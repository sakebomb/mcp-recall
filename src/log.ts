/**
 * Standardized diagnostic logging for mcp-recall.
 *
 * All output goes to stderr using the format:
 *   [mcp-recall] <level>: <message>
 *
 * Debug messages are gated on RECALL_DEBUG=1.
 */
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
    if (process.env.RECALL_DEBUG === "1") {
      process.stderr.write(`[mcp-recall] debug: ${msg}\n`);
    }
  },
};
