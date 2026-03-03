import type { Handler } from "./types";
import { playwrightHandler } from "./playwright";
import { githubHandler } from "./github";
import { gitlabHandler } from "./gitlab";
import { filesystemHandler } from "./filesystem";
import { shellHandler } from "./shell";
import { getBashHandler } from "./bash";
import { linearHandler } from "./linear";
import { slackHandler } from "./slack";
import { tavilyHandler } from "./tavily";
import { databaseHandler } from "./database";
import { sentryHandler } from "./sentry";
import { csvHandler, looksLikeCsv } from "./csv";
import { jsonHandler } from "./json";
import { genericHandler } from "./generic";
import { extractText } from "./types";
import { getProfileHandler } from "../profiles";

export type { CompressionResult, Handler } from "./types";
export { extractText } from "./types";

/**
 * Returns the appropriate compression handler for a given MCP tool name.
 *
 * Dispatch order:
 *   1. Native Bash tool                     → bash handler (CLI-aware, routes on command)
 *   2. User / community profile match       → profile handler (beats TypeScript handlers)
 *   3. Playwright browser_snapshot          → playwright handler
 *   4. GitHub tools                         → github handler
 *   5. GitLab tools                         → gitlab handler
 *   6. Filesystem tools                     → filesystem handler
 *   7. Shell/bash/remote-exec               → shell handler
 *   8. Linear tools                         → linear handler
 *   9. Slack tools                          → slack handler
 *  10. Tavily search/research               → tavily handler
 *  11. Database query tools                 → database handler
 *  12. Sentry tools                         → sentry handler
 *  13. CSV tools (name-based)               → csv handler
 *  14. Bundled profile match                → profile handler
 *  15. Unmatched with JSON output           → json handler
 *  16. CSV content-based fallback           → csv handler
 *  17. Everything else                      → generic handler
 *
 * `input` (tool_input) is used for the Bash tool to route on the command string.
 */
export function getHandler(toolName: string, output: unknown, input?: unknown): Handler {
  // Native Bash tool — inspect tool_input.command for CLI-aware routing
  if (toolName === "Bash") {
    return getBashHandler(input);
  }

  // User and community profiles beat TypeScript handlers
  const highPriorityProfile = getProfileHandler(toolName, ["user", "community"]);
  if (highPriorityProfile) return highPriorityProfile;

  if (toolName.includes("playwright") && toolName.includes("snapshot")) {
    return playwrightHandler;
  }

  if (toolName.startsWith("mcp__github__")) {
    return githubHandler;
  }

  if (toolName.startsWith("mcp__gitlab__")) {
    return gitlabHandler;
  }

  if (
    toolName.startsWith("mcp__filesystem__") ||
    toolName.includes("read_file") ||
    toolName.includes("get_file")
  ) {
    return filesystemHandler;
  }

  if (
    toolName.includes("bash") ||
    toolName.includes("shell") ||
    toolName.includes("terminal") ||
    toolName.includes("run_command") ||
    toolName.includes("ssh_exec") ||
    toolName.includes("exec_command") ||
    toolName.includes("remote_exec") ||
    toolName.includes("container_exec")
  ) {
    return shellHandler;
  }

  if (toolName.includes("linear")) {
    return linearHandler;
  }

  if (toolName.includes("slack")) {
    return slackHandler;
  }

  if (toolName.includes("tavily")) {
    return tavilyHandler;
  }

  if (
    toolName.includes("postgres") ||
    toolName.includes("mysql") ||
    toolName.includes("sqlite") ||
    toolName.includes("database")
  ) {
    return databaseHandler;
  }

  if (toolName.includes("sentry")) {
    return sentryHandler;
  }

  if (toolName.includes("csv")) {
    return csvHandler;
  }

  // Bundled profiles — for tools without a TypeScript handler
  const bundledProfile = getProfileHandler(toolName, ["bundled"]);
  if (bundledProfile) return bundledProfile;

  // Content-based fallbacks
  const text = extractText(output);
  const trimmed = text.trimStart();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return jsonHandler;
  }

  if (looksLikeCsv(text)) {
    return csvHandler;
  }

  return genericHandler;
}
