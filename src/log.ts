/**
 * Standardized diagnostic logging for mcp-recall.
 *
 * All output goes to stderr using the format:
 *   [mcp-recall] <level>: <message>
 *
 * Debug messages are gated on RECALL_DEBUG=1 or config.debug.enabled.
 * Call setDebugEnabled() after loading config to activate config-based debug.
 */

let _configDebugEnabled = false;

/** Called by config loader to sync config.debug.enabled into the log module. */
export function setDebugEnabled(enabled: boolean): void {
  _configDebugEnabled = enabled;
}

export const log = {
  info: (msg: string): void => {
    process.stderr.write(`[mcp-recall] info: ${msg}\n`);
  },
  warn: (msg: string): void => {
    process.stderr.write(`[mcp-recall] warn: ${msg}\n`);
  },
  error: (msg: string): void => {
    process.stderr.write(`[mcp-recall] error: ${msg}\n`);
  },
  debug: (msg: string): void => {
    if (process.env.RECALL_DEBUG === "1" || _configDebugEnabled) {
      process.stderr.write(`[mcp-recall] debug: ${msg}\n`);
    }
  },
};
