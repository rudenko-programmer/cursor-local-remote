import Database from "better-sqlite3";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync } from "fs";
import type { StoredSession } from "@/lib/types";

const DATA_DIR = join(homedir(), ".cursor-local-remote");
const DB_PATH = join(DATA_DIR, "sessions.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;

  mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      workspace TEXT NOT NULL,
      preview TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  return db;
}

function rowToSession(row: Record<string, unknown>): StoredSession {
  return {
    id: row.id as string,
    title: row.title as string,
    workspace: row.workspace as string,
    preview: row.preview as string,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

export function upsertSession(
  sessionId: string,
  workspace: string,
  firstMessage: string,
): StoredSession {
  const conn = getDb();
  const now = Date.now();
  const existing = conn.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as
    | Record<string, unknown>
    | undefined;

  if (existing) {
    const preview = firstMessage ? firstMessage.slice(0, 120) : (existing.preview as string);
    conn.prepare("UPDATE sessions SET updated_at = ?, preview = ? WHERE id = ?").run(
      now,
      preview,
      sessionId,
    );
    return rowToSession({ ...existing, updated_at: now, preview });
  }

  const title = firstMessage.slice(0, 60) || "New session";
  const preview = firstMessage.slice(0, 120);
  conn.prepare(
    "INSERT INTO sessions (id, title, workspace, preview, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(sessionId, title, workspace, preview, now, now);

  return { id: sessionId, title, workspace, preview, createdAt: now, updatedAt: now };
}

export function listSessions(workspace?: string): StoredSession[] {
  const conn = getDb();
  const rows = workspace
    ? (conn
        .prepare("SELECT * FROM sessions WHERE workspace = ? ORDER BY updated_at DESC")
        .all(workspace) as Record<string, unknown>[])
    : (conn
        .prepare("SELECT * FROM sessions ORDER BY updated_at DESC")
        .all() as Record<string, unknown>[]);
  return rows.map(rowToSession);
}

export function deleteSession(sessionId: string): void {
  const conn = getDb();
  conn.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}
