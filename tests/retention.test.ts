import { describe, it, expect } from "bun:test";
import { shouldRetainFullBody } from "../src/retention";

describe("shouldRetainFullBody", () => {
  it("full: keeps every intercepted body", () => {
    expect(shouldRetainFullBody("full", "Bash", "git status")).toBe(true);
    expect(shouldRetainFullBody("full", "Bash", "cargo test")).toBe(true);
    expect(shouldRetainFullBody("full", "mcp__tavily__search")).toBe(true);
  });

  it("minimal: drops every intercepted body", () => {
    expect(shouldRetainFullBody("minimal", "mcp__tavily__search")).toBe(false);
    expect(shouldRetainFullBody("minimal", "Bash", "curl https://x")).toBe(false);
    expect(shouldRetainFullBody("minimal", "Bash", "git diff")).toBe(false);
  });

  describe("balanced", () => {
    it("keeps MCP output (durable/expensive to reproduce)", () => {
      expect(shouldRetainFullBody("balanced", "mcp__tavily__search")).toBe(true);
      expect(shouldRetainFullBody("balanced", "mcp__github__list_issues")).toBe(true);
    });

    it("drops reproducible Bash (git, tests, ls, grep, cat, docker ps)", () => {
      for (const c of [
        "git diff", "git log --oneline", "cargo test", "pytest -q",
        "ls -la", "grep -rn foo src/", "cat README.md", "docker ps -a", "make build",
      ]) {
        expect(shouldRetainFullBody("balanced", "Bash", c)).toBe(false);
      }
    });

    it("keeps network-fetch Bash (curl / wget / gh api) — expensive, stays valid", () => {
      for (const c of ["curl https://api.example.com/data", "wget http://x/y.tar", "gh api repos/o/r/issues"]) {
        expect(shouldRetainFullBody("balanced", "Bash", c)).toBe(true);
      }
    });

    it("unwraps leading `cd <dir> && ` (including multi-hop) before classifying", () => {
      expect(shouldRetainFullBody("balanced", "Bash", "cd /repo && git diff")).toBe(false);
      expect(shouldRetainFullBody("balanced", "Bash", "cd /repo && curl https://x")).toBe(true);
      // multi-hop cd chains must still reach the real command
      expect(shouldRetainFullBody("balanced", "Bash", "cd /a && cd /b && curl https://x")).toBe(true);
      expect(shouldRetainFullBody("balanced", "Bash", "cd /a; cd /b; git diff")).toBe(false);
    });

    it("keeps unknown intercepted tools (never silently drop the unrecognised)", () => {
      expect(shouldRetainFullBody("balanced", "SomeFutureTool")).toBe(true);
    });
  });
});
