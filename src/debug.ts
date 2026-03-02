import { loadConfig } from "./config";

export function dbg(msg: string): void {
  if (process.env.RECALL_DEBUG || loadConfig().debug.enabled) {
    process.stderr.write(`[recall:debug] ${msg}\n`);
  }
}
