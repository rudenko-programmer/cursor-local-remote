import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { StoredSession } from "@/lib/types";

interface StoreData {
  sessions: StoredSession[];
}

const DATA_DIR = join(homedir(), ".cursor-local-remote");
const STORE_PATH = join(DATA_DIR, "sessions.json");

function ensureDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readStore(): StoreData {
  ensureDir();
  if (!existsSync(STORE_PATH)) return { sessions: [] };
  try {
    return JSON.parse(readFileSync(STORE_PATH, "utf-8"));
  } catch {
    return { sessions: [] };
  }
}

function writeStore(data: StoreData) {
  ensureDir();
  writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

export function upsertSession(
  sessionId: string,
  workspace: string,
  firstMessage: string
): StoredSession {
  const store = readStore();
  const existing = store.sessions.find((s) => s.id === sessionId);

  if (existing) {
    existing.updatedAt = Date.now();
    if (firstMessage) existing.preview = firstMessage.slice(0, 120);
    writeStore(store);
    return existing;
  }

  const title = firstMessage.slice(0, 60) || "New session";
  const session: StoredSession = {
    id: sessionId,
    title,
    workspace,
    preview: firstMessage.slice(0, 120),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  store.sessions.unshift(session);
  writeStore(store);
  return session;
}

export function listSessions(workspace?: string): StoredSession[] {
  const store = readStore();
  const sessions = workspace
    ? store.sessions.filter((s) => s.workspace === workspace)
    : store.sessions;
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteSession(sessionId: string) {
  const store = readStore();
  store.sessions = store.sessions.filter((s) => s.id !== sessionId);
  writeStore(store);
}
