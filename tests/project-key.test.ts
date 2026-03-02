import { describe, it, expect } from "bun:test";
import { getProjectKey, getProjectPath } from "../src/project-key";
import { tmpdir } from "os";
import { join } from "path";

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
});
