import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { patternsOverlap, testProfile } from "../src/profiles/commands";
import { clearProfileCache } from "../src/profiles/loader";

// ── patternsOverlap ───────────────────────────────────────────────────────────

describe("patternsOverlap", () => {
  test("two identical exact patterns overlap", () => {
    expect(patternsOverlap("mcp__jira__search", "mcp__jira__search")).toBe(true);
  });

  test("two different exact patterns do not overlap", () => {
    expect(patternsOverlap("mcp__jira__search", "mcp__jira__create")).toBe(false);
  });

  test("exact pattern overlaps with matching wildcard", () => {
    expect(patternsOverlap("mcp__jira__search", "mcp__jira__*")).toBe(true);
  });

  test("exact pattern does not overlap with non-matching wildcard", () => {
    expect(patternsOverlap("mcp__notion__search", "mcp__jira__*")).toBe(false);
  });

  test("two wildcards with same prefix overlap", () => {
    expect(patternsOverlap("mcp__jira__*", "mcp__jira__*")).toBe(true);
  });

  test("two wildcards where one is a prefix of the other overlap", () => {
    expect(patternsOverlap("mcp__jira__*", "mcp__jira__search*")).toBe(true);
  });

  test("two wildcards with completely different prefixes do not overlap", () => {
    expect(patternsOverlap("mcp__jira__*", "mcp__notion__*")).toBe(false);
  });
});

// ── testProfile ───────────────────────────────────────────────────────────────

describe("testProfile", () => {
  let userDir: string;

  beforeEach(() => {
    userDir = mkdtempSync(join(tmpdir(), "recall-test-"));
    clearProfileCache();
    process.env.RECALL_USER_PROFILES_PATH = userDir;
    process.env.RECALL_COMMUNITY_PROFILES_PATH = join(tmpdir(), "nonexistent-c");
    process.env.RECALL_BUNDLED_PROFILES_PATH = join(tmpdir(), "nonexistent-b");
  });

  afterEach(() => {
    rmSync(userDir, { recursive: true, force: true });
    delete process.env.RECALL_USER_PROFILES_PATH;
    delete process.env.RECALL_COMMUNITY_PROFILES_PATH;
    delete process.env.RECALL_BUNDLED_PROFILES_PATH;
    clearProfileCache();
  });

  test("matches loaded profile when tool name matches pattern", () => {
    writeFileSync(
      join(userDir, "jira.toml"),
      `[profile]
id = "mcp__jira"
version = "1.0.0"
description = "Jira"
mcp_pattern = "mcp__jira__*"
[strategy]
type = "json_extract"
fields = ["key", "summary"]`
    );

    const content = JSON.stringify({
      key: "PROJ-123",
      summary: "Fix login bug",
      description: "Long description that should be dropped by the extractor",
    });
    const result = testProfile("mcp__jira__search_issues", content);

    expect(result.toolName).toBe("mcp__jira__search_issues");
    expect(result.matchedProfile).not.toBeNull();
    expect(result.matchedProfile!.spec.profile.id).toBe("mcp__jira");
    expect(result.inputBytes).toBeGreaterThan(0);
    expect(result.outputBytes).toBeGreaterThan(0);
    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(0);
  });

  test("returns null matchedProfile when no profile matches", () => {
    const content = JSON.stringify({ foo: "bar" });
    const result = testProfile("mcp__unknown__no_match_here", content);

    expect(result.toolName).toBe("mcp__unknown__no_match_here");
    expect(result.matchedProfile).toBeNull();
    expect(typeof result.handlerName).toBe("string");
    expect(result.handlerName.length).toBeGreaterThan(0);
    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(0);
  });

  test("reductionPct is 0 when originalSize is 0", () => {
    const result = testProfile("mcp__unknown__tool", "");
    expect(result.reductionPct).toBe(0);
  });

  test("inputBytes and outputBytes are non-negative integers", () => {
    const content = JSON.stringify({ message: "hello world", count: 42 });
    const result = testProfile("mcp__unknown__tool", content);

    expect(result.inputBytes).toBeGreaterThanOrEqual(0);
    expect(result.outputBytes).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result.inputBytes)).toBe(true);
    expect(Number.isInteger(result.outputBytes)).toBe(true);
  });
});

// ── cmdCheck via loadProfiles integration ─────────────────────────────────────

describe("profile conflict detection", () => {
  let userDir: string;

  beforeEach(() => {
    userDir = mkdtempSync(join(tmpdir(), "recall-cmd-"));
    clearProfileCache();
    process.env.RECALL_USER_PROFILES_PATH = userDir;
    process.env.RECALL_COMMUNITY_PROFILES_PATH = join(tmpdir(), "nonexistent-c");
    process.env.RECALL_BUNDLED_PROFILES_PATH = join(tmpdir(), "nonexistent-b");
  });

  afterEach(() => {
    rmSync(userDir, { recursive: true, force: true });
    delete process.env.RECALL_USER_PROFILES_PATH;
    delete process.env.RECALL_COMMUNITY_PROFILES_PATH;
    delete process.env.RECALL_BUNDLED_PROFILES_PATH;
    clearProfileCache();
  });

  test("no conflicts when profiles have non-overlapping patterns", () => {
    writeFileSync(
      join(userDir, "jira.toml"),
      `[profile]
id = "mcp__jira"
version = "1.0.0"
description = "Jira"
mcp_pattern = "mcp__jira__*"
[strategy]
type = "json_extract"
fields = ["key"]`
    );
    writeFileSync(
      join(userDir, "notion.toml"),
      `[profile]
id = "mcp__notion"
version = "1.0.0"
description = "Notion"
mcp_pattern = "mcp__notion__*"
[strategy]
type = "text_truncate"`
    );

    const { loadProfiles } = require("../src/profiles/loader");
    const { patternsOverlap } = require("../src/profiles/commands");
    const profiles = loadProfiles();
    expect(profiles).toHaveLength(2);

    // No conflicts: jira vs notion don't overlap
    const a = profiles[0]!;
    const b = profiles[1]!;
    const overlap = a.patterns.some((pa: string) =>
      b.patterns.some((pb: string) => patternsOverlap(pa, pb))
    );
    expect(overlap).toBe(false);
  });

  test("detects conflict when two profiles in same tier have overlapping patterns", () => {
    writeFileSync(
      join(userDir, "jira-broad.toml"),
      `[profile]
id = "mcp__jira"
version = "1.0.0"
description = "Jira broad"
mcp_pattern = "mcp__jira__*"
[strategy]
type = "json_extract"
fields = ["key"]`
    );
    writeFileSync(
      join(userDir, "jira-narrow.toml"),
      `[profile]
id = "mcp__jira__search"
version = "1.0.0"
description = "Jira search only"
mcp_pattern = "mcp__jira__search*"
[strategy]
type = "text_truncate"`
    );

    const { loadProfiles } = require("../src/profiles/loader");
    const { patternsOverlap } = require("../src/profiles/commands");
    const profiles = loadProfiles();
    expect(profiles).toHaveLength(2);

    const a = profiles[0]!;
    const b = profiles[1]!;
    const overlap = a.patterns.some((pa: string) =>
      b.patterns.some((pb: string) => patternsOverlap(pa, pb))
    );
    expect(overlap).toBe(true);
  });
});
