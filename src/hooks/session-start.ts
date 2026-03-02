import { loadConfig } from "../config";
import { getProjectKey } from "../project-key";
import { getDb, defaultDbPath, recordSession, pruneExpired, getContext } from "../db/index";
import { toolContext } from "../tools";
import { dbg } from "../debug";

interface SessionStartInput {
  session_id: string;
  cwd: string;
  [key: string]: unknown;
}

/** Maximum characters written to stdout for the context snapshot injection. */
const INJECT_MAX_CHARS = 2000;

export function handleSessionStart(raw: string): void {
  const input = JSON.parse(raw) as SessionStartInput;
  const config = loadConfig();
  const projectKey = getProjectKey(input.cwd);
  const db = getDb(defaultDbPath(projectKey));

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  recordSession(db, today);
  pruneExpired(db, projectKey, config.store.expire_after_session_days);

  // Inject a compact context snapshot into Claude's initial context via stdout.
  // Claude Code adds SessionStart hook stdout as context before the first message.
  const data = getContext(db, projectKey);
  const isEmpty =
    data.pinned.length === 0 &&
    data.notes.length === 0 &&
    data.recent.length === 0 &&
    data.last_session === null;

  if (!isEmpty) {
    let snapshot = toolContext(db, projectKey, {});
    if (snapshot.length > INJECT_MAX_CHARS) {
      snapshot =
        snapshot.slice(0, INJECT_MAX_CHARS) +
        "\n… (truncated — call recall__context for the full view)";
    }
    process.stdout.write(snapshot + "\n");
    dbg(`session-start · project=${projectKey.slice(0, 8)} · injected ${snapshot.length} chars`);
  } else {
    dbg(`session-start · project=${projectKey.slice(0, 8)} · nothing to inject`);
  }
}
