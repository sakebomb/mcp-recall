import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getDb, closeDb, storeOutput, pinOutput, recordAccess, recordSession, type StoreInput } from "../src/db/index";
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
  toolContext,
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

    it("includes a > snippet line when full_content matches the query", () => {
      storeOutput(db, makeInput({
        summary: "GitHub issues list",
        full_content: "Issue #42: implement the frobnication feature for power users",
      }));
      const result = toolSearch(db, PROJECT_KEY, { query: "frobnication" });
      expect(result).toContain(">");
      expect(result).toContain("frobnication");
    });

    it("still returns summary when no snippet is found (graceful fallback)", () => {
      // Item whose full_content is empty — retrieveSnippet returns null
      storeOutput(db, makeInput({
        summary: "ghosttoken appears only in summary",
        full_content: "",
      }));
      const result = toolSearch(db, PROJECT_KEY, { query: "ghosttoken" });
      expect(result).toContain("ghosttoken");
      // No crash; result is well-formed
      expect(result).toContain("Found 1 result");
    });

    it("caps snippet at 150 characters", () => {
      const longContent = "frobnicate " + "x".repeat(300);
      storeOutput(db, makeInput({
        summary: "item with long full content",
        full_content: longContent,
      }));
      const result = toolSearch(db, PROJECT_KEY, { query: "frobnicate" });
      // Snippet line should be present and capped (full chunk is 512 chars)
      expect(result).toContain(">");
      const snippetLine = result.split("\n").find((l) => l.trim().startsWith(">"))!;
      // Remove the "> …" prefix (4 chars) and trailing "…" to measure content
      const snippetContent = snippetLine.trim().replace(/^>\s*…/, "").replace(/…$/, "");
      expect(snippetContent.length).toBeLessThanOrEqual(150);
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

    it("omits Suggestions section when no candidates qualify", () => {
      storeOutput(db, makeInput());
      // access_count=0, just created — not stale yet, not a pin candidate
      const result = toolStats(db, PROJECT_KEY, { pin_threshold: 5, stale_days: 3 });
      expect(result).not.toContain("Suggestions");
    });

    it("shows pin candidates when access_count meets threshold", () => {
      const stored = storeOutput(db, makeInput());
      recordAccess(db, stored.id);
      const result = toolStats(db, PROJECT_KEY, { pin_threshold: 1 });
      expect(result).toContain("Suggestions");
      expect(result).toContain("Consider pinning");
      expect(result).toContain(stored.id);
      expect(result).toContain("accessed 1×");
    });

    it("shows stale candidates when items are old and never accessed", () => {
      const stored = storeOutput(db, makeInput());
      // Backdate by 5 days so it's stale under a 3-day threshold
      const fiveDaysAgo = Math.floor(Date.now() / 1000) - 5 * 86400;
      db.prepare(`UPDATE stored_outputs SET created_at = ? WHERE id = ?`)
        .run(fiveDaysAgo, stored.id);

      const result = toolStats(db, PROJECT_KEY, { stale_days: 3 });
      expect(result).toContain("Suggestions");
      expect(result).toContain("Never accessed");
      expect(result).toContain(stored.id);
      expect(result).toContain("days ago");
    });

    it("shows both categories when both qualify", () => {
      // Pin candidate
      const pinItem = storeOutput(db, makeInput());
      recordAccess(db, pinItem.id);

      // Stale candidate
      const staleItem = storeOutput(db, makeInput());
      const fiveDaysAgo = Math.floor(Date.now() / 1000) - 5 * 86400;
      db.prepare(`UPDATE stored_outputs SET created_at = ? WHERE id = ?`)
        .run(fiveDaysAgo, staleItem.id);

      const result = toolStats(db, PROJECT_KEY, { pin_threshold: 1, stale_days: 3 });
      expect(result).toContain("Consider pinning");
      expect(result).toContain("Never accessed");
    });

    it("does not suggest already-pinned items", () => {
      const stored = storeOutput(db, makeInput());
      pinOutput(db, stored.id, PROJECT_KEY, true);
      recordAccess(db, stored.id);
      // Even with high access_count, pinned items should not appear as pin candidates
      const result = toolStats(db, PROJECT_KEY, { pin_threshold: 1 });
      expect(result).not.toContain("Consider pinning");
    });

    it("shows per-tool breakdown section", () => {
      storeOutput(db, makeInput({ tool_name: "mcp__github__list_issues", original_size: 8000 }));
      storeOutput(db, makeInput({ tool_name: "mcp__github__list_issues", original_size: 4000 }));
      storeOutput(db, makeInput({ tool_name: "mcp__playwright__snapshot", original_size: 20000 }));
      const result = toolStats(db, PROJECT_KEY);
      expect(result).toContain("By tool");
      // Playwright row appears first (larger original size)
      expect(result.indexOf("mcp__playwright__snapshot")).toBeLessThan(
        result.indexOf("mcp__github__list_issues")
      );
    });

    it("per-tool breakdown shows item count and reduction percentage", () => {
      storeOutput(db, makeInput({ tool_name: "mcp__github__list_issues", original_size: 10000 }));
      const result = toolStats(db, PROJECT_KEY);
      expect(result).toContain("1 item");
      expect(result).toContain("%");
    });

    it("per-tool breakdown lists each distinct tool_name once", () => {
      storeOutput(db, makeInput({ tool_name: "mcp__tool_a", original_size: 1000 }));
      storeOutput(db, makeInput({ tool_name: "mcp__tool_a", original_size: 1000 }));
      storeOutput(db, makeInput({ tool_name: "mcp__tool_b", original_size: 500 }));
      const result = toolStats(db, PROJECT_KEY);
      // Each tool name appears exactly once in the breakdown
      const countA = (result.match(/mcp__tool_a/g) ?? []).length;
      const countB = (result.match(/mcp__tool_b/g) ?? []).length;
      expect(countA).toBe(1);
      expect(countB).toBe(1);
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

  // -------------------------------------------------------------------------
  // toolContext
  // -------------------------------------------------------------------------

  describe("toolContext", () => {
    it("returns no-context message when store is empty", () => {
      const result = toolContext(db, PROJECT_KEY, {});
      expect(result).toContain("no context available");
    });

    it("shows pinned items", () => {
      const stored = storeOutput(db, makeInput());
      pinOutput(db, stored.id, PROJECT_KEY, true);
      const result = toolContext(db, PROJECT_KEY, {});
      expect(result).toContain("Pinned (1)");
      expect(result).toContain("📌");
      expect(result).toContain(stored.id);
    });

    it("shows notes", () => {
      storeOutput(db, makeInput({ tool_name: "recall__note", summary: "(note): Auth findings" }));
      const result = toolContext(db, PROJECT_KEY, {});
      expect(result).toContain("Notes (1)");
      expect(result).toContain("Auth findings");
    });

    it("shows recently accessed items", () => {
      const stored = storeOutput(db, makeInput());
      recordAccess(db, stored.id); // sets last_accessed to now
      const result = toolContext(db, PROJECT_KEY, {});
      expect(result).toContain("Recently accessed");
      expect(result).toContain(stored.id);
    });

    it("excludes items not accessed within the days window", () => {
      const stored = storeOutput(db, makeInput());
      // Set last_accessed to 8 days ago (outside default 7-day window)
      const oldAccess = Math.floor(Date.now() / 1000) - 8 * 86400;
      db.prepare("UPDATE stored_outputs SET access_count = 1, last_accessed = ? WHERE id = ?")
        .run(oldAccess, stored.id);
      const result = toolContext(db, PROJECT_KEY, { days: 7 });
      expect(result).not.toContain(stored.id);
    });

    it("shows last session headline", () => {
      const yesterday = new Date(Date.now() - 86400 * 1000).toISOString().slice(0, 10);
      const startOfYesterday = Math.floor(new Date(`${yesterday}T00:00:00Z`).getTime() / 1000);
      db.prepare(
        `INSERT INTO stored_outputs (id,project_key,session_id,tool_name,summary,full_content,original_size,summary_size,created_at)
         VALUES ('recall_ctx_prev1',?,?,?,?,?,4096,64,?)`
      ).run(PROJECT_KEY, "sess-prev", "mcp__tool", "prev summary", "prev content", startOfYesterday + 3600);
      recordSession(db, yesterday);
      const result = toolContext(db, PROJECT_KEY, {});
      expect(result).toContain(`Last session (${yesterday})`);
      expect(result).toContain("1 item");
    });

    it("pinned items appear in Pinned section, not in Recently accessed", () => {
      const stored = storeOutput(db, makeInput());
      pinOutput(db, stored.id, PROJECT_KEY, true);
      recordAccess(db, stored.id);
      const result = toolContext(db, PROJECT_KEY, {});
      expect(result).toContain("Pinned (1)");
      // Only pinned item exists; recently accessed query excludes pinned=1
      expect(result).not.toContain("Recently accessed");
    });

    it("shows hot items from a past session", () => {
      const old = new Date(Date.now() - 14 * 86400 * 1000).toISOString().slice(0, 10);
      const startOfOld = Math.floor(new Date(`${old}T00:00:00Z`).getTime() / 1000);
      db.prepare(
        `INSERT INTO stored_outputs
           (id,project_key,session_id,tool_name,summary,full_content,original_size,summary_size,created_at,access_count)
         VALUES ('recall_ctx_hot1',?,?,?,?,?,4096,64,?,3)`
      ).run(PROJECT_KEY, "sess-old", "mcp__github__list_issues", "hot item summary", "full content", startOfOld + 3600);
      recordSession(db, old);
      const result = toolContext(db, PROJECT_KEY, {});
      expect(result).toContain(`Hot from last session (${old}`);
      expect(result).toContain("recall_ctx_hot1");
      expect(result).toContain("×3");
    });

    it("hot section absent when accessed items fall within the recent window", () => {
      const stored = storeOutput(db, makeInput());
      recordAccess(db, stored.id); // last_accessed = now, within 7-day recent window
      const yesterday = new Date(Date.now() - 86400 * 1000).toISOString().slice(0, 10);
      recordSession(db, yesterday);
      // stored was created today, not yesterday — so hot query (yesterday's date range) won't match it
      // and recent will show it because last_accessed is fresh
      const result = toolContext(db, PROJECT_KEY, {});
      expect(result).toContain("Recently accessed");
      expect(result).not.toContain("Hot from last session");
    });
  });
});
