import { readdir, stat, readFile, access } from "fs/promises";
import { join, resolve, sep, relative, isAbsolute } from "path";
import { homedir } from "os";
import { existsSync, statSync } from "fs";
import type { StoredSession, ChatMessage, ToolCallInfo, TodoItem, ProjectInfo } from "@/lib/types";
import { vlog } from "@/lib/verbose";
import { IDE_ACTIVITY_WINDOW_MS } from "@/lib/constants";

const CURSOR_PROJECTS_DIR = join(homedir(), ".cursor", "projects");

function keyComparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function keyFromWorkspace(workspace: string): string {
  const abs = resolve(workspace).replace(/\\/g, "/");
  const normalizedDrive = abs.replace(/^([A-Za-z]):/, (_, drive: string) => `${drive.toLowerCase()}`);

  const parts = normalizedDrive
    .replace(/^\/+/, "")
    .split("/")
    .map((part) =>
      part
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, ""),
    )
    .filter(Boolean);

  return parts.join("-");
}

export function workspaceToProjectKey(workspace: string): string {
  return keyFromWorkspace(workspace);
}

function projectKeyToWorkspace(key: string): string | null {
  const parts = key.split("-");
  if (parts.length > 1 && /^[a-zA-Z]$/.test(parts[0])) {
    const winPath = `${parts[0].toUpperCase()}:/${parts.slice(1).join("/")}`;
    const resolved = resolve(winPath);
    if (existsSync(resolved)) return resolved;
  }

  let path = sep + parts[0];
  for (let i = 1; i < parts.length; i++) {
    const withSlash = path + sep + parts[i];
    if (existsSync(withSlash) && statSync(withSlash).isDirectory()) {
      path = withSlash;
    } else {
      path = path + "-" + parts[i];
    }
  }
  if (!existsSync(path)) return null;
  return path;
}

export async function listProjects(): Promise<ProjectInfo[]> {
  const projects: ProjectInfo[] = [];
  try {
    const entries = await readdir(CURSOR_PROJECTS_DIR);
    for (const entry of entries) {
      if (!/^[A-Za-z]/.test(entry)) continue;
      const transcriptsDir = join(CURSOR_PROJECTS_DIR, entry, "agent-transcripts");
      try {
        await access(transcriptsDir);
      } catch {
        continue;
      }
      const workspace = projectKeyToWorkspace(entry);
      if (!workspace) continue;
      const name = workspace.split(sep).pop() || workspace;
      projects.push({ name, path: workspace, key: entry });
    }
  } catch {
    // projects dir doesn't exist or can't be read
  }
  return projects.sort((a, b) => a.name.localeCompare(b.name));
}

async function findTranscriptsDir(workspace: string): Promise<string | null> {
  const key = workspaceToProjectKey(workspace);
  const dir = join(CURSOR_PROJECTS_DIR, key, "agent-transcripts");
  try {
    await access(dir);
    vlog("reader", "transcripts dir found", dir);
    return dir;
  } catch {
    try {
      const target = keyComparable(key);
      const entries = await readdir(CURSOR_PROJECTS_DIR);

      for (const entry of entries) {
        if (keyComparable(entry) !== target) continue;
        const fallbackDir = join(CURSOR_PROJECTS_DIR, entry, "agent-transcripts");
        try {
          await access(fallbackDir);
          vlog("reader", "transcripts dir found via fallback", { workspace, key, entry, fallbackDir });
          return fallbackDir;
        } catch {
          // keep searching
        }
      }
    } catch {
      // ignore fallback lookup errors
    }

    vlog("reader", "transcripts dir not found", dir, "workspace", workspace, "key", key);
    return null;
  }
}

async function parseJsonlEntries(jsonlPath: string): Promise<Record<string, unknown>[]> {
  try {
    const content = await readFile(jsonlPath, "utf-8");
    const entries: Record<string, unknown>[] = [];
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line));
      } catch {
        continue;
      }
    }
    return entries;
  } catch {
    return [];
  }
}

