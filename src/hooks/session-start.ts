import { statSync } from "fs";
import { loadConfig } from "../config";
import { getProjectKey, getProjectPath } from "../project-key";
import { getDb, defaultDbPath, recordSession, pruneExpired, setMeta } from "../db/index";
import { toolContext, CONTEXT_EMPTY_RESPONSE } from "../tools";
import { storeFootprint, gcReminderText } from "../gc/index";
import { log } from "../log";

interface SessionStartInput {
  session_id: string;
  cwd: string;
  [key: string]: unknown;
}

/** Maximum characters written to stdout for the context snapshot injection. */
const INJECT_MAX_CHARS = 2000;

/** True only for a path that exists AND is a directory — a project path is never a file. */
function isExistingDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function handleSessionStart(raw: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    log.error("session-start received invalid JSON — skipping");
    return;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    log.error("session-start received unexpected input shape — skipping");
    return;
  }
  const input = parsed as SessionStartInput;
  const config = loadConfig();
  const projectKey = getProjectKey(input.cwd);
  const db = getDb(defaultDbPath(projectKey));

  // Record the resolved project path so `mcp-recall gc` can tell whether this
  // project still exists on disk (orphan detection is path-existence based).
  //
  // Only recorded when it resolves to a real directory. The path is absolute by
  // construction, but absolute is not the same as true: a relative payload `cwd`
  // gets rooted against this process's cwd, which may not be where it was meant to
  // be rooted. This hook runs *inside* the project, so a resolved path that does
  // not exist means the guess was wrong — and recording it would let gc read a live
  // project as "path gone, parent present" and delete its database.
  //
  // Skipping is not the same as clearing: setMeta upserts, so a database that
  // already holds a verified path keeps it. That is the better evidence — a path
  // that once resolved beats a guess that just failed. Only a database that never
  // recorded one stays pathless, which gc keeps as legacy-fresh and reclaims solely
  // on the untouched-for-N-days rule, never on a deleted-project inference.
  const projectPath = getProjectPath(input.cwd);
  if (isExistingDir(projectPath)) {
    setMeta(db, "project_path", projectPath);
  } else {
    log.debug(`session-start · resolved project path is not a directory, leaving meta as-is: ${projectPath}`);
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  recordSession(db, today);
  pruneExpired(db, projectKey, config.store.expire_after_session_days);

  // Inject a compact context snapshot into Claude's initial context via stdout.
  // Claude Code adds SessionStart hook stdout as context before the first message.
  // A store-maintenance reminder (if any) leads, so it survives snapshot truncation.
  const parts: string[] = [];
  const reminder = gcReminderText(storeFootprint(), config.store.gc_reminder_mb);
  if (reminder) parts.push(reminder);

  let snapshot = toolContext(db, projectKey, {});
  if (snapshot !== CONTEXT_EMPTY_RESPONSE) {
    if (snapshot.length > INJECT_MAX_CHARS) {
      snapshot =
        snapshot.slice(0, INJECT_MAX_CHARS) +
        "\n… (truncated — call recall__context for the full view)";
    }
    parts.push(snapshot);
  }

  if (parts.length === 0) {
    log.debug(`session-start · project=${projectKey.slice(0, 8)} · nothing to inject`);
  } else {
    const out = parts.join("\n\n");
    process.stdout.write(out + "\n");
    log.debug(`session-start · project=${projectKey.slice(0, 8)} · injected ${out.length} chars`);
  }
}
