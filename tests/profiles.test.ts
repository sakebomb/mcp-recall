import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, utimesSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { clearProfileCache, loadProfiles } from "../src/profiles/loader";
import { resolveProfile } from "../src/profiles/index";
import { getProfileHandler } from "../src/profiles/index";
import { getHandler } from "../src/handlers/index";
import { applyJsonExtract, applyJsonTruncate, applyTextTruncate } from "../src/profiles/strategies";
import type { ProfileStrategy } from "../src/profiles/types";

// ── test fixture helpers ──────────────────────────────────────────────────────

function makeProfileDir(): string {
  return mkdtempSync(join(tmpdir(), "recall-profiles-"));
}

function writeProfile(dir: string, name: string, content: string): string {
  const file = join(dir, name);
  writeFileSync(file, content);
  return file;
}

const JIRA_PROFILE = `
[profile]
id          = "mcp__jira"
version     = "1.0.0"
description = "Jira issues"
mcp_pattern = "mcp__jira__*"

[strategy]
type       = "json_extract"
items_path = ["issues"]
fields     = ["key", "fields.summary", "fields.status.name"]
max_items  = 5
`;

const EXACT_PROFILE = `
[profile]
id          = "mcp__jira__search"
version     = "1.0.0"
description = "Exact match for Jira search"
mcp_pattern = "mcp__jira__search_issues"

[strategy]
type   = "text_truncate"
max_chars = 100
`;

const TRUNCATE_PROFILE = `
[profile]
id          = "mcp__myservice"
version     = "1.0.0"
description = "Plain text truncation"
mcp_pattern = "mcp__myservice__*"

[strategy]
type      = "text_truncate"
max_chars = 50
`;

// ── loader tests ──────────────────────────────────────────────────────────────

describe("loadProfiles — loader", () => {
  let userDir: string;

  beforeEach(() => {
    userDir = makeProfileDir();
    clearProfileCache();
    process.env.RECALL_USER_PROFILES_PATH = userDir;
    process.env.RECALL_COMMUNITY_PROFILES_PATH = join(tmpdir(), "nonexistent-community");
    process.env.RECALL_BUNDLED_PROFILES_PATH = join(tmpdir(), "nonexistent-bundled");
  });

  afterEach(() => {
    rmSync(userDir, { recursive: true, force: true });
    delete process.env.RECALL_USER_PROFILES_PATH;
    delete process.env.RECALL_COMMUNITY_PROFILES_PATH;
    delete process.env.RECALL_BUNDLED_PROFILES_PATH;
    clearProfileCache();
  });

  test("returns empty array when profiles directory does not exist", () => {
    process.env.RECALL_USER_PROFILES_PATH = join(tmpdir(), "no-such-dir");
    expect(loadProfiles()).toEqual([]);
  });

  test("loads a valid profile from user dir", () => {
    writeProfile(userDir, "jira.toml", JIRA_PROFILE);
    const profiles = loadProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0]!.spec.profile.id).toBe("mcp__jira");
    expect(profiles[0]!.tier).toBe("user");
    expect(profiles[0]!.patterns).toEqual(["mcp__jira__*"]);
  });

  test("skips invalid TOML files silently", () => {
    writeProfile(userDir, "broken.toml", "this is not valid = [[[ toml");
    expect(loadProfiles()).toHaveLength(0);
  });

  test("skips profiles missing required fields", () => {
    writeProfile(userDir, "bad.toml", `
[profile]
id = "missing-fields"
[strategy]
type = "text_truncate"
`);
    expect(loadProfiles()).toHaveLength(0);
  });

  test("caches result by mtime — second call returns same object", () => {
    writeProfile(userDir, "jira.toml", JIRA_PROFILE);
    const first = loadProfiles();
    const second = loadProfiles();
    expect(first[0]!.spec).toBe(second[0]!.spec); // same reference
  });

  test("invalidates cache when file mtime changes", async () => {
    const file = writeProfile(userDir, "jira.toml", JIRA_PROFILE);
    const first = loadProfiles();
    // Force mtime change
    await new Promise((r) => setTimeout(r, 10));
    const future = new Date(Date.now() + 5000);
    utimesSync(file, future, future);
    clearProfileCache();
    const second = loadProfiles();
    expect(second[0]!.spec).not.toBe(first[0]!.spec); // different reference after re-parse
  });
});