async function extractFirstUserMessage(jsonlPath: string): Promise<string> {
  for (const entry of await parseJsonlEntries(jsonlPath)) {
    if (entry.role === "user") {
      const msg = entry.message as Record<string, unknown> | undefined;
      const content = msg?.content as Array<Record<string, unknown>> | undefined;
      const text = (content || [])
        .map((part) => (part.type === "text" ? part.text : ""))
        .filter((part): part is string => typeof part === "string")
        .join("");
      return text
        .replace(/<[^>]+>/g, "")
        .trim()
        .slice(0, 120);
    }
  }
  return "";
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function findJsonlFile(entryPath: string, entryName: string): Promise<string | null> {
  const s = await stat(entryPath);

  if (s.isFile() && entryName.endsWith(".jsonl")) {
    return entryPath;
  }

  if (s.isDirectory()) {
    const inner = join(entryPath, entryName + ".jsonl");
    if (await pathExists(inner)) return inner;

    try {
      const files = (await readdir(entryPath)).filter((f) => f.endsWith(".jsonl"));
      if (files.length > 0) return join(entryPath, files[0]);
    } catch {
      // read error
    }
  }

  return null;
}

export async function readCursorSessions(workspace: string): Promise<StoredSession[]> {
  const dir = await findTranscriptsDir(workspace);
  if (!dir) return [];

  const sessions: StoredSession[] = [];

  try {
    const entries = await readdir(dir);

    for (const entry of entries) {
      const entryPath = join(dir, entry);
      const jsonl = await findJsonlFile(entryPath, entry.replace(".jsonl", ""));
      if (!jsonl) continue;

      const s = await stat(jsonl);
      const sessionId = entry.replace(".jsonl", "");
      const preview = await extractFirstUserMessage(jsonl);
      const fallbackPreview = preview || `Session ${sessionId.slice(0, 8)}`;

      sessions.push({
        id: sessionId,
        title: fallbackPreview.slice(0, 60),
        workspace,
        preview: fallbackPreview,
        createdAt: s.birthtimeMs,
        updatedAt: s.mtimeMs,
        source: "ide",
      });
    }
  } catch {
    // directory read error
  }

  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

function stripXmlTags(text: string): string {
  return text
    .replace(/<user_query>\n?/g, "")
    .replace(/<\/user_query>\n?/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

const ASSISTANT_REASONING_MARKER_RE =
  /\n{2,}(The user(?:\s+just)?\s+said\b|Now I(?:\s+need to|\s+am|\s+'m)\b|I need to\b|Let me\b|My initial assessment\b|Key observations\b|One thing I should\b|Actually, let me\b)/i;

const ASSISTANT_THINKING_ONLY_RE =
  /^(Let me\b|I need to\b|Now I(?:\s+need to|\s+am|\s+'m)\b|First,? I'll\b|I'll\s+now\b)/i;

function sanitizeAssistantText(text: string, hasToolUse: boolean): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";

  const marker = normalized.match(ASSISTANT_REASONING_MARKER_RE);
  if (marker && marker.index && marker.index > 40) {
    return normalized.slice(0, marker.index).trim();
  }

  // Tool-use entries often include internal planning text; hide that noise.
  if (hasToolUse && ASSISTANT_THINKING_ONLY_RE.test(normalized)) {
    return "";
  }

  return normalized;
}

export interface SessionHistoryResult {
  messages: ChatMessage[];
  toolCalls: ToolCallInfo[];
  modifiedAt: number;
}

export function isSessionLikelyActive(modifiedAt: number, now = Date.now(), windowMs = IDE_ACTIVITY_WINDOW_MS): boolean {
  if (!Number.isFinite(modifiedAt) || modifiedAt <= 0) return false;
  return now - modifiedAt <= windowMs;
}

export async function resolveJsonlPath(workspace: string, sessionId: string): Promise<string | null> {
  const dir = await findTranscriptsDir(workspace);
  if (!dir) {
    vlog("reader", "resolveJsonlPath: no transcripts dir", { workspace, sessionId });
    return null;
  }

  const resolvedDir = resolve(dir);
  const entryPath = resolve(dir, sessionId);
  const rel = relative(resolvedDir, entryPath);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    vlog("reader", "resolveJsonlPath: path traversal blocked", { entryPath, resolvedDir });
    return null;
  }

  const flatPath = join(dir, sessionId + ".jsonl");

  if (await pathExists(entryPath)) {
    const s = await stat(entryPath);
    if (s.isDirectory()) {
      const result = await findJsonlFile(entryPath, sessionId);
      vlog("reader", "resolveJsonlPath: directory entry", { sessionId, found: result ?? "null" });
      return result;
    }
  }
  if (await pathExists(flatPath)) {
    vlog("reader", "resolveJsonlPath: flat file", { sessionId, path: flatPath });
    return flatPath;
  }
  vlog("reader", "resolveJsonlPath: not found", { sessionId, triedDir: entryPath, triedFlat: flatPath });
  return null;
}

export async function getSessionModifiedAt(workspace: string, sessionId: string): Promise<number> {
  const jsonlPath = await resolveJsonlPath(workspace, sessionId);
  if (!jsonlPath) return 0;
  try {
    return (await stat(jsonlPath)).mtimeMs;
  } catch {
    return 0;
  }
}

const TOOL_NAME_MAP: Record<string, ToolCallInfo["type"]> = {
  Read: "read",
  Write: "write",
  Edit: "edit",
  StrReplace: "edit",
  Shell: "shell",
  Grep: "search",
  Glob: "search",
  List: "read",
  TodoWrite: "todo",
};

function extractToolCallsFromContent(
  contentArr: unknown[],
  sessionId: string,
  counter: { n: number },
  baseTimestamp: number,
): ToolCallInfo[] {
  const calls: ToolCallInfo[] = [];
  for (const part of contentArr) {
    if (typeof part !== "object" || part === null) continue;
    const p = part as Record<string, unknown>;
    if (p.type !== "tool_use") continue;

    const name = (p.name as string) || "Tool";
    const input = (p.input as Record<string, unknown>) || {};
    const type = TOOL_NAME_MAP[name] || "other";

    let todos: TodoItem[] | undefined;
    if (name === "TodoWrite" && Array.isArray(input.todos)) {
      todos = (input.todos as Record<string, string>[]).map((t) => ({
        id: t.id,
        content: t.content,
        status: t.status?.toUpperCase().includes("COMPLETED")
          ? "TODO_STATUS_COMPLETED"
          : t.status?.toUpperCase().includes("PROGRESS")
            ? "TODO_STATUS_IN_PROGRESS"
            : "TODO_STATUS_PENDING",
      }));
    }

    const done = todos?.filter((t) => t.status.includes("COMPLETED")).length ?? 0;
    const total = todos?.length ?? 0;

    let toolDiff: string | undefined;
    let toolDiffStartLine: number | undefined;
    if (type === "edit" && typeof input.old_string === "string" && typeof input.new_string === "string") {
      const oldLines = (input.old_string as string).split("\n").map((l) => `-${l}`);
      const newLines = (input.new_string as string).split("\n").map((l) => `+${l}`);
      toolDiff = [...oldLines, ...newLines].join("\n");
    } else if (type === "write" && typeof input.contents === "string") {
      const lines = (input.contents as string).split("\n");
      toolDiff = lines.map((l) => `+${l}`).join("\n");
      if (lines.length > 30) {
        toolDiff = lines.slice(0, 30).map((l) => `+${l}`).join("\n") + "\n+... (" + (lines.length - 30) + " more lines)";
      }
    }
    if (typeof input.start_line === "number") {
      toolDiffStartLine = input.start_line as number;
    }

    calls.push({
      id: `${sessionId}-tc-${counter.n++}`,
      callId: `${sessionId}-tc-${counter.n}`,
      type,
      name,
      path: (input.path || input.file_path) as string | undefined,
      command:
        type === "shell"
          ? (input.command as string)
          : type === "search"
            ? (input.pattern as string)
            : undefined,
      status: "completed",
      diff: toolDiff,
      diffStartLine: toolDiffStartLine,
      result: type === "todo" && total > 0 ? `${total} items · ${done} done` : undefined,
      todos,
      timestamp: baseTimestamp + counter.n,
    });
  }
  return calls;
}

export function parseLiveEvents(
  events: Record<string, unknown>[],
  sessionId: string,
): { messages: ChatMessage[]; toolCalls: ToolCallInfo[] } {
  const messages: ChatMessage[] = [];
  const toolCalls: ToolCallInfo[] = [];
  const counter = { n: 0 };
  const baseTimestamp = Date.now() - 60_000;

  for (const event of events) {
    const role = event.type as string;
    if (role !== "user" && role !== "assistant") continue;

    const contentArr = (event.message as Record<string, unknown> | undefined)?.content;
    if (!Array.isArray(contentArr)) continue;

    const hasToolUse = contentArr.some((part) => {
      if (typeof part !== "object" || part === null) return false;
      return (part as Record<string, unknown>).type === "tool_use";
    });

    const textParts: string[] = [];
    for (const part of contentArr) {
      if ((part as Record<string, unknown>).type === "text" && (part as Record<string, unknown>).text) {
        textParts.push((part as Record<string, unknown>).text as string);
      }
    }

    let text = textParts.join("");
    if (role === "user") {
      text = stripXmlTags(text);
    } else {
      text = sanitizeAssistantText(text, hasToolUse);
    }

    if (text.trim()) {
      messages.push({
        id: `${sessionId}-live-${counter.n++}`,
        role: role as "user" | "assistant",
        content: text,
        timestamp: baseTimestamp + counter.n,
      });
    }

    if (role === "assistant") {
      toolCalls.push(...extractToolCallsFromContent(contentArr, sessionId, counter, baseTimestamp));
    }
  }

  return { messages, toolCalls };
}

export async function readSessionMessages(workspace: string, sessionId: string): Promise<SessionHistoryResult> {
  const t0 = Date.now();
  const jsonlPath = await resolveJsonlPath(workspace, sessionId);
  if (!jsonlPath) {
    vlog("reader", "readSessionMessages: no jsonl path", { workspace, sessionId });
    return { messages: [], toolCalls: [], modifiedAt: 0 };
  }

  let modifiedAt = 0;
  try {
    modifiedAt = (await stat(jsonlPath)).mtimeMs;
  } catch (err) {
    vlog("reader", "readSessionMessages: stat failed", { jsonlPath, error: String(err) });
    return { messages: [], toolCalls: [], modifiedAt: 0 };
  }

  const entries = await parseJsonlEntries(jsonlPath);
  vlog("reader", "readSessionMessages: parsed jsonl", { sessionId, entries: entries.length, jsonlPath });

  const messages: ChatMessage[] = [];
  const toolCalls: ToolCallInfo[] = [];
  const counter = { n: 0 };
  const baseTimestamp = modifiedAt - 60_000;
  let skippedEntries = 0;

  for (const entry of entries) {
    const role = entry.role as string;
    if (role !== "user" && role !== "assistant") {
      skippedEntries++;
      continue;
    }

    const contentArr = (entry.message as Record<string, unknown> | undefined)?.content;
    if (!Array.isArray(contentArr)) {
      skippedEntries++;
      continue;
    }

    const hasToolUse = contentArr.some((part) => {
      if (typeof part !== "object" || part === null) return false;
      return (part as Record<string, unknown>).type === "tool_use";
    });

    const textParts: string[] = [];
    for (const part of contentArr) {
      if (part.type === "text" && part.text) {
        textParts.push(part.text);
      }
    }

    let text = textParts.join("");
    if (role === "user") {
      text = stripXmlTags(text);
    } else {
      text = sanitizeAssistantText(text, hasToolUse);
    }

    if (text.trim()) {
      messages.push({
        id: `${sessionId}-${counter.n++}`,
        role: role as "user" | "assistant",
        content: text,
        timestamp: baseTimestamp + counter.n,
      });
    }

    if (role === "assistant") {
      toolCalls.push(...extractToolCallsFromContent(contentArr, sessionId, counter, baseTimestamp));
    }
  }

  vlog("reader", "readSessionMessages: done", {
    sessionId, messages: messages.length, toolCalls: toolCalls.length,
    skippedEntries, modifiedAt, ms: Date.now() - t0,
  });

  return { messages, toolCalls, modifiedAt };
}
