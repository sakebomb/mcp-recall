import { loadConfig } from "../config";
import { getProjectKey, getProjectPath } from "../project-key";
import { getDb, defaultDbPath, recordSession, pruneExpired, setMeta } from "../db/index";
import { toolContext, CONTEXT_EMPTY_RESPONSE } from "../tools";
import { storeFootprint } from "../gc/index";
import { formatBytes } from "../format";
import { log } from "../log";

/**
 * Returns a one-line reminder to run `mcp-recall gc` when the store's on-disk
 * footprint exceeds the configured threshold, or "" when it doesn't (or the
 * reminder is disabled with `gc_reminder_mb = 0`). Cheap: stats files, no DB opens.
 */
function gcReminder(reminderMb: number): string {
  if (reminderMb <= 0) return "";
  const { totalBytes, dbCount } = storeFootprint();
  if (totalBytes < reminderMb * 1024 * 1024) return "";
  return (
    `💡 recall store is ${formatBytes(totalBytes)} across ${dbCount} project ` +
    `databases — run \`mcp-recall gc\` to review and reclaim disk space.`
  );
}

interface SessionStartInput {
  session_id: string;
  cwd: string;
  [key: string]: unknown;
}

/** Maximum characters written to stdout for the context snapshot injection. */
const INJECT_MAX_CHARS = 2000;

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
  setMeta(db, "project_path", getProjectPath(input.cwd));

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  recordSession(db, today);
  pruneExpired(db, projectKey, config.store.expire_after_session_days);

  // Inject a compact context snapshot into Claude's initial context via stdout.
  // Claude Code adds SessionStart hook stdout as context before the first message.
  // A store-maintenance reminder (if any) leads, so it survives snapshot truncation.
  const parts: string[] = [];
  const reminder = gcReminder(config.store.gc_reminder_mb);
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