// ── resolver tests ────────────────────────────────────────────────────────────

describe("resolveProfile — priority", () => {
  let userDir: string;
  let communityDir: string;

  beforeEach(() => {
    userDir = makeProfileDir();
    communityDir = makeProfileDir();
    clearProfileCache();
    process.env.RECALL_USER_PROFILES_PATH = userDir;
    process.env.RECALL_COMMUNITY_PROFILES_PATH = communityDir;
    process.env.RECALL_BUNDLED_PROFILES_PATH = join(tmpdir(), "nonexistent-bundled");
  });

  afterEach(() => {
    rmSync(userDir, { recursive: true, force: true });
    rmSync(communityDir, { recursive: true, force: true });
    delete process.env.RECALL_USER_PROFILES_PATH;
    delete process.env.RECALL_COMMUNITY_PROFILES_PATH;
    delete process.env.RECALL_BUNDLED_PROFILES_PATH;
    clearProfileCache();
  });

  test("returns null when no profile matches", () => {
    writeProfile(userDir, "jira.toml", JIRA_PROFILE);
    const profiles = loadProfiles();
    expect(resolveProfile("mcp__notion__search", profiles)).toBeNull();
  });

  test("exact match beats wildcard in same tier", () => {
    writeProfile(userDir, "jira-wildcard.toml", JIRA_PROFILE);
    writeProfile(userDir, "jira-exact.toml", EXACT_PROFILE);
    const profiles = loadProfiles();
    const match = resolveProfile("mcp__jira__search_issues", profiles);
    expect(match!.spec.profile.id).toBe("mcp__jira__search");
  });

  test("user tier beats community tier", () => {
    writeProfile(userDir, "jira.toml", JIRA_PROFILE);
    writeProfile(communityDir, "jira-community.toml", `
[profile]
id          = "mcp__jira__community"
version     = "1.0.0"
description = "Community Jira profile"
mcp_pattern = "mcp__jira__*"
[strategy]
type   = "text_truncate"
max_chars = 200
fields = ["key"]
`);
    const profiles = loadProfiles();
    const match = resolveProfile("mcp__jira__search_issues", profiles);
    expect(match!.tier).toBe("user");
    expect(match!.spec.profile.id).toBe("mcp__jira");
  });
});

// ── strategy tests ────────────────────────────────────────────────────────────

