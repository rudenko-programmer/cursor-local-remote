import { readSessionMessages, getSessionModifiedAt } from "@/lib/transcript-reader";
import { getWorkspace } from "@/lib/workspace";
import { sessionIdParam } from "@/lib/validation";
import { badRequest } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawId = url.searchParams.get("id");
  const checkOnly = url.searchParams.get("check") === "true";
  const sinceParam = url.searchParams.get("since");

  const result = sessionIdParam.safeParse(rawId);
  if (!result.success) return badRequest("invalid or missing session id");
  const sessionId = result.data;

  const workspace = getWorkspace();

  if (checkOnly) {
    const modifiedAt = await getSessionModifiedAt(workspace, sessionId);
    return Response.json({ sessionId, modifiedAt });
  }

  if (sinceParam) {
    const since = parseInt(sinceParam, 10);
    const modifiedAt = await getSessionModifiedAt(workspace, sessionId);
    if (!isNaN(since) && modifiedAt <= since) {
      return Response.json({ sessionId, modifiedAt, messages: null, toolCalls: null });
    }
  }

  const { messages, toolCalls, modifiedAt } = await readSessionMessages(workspace, sessionId);
  return Response.json({ messages, toolCalls, sessionId, modifiedAt });
}
