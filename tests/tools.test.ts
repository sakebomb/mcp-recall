import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getDb, closeDb, storeOutput, recordSession, type StoreInput } from "../src/db/index";
import {
  toolRetrieve,
  toolSearch,
  toolForget,
  toolListStored,
  toolStats,
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
});
