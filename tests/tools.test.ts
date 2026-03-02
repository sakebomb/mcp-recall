import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getDb, closeDb, storeOutput, pinOutput, recordSession, type StoreInput } from "../src/db/index";
import {
  toolRetrieve,
  toolSearch,
  toolPin,
  toolNote,
  toolExport,
  toolForget,
  toolListStored,
  toolStats,
  toolSessionSummary,
} from "../src/tools";
import { resetConfig } from "../src/config";
import type { Database } from "bun:sqlite";

const PROJECT_KEY = "tooltest1234567";

function makeInput(overrides: Partial<StoreInput> = {}): StoreInput {
  return {
    project_key: PROJECT_KEY,
    session_id: "test-session-abc",
    tool_name: "mcp__github__list_issues",
    summary: "#1 \"Fix bug\" [open] · labels: bug · body: Something is broken",
    full_content: JSON.stringify([{ number: 1, title: "Fix bug", state: "open", body: "Something is broken" }]),
    original_size: 2048,
    ...overrides,
  };
}

describe("MCP tool handlers", () => {
  let db: Database;

  beforeEach(() => {
    process.env.RECALL_DB_PATH = ":memory:";
    db = getDb(":memory:");
  });

  afterEach(() => {
    closeDb();
    resetConfig();
    delete process.env.RECALL_DB_PATH;
  });

  // -------------------------------------------------------------------------
  // toolRetrieve
  // -------------------------------------------------------------------------

  describe("toolRetrieve", () => {
    it("returns not-found message for unknown id", () => {
      const result = toolRetrieve(db, { id: "recall_00000000" });
      expect(result).toContain("no item found");
    });

    it("returns summary with header when no query given", () => {
      const stored = storeOutput(db, makeInput());
      const result = toolRetrieve(db, { id: stored.id });
      expect(result).toContain(stored.id);
      expect(result).toContain("mcp__github__list_issues");
      expect(result).toContain("Fix bug");
    });

    it("returns full_content when query is given", () => {
      const stored = storeOutput(db, makeInput());
      const result = toolRetrieve(db, { id: stored.id, query: "broken" });
      expect(result).toContain("Something is broken");
    });

    it("applies max_bytes cap to full_content", () => {
      const stored = storeOutput(db, makeInput({ full_content: "x".repeat(2000) }));
      const result = toolRetrieve(db, { id: stored.id, query: "x", max_bytes: 100 });
      expect(result).toContain("truncated");
    });

    it("includes size info in header", () => {
      const stored = storeOutput(db, makeInput({ original_size: 2048 }));
      const result = toolRetrieve(db, { id: stored.id });
      expect(result).toContain("KB");
    });
  });

  // -------------------------------------------------------------------------
  // toolSearch
  // -------------------------------------------------------------------------

  describe("toolSearch", () => {
    it("returns no-results message when nothing matches", () => {
      storeOutput(db, makeInput());
      const result = toolSearch(db, PROJECT_KEY, { query: "zzznomatch" });
      expect(result).toContain("no results");
    });

    it("finds items matching the query", () => {
      storeOutput(db, makeInput({ summary: "critical authentication failure" }));
      const result = toolSearch(db, PROJECT_KEY, { query: "authentication" });
      expect(result).toContain("authentication");
      expect(result).toContain("Found 1 result");
    });

    it("filters by tool name substring", () => {
      storeOutput(db, makeInput({ tool_name: "mcp__github__list_issues", summary: "find me" }));
      storeOutput(db, makeInput({ tool_name: "mcp__playwright__snapshot", summary: "find me" }));

      const result = toolSearch(db, PROJECT_KEY, { query: "find", tool: "github" });
      expect(result).toContain("mcp__github__list_issues");
      expect(result).not.toContain("playwright");
    });

    it("respects limit", () => {
      for (let i = 0; i < 5; i++) {
        storeOutput(db, makeInput({ summary: `result item number ${i}` }));
      }
      const result = toolSearch(db, PROJECT_KEY, { query: "result", limit: 2 });
      expect(result).toContain("Found 2 results");
    });
  });

  // -------------------------------------------------------------------------
  // toolForget
  // -------------------------------------------------------------------------

  describe("toolForget", () => {
    it("requires confirmed: true when all: true", () => {
      const result = toolForget(db, PROJECT_KEY, { all: true });
      expect(result).toContain("requires confirmed: true");
    });

    it("deletes all items when all: true and confirmed: true", () => {
      storeOutput(db, makeInput());
      storeOutput(db, makeInput());
      const result = toolForget(db, PROJECT_KEY, { all: true, confirmed: true });
      expect(result).toContain("deleted 2 items");
    });

    it("deletes by id", () => {
      const stored = storeOutput(db, makeInput());
      const result = toolForget(db, PROJECT_KEY, { id: stored.id });
      expect(result).toContain("deleted 1 item");
    });

    it("deletes by tool name", () => {
      storeOutput(db, makeInput({ tool_name: "mcp__github__list_issues" }));
      storeOutput(db, makeInput({ tool_name: "mcp__github__list_issues" }));
      storeOutput(db, makeInput({ tool_name: "mcp__playwright__snapshot" }));
      const result = toolForget(db, PROJECT_KEY, { tool: "mcp__github__list_issues" });
      expect(result).toContain("deleted 2 items");
    });

    it("returns nothing-deleted message when no match", () => {
      const result = toolForget(db, PROJECT_KEY, { id: "recall_00000000" });
      expect(result).toContain("nothing deleted");
    });
  });

  // -------------------------------------------------------------------------
  // toolListStored
  // -------------------------------------------------------------------------

  describe("toolListStored", () => {
    it("returns no-items message when store is empty", () => {
      const result = toolListStored(db, PROJECT_KEY, {});
      expect(result).toContain("no stored items");
    });

    it("lists stored items with ID, tool, date, and size", () => {
      storeOutput(db, makeInput());
      const result = toolListStored(db, PROJECT_KEY, {});
      expect(result).toContain("recall_");
      expect(result).toContain("mcp__github__list_issues");
    });

    it("paginates with limit and offset", () => {
      for (let i = 0; i < 5; i++) storeOutput(db, makeInput());
      const page1 = toolListStored(db, PROJECT_KEY, { limit: 2, offset: 0 });
      const page2 = toolListStored(db, PROJECT_KEY, { limit: 2, offset: 2 });
      // First IDs should differ between pages
      const id1 = page1.match(/recall_[0-9a-f]{8}/)?.[0];
      const id2 = page2.match(/recall_[0-9a-f]{8}/)?.[0];
      expect(id1).not.toBe(id2);
    });

    it("returns no-more-items message when offset exceeds store", () => {
      storeOutput(db, makeInput());
      const result = toolListStored(db, PROJECT_KEY, { limit: 10, offset: 100 });
      expect(result).toContain("no more items");
    });

    it("filters by tool substring", () => {
      storeOutput(db, makeInput({ tool_name: "mcp__github__list_issues" }));
      storeOutput(db, makeInput({ tool_name: "mcp__playwright__snapshot" }));
      const result = toolListStored(db, PROJECT_KEY, { tool: "github" });
      expect(result).toContain("mcp__github__list_issues");
      expect(result).not.toContain("playwright");
    });

    it("sorts by size descending when sort=size", () => {
      storeOutput(db, makeInput({ original_size: 100 }));
      storeOutput(db, makeInput({ original_size: 5000 }));
      const result = toolListStored(db, PROJECT_KEY, { sort: "size" });
      const first = result.indexOf("5.0KB");
      const second = result.indexOf("100B");
      expect(first).toBeLessThan(second);
    });
  });

  // -------------------------------------------------------------------------
  // toolStats
  // -------------------------------------------------------------------------

  describe("toolStats", () => {
    it("returns no-data message when store is empty", () => {
      const result = toolStats(db, PROJECT_KEY);
      expect(result).toContain("no data stored");
    });

    it("shows item count, sizes, and reduction", () => {
      storeOutput(db, makeInput({ original_size: 10000, summary: "x".repeat(100) }));
      storeOutput(db, makeInput({ original_size: 5000, summary: "y".repeat(50) }));
      const result = toolStats(db, PROJECT_KEY);
      expect(result).toContain("Items stored:      2");
      expect(result).toContain("reduction");
    });

    it("shows session days count", () => {
      recordSession(db, "2026-03-01");
      recordSession(db, "2026-02-28");
      storeOutput(db, makeInput());
      const result = toolStats(db, PROJECT_KEY);
      expect(result).toContain("Session days:      2");
    });

    it("shows token savings estimate", () => {
      storeOutput(db, makeInput({ original_size: 40000, summary: "x".repeat(200) }));
      const result = toolStats(db, PROJECT_KEY);
      expect(result).toContain("Tokens saved");
    });
  });

  // -------------------------------------------------------------------------
  // toolRetrieve — updated behavior
  // -------------------------------------------------------------------------

  describe("toolRetrieve (v2)", () => {
    it("increments access_count on retrieve", () => {
      const stored = storeOutput(db, makeInput());
      expect(stored.access_count).toBe(0);
      toolRetrieve(db, { id: stored.id });
      const row = db.prepare("SELECT access_count FROM stored_outputs WHERE id = ?").get(stored.id) as { access_count: number };
      expect(row.access_count).toBe(1);
    });

    it("returns FTS snippet when query matches full_content", () => {
      const stored = storeOutput(db, makeInput({
        full_content: "The deployment pipeline uses kubernetes and helm charts",
      }));
      const result = toolRetrieve(db, { id: stored.id, query: "kubernetes" });
      expect(result).toContain("kubernetes");
    });

    it("falls back to full_content slice when query has no FTS match", () => {
      const stored = storeOutput(db, makeInput({ full_content: "hello world content" }));
      const result = toolRetrieve(db, { id: stored.id, query: "zzznomatch" });
      expect(result).toContain("hello world content");
    });
  });

  // -------------------------------------------------------------------------
  // toolPin
  // -------------------------------------------------------------------------

  describe("toolPin", () => {
    it("pins an item and returns confirmation", () => {
      const stored = storeOutput(db, makeInput());
      const result = toolPin(db, PROJECT_KEY, { id: stored.id });
      expect(result).toContain("pinned");
      expect(result).toContain(stored.id);
    });

    it("unpins when pinned: false", () => {
      const stored = storeOutput(db, makeInput());
      pinOutput(db, stored.id, PROJECT_KEY, true);
      const result = toolPin(db, PROJECT_KEY, { id: stored.id, pinned: false });
      expect(result).toContain("unpinned");
    });

    it("returns not-found for unknown id", () => {
      const result = toolPin(db, PROJECT_KEY, { id: "recall_00000000" });
      expect(result).toContain("no item found");
    });

    it("defaults pinned to true when omitted", () => {
      const stored = storeOutput(db, makeInput());
      toolPin(db, PROJECT_KEY, { id: stored.id });
      const row = db.prepare("SELECT pinned FROM stored_outputs WHERE id = ?").get(stored.id) as { pinned: number };
      expect(row.pinned).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // toolNote
  // -------------------------------------------------------------------------

  describe("toolNote", () => {
    it("stores a note with tool_name recall__note", () => {
      toolNote(db, PROJECT_KEY, { text: "Important finding about the auth flow" });
      const rows = db.prepare("SELECT tool_name FROM stored_outputs WHERE project_key = ?").all(PROJECT_KEY) as Array<{ tool_name: string }>;
      expect(rows.some((r) => r.tool_name === "recall__note")).toBe(true);
    });

    it("returns stored id in response", () => {
      const result = toolNote(db, PROJECT_KEY, { text: "some note text" });
      expect(result).toMatch(/recall_[0-9a-f]{8}/);
    });

    it("includes title in summary when provided", () => {
      toolNote(db, PROJECT_KEY, { text: "content here", title: "My Finding" });
      const row = db.prepare("SELECT summary FROM stored_outputs WHERE tool_name = 'recall__note'").get() as { summary: string };
      expect(row.summary).toContain("My Finding");
    });

    it("uses (note) as default title when none given", () => {
      toolNote(db, PROJECT_KEY, { text: "untitled note" });
      const row = db.prepare("SELECT summary FROM stored_outputs WHERE tool_name = 'recall__note'").get() as { summary: string };
      expect(row.summary).toContain("(note)");
    });

    it("stores full text as full_content", () => {
      const text = "The full text of this important note";
      toolNote(db, PROJECT_KEY, { text });
      const row = db.prepare("SELECT full_content FROM stored_outputs WHERE tool_name = 'recall__note'").get() as { full_content: string };
      expect(row.full_content).toBe(text);
    });

    it("truncates summary at 200 chars with ellipsis", () => {
      const text = "x".repeat(300);
      toolNote(db, PROJECT_KEY, { text });
      const row = db.prepare("SELECT summary FROM stored_outputs WHERE tool_name = 'recall__note'").get() as { summary: string };
      expect(row.summary).toContain("…");
    });
  });

  // -------------------------------------------------------------------------
  // toolExport
  // -------------------------------------------------------------------------

  describe("toolExport", () => {
    it("returns no-items message when store is empty", () => {
      const result = toolExport(db, PROJECT_KEY);
      expect(result).toContain("no items to export");
    });

    it("returns JSON array of stored items", () => {
      storeOutput(db, makeInput());
      const result = toolExport(db, PROJECT_KEY);
      const parsed = JSON.parse(result) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(1);
    });

    it("exported items include id, tool_name, summary, and full_content", () => {
      storeOutput(db, makeInput({ summary: "exported summary" }));
      const result = toolExport(db, PROJECT_KEY);
      const parsed = JSON.parse(result) as Array<Record<string, unknown>>;
      const item = parsed[0]!;
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("tool_name");
      expect(item).toHaveProperty("summary", "exported summary");
      expect(item).toHaveProperty("full_content");
    });

    it("orders items oldest-first", () => {
      const now = Math.floor(Date.now() / 1000);
      db.prepare(`INSERT INTO stored_outputs (id,project_key,session_id,tool_name,summary,full_content,original_size,summary_size,created_at) VALUES ('recall_exp00001',?,?,?,?,?,100,3,?)`).run(PROJECT_KEY, "s", "mcp__tool", "older", "c", now - 10);
      db.prepare(`INSERT INTO stored_outputs (id,project_key,session_id,tool_name,summary,full_content,original_size,summary_size,created_at) VALUES ('recall_exp00002',?,?,?,?,?,100,3,?)`).run(PROJECT_KEY, "s", "mcp__tool", "newer", "c", now);
      const parsed = JSON.parse(toolExport(db, PROJECT_KEY)) as Array<{ summary: string }>;
      expect(parsed[0]!.summary).toBe("older");
      expect(parsed[1]!.summary).toBe("newer");
    });
  });

  // -------------------------------------------------------------------------
  // toolForget (v2) — pin awareness
  // -------------------------------------------------------------------------

  describe("toolForget (v2)", () => {
    it("skips pinned items by default", () => {
      const stored = storeOutput(db, makeInput());
      pinOutput(db, stored.id, PROJECT_KEY, true);
      storeOutput(db, makeInput());
      const result = toolForget(db, PROJECT_KEY, { all: true, confirmed: true });
      expect(result).toContain("deleted 1 item");
      expect(db.prepare("SELECT id FROM stored_outputs WHERE id = ?").get(stored.id)).not.toBeNull();
    });

    it("deletes pinned items when force: true", () => {
      const stored = storeOutput(db, makeInput());
      pinOutput(db, stored.id, PROJECT_KEY, true);
      toolForget(db, PROJECT_KEY, { all: true, confirmed: true, force: true });
      expect(db.prepare("SELECT id FROM stored_outputs WHERE id = ?").get(stored.id)).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // toolListStored (v2) — sort: accessed
  // -------------------------------------------------------------------------

  describe("toolListStored (v2)", () => {
    it("sorts by access_count descending when sort=accessed", () => {
      const a = storeOutput(db, makeInput({ summary: "item a" }));
      const b = storeOutput(db, makeInput({ summary: "item b" }));
      // Give item b more accesses
      db.prepare("UPDATE stored_outputs SET access_count = 5 WHERE id = ?").run(b.id);
      const result = toolListStored(db, PROJECT_KEY, { sort: "accessed" });
      expect(result.indexOf(b.id)).toBeLessThan(result.indexOf(a.id));
    });

    it("shows pin indicator for pinned items", () => {
      const stored = storeOutput(db, makeInput());
      pinOutput(db, stored.id, PROJECT_KEY, true);
      const result = toolListStored(db, PROJECT_KEY, {});
      expect(result).toContain("📌");
    });
  });

  // -------------------------------------------------------------------------
  // toolSessionSummary
  // -------------------------------------------------------------------------

  describe("toolSessionSummary", () => {
    const today = new Date().toISOString().slice(0, 10);

    it("returns no-data message when nothing stored for the date", () => {
      const result = toolSessionSummary(db, PROJECT_KEY, { date: "2000-01-01" });
      expect(result).toContain("no items stored");
      expect(result).toContain("2000-01-01");
    });

    it("shows stored count and compression stats", () => {
      storeOutput(db, makeInput({ original_size: 4096 }));
      storeOutput(db, makeInput({ original_size: 8192 }));
      const result = toolSessionSummary(db, PROJECT_KEY, { date: today });
      expect(result).toContain("2 items");
      expect(result).toContain("→");
      expect(result).toContain("reduction");
    });

    it("shows tool breakdown sorted by count", () => {
      storeOutput(db, makeInput({ tool_name: "mcp__playwright__browser_snapshot" }));
      storeOutput(db, makeInput({ tool_name: "mcp__playwright__browser_snapshot" }));
      storeOutput(db, makeInput({ tool_name: "mcp__github__list_issues" }));
      const result = toolSessionSummary(db, PROJECT_KEY, { date: today });
      expect(result).toContain("mcp__playwright__browser_snapshot");
      expect(result).toContain("×2");
      expect(result).toContain("mcp__github__list_issues");
      // playwright should appear before github (higher count)
      expect(result.indexOf("mcp__playwright__browser_snapshot")).toBeLessThan(
        result.indexOf("mcp__github__list_issues")
      );
    });

    it("shows most accessed items", () => {
      const stored = storeOutput(db, makeInput());
      db.prepare("UPDATE stored_outputs SET access_count = 3 WHERE id = ?").run(stored.id);
      const result = toolSessionSummary(db, PROJECT_KEY, { date: today });
      expect(result).toContain("Most accessed");
      expect(result).toContain(stored.id);
      expect(result).toContain("×3");
    });

    it("shows pinned items", () => {
      const stored = storeOutput(db, makeInput());
      pinOutput(db, stored.id, PROJECT_KEY, true);
      const result = toolSessionSummary(db, PROJECT_KEY, { date: today });
      expect(result).toContain("Pinned: 1");
      expect(result).toContain("📌");
      expect(result).toContain(stored.id);
    });

    it("shows notes separately", () => {
      storeOutput(db, makeInput({ tool_name: "recall__note", summary: "(note): Auth findings" }));
      const result = toolSessionSummary(db, PROJECT_KEY, { date: today });
      expect(result).toContain("Notes: 1");
      expect(result).toContain("Auth findings");
    });

    it("filters by session_id", () => {
      storeOutput(db, makeInput({ session_id: "sess-aaa" }));
      storeOutput(db, makeInput({ session_id: "sess-bbb" }));
      const result = toolSessionSummary(db, PROJECT_KEY, { session_id: "sess-aaa" });
      expect(result).toContain("sess-aaa");
      expect(result).toContain("1 item");
    });
  });
});