describe("applyJsonExtract", () => {
  const base: ProfileStrategy = {
    type: "json_extract",
    items_path: ["issues"],
    fields: ["key", "fields.summary"],
    max_items: 10,
    max_chars_per_field: 100,
    fallback_chars: 500,
  };

  // Context7 sends markdown in a top-level text-block array; a `learn` profile
  // guessed JSON fields for it and every summary came out as "1 item:\n1. ".
  const guessed: ProfileStrategy = {
    type: "json_extract",
    items_path: ["items", "results", "data", "nodes"],
    fields: ["id", "title", "name", "libraryId"],
    max_items: 10,
    max_chars_per_field: 200,
    fallback_chars: 500,
  };

  test("summarizes markdown in a top-level text-block array instead of emitting empty items", () => {
    const markdown = "Available Libraries:\n\n- Title: SQLite\n- Context7-compatible library ID: /websites/sqlite_docs\n" + "- Description: an embedded SQL engine\n".repeat(40);
    const result = applyJsonExtract(guessed, "mcp__context7__resolve-library-id", [{ type: "text", text: markdown }]);
    expect(result.summary).toContain("/websites/sqlite_docs");
    expect(result.summary).not.toMatch(/^\d+ items?:\n1\. $/m);
  });

  test("parses a JSON body carried in a top-level text-block array", () => {
    const body = JSON.stringify({ results: [{ id: "lib-1", title: "First" }, { id: "lib-2", title: "Second" }] });
    const result = applyJsonExtract(guessed, "mcp__x__search", [{ type: "text", text: body }]);
    expect(result.summary).toContain("2 items:");
    expect(result.summary).toContain("id: lib-1");
    expect(result.summary).toContain("title: Second");
  });

  test("falls back to an excerpt when no configured field matches any item", () => {
    const output = JSON.stringify({ results: [{ other: "unmatched value one" }, { other: "unmatched value two" }] });
    const result = applyJsonExtract(guessed, "mcp__x__search", output);
    expect(result.summary).toContain("unmatched value one");
    expect(result.summary).not.toContain("1. ");
  });

  test("extracts fields from items array", () => {
    const output = JSON.stringify({
      issues: [
        { key: "PROJ-1", fields: { summary: "Fix bug" } },
        { key: "PROJ-2", fields: { summary: "Add feature" } },
      ],
    });
    const result = applyJsonExtract(base, "mcp__jira__search", output);
    expect(result.summary).toContain("2 items");
    expect(result.summary).toContain("PROJ-1");
    expect(result.summary).toContain("Fix bug");
  });

  test("tries items_path entries in order", () => {
    const strategy: ProfileStrategy = { ...base, items_path: ["missing", "nodes"] };
    const output = JSON.stringify({ nodes: [{ key: "X-1", fields: { summary: "hello" } }] });
    const result = applyJsonExtract(strategy, "mcp__tool__x", output);
    expect(result.summary).toContain("X-1");
  });

  test("treats root-level array as items", () => {
    const strategy: ProfileStrategy = { ...base, items_path: [] };
    const output = JSON.stringify([{ key: "A-1", fields: { summary: "root item" } }]);
    const result = applyJsonExtract(strategy, "mcp__tool__x", output);
    expect(result.summary).toContain("A-1");
  });

  test("treats single object as one-item list", () => {
    const strategy: ProfileStrategy = { ...base, items_path: ["data.issue"] };
    const output = JSON.stringify({ data: { issue: { key: "S-1", fields: { summary: "single" } } } });
    const result = applyJsonExtract(strategy, "mcp__tool__x", output);
    expect(result.summary).toContain("S-1");
  });

  test("falls back to raw text on JSON parse failure", () => {
    const result = applyJsonExtract(base, "mcp__tool__x", "not json at all");
    expect(result.summary).toBe("not json at all");
  });

  test("respects max_items cap", () => {
    const strategy: ProfileStrategy = { ...base, max_items: 2 };
    const items = Array.from({ length: 5 }, (_, i) => ({ key: `P-${i}`, fields: { summary: `s${i}` } }));
    const output = JSON.stringify({ issues: items });
    const result = applyJsonExtract(strategy, "mcp__tool__x", output);
    expect(result.summary).toContain("…and 3 more");
    expect(result.summary).not.toContain("P-2");
  });

  test("uses custom labels when provided", () => {
    const strategy: ProfileStrategy = {
      ...base,
      labels: { key: "Ticket", "fields.summary": "Title" },
    };
    const output = JSON.stringify({ issues: [{ key: "X-1", fields: { summary: "test" } }] });
    const result = applyJsonExtract(strategy, "mcp__tool__x", output);
    expect(result.summary).toContain("Ticket: X-1");
    expect(result.summary).toContain("Title: test");
  });
});

describe("applyJsonTruncate", () => {
  test("limits nesting depth", () => {
    const strategy: ProfileStrategy = { type: "json_truncate", max_depth: 1, max_array_items: 10 };
    const output = JSON.stringify({ a: { b: { c: "deep" } } });
    const result = applyJsonTruncate(strategy, "mcp__tool__x", output);
    expect(result.summary).toContain("…");
  });

  test("limits array items", () => {
    const strategy: ProfileStrategy = { type: "json_truncate", max_depth: 3, max_array_items: 2 };
    const output = JSON.stringify({ items: [1, 2, 3, 4, 5] });
    const result = applyJsonTruncate(strategy, "mcp__tool__x", output);
    expect(result.summary).toContain("3 more");
  });
});

