import { statSync } from "fs";
import type { Database } from "bun:sqlite";
import { getProjectPath } from "../project-key";
import { getMeta, setMeta } from "../db/index";
import { log } from "../log";

/** True only for a path that exists AND is a directory — a project path is never a file. */
function isExistingDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Records the store's project path so `mcp-recall gc` can tell whether the project
 * still exists on disk (orphan detection is path-existence based).
 *
 * Only a path that resolves to a real directory is recorded. The path is absolute
 * by construction, but absolute is not the same as true: a relative payload `cwd`
 * gets rooted against this process's cwd, which may not be where it was meant to be
 * rooted. The hooks run *inside* the project, so a resolved path that does not
 * exist means the guess was wrong — and recording it would let gc read a live
 * project as "path gone, parent present" and delete its database.
 *
 * Skipping is not the same as clearing: a database that already holds a verified
 * path keeps it. That is the better evidence — a path that once resolved beats a
 * guess that just failed.
 *
 * `onlyIfMissing` is for post-tool-use, which runs on every call: it writes only
 * when the store has no path yet. A store can be opened with no SessionStart for
 * it, as by a subagent (which fires SubagentStart) in its own worktree, and would
 * otherwise never learn its path (#488). The store key is a hash of this same resolved path, so the
 * path recorded always belongs to the store it lands in.
 */
export function recordProjectPath(db: Database, cwd: string, onlyIfMissing = false): void {
  if (onlyIfMissing && getMeta(db, "project_path") !== null) return;
  const projectPath = getProjectPath(cwd);
  if (isExistingDir(projectPath)) {
    setMeta(db, "project_path", projectPath);
  } else {
    log.debug(`resolved project path is not a directory, leaving meta as-is: ${projectPath}`);
  }
}
