import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { handleSessionStart } from "../src/hooks/session-start";
import { handlePostToolUse } from "../src/hooks/post-tool-use";
import { getDb, closeDb, listOutputs, getSessionDays, retrieveOutput, storeOutput, pinOutput } from "../src/db/index";
import { resetConfig } from "../src/config";
import { getProjectKey } from "../src/project-key";

const TEST_CWD = process.cwd();
const SESSION_ID = "test-session-abc123";

function makeSessionStartInput(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    session_id: SESSION_ID,
    cwd: TEST_CWD,
    hook_event_name: "SessionStart",
    transcript_path: "/tmp/test",
    permission_mode: "default",
    ...overrides,
  });
}

function makePostToolUseInput(
  toolName: string,
  toolResponse: unknown,
  overrides: Record<string, unknown> = {}
): string {
  return JSON.stringify({
    session_id: SESSION_ID,
    cwd: TEST_CWD,
    hook_event_name: "PostToolUse",
    tool_name: toolName,
    tool_input: {},
    tool_response: toolResponse,
    tool_use_id: "toolu_test123",
    transcript_path: "/tmp/test",
    permission_mode: "default",
    ...overrides,
  });
}

// Large enough to compress meaningfully
const LARGE_GITHUB_RESPONSE = JSON.stringify(
  Array.from({ length: 5 }, (_, i) => ({
    number: i + 1,
    title: `Issue number ${i + 1} with a descriptive title`,
    state: "open",
    html_url: `https://github.com/org/repo/issues/${i + 1}`,
    labels: [{ name: "bug" }],
    body: "x".repeat(300),
  }))
);

