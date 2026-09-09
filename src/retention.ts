/**
 * Retention policy — decides whether an intercepted output keeps a retrievable
 * verbatim body or is stored summary-only. Driven by `store.retention`:
 *
 *   full     — keep every intercepted body (max retrievability, max disk).
 *   balanced — keep MCP/web/API results and network-fetch Bash (curl/wget/gh api);
 *              store reproducible Bash (git, tests, ls, grep, cat, docker ps,
 *              build/lint…) summary-only. An old copy of that output is either
 *              trivially reproducible or misleadingly stale, so it isn't worth
 *              persisting — the summary already delivered its value.
 *   minimal  — drop every intercepted body (summary-only for all).
 *
 * Notes (`recall__note`) never pass through here — they are stored via the note
 * tool, not the hook — so memory always keeps its body regardless of level.
 */
import { normalizeCommand } from "./handlers/bash";

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
    return NETWORK_BASH_RE.test(unwrapCommand(command ?? ""));
  }
  // Unknown intercepted tool — keep the body (conservative: never silently drop
  // something we don't understand).
  return true;
}
