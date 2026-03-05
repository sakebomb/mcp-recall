import { createHash } from "crypto";
import { spawnSync } from "child_process";

const pathCache = new Map<string, string>();

/**
 * Resolves a stable project key for the given working directory.
 * Prefers git root for stability across launch locations.
 * Falls back to cwd if not inside a git repo.
 * Returns a 16-char hex hash of the resolved path.
 * Results are cached — git root won't change within a process.
 */
export function getProjectKey(cwd: string): string {
  const resolved = resolveProjectPath(cwd);
  return hashPath(resolved);
}

/**
 * Returns the raw project path (git root or cwd) without hashing.
 * Useful for display and stats output.
 */
export function getProjectPath(cwd: string): string {
  return resolveProjectPath(cwd);
}

function resolveProjectPath(cwd: string): string {
  const cached = pathCache.get(cwd);
  if (cached !== undefined) return cached;

  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  const resolved = result.status === 0 && result.stdout
    ? result.stdout.trim()
    : cwd;

  pathCache.set(cwd, resolved);
  return resolved;
}

function hashPath(path: string): string {
  return createHash("sha256").update(path).digest("hex").slice(0, 16);
}
