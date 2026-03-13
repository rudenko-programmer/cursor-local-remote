import { listSessions } from "@/lib/cursor-cli";
import type { SessionInfo } from "@/lib/types";

export const dynamic = "force-dynamic";

function parseSessionList(raw: string): SessionInfo[] {
  const lines = raw.trim().split("\n").filter(Boolean);
  const sessions: SessionInfo[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const match = line.match(/^(\S+)\s+(.+?)\s{2,}(.+)$/);
    if (match && match[1]) {
      sessions.push({
        id: match[1],
        title: match[2].trim(),
        date: match[3].trim(),
      });
      continue;
    }

    const parts = line.split(/\s{2,}/);
    const id = parts[0]?.trim();
    if (id) {
      sessions.push({
        id,
        title: parts[1]?.trim() || "Untitled",
        date: parts[2]?.trim() || "",
      });
    }
  }

  const seen = new Set<string>();
  return sessions.filter((s) => {
    if (!s.id || seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

export async function GET() {
  try {
    const raw = await listSessions();
    const sessions = parseSessionList(raw);
    return Response.json({ sessions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list sessions";
    return Response.json({ sessions: [], error: message }, { status: 200 });
  }
}
