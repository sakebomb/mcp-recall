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

    it("drops reproducible Bash (git log/status, tests, ls, grep, docker ps)", () => {
      for (const c of [
        "git log --oneline", "git status", "cargo test", "pytest -q",
        "ls -la", "grep -rn foo src/", "docker ps -a", "make build",
      ]) {
        expect(shouldRetainFullBody("balanced", "Bash", c)).toBe(false);
      }
    });

    it("keeps content reads, whose summary drops what Claude asked for (#332)", () => {
      for (const c of [
        "git diff", "git show HEAD~1", "cat README.md", "sed -n 900,1000p src/x.ts",
        "grep -n foo -A 30 src/x.ts | head -40", 'echo "=== a"; cat a.md',
        "cd /repo && git --no-pager diff main", "timeout 30 cat big.log", "sudo cat /etc/hosts",
      ]) {
        expect(shouldRetainFullBody("balanced", "Bash", c)).toBe(true);
      }
      expect(shouldRetainFullBody("minimal", "Bash", "cat README.md")).toBe(false);
    });

    it("keeps network-fetch Bash (curl / wget / gh api) — expensive, stays valid", () => {
      for (const c of ["curl https://api.example.com/data", "wget http://x/y.tar", "gh api repos/o/r/issues"]) {
        expect(shouldRetainFullBody("balanced", "Bash", c)).toBe(true);
      }
    });

    // #260 review: this module kept its own `cd`-unwrap regex that understood only
    // `&&`/`;`. A network fetch behind a NEWLINE-separated `cd` therefore failed
    // both the unwrap and the network match, was classified reproducible, and had
    // its body dropped under `balanced` — silently discarding output that by
    // definition cannot be reproduced. Unwrapping now delegates to the one shared
    // normalizer, so every separator shape classifies identically.
    it("keeps a network-fetch body behind a newline-separated `cd` (#260)", () => {
      expect(shouldRetainFullBody("balanced", "Bash", "cd /repo\ncurl https://example.com")).toBe(true);
      expect(shouldRetainFullBody("balanced", "Bash", "cd /repo\ngh api /repos/x/y")).toBe(true);
      expect(shouldRetainFullBody("balanced", "Bash", "cd /repo\nwget https://example.com/f.tar")).toBe(true);
    });

    it("classifies a newline-separated `cd` identically to `&&` (#260)", () => {
      for (const cmd of ["curl https://example.com", "git diff", "git log", "ls -la", "gh api /x"]) {
        expect(shouldRetainFullBody("balanced", "Bash", `cd /repo\n${cmd}`))
          .toBe(shouldRetainFullBody("balanced", "Bash", `cd /repo && ${cmd}`));
      }
    });

    it("unwraps leading `cd <dir> && ` (including multi-hop) before classifying", () => {
      expect(shouldRetainFullBody("balanced", "Bash", "cd /repo && git log")).toBe(false);
      expect(shouldRetainFullBody("balanced", "Bash", "cd /repo && curl https://x")).toBe(true);
      // multi-hop cd chains must still reach the real command
      expect(shouldRetainFullBody("balanced", "Bash", "cd /a && cd /b && curl https://x")).toBe(true);
      expect(shouldRetainFullBody("balanced", "Bash", "cd /a; cd /b; git log")).toBe(false);
    });

    it("unwraps leading wrappers before classifying (#302)", () => {
      expect(shouldRetainFullBody("balanced", "Bash", "timeout 30 curl https://x")).toBe(true);
      expect(shouldRetainFullBody("balanced", "Bash", "env CI=1 gh api /x")).toBe(true);
      expect(shouldRetainFullBody("balanced", "Bash", "timeout 30 git log")).toBe(false);
    });

    it("keeps unknown intercepted tools (never silently drop the unrecognised)", () => {
      expect(shouldRetainFullBody("balanced", "SomeFutureTool")).toBe(true);
    });
  });
});
