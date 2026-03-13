import { randomUUID } from "node:crypto";
import { spawnAgent } from "@/lib/cursor-cli";
import { getWorkspace } from "@/lib/workspace";
import { upsertSession } from "@/lib/session-store";
import { registerProcess, promoteToSessionId, pushLiveEvent } from "@/lib/process-registry";
import { chatRequestSchema, parseBody } from "@/lib/validation";
import { badRequest, serverError, safeErrorMessage, parseJsonBody } from "@/lib/errors";
import { AGENT_INIT_TIMEOUT_MS } from "@/lib/constants";
import type { ChatRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

function waitForSessionId(
  child: ReturnType<typeof spawnAgent>,
  workspace: string,
  prompt: string,
  requestId: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    let found = false;
    let buffer = "";
    let resolvedSessionId: string | null = null;

    const timer = setTimeout(() => {
      if (!found) resolve(null);
    }, AGENT_INIT_TIMEOUT_MS);

    child.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);

          if (!found && event.type === "system" && event.subtype === "init" && event.session_id) {
            found = true;
            resolvedSessionId = event.session_id;
            clearTimeout(timer);
            upsertSession(event.session_id, workspace, prompt);
            promoteToSessionId(requestId, event.session_id);
            resolve(event.session_id);
          }

          if (resolvedSessionId && (event.type === "user" || event.type === "assistant")) {
            pushLiveEvent(resolvedSessionId, event);
          }
        } catch {
          // non-json line
        }
      }
    });

    child.on("close", () => {
      if (!found) {
        clearTimeout(timer);
        resolve(null);
      }
    });

    child.on("error", () => {
      if (!found) {
        clearTimeout(timer);
        resolve(null);
      }
    });
  });
}

export async function POST(req: Request) {
  const raw = await parseJsonBody<ChatRequest>(req);
  if (raw instanceof Response) return raw;

  const parsed = parseBody(chatRequestSchema, raw);
  if ("error" in parsed) return badRequest(parsed.error);
  const body = parsed.data;

  const workspace = getWorkspace();

  try {
    const requestId = randomUUID();

    const child = spawnAgent({
      prompt: body.prompt,
      sessionId: body.sessionId,
      workspace,
      model: body.model,
      mode: body.mode,
    });

    registerProcess(requestId, child, workspace);

    if (body.sessionId) {
      promoteToSessionId(requestId, body.sessionId);
    }

    child.stderr?.on("data", () => {});

    const sessionId = await waitForSessionId(child, workspace, body.prompt, requestId);

    if (!sessionId) {
      child.kill("SIGTERM");
      return serverError("Agent failed to start");
    }

    return Response.json({ sessionId });
  } catch (err) {
    safeErrorMessage(err, "Failed to start agent");
    return serverError("Failed to start agent");
  }
}
