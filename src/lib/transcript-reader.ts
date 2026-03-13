import { readdirSync, statSync, readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";
import type { StoredSession, ChatMessage } from "@/lib/types";

const CURSOR_PROJECTS_DIR = join(homedir(), ".cursor", "projects");

export function workspaceToProjectKey(workspace: string): string {
  const abs = resolve(workspace);
  return abs.replace(/^\//, "").replace(/\//g, "-");
}

function findTranscriptsDir(workspace: string): string | null {
  const key = workspaceToProjectKey(workspace);
  const dir = join(CURSOR_PROJECTS_DIR, key, "agent-transcripts");
  return existsSync(dir) ? dir : null;
}

function extractFirstUserMessage(jsonlPath: string): string {
  try {
    const content = readFileSync(jsonlPath, "utf-8");
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.role === "user") {
          const text: string = entry.message?.content?.[0]?.text || "";
          return text.replace(/<[^>]+>/g, "").trim().slice(0, 120);
        }
      } catch {
        continue;
      }
    }
  } catch {
    // file read error
  }
  return "";
}

function findJsonlFile(entryPath: string, entryName: string): string | null {
  const stat = statSync(entryPath);

  if (stat.isFile() && entryName.endsWith(".jsonl")) {
    return entryPath;
  }

  if (stat.isDirectory()) {
    const inner = join(entryPath, entryName + ".jsonl");
    if (existsSync(inner)) return inner;

    try {
      const files = readdirSync(entryPath).filter((f) => f.endsWith(".jsonl"));
      if (files.length > 0) return join(entryPath, files[0]);
    } catch {
      // read error
    }
  }

  return null;
}

export function readCursorSessions(workspace: string): StoredSession[] {
  const dir = findTranscriptsDir(workspace);
  if (!dir) return [];

  const sessions: StoredSession[] = [];

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const entryPath = join(dir, entry);
      const jsonl = findJsonlFile(entryPath, entry.replace(".jsonl", ""));
      if (!jsonl) continue;

      const stat = statSync(jsonl);
      const sessionId = entry.replace(".jsonl", "");
      const preview = extractFirstUserMessage(jsonl);

      if (!preview) continue;

      sessions.push({
        id: sessionId,
        title: preview.slice(0, 60),
        workspace,
        preview,
        createdAt: stat.birthtimeMs,
        updatedAt: stat.mtimeMs,
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

export interface SessionHistoryResult {
  messages: ChatMessage[];
  modifiedAt: number;
}

function resolveJsonlPath(workspace: string, sessionId: string): string | null {
  const dir = findTranscriptsDir(workspace);
  if (!dir) return null;

  const resolvedDir = resolve(dir);
  const entryPath = resolve(dir, sessionId);
  if (!entryPath.startsWith(resolvedDir + "/")) return null;

  const flatPath = join(dir, sessionId + ".jsonl");

  if (existsSync(entryPath) && statSync(entryPath).isDirectory()) {
    return findJsonlFile(entryPath, sessionId);
  }
  if (existsSync(flatPath)) {
    return flatPath;
  }
  return null;
}

export function getSessionModifiedAt(workspace: string, sessionId: string): number {
  const jsonlPath = resolveJsonlPath(workspace, sessionId);
  if (!jsonlPath) return 0;
  try {
    return statSync(jsonlPath).mtimeMs;
  } catch {
    return 0;
  }
}

export function readSessionMessages(
  workspace: string,
  sessionId: string
): SessionHistoryResult {
  const jsonlPath = resolveJsonlPath(workspace, sessionId);
  if (!jsonlPath) return { messages: [], modifiedAt: 0 };

  let modifiedAt = 0;
  try {
    modifiedAt = statSync(jsonlPath).mtimeMs;
  } catch {
    return { messages: [], modifiedAt: 0 };
  }

  const messages: ChatMessage[] = [];
  let counter = 0;

  try {
    const content = readFileSync(jsonlPath, "utf-8");
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        const role = entry.role as string;
        if (role !== "user" && role !== "assistant") continue;

        const textParts: string[] = [];
        const contentArr = entry.message?.content;
        if (Array.isArray(contentArr)) {
          for (const part of contentArr) {
            if (part.type === "text" && part.text) {
              textParts.push(part.text);
            }
          }
        }

        let text = textParts.join("");
        if (role === "user") {
          text = stripXmlTags(text);
        }

        if (!text.trim()) continue;

        messages.push({
          id: `${sessionId}-${counter++}`,
          role: role as "user" | "assistant",
          content: text,
          timestamp: Date.now() - (1000 - counter),
        });
      } catch {
        continue;
      }
    }
  } catch {
    // file read error
  }

  return { messages, modifiedAt };
}
