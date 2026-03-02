import { loadConfig } from "../config";
import { getProjectKey } from "../project-key";
import { getDb, defaultDbPath, recordSession, pruneExpired } from "../db/index";

interface SessionStartInput {
  session_id: string;
  cwd: string;
  [key: string]: unknown;
}

export function handleSessionStart(raw: string): void {
  const input = JSON.parse(raw) as SessionStartInput;
  const config = loadConfig();
  const projectKey = getProjectKey(input.cwd);
  const db = getDb(defaultDbPath(projectKey));

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  recordSession(db, today);
  pruneExpired(db, projectKey, config.store.expire_after_session_days);
}
