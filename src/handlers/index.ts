import type { Handler } from "./types";
import { playwrightHandler } from "./playwright";
import { githubHandler } from "./github";
import { filesystemHandler } from "./filesystem";
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
 *   1. Playwright browser_snapshot → playwright handler
 *   2. GitHub tools               → github handler
 *   3. Filesystem tools           → filesystem handler
 *   4. Linear tools               → linear handler
 *   5. Slack tools                → slack handler
 *   6. CSV tools (name-based)     → csv handler
 *   7. Unmatched with JSON output → json handler
 *   8. CSV content-based fallback → csv handler
 *   9. Everything else            → generic handler
 */
export function getHandler(toolName: string, output: unknown): Handler {
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
