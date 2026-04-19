import { getSessionModifiedAt, isSessionLikelyActive } from "@/lib/transcript-reader";
import { badRequest, parseJsonBody, serverError } from "@/lib/errors";
import { vlog } from "@/lib/verbose";

export const dynamic = "force-dynamic";

interface IdeActiveRequest {
  sessions?: Array<{ id?: string; workspace?: string }>;
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const raw = await parseJsonBody<IdeActiveRequest>(req);
  if (raw instanceof Response) return raw;

  const items = raw.sessions;
  if (!Array.isArray(items)) return badRequest("sessions must be an array");
  if (items.length > 500) return badRequest("too many sessions");

  const unique = new Map<string, { id: string; workspace: string }>();
  for (const item of items) {
    const id = item?.id;
    const workspace = item?.workspace;
    if (typeof id !== "string" || id.length === 0) continue;
    if (typeof workspace !== "string" || workspace.length === 0) continue;
    const key = `${workspace}\u0000${id}`;
    unique.set(key, { id, workspace });
  }

  try {
    const now = Date.now();
    const checks = await Promise.all(
      Array.from(unique.values()).map(async ({ id, workspace }) => {
        try {
          const modifiedAt = await getSessionModifiedAt(workspace, id);
          return isSessionLikelyActive(modifiedAt, now) ? id : null;
        } catch {
          return null;
        }
      }),
    );

    const activeIds = checks.filter((id): id is string => id !== null);
    vlog("sessions", "ide-active", {
      requested: unique.size,
      active: activeIds.length,
      ms: Date.now() - t0,
    });

    return Response.json({ sessions: activeIds });
  } catch {
    return serverError("Failed to determine IDE active sessions");
  }
}
