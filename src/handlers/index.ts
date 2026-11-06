import type { Handler } from "./types";
import { playwrightHandler, isPlaywrightResponse } from "./playwright";
import { githubHandler } from "./github";
import { gitlabHandler } from "./gitlab";
import { filesystemHandler } from "./filesystem";
import { shellHandler } from "./shell";
import { getBashHandler, keepStderrError } from "./bash";
import { linearHandler } from "./linear";
import { slackHandler } from "./slack";
import { tavilyHandler } from "./tavily";
import { databaseHandler } from "./database";
import { sentryHandler } from "./sentry";
import { stripeHandler } from "./stripe";
import { csvHandler, looksLikeCsv } from "./csv";
import { jsonHandler } from "./json";
import { genericHandler } from "./generic";
import { extractText } from "./types";
import { getProfileHandler } from "../profiles";

export type { CompressionResult, Handler } from "./types";
export { extractText } from "./types";

// ---------------------------------------------------------------------------
// Typed-handler registry
// ---------------------------------------------------------------------------

/** A single entry in the handler registry. First match wins. */
type HandlerMatcher = {
  match: (toolName: string, output: unknown) => boolean;
  handler: Handler;
};

/**
 * Ordered list of typed handlers.  Dispatch walks this array and returns the
 * first entry whose `match` function returns true for the tool name.
 *
 * Order is load-bearing: more-specific patterns (exact prefix matches) come
 * before broader keyword matches so they are not shadowed.
 */
const HANDLER_REGISTRY: HandlerMatcher[] = [
  {
    // Every Playwright action and evaluate returns the page response, not only browser_snapshot (#424).
    match: (t, output) => t.includes("playwright") && (t.includes("snapshot") || isPlaywrightResponse(output)),
    handler: playwrightHandler,
  },
  {
    match: (t) => t.startsWith("mcp__github__"),
    handler: githubHandler,
  },
  {
    match: (t) => t.startsWith("mcp__gitlab__"),
    handler: gitlabHandler,
  },
  {
    match: (t) => t.startsWith("mcp__stripe__"),
    handler: stripeHandler,
  },
  {
    match: (t) =>
      t.startsWith("mcp__filesystem__") ||
      t.includes("read_file") ||
      t.includes("get_file"),
    handler: filesystemHandler,
  },
  {
    match: (t) =>
      t.includes("bash") ||
      t.includes("shell") ||
      t.includes("terminal") ||
      t.includes("run_command") ||
      t.includes("ssh_exec") ||
      t.includes("exec_command") ||
      t.includes("remote_exec") ||
      t.includes("container_exec"),
    handler: shellHandler,
  },
  {
    match: (t) => t.includes("linear"),
    handler: linearHandler,
  },
  {
    match: (t) => t.includes("slack"),
    handler: slackHandler,
  },
  {
    match: (t) => t.includes("tavily"),
    handler: tavilyHandler,
  },
  {
    match: (t) =>
      t.includes("postgres") ||
      t.includes("mysql") ||
      t.includes("sqlite") ||
      t.includes("database"),
    handler: databaseHandler,
  },
  {
    match: (t) => t.includes("sentry"),
    handler: sentryHandler,
  },
  {
    match: (t) => t.includes("csv"),
    handler: csvHandler,
  },
];

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function parsesAsJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the appropriate compression handler for a given MCP tool name.
 *
 * Dispatch order:
 *   1. Native Bash tool              → bash handler (CLI-aware, routes on command;
 *                                      an error only on stderr goes to shell, #326)
 *   2. User / community profiles     → profile handler (beats TypeScript handlers)
 *   3. HANDLER_REGISTRY (first match wins, ordered by specificity)
 *   4. Bundled profile match         → profile handler
 *   5. JSON content fallback         → json handler
 *   6. CSV content fallback          → csv handler
 *   7. Everything else               → generic handler
 *
 * A result with image or other non-text blocks never reaches here: the hook
 * delivers it unchanged (#441).
 *
 * `input` (tool_input) is passed through to the Bash handler for CLI-aware routing.
 */
export function getHandler(toolName: string, output: unknown, input?: unknown): Handler {
  // Native Bash tool — inspect tool_input.command for CLI-aware routing
  if (toolName === "Bash") {
    return keepStderrError(getBashHandler(input), output);
  }

  // User and community profiles beat TypeScript handlers
  const highPriorityProfile = getProfileHandler(toolName, ["user", "community"]);
  if (highPriorityProfile) return highPriorityProfile;

  // Walk the typed-handler registry in priority order
  for (const { match, handler } of HANDLER_REGISTRY) {
    if (match(toolName, output)) return handler;
  }

  // Bundled profiles — for tools without a TypeScript handler
  const bundledProfile = getProfileHandler(toolName, ["bundled"]);
  if (bundledProfile) return bundledProfile;

  // Content-based fallbacks
  const text = extractText(output);
  const trimmed = text.trimStart();

  // A log line such as "[WARN] …" opens with a bracket too; jsonHandler would cut it to 500 chars.
  if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && parsesAsJson(trimmed)) {
    return jsonHandler;
  }

  if (looksLikeCsv(text)) {
    return csvHandler;
  }

  return genericHandler;
}
