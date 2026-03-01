import { createHash } from "crypto";
import { spawnSync } from "child_process";

/**
 * Resolves a stable project key for the given working directory.
 * Prefers git root for stability across launch locations.
 * Falls back to cwd if not inside a git repo.
 * Returns a 16-char hex hash of the resolved path.
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
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (result.status === 0 && result.stdout) {
    return result.stdout.trim();
  }

  return cwd;
}

function hashPath(path: string): string {
  return createHash("sha256").update(path).digest("hex").slice(0, 16);
}
