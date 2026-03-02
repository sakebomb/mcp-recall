import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { handleSessionStart } from "../src/hooks/session-start";
import { handlePostToolUse } from "../src/hooks/post-tool-use";
import { getDb, closeDb, listOutputs, getSessionDays, retrieveOutput } from "../src/db/index";
import { resetConfig } from "../src/config";

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
});