describe("handleSessionStart", () => {
  beforeEach(() => {
    process.env.RECALL_DB_PATH = ":memory:";
  });

  afterEach(() => {
    closeDb();
    resetConfig();
    delete process.env.RECALL_DB_PATH;
  });

  it("records today's date in the sessions table", () => {
    handleSessionStart(makeSessionStartInput());
    const db = getDb(":memory:");
    const days = getSessionDays(db);
    const today = new Date().toISOString().slice(0, 10);
    expect(days).toContain(today);
  });

  it("is idempotent — running twice records only one session entry", () => {
    handleSessionStart(makeSessionStartInput());
    handleSessionStart(makeSessionStartInput());
    const db = getDb(":memory:");
    const days = getSessionDays(db);
    const today = new Date().toISOString().slice(0, 10);
    expect(days.filter((d) => d === today).length).toBe(1);
  });

  it("does not throw on valid input", () => {
    expect(() => handleSessionStart(makeSessionStartInput())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// handleSessionStart — context snapshot injection
// ---------------------------------------------------------------------------

describe("handleSessionStart — context injection", () => {
  beforeEach(() => {
    process.env.RECALL_DB_PATH = ":memory:";
  });

  afterEach(() => {
    closeDb();
    resetConfig();
    delete process.env.RECALL_DB_PATH;
  });

  it("writes nothing to stdout when the store is empty", () => {
    const spy = spyOn(process.stdout, "write");
    handleSessionStart(makeSessionStartInput());
    const callCount = spy.mock.calls.length;
    spy.mockRestore();
    expect(callCount).toBe(0);
  });

  it("writes context snapshot to stdout when store has a pinned item", () => {
    const db = getDb(":memory:");
    const projectKey = getProjectKey(TEST_CWD);
    const stored = storeOutput(db, {
      project_key: projectKey,
      session_id: "sess-inject-001",
      tool_name: "mcp__github__list_issues",
      summary: "pinned item summary for injection test",
      full_content: "full content here",
      original_size: 100,
    });
    pinOutput(db, stored.id, projectKey, true);

    const spy = spyOn(process.stdout, "write");
    handleSessionStart(makeSessionStartInput());
    const output = spy.mock.calls.map(([chunk]) => String(chunk)).join("");
    spy.mockRestore();

    expect(output).toContain("pinned item summary for injection test");
  });

  it("truncates snapshot at 2000 characters when context is large", () => {
    const db = getDb(":memory:");
    const projectKey = getProjectKey(TEST_CWD);
    // Store enough pinned items to push the formatted snapshot past 2000 chars.
    // toolContext formats each item as ~200 chars; 15 items ≈ 3000 chars.
    for (let i = 0; i < 15; i++) {
      const stored = storeOutput(db, {
        project_key: projectKey,
        session_id: "sess-inject-002",
        tool_name: "mcp__github__list_issues",
        summary: `pinned item ${i} — ${"x".repeat(80)}`,
        full_content: "full",
        original_size: 100,
      });
      pinOutput(db, stored.id, projectKey, true);
    }

    const spy = spyOn(process.stdout, "write");
    handleSessionStart(makeSessionStartInput());
    const output = spy.mock.calls.map(([chunk]) => String(chunk)).join("");
    spy.mockRestore();

    // 2000-char cap + truncation suffix + trailing newline
    expect(output.length).toBeLessThan(2100);
    expect(output).toContain("truncated");
  });

  it("does not inject when the only db content is from an unknown project", () => {
    // Store data under a different project key — should not appear in injection
    const db = getDb(":memory:");
    storeOutput(db, {
      project_key: "completely-different-project-key",
      session_id: "sess-other",
      tool_name: "mcp__github__list_issues",
      summary: "should not appear",
      full_content: "full",
      original_size: 100,
    });

    const spy = spyOn(process.stdout, "write");
    handleSessionStart(makeSessionStartInput());
    const callCount = spy.mock.calls.length;
    spy.mockRestore();

    expect(callCount).toBe(0);
  });
});

describe("handlePostToolUse", () => {
  beforeEach(() => {
    process.env.RECALL_DB_PATH = ":memory:";
  });

  afterEach(() => {
    closeDb();
    resetConfig();
    delete process.env.RECALL_DB_PATH;
  });

  it("returns empty object for denied tools (recall tools)", () => {
    const result = handlePostToolUse(
      makePostToolUseInput("mcp__recall__search", { content: [{ type: "text", text: "x" }] })
    );
    expect(result).toEqual({});
  });

  it("returns empty object for denied tools (1password)", () => {
    const result = handlePostToolUse(
      makePostToolUseInput("mcp__1password__item_lookup", { content: [{ type: "text", text: "secret=abc" }] })
    );
    expect(result).toEqual({});
  });

  it("returns empty object and logs when content contains a secret", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIE...";
    const result = handlePostToolUse(
      makePostToolUseInput("mcp__github__get_file_contents", {
        content: [{ type: "text", text: pem }],
      })
    );
    expect(result).toEqual({});
  });

  it("returns empty object when output is too small to compress", () => {
    const result = handlePostToolUse(
      makePostToolUseInput("mcp__github__list_issues", {
        content: [{ type: "text", text: "tiny" }],
      })
    );
    expect(result).toEqual({});
  });

  it("compresses large output and returns updatedMCPToolOutput", () => {
    const result = handlePostToolUse(
      makePostToolUseInput("mcp__github__list_issues", {
        content: [{ type: "text", text: LARGE_GITHUB_RESPONSE }],
      })
    );
    expect(result.updatedMCPToolOutput).toBeDefined();
    expect(result.suppressOutput).toBe(true);
  });

  it("updatedMCPToolOutput contains recall ID header", () => {
    const result = handlePostToolUse(
      makePostToolUseInput("mcp__github__list_issues", {
        content: [{ type: "text", text: LARGE_GITHUB_RESPONSE }],
      })
    );
    expect(result.updatedMCPToolOutput).toMatch(/^\[recall:recall_[0-9a-f]{8}/);
  });

  it("updatedMCPToolOutput contains size and reduction info", () => {
    const result = handlePostToolUse(
      makePostToolUseInput("mcp__github__list_issues", {
        content: [{ type: "text", text: LARGE_GITHUB_RESPONSE }],
      })
    );
    expect(result.updatedMCPToolOutput).toContain("% reduction");
    expect(result.updatedMCPToolOutput).toMatch(/→\d+(\.\d+)?(B|KB|MB)/);
  });

  it("stores the output in the DB", () => {
    handlePostToolUse(
      makePostToolUseInput("mcp__github__list_issues", {
        content: [{ type: "text", text: LARGE_GITHUB_RESPONSE }],
      })
    );
    const db = getDb(":memory:");
    const items = db.prepare("SELECT COUNT(*) as n FROM stored_outputs").get() as { n: number };
    expect(items.n).toBeGreaterThan(0);
  });

  it("stored output preserves session_id from hook input", () => {
    handlePostToolUse(
      makePostToolUseInput("mcp__github__list_issues", {
        content: [{ type: "text", text: LARGE_GITHUB_RESPONSE }],
      })
    );
    const db = getDb(":memory:");
    const allItems = db.prepare("SELECT * FROM stored_outputs").all() as Array<{ session_id: string }>;
    expect(allItems[0]!.session_id).toBe(SESSION_ID);
  });

  it("stored full_content is the extracted text, not raw MCP wrapper", () => {
    handlePostToolUse(
      makePostToolUseInput("mcp__github__list_issues", {
        content: [{ type: "text", text: LARGE_GITHUB_RESPONSE }],
      })
    );
    const db = getDb(":memory:");
    const items = db.prepare("SELECT * FROM stored_outputs").all() as Array<{ id: string }>;
    const item = retrieveOutput(db, items[0]!.id)!;
    // full_content should be the raw JSON text, not the MCP { content: [...] } wrapper
    expect(item.full_content).toContain('"number"');
    expect(item.full_content).not.toContain('"content":[{');
  });

  // -------------------------------------------------------------------------
  // Dedup
  // -------------------------------------------------------------------------

  it("returns cached response on second call with same tool_input", () => {
    const input = makePostToolUseInput("mcp__github__list_issues", {
      content: [{ type: "text", text: LARGE_GITHUB_RESPONSE }],
    }, { tool_input: { owner: "org", repo: "repo" } });

    handlePostToolUse(input); // first call — stores item
    const second = handlePostToolUse(input); // second call — cache hit

    expect(second.updatedMCPToolOutput).toMatch(/· cached · \d{4}-\d{2}-\d{2}/);
    expect(second.suppressOutput).toBe(true);
  });

  it("cached header contains the original recall id", () => {
    const input = makePostToolUseInput("mcp__github__list_issues", {
      content: [{ type: "text", text: LARGE_GITHUB_RESPONSE }],
    }, { tool_input: { owner: "org", repo: "repo" } });

    const first = handlePostToolUse(input);
    const idMatch = first.updatedMCPToolOutput!.match(/\[recall:(recall_[0-9a-f]{8})/);
    const originalId = idMatch![1];

    const second = handlePostToolUse(input);
    expect(second.updatedMCPToolOutput).toContain(originalId);
  });

  it("does not store a second item on cache hit", () => {
    const input = makePostToolUseInput("mcp__github__list_issues", {
      content: [{ type: "text", text: LARGE_GITHUB_RESPONSE }],
    }, { tool_input: { owner: "org", repo: "repo" } });

    handlePostToolUse(input);
    handlePostToolUse(input);

    const db = getDb(":memory:");
    const count = (db.prepare("SELECT COUNT(*) as n FROM stored_outputs").get() as { n: number }).n;
    expect(count).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Eviction
  // -------------------------------------------------------------------------

  it("evicts non-pinned items after storing when store exceeds max_size_mb", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "recall-hooks-test-"));
    const configPath = join(tempDir, "config.toml");
    // ~3KB limit: allows the new item (~2.25KB) but not the pre-inserted + new item together
    writeFileSync(configPath, "[store]\nmax_size_mb = 0.003\n");
    process.env.RECALL_CONFIG_PATH = configPath;
    resetConfig();

    try {
      const db = getDb(":memory:");
      const projectKey = getProjectKey(TEST_CWD);
      const oldTs = Math.floor(Date.now() / 1000) - 60;
      db.prepare(`
        INSERT INTO stored_outputs
          (id, project_key, session_id, tool_name, summary, full_content, original_size, summary_size, created_at)
        VALUES ('recall_evict0001', ?, 'session', 'mcp__old__tool', 'old', 'old content', 2000, 3, ?)
      `).run(projectKey, oldTs);

      handlePostToolUse(
        makePostToolUseInput("mcp__github__list_issues", {
          content: [{ type: "text", text: LARGE_GITHUB_RESPONSE }],
        })
      );

      // Pre-inserted item (older, lower access_count) should have been evicted
      expect(db.prepare("SELECT id FROM stored_outputs WHERE id = 'recall_evict0001'").get()).toBeNull();
    } finally {
      delete process.env.RECALL_CONFIG_PATH;
      resetConfig();
      rmSync(tempDir, { recursive: true });
    }
  });
});
