import type { Handler } from "./types";
import { playwrightHandler } from "./playwright";
import { githubHandler } from "./github";
import { filesystemHandler } from "./filesystem";
import { shellHandler } from "./shell";
import { getBashHandler } from "./bash";
import { linearHandler } from "./linear";
import { slackHandler } from "./slack";
import { csvHandler, looksLikeCsv } from "./csv";
import { jsonHandler } from "./json";
import { genericHandler } from "./generic";
import { extractText } from "./types";

export type { CompressionResult, Handler } from "./types";
export { extractText } from "./types";

/**
 * Returns the appropriate compression handler for a given MCP tool name.
 *
 * Dispatch order:
 *   1. Native Bash tool              → bash handler (CLI-aware, routes on command)
 *   2. Playwright browser_snapshot   → playwright handler
 *   3. GitHub tools                  → github handler
 *   4. Filesystem tools              → filesystem handler
 *   5. Shell/bash/remote-exec        → shell handler
 *   6. Linear tools                  → linear handler
 *   7. Slack tools                   → slack handler
 *   8. CSV tools (name-based)        → csv handler
 *   9. Unmatched with JSON output    → json handler
 *  10. CSV content-based fallback    → csv handler
 *  11. Everything else               → generic handler
 *
 * `input` (tool_input) is used for the Bash tool to route on the command string.
 */
export function getHandler(toolName: string, output: unknown, input?: unknown): Handler {
  // Native Bash tool — inspect tool_input.command for CLI-aware routing
  if (toolName === "Bash") {
    return getBashHandler(input);
  }

  if (toolName.includes("playwright") && toolName.includes("snapshot")) {
    return playwrightHandler;
  }

  if (toolName.startsWith("mcp__github__")) {
    return githubHandler;
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

  if (toolName.includes("csv")) {
    return csvHandler;
  }

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