describe("applyTextTruncate", () => {
  test("truncates at max_chars", () => {
    const strategy: ProfileStrategy = { type: "text_truncate", max_chars: 10 };
    const result = applyTextTruncate(strategy, "mcp__tool__x", "hello world this is long");
    expect(result.summary).toBe("hello worl\n…");
  });

  test("returns full text when under limit", () => {
    const strategy: ProfileStrategy = { type: "text_truncate", max_chars: 100 };
    const result = applyTextTruncate(strategy, "mcp__tool__x", "short");
    expect(result.summary).toBe("short");
  });

  test("returns complete text ending in a newline unchanged", () => {
    const strategy: ProfileStrategy = { type: "text_truncate", max_chars: 100 };
    const result = applyTextTruncate(strategy, "mcp__tool__x", "short\n----------\n");
    expect(result.summary).toBe("short\n----------\n");
  });
});

// ── integration: getProfileHandler ───────────────────────────────────────────

describe("getProfileHandler — integration", () => {
  let userDir: string;

  beforeEach(() => {
    userDir = makeProfileDir();
    clearProfileCache();
    process.env.RECALL_USER_PROFILES_PATH = userDir;
    process.env.RECALL_COMMUNITY_PROFILES_PATH = join(tmpdir(), "nonexistent-community");
    process.env.RECALL_BUNDLED_PROFILES_PATH = join(tmpdir(), "nonexistent-bundled");
  });

  afterEach(() => {
    rmSync(userDir, { recursive: true, force: true });
    delete process.env.RECALL_USER_PROFILES_PATH;
    delete process.env.RECALL_COMMUNITY_PROFILES_PATH;
    delete process.env.RECALL_BUNDLED_PROFILES_PATH;
    clearProfileCache();
  });

  test("returns null for unmatched tool", () => {
    writeProfile(userDir, "jira.toml", JIRA_PROFILE);
    expect(getProfileHandler("mcp__notion__search")).toBeNull();
  });

  test("returns handler for matched tool", () => {
    writeProfile(userDir, "jira.toml", JIRA_PROFILE);
    const handler = getProfileHandler("mcp__jira__search_issues");
    expect(handler).not.toBeNull();
    expect(typeof handler).toBe("function");
  });

  test("returned handler name reflects profile id", () => {
    writeProfile(userDir, "jira.toml", JIRA_PROFILE);
    const handler = getProfileHandler("mcp__jira__search_issues");
    expect(handler!.name).toBe("profile:mcp__jira");
  });

  test("returned handler produces a summary", () => {
    writeProfile(userDir, "truncate.toml", TRUNCATE_PROFILE);
    const handler = getProfileHandler("mcp__myservice__list");
    const result = handler!("mcp__myservice__list", "hello world this is a long response");
    expect(result.summary).toContain("hello world");
    expect(result.originalSize).toBeGreaterThan(0);
  });
});

