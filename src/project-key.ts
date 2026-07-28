import { createHash } from "crypto";
import { spawnSync } from "child_process";
import { resolve } from "path";

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

  // The fallback is absolutised rather than used verbatim. `cwd` arrives from a
  // hook payload that is only cast, never validated, so it can be relative or "" —
  // and this value is recorded as `project_path`, which `mcp-recall gc` uses to
  // decide whether a project still exists. A relative path there is un-rootable:
  // it read as "parent survived, project deleted" and got the database removed
  // (#212 guards the deletion site; this removes the cause). `resolve("")` yields
  // the process cwd — plausible rather than certain, but absolute and therefore
  // reasoned about honestly downstream.
  //
  // git's --show-toplevel output is already absolute and normalised, and is left
  // untouched: passing it through resolve() could alter the string for some paths
  // and re-key every existing git project's database.
  const resolved = result.status === 0 && result.stdout
    ? result.stdout.trim()
    : resolve(cwd);

  pathCache.set(cwd, resolved);
  return resolved;
}

function hashPath(path: string): string {
  return createHash("sha256").update(path).digest("hex").slice(0, 16);
}
