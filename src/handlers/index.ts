import type { Handler } from "./types";
import { playwrightHandler } from "./playwright";
import { githubHandler } from "./github";
import { filesystemHandler } from "./filesystem";
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
 *   4. Unmatched with JSON output → json handler
 *   5. Everything else            → generic handler
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

  // Content-based fallback: try JSON handler if output looks like JSON
  const text = extractText(output);
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return jsonHandler;
  }

  return genericHandler;
}