describe("bundled Context7 profiles", () => {
  beforeEach(() => {
    clearProfileCache();
    process.env.RECALL_USER_PROFILES_PATH = join(tmpdir(), "nonexistent-user");
    process.env.RECALL_COMMUNITY_PROFILES_PATH = join(tmpdir(), "nonexistent-community");
    process.env.RECALL_BUNDLED_PROFILES_PATH = join(import.meta.dir, "..", "profiles");
  });

  afterEach(() => {
    delete process.env.RECALL_USER_PROFILES_PATH;
    delete process.env.RECALL_COMMUNITY_PROFILES_PATH;
    delete process.env.RECALL_BUNDLED_PROFILES_PATH;
    clearProfileCache();
  });

  // Real responses are markdown in a top-level text-block array.
  const block = (text: string) => [{ type: "text", text }];

  test("resolve-library-id leaves a typical library list intact", () => {
    // Real lists run ~1.6 KB: long enough that a 500-char cut drops library IDs.
    const list = "Available Libraries:\n\n" + Array.from({ length: 5 }, (_, i) =>
      `- Title: Lib ${i}\n- Context7-compatible library ID: /org/lib-${i}\n- Description: ${"An embedded library for testing. ".repeat(6)}\n- Code Snippets: ${i * 10}\n----------\n`).join("");
    expect(list.length).toBeGreaterThan(1200);
    const output = block(list);
    const handler = getHandler("mcp__context7__resolve-library-id", output);
    const { summary, originalSize } = handler("mcp__context7__resolve-library-id", output);
    for (let i = 0; i < 5; i++) expect(summary).toContain(`/org/lib-${i}`);
    expect(Buffer.byteLength(summary)).toBeGreaterThanOrEqual(originalSize); // the hook passes it through
  });

  test("query-docs keeps the top of the documentation", () => {
    const docs = "### useEffect cleanup\n\nReturn a function from the effect.\n" + "More reference text. ".repeat(70) +
      "MID_MARKER " + "More reference text. ".repeat(400) + "BOTTOM_MARKER";
    expect(docs.indexOf("MID_MARKER")).toBeGreaterThan(1000);
    const output = block(docs);
    const { summary } = getHandler("mcp__context7__query-docs", output)("mcp__context7__query-docs", output);
    expect(summary.startsWith("### useEffect cleanup")).toBe(true);
    expect(summary).toContain("MID_MARKER"); // more than a 500-char excerpt
    expect(summary).not.toContain("BOTTOM_MARKER");
    expect(summary.length).toBeLessThan(2100);
  });
});

describe("bundled mcp__cloudflare__docs profile", () => {
  beforeEach(() => {
    clearProfileCache();
    process.env.RECALL_USER_PROFILES_PATH = join(tmpdir(), "nonexistent-user");
    process.env.RECALL_COMMUNITY_PROFILES_PATH = join(tmpdir(), "nonexistent-community");
    process.env.RECALL_BUNDLED_PROFILES_PATH = join(import.meta.dir, "..", "profiles");
  });

  afterEach(() => {
    delete process.env.RECALL_USER_PROFILES_PATH;
    delete process.env.RECALL_COMMUNITY_PROFILES_PATH;
    delete process.env.RECALL_BUNDLED_PROFILES_PATH;
    clearProfileCache();
  });

  // Same shape as real responses: { results: [{ similarity, id, url, title, text }] }.
  const results = Array.from({ length: 7 }, (_, i) => ({
    similarity: 0.9 - i / 100,
    id: "f".repeat(64),
    url: `https://developers.cloudflare.com/workers/page-${i}/`,
    title: `Workers page ${i}`,
    text: `Section ${i} intro. ` + "Durable Objects coordinate state across requests. ".repeat(60) + `TAIL_MARKER_${i}`,
  }));
  const json = JSON.stringify({ results });
  // Stored rows begin `{"results":[`, so the hook receives the standard
  // { content: [...] } wrapper or a plain string; both extract to this JSON.
  const shapes: [string, unknown][] = [
    ["content-wrapped", { content: [{ type: "text", text: json }] }],
    ["plain string", json],
  ];

  for (const [label, output] of shapes) {
    test(`routes through the dispatcher and keeps title and URL per result (${label})`, () => {
      const handler = getHandler("mcp__cloudflare__docs", output);
      expect(handler.name).toBe("profile:mcp__cloudflare__docs");

      const { summary, originalSize } = handler("mcp__cloudflare__docs", output);
      for (let i = 0; i < 5; i++) {
        expect(summary).toContain(`Workers page ${i}`);
        expect(summary).toContain(`https://developers.cloudflare.com/workers/page-${i}/`);
      }
      expect(summary).toContain("Section 0 intro.");
      expect(summary).not.toContain("TAIL_MARKER_0");
      expect(1 - Buffer.byteLength(summary) / originalSize).toBeGreaterThan(0.8);
    });
  }

  test("does not claim other Cloudflare tools", () => {
    expect(getProfileHandler("mcp__cloudflare__execute")).toBeNull();
  });
});
