import { describe, it, expect } from "bun:test";
import { getProjectKey, getProjectPath } from "../src/project-key";
import { tmpdir } from "os";
import { join, isAbsolute } from "path";

describe("getProjectKey", () => {
  it("returns a 16-char hex string", () => {
    const key = getProjectKey(process.cwd());
    expect(key).toMatch(/^[a-f0-9]{16}$/);
  });

  it("returns the same key for the same path", () => {
    const a = getProjectKey(process.cwd());
    const b = getProjectKey(process.cwd());
    expect(a).toBe(b);
  });

  it("returns different keys for different paths", () => {
    const a = getProjectKey(process.cwd());
    const b = getProjectKey(tmpdir());
    expect(a).not.toBe(b);
  });

  it("falls back to cwd when not in a git repo", () => {
    const nonGitDir = tmpdir();
    const key = getProjectKey(nonGitDir);
    expect(key).toMatch(/^[a-f0-9]{16}$/);
  });
});

describe("getProjectPath", () => {
  it("returns a non-empty string", () => {
    const path = getProjectPath(process.cwd());
    expect(path.length).toBeGreaterThan(0);
  });

  it("returns git root when inside a git repo", () => {
    const path = getProjectPath(process.cwd());
    // mcp-recall is a git repo — should return git root, not a subdirectory
    expect(path).not.toContain("node_modules");
  });

  it("returns cwd when not in a git repo", () => {
    const nonGitDir = tmpdir();
    const path = getProjectPath(nonGitDir);
    expect(path).toBe(join(nonGitDir));
  });

  // The returned value is recorded as `project_path` and drives gc's decision about
  // whether a project still exists. A relative or empty path is un-rootable there:
  // it read as "parent survived, project deleted" and the database was removed
  // (#212). Hook payloads are cast, never validated, so this must hold for any input.
  // These two reach the non-git fallback (the directories don't exist, so
  // `git rev-parse` fails) and are the cases that actually guard the fix —
  // reverting to a bare `cwd` turns both red.
  it.each([
    ["a bare relative name", "definitely-not-a-real-dir-xyz"],
    ["a relative path with segments", "some/relative/path"],
  ])("returns an absolute path for %s", (_label, input) => {
    const path = getProjectPath(input);
    expect(isAbsolute(path)).toBe(true);
  });

  // Built by concatenation, not join(), which would normalise the input before
  // it ever reached the function — the first version of this test did that and
  // passed no matter what the implementation did.
  it("normalises .. segments in a non-git path", () => {
    const messy = `${tmpdir()}/a/../b`;
    expect(getProjectPath(messy)).toBe(join(tmpdir(), "b"));
  });

  // Which branch answers is runtime-specific: Bun's spawnSync with cwd "" runs in
  // the process cwd so git answers, while Node would chdir("") -> ENOENT and take
  // the fallback. Absolute either way, which is the invariant callers depend on —
  // so this documents that invariant rather than guarding the fix on any runtime.
  it("returns an absolute path for an empty string", () => {
    expect(isAbsolute(getProjectPath(""))).toBe(true);
  });

  it("leaves an already-absolute non-git path unchanged, so keys do not shift", () => {
    // Guards the migration property: normalising must be a no-op for the paths
    // real callers pass, or every existing project would be re-keyed to a new DB.
    const abs = tmpdir();
    expect(getProjectPath(abs)).toBe(abs);
  });
});
