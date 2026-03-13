import { listSessions, deleteSession } from "@/lib/session-store";
import { readCursorSessions } from "@/lib/transcript-reader";
import { getWorkspace } from "@/lib/workspace";
import { SESSION_ID_RE } from "@/lib/validation";
import type { StoredSession } from "@/lib/types";

export const dynamic = "force-dynamic";

function mergeSessions(ours: StoredSession[], cursor: StoredSession[]): StoredSession[] {
  const byId = new Map<string, StoredSession>();

  for (const s of cursor) {
    byId.set(s.id, s);
  }
  for (const s of ours) {
    const existing = byId.get(s.id);
    if (existing) {
      byId.set(s.id, {
        ...existing,
        updatedAt: Math.max(existing.updatedAt, s.updatedAt),
      });
    } else {
      byId.set(s.id, s);
    }
  }

  return Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const all = url.searchParams.get("all") === "true";
  const workspace = getWorkspace();

  if (all) {
    const ours = listSessions();
    return Response.json({ sessions: ours, workspace });
  }

  const cursorSessions = readCursorSessions(workspace);
  const ourSessions = listSessions(workspace);
  const merged = mergeSessions(ourSessions, cursorSessions);

  return Response.json({ sessions: merged, workspace });
}

export async function DELETE(req: Request) {
  let body: { sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.sessionId || !SESSION_ID_RE.test(body.sessionId)) {
    return Response.json({ error: "invalid sessionId" }, { status: 400 });
  }
  deleteSession(body.sessionId);
  return Response.json({ ok: true });
}
