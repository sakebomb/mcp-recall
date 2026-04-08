import { loadConfig } from "./config";

export function dbg(msg: string): void {
  if (process.env.RECALL_DEBUG === "1" || loadConfig().debug.enabled) {
    process.stderr.write(`[mcp-recall] debug: ${msg}\n`);
  }
}
