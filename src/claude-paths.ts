/**
 * src/claude-paths.ts
 *
 * Where Claude Code keeps its config. `CLAUDE_CONFIG_DIR` moves all of it,
 * `.claude.json` included, into that directory; without it, `.claude.json`
 * sits in the home directory and the rest under `~/.claude` (#494).
 */

import os from "os";
import path from "path";

function configDirOverride(): string | undefined {
  return process.env.CLAUDE_CONFIG_DIR || undefined;
}

/** The directory holding settings.json, CLAUDE.md and plugins/. */
export function claudeConfigDir(): string {
  return configDirOverride() ?? path.join(os.homedir(), ".claude");
}

/** Claude Code's `.claude.json`, which holds the MCP server entries. */
export function claudeJsonPath(): string {
  const dir = configDirOverride();
  return dir ? path.join(dir, ".claude.json") : path.join(os.homedir(), ".claude.json");
}

/** `p` with the home directory shown as `~`, for output. */
export function tildePath(p: string): string {
  const home = os.homedir();
  return p === home || p.startsWith(home + path.sep) ? "~" + p.slice(home.length) : p;
}
