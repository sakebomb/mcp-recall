/**
 * Retention policy — decides whether an intercepted output keeps a retrievable
 * verbatim body or is stored summary-only. Driven by `store.retention`:
 *
 *   full     — keep every intercepted body (max retrievability, max disk).
 *   balanced — keep MCP/web/API results, network-fetch Bash (curl/wget/gh api)
 *              and content reads (cat, git diff/show/log -p, head/tail, sed -n ranges,
 *              grep with context), whose summaries drop what Claude asked for
 *              (#332). Store other reproducible Bash (git log/status, tests, ls,
 *              plain grep, docker ps, build/lint…) summary-only: an old copy is
 *              either trivially reproducible or misleadingly stale, and the
 *              summary already delivered its value.
 *   minimal  — drop every intercepted body (summary-only for all).
 *
 * Notes (`recall__note`) never pass through here — they are stored via the note
 * tool, not the hook — so memory always keeps its body regardless of level.
 */
import { normalizeCommand, isContentRead } from "./handlers/bash";

export type RetentionLevel = "full" | "balanced" | "minimal";

// Bash commands whose output is expensive/impossible to reproduce and stays
// valid later (network fetches / API calls) — worth keeping under `balanced`.
const NETWORK_BASH_RE = /^(curl|wget|https?|xh)\b|^gh\s+api\b/;

// Unwrapping a leading `cd <dir>` prefix is delegated to the ONE shared
// normalizer used by handler routing — this module previously kept its own copy
// that understood only `&&`/`;`, so a fetch chained behind a newline-separated
// `cd` was classified reproducible and its body dropped under `balanced`, losing
// output that by definition cannot be reproduced (#260).
const unwrapCommand = normalizeCommand;

/**
 * Returns true when the verbatim body should be persisted for retrieval.
 * `command` is the Bash `tool_input.command` (undefined for non-Bash tools).
 */
export function shouldRetainFullBody(
  level: RetentionLevel,
  toolName: string,
  command?: string
): boolean {
  if (level === "full") return true;
  if (level === "minimal") return false;

  // balanced:
  if (toolName.startsWith("mcp__")) return true; // web/API/scrape — durable, expensive
  if (toolName === "Bash") {
    // A content read's summary drops what Claude asked for (a diff kept as
    // stats, a file as head and tail), so its body is the only copy (#332).
    return NETWORK_BASH_RE.test(unwrapCommand(command ?? "")) || isContentRead(command ?? "");
  }
  // Unknown intercepted tool — keep the body (conservative: never silently drop
  // something we don't understand).
  return true;
}
