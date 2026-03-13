import { spawnAgent, createStreamFromProcess } from "@/lib/cursor-cli";
import { getWorkspace } from "@/lib/workspace";
import type { ChatRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.prompt?.trim()) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  try {
    const child = spawnAgent({
      prompt: body.prompt,
      sessionId: body.sessionId,
      workspace: body.workspace || getWorkspace(),
      model: body.model,
    });

    const stream = createStreamFromProcess(child);

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start agent";
    return Response.json({ error: message }, { status: 500 });
  }
}
