import { resolve } from "path";

let currentWorkspace: string | null = null;

export function getWorkspace(): string {
  if (currentWorkspace) return currentWorkspace;
  const fromEnv = process.env.CURSOR_WORKSPACE;
  if (fromEnv) return resolve(fromEnv);
  return process.cwd();
}

export function setWorkspace(path: string) {
  currentWorkspace = resolve(path);
}
