import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  getDb,
  closeDb,
  storeOutput,
  retrieveOutput,
  recordAccess,
  pinOutput,
  checkDedup,
  checkOutputDedup,
  hashContent,
  evictIfNeeded,
  retrievePeek,
  retrieveSnippet,
  searchOutputs,
  listOutputs,
  forgetOutputs,
  getStats,
  getBashCommandBreakdown,
  setMeta,
  getMeta,
  pruneExpired,
  recordSession,
  getSessionDays,
  getContext,
  chunkText,
  CHUNK_SIZE,
  CHUNK_OVERLAP,
  sanitizeFtsQuery,
  initSchema,
  type StoreInput,
} from "../src/db/index";
import { Database } from "bun:sqlite";

const PROJECT_KEY = "testproject1234";

function makeInput(overrides: Partial<StoreInput> = {}): StoreInput {
  return {
    project_key: PROJECT_KEY,
    session_id: "2026-03-01",
    tool_name: "mcp__github__list_issues",
    summary: "Summary of issues",
    full_content: "Full content of the GitHub issues response",
    original_size: 1024,
    ...overrides,
  };
}

describe("db", () => {
  let db: Database;

  beforeEach(() => {
    db = getDb(":memory:");
  });

  afterEach(() => {
    closeDb();
  });

  // -------------------------------------------------------------------------
  // storeOutput / retrieveOutput
  // -------------------------------------------------------------------------

  describe("storeOutput", () => {
    it("returns a stored output with generated id", () => {
      const result = storeOutput(db, makeInput());
      expect(result.id).toMatch(/^recall_[0-9a-f]{16}$/);
    });

    it("computes summary_size from summary bytes", () => {
      const summary = "hello";
      const result = storeOutput(db, makeInput({ summary }));
      expect(result.summary_size).toBe(Buffer.byteLength(summary, "utf8"));
    });

    it("sets created_at to a recent unix timestamp", () => {
      const before = Math.floor(Date.now() / 1000);
      const result = storeOutput(db, makeInput());
      const after = Math.floor(Date.now() / 1000);
      expect(result.created_at).toBeGreaterThanOrEqual(before);
      expect(result.created_at).toBeLessThanOrEqual(after);
    });

    it("generates unique IDs for multiple inserts", () => {
      const a = storeOutput(db, makeInput());
      const b = storeOutput(db, makeInput());
      expect(a.id).not.toBe(b.id);
    });
  });

  describe("retrieveOutput", () => {
    it("retrieves a stored output by id", () => {
      const stored = storeOutput(db, makeInput());
      const retrieved = retrieveOutput(db, stored.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(stored.id);
      expect(retrieved!.tool_name).toBe(stored.tool_name);
      expect(retrieved!.summary).toBe(stored.summary);
    });

    it("returns null for unknown id", () => {
      expect(retrieveOutput(db, "recall_00000000")).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // searchOutputs (FTS)
  // -------------------------------------------------------------------------

  describe("searchOutputs", () => {
    it("finds items matching query in summary", () => {
      storeOutput(db, makeInput({ summary: "critical authentication bug" }));
      storeOutput(db, makeInput({ summary: "update dependencies" }));

      const results = searchOutputs(db, "authentication", { project_key: PROJECT_KEY });
      expect(results.length).toBe(1);
      expect(results[0]!.summary).toContain("authentication");
    });

    it("finds items matching query in full_content", () => {
      storeOutput(db, makeInput({ full_content: "deep content about oauth tokens" }));
      storeOutput(db, makeInput({ full_content: "unrelated content" }));

      const results = searchOutputs(db, "oauth", { project_key: PROJECT_KEY });
      expect(results.length).toBe(1);
    });

    it("returns empty array when nothing matches", () => {
      storeOutput(db, makeInput({ summary: "something else" }));
      const results = searchOutputs(db, "zzznomatch", { project_key: PROJECT_KEY });
      expect(results.length).toBe(0);
    });

    it("filters by tool name", () => {
      storeOutput(db, makeInput({ tool_name: "mcp__github__list_issues", summary: "search me" }));
      storeOutput(db, makeInput({ tool_name: "mcp__playwright__snapshot", summary: "search me" }));

      const results = searchOutputs(db, "search", {
        project_key: PROJECT_KEY,
        tool: "mcp__github__list_issues",
      });
      expect(results.length).toBe(1);
      expect(results[0]!.tool_name).toBe("mcp__github__list_issues");
    });

    it("respects limit option", () => {
      for (let i = 0; i < 5; i++) {
        storeOutput(db, makeInput({ summary: `result item ${i}` }));
      }
      const results = searchOutputs(db, "result", { project_key: PROJECT_KEY, limit: 3 });
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it("does not return results from a different project", () => {
      storeOutput(db, makeInput({ project_key: "otherproject567", summary: "secret stuff" }));
      const results = searchOutputs(db, "secret", { project_key: PROJECT_KEY });
      expect(results.length).toBe(0);
    });

    it("returns empty array for malformed FTS query instead of throwing", () => {
      storeOutput(db, makeInput());
      const results = searchOutputs(db, "NOT *", { project_key: PROJECT_KEY });
      expect(Array.isArray(results)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // sanitizeFtsQuery
  // -------------------------------------------------------------------------

  describe("sanitizeFtsQuery", () => {
    it("wraps simple terms in double-quotes", () => {
      expect(sanitizeFtsQuery("hello world")).toBe('"hello" "world"');
    });

    it("escapes embedded double-quotes", () => {
      expect(sanitizeFtsQuery('say "hi"')).toBe('"say" """hi"""');
    });

    it("handles empty and whitespace-only input", () => {
      expect(sanitizeFtsQuery("")).toBe('""');
      expect(sanitizeFtsQuery("   ")).toBe('""');
    });

    it("neutralises FTS operators", () => {
      expect(sanitizeFtsQuery("NOT something")).toBe('"NOT" "something"');
      expect(sanitizeFtsQuery("a OR b")).toBe('"a" "OR" "b"');
    });
  });

  // -------------------------------------------------------------------------
  // listOutputs
  // -------------------------------------------------------------------------

  describe("listOutputs", () => {
    it("returns outputs for the project in newest-first order by default", () => {
      const now = Math.floor(Date.now() / 1000);
      db.prepare(`INSERT INTO stored_outputs (id,project_key,session_id,tool_name,summary,full_content,original_size,summary_size,created_at) VALUES ('recall_ord00001',?,?,?,?,?,100,5,?)`).run(PROJECT_KEY, "2026-03-01", "mcp__tool", "first", "first content", now - 10);
      db.prepare(`INSERT INTO stored_outputs (id,project_key,session_id,tool_name,summary,full_content,original_size,summary_size,created_at) VALUES ('recall_ord00002',?,?,?,?,?,100,6,?)`).run(PROJECT_KEY, "2026-03-01", "mcp__tool", "second", "second content", now);
      const results = listOutputs(db, { project_key: PROJECT_KEY });
      expect(results[0]!.summary).toBe("second");
      expect(results[1]!.summary).toBe("first");
    });

    it("returns outputs in oldest-first order when sort=oldest", () => {
      const now = Math.floor(Date.now() / 1000);
      db.prepare(`INSERT INTO stored_outputs (id,project_key,session_id,tool_name,summary,full_content,original_size,summary_size,created_at) VALUES ('recall_ord00003',?,?,?,?,?,100,5,?)`).run(PROJECT_KEY, "2026-03-01", "mcp__tool", "first", "first content", now - 10);
      db.prepare(`INSERT INTO stored_outputs (id,project_key,session_id,tool_name,summary,full_content,original_size,summary_size,created_at) VALUES ('recall_ord00004',?,?,?,?,?,100,6,?)`).run(PROJECT_KEY, "2026-03-01", "mcp__tool", "second", "second content", now);
      const results = listOutputs(db, { project_key: PROJECT_KEY, sort: "oldest" });
      expect(results[0]!.summary).toBe("first");
    });

    it("filters by tool name", () => {
      storeOutput(db, makeInput({ tool_name: "mcp__github__list_issues" }));
      storeOutput(db, makeInput({ tool_name: "mcp__playwright__snapshot" }));
      const results = listOutputs(db, {
        project_key: PROJECT_KEY,
        tool: "mcp__github__list_issues",
      });
      expect(results.length).toBe(1);
    });

    it("paginates with limit and offset", () => {
      for (let i = 0; i < 5; i++) storeOutput(db, makeInput());
      const page1 = listOutputs(db, { project_key: PROJECT_KEY, limit: 2, offset: 0 });
      const page2 = listOutputs(db, { project_key: PROJECT_KEY, limit: 2, offset: 2 });
      expect(page1.length).toBe(2);
      expect(page2.length).toBe(2);
      expect(page1[0]!.id).not.toBe(page2[0]!.id);
    });

    it("does not return outputs from a different project", () => {
      storeOutput(db, makeInput({ project_key: "otherproject567" }));
      const results = listOutputs(db, { project_key: PROJECT_KEY });
      expect(results.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // forgetOutputs
  // -------------------------------------------------------------------------

  describe("forgetOutputs", () => {
    it("deletes by id and returns change count", () => {
      const stored = storeOutput(db, makeInput());
      const deleted = forgetOutputs(db, PROJECT_KEY, { id: stored.id });
      expect(deleted).toBe(1);
      expect(retrieveOutput(db, stored.id)).toBeNull();
    });

    it("deletes by tool name", () => {
      storeOutput(db, makeInput({ tool_name: "mcp__github__list_issues" }));
      storeOutput(db, makeInput({ tool_name: "mcp__github__list_issues" }));
      storeOutput(db, makeInput({ tool_name: "mcp__playwright__snapshot" }));
      const deleted = forgetOutputs(db, PROJECT_KEY, { tool: "mcp__github__list_issues" });
      expect(deleted).toBe(2);
      expect(listOutputs(db, { project_key: PROJECT_KEY }).length).toBe(1);
    });

    it("deletes by session_id", () => {
      storeOutput(db, makeInput({ session_id: "2026-03-01" }));
      storeOutput(db, makeInput({ session_id: "2026-03-01" }));
      storeOutput(db, makeInput({ session_id: "2026-02-28" }));
      const deleted = forgetOutputs(db, PROJECT_KEY, { session_id: "2026-03-01" });
      expect(deleted).toBe(2);
    });

    it("deletes all when all=true", () => {
      storeOutput(db, makeInput());
      storeOutput(db, makeInput());
      const deleted = forgetOutputs(db, PROJECT_KEY, { all: true });
      expect(deleted).toBe(2);
      expect(listOutputs(db, { project_key: PROJECT_KEY }).length).toBe(0);
    });

    it("does not delete outputs from a different project", () => {
      const stored = storeOutput(db, makeInput({ project_key: "otherproject567" }));
      forgetOutputs(db, PROJECT_KEY, { all: true });
      expect(retrieveOutput(db, stored.id)).not.toBeNull();
    });

    it("returns 0 when no options match anything", () => {
      expect(forgetOutputs(db, PROJECT_KEY, {})).toBe(0);
    });

    it("cleans up FTS index on delete (no stale search results)", () => {
      const stored = storeOutput(db, makeInput({ summary: "findme unique term" }));
      forgetOutputs(db, PROJECT_KEY, { id: stored.id });
      const results = searchOutputs(db, "findme", { project_key: PROJECT_KEY });
      expect(results.length).toBe(0);
    });

    it("bulk delete of 50+ items does not throw and returns correct count", () => {
      for (let i = 0; i < 55; i++) {
        storeOutput(db, makeInput({ summary: `bulk item ${i}` }));
      }
      expect(() => {
        const deleted = forgetOutputs(db, PROJECT_KEY, { all: true });
        expect(deleted).toBe(55);
      }).not.toThrow();
    });

    it("data integrity is preserved after bulk delete with incremental_vacuum", () => {
      const survivor = storeOutput(db, makeInput({ project_key: "other-project", summary: "keep me" }));
      for (let i = 0; i < 55; i++) {
        storeOutput(db, makeInput({ summary: `vacuum-test item ${i}` }));
      }
      forgetOutputs(db, PROJECT_KEY, { all: true });
      expect(retrieveOutput(db, survivor.id)).not.toBeNull();
      expect(retrieveOutput(db, survivor.id)!.summary).toBe("keep me");
    });
  });

  // -------------------------------------------------------------------------
  // getStats
  // -------------------------------------------------------------------------

  describe("getStats", () => {
    it("returns zeros for empty project", () => {
      const stats = getStats(db, PROJECT_KEY);
      expect(stats.total_items).toBe(0);
      expect(stats.total_original_bytes).toBe(0);
      expect(stats.compression_ratio).toBe(0);
    });

    it("accumulates totals across stored outputs", () => {
      storeOutput(db, makeInput({ original_size: 1000, summary: "x".repeat(50) }));
      storeOutput(db, makeInput({ original_size: 2000, summary: "y".repeat(100) }));
      const stats = getStats(db, PROJECT_KEY);
      expect(stats.total_items).toBe(2);
      expect(stats.total_original_bytes).toBe(3000);
      expect(stats.compression_ratio).toBeLessThan(1);
    });

    it("does not include stats from other projects", () => {
      storeOutput(db, makeInput({ project_key: "otherproject567", original_size: 9999 }));
      const stats = getStats(db, PROJECT_KEY);
      expect(stats.total_items).toBe(0);
    });

    it("reports pinned item count and pinned bytes", () => {
      const a = storeOutput(db, makeInput({ original_size: 1000 }));
      storeOutput(db, makeInput({ original_size: 2000 }));
      pinOutput(db, a.id, PROJECT_KEY, true);
      const stats = getStats(db, PROJECT_KEY);
      expect(stats.pinned_items).toBe(1);
      expect(stats.pinned_bytes).toBe(1000);
    });

    it("reports zero pinned bytes when nothing is pinned", () => {
      storeOutput(db, makeInput({ original_size: 500 }));
      const stats = getStats(db, PROJECT_KEY);
      expect(stats.pinned_items).toBe(0);
      expect(stats.pinned_bytes).toBe(0);
    });

    it("excludes recall__note from interception totals and reports notes separately", () => {
      // Real interception: a Bash output compressed 1000 -> 100 bytes.
      storeOutput(db, makeInput({ tool_name: "Bash", original_size: 1000, summary: "x".repeat(100) }));
      // Stored memory (e.g. an external memoree-sync backend) — NOT interception.
      storeOutput(db, makeInput({ tool_name: "recall__note", original_size: 5000, summary: "y".repeat(4900) }));
      const stats = getStats(db, PROJECT_KEY);
      // Headline savings reflect interception only.
      expect(stats.total_items).toBe(1);
      expect(stats.total_original_bytes).toBe(1000);
      expect(stats.compression_ratio).toBeCloseTo(0.1, 5);
      // Notes are reported, not hidden.
      expect(stats.note_items).toBe(1);
      expect(stats.note_bytes).toBe(5000);
    });

    it("counts pinned notes in the store-wide pin budget even though they are not interception", () => {
      const n = storeOutput(db, makeInput({ tool_name: "recall__note", original_size: 5000 }));
      pinOutput(db, n.id, PROJECT_KEY, true);
      const stats = getStats(db, PROJECT_KEY);
      expect(stats.total_items).toBe(0);       // not interception
      expect(stats.note_items).toBe(1);
      expect(stats.pinned_items).toBe(1);      // but does consume the pin budget
      expect(stats.pinned_bytes).toBe(5000);
    });

    it("reports zero notes when there are none", () => {
      storeOutput(db, makeInput({ tool_name: "Bash", original_size: 200 }));
      const stats = getStats(db, PROJECT_KEY);
      expect(stats.note_items).toBe(0);
      expect(stats.note_bytes).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // storeOutput retention (full_retained)
  // -------------------------------------------------------------------------

  describe("storeOutput retention", () => {
    it("retains body and chunks by default", () => {
      const body = "x".repeat(3000);
      const r = storeOutput(db, makeInput({ full_content: body }));
      expect(r.full_retained).toBe(1);
      expect(retrieveOutput(db, r.id)!.full_content).toBe(body);
      // chunked → peek (no query) returns content
      expect(retrievePeek(db, r.id, undefined)).not.toBeNull();
    });

    it("summary-only: drops body and chunks but keeps summary", () => {
      const body = "line\n".repeat(500);
      const r = storeOutput(db, makeInput({
        tool_name: "Bash", full_content: body, original_size: body.length, full_retained: 0,
      }));
      expect(r.full_retained).toBe(0);
      const row = retrieveOutput(db, r.id)!;
      expect(row.full_content).toBe("");        // body not persisted
      expect(row.summary).toBe("Summary of issues"); // summary preserved
      expect(retrievePeek(db, r.id, undefined)).toBeNull(); // no chunks written
    });

    it("summary-only still stores output_hash so dedup keeps working", () => {
      const body = "duplicate output body ".repeat(50);
      storeOutput(db, makeInput({
        tool_name: "Bash", full_content: body, original_size: body.length, full_retained: 0,
      }));
      // The dedup key is the hash of the REAL content, not the dropped body.
      const hit = checkOutputDedup(db, PROJECT_KEY, hashContent(body));
      expect(hit).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // meta table
  // -------------------------------------------------------------------------

  describe("setMeta / getMeta", () => {
    it("returns null for an unset key", () => {
      expect(getMeta(db, "project_path")).toBeNull();
    });

    it("stores and reads back a value", () => {
      setMeta(db, "project_path", "/home/u/proj");
      expect(getMeta(db, "project_path")).toBe("/home/u/proj");
    });

    it("upserts an existing key rather than duplicating it", () => {
      setMeta(db, "project_path", "/old");
      setMeta(db, "project_path", "/new");
      expect(getMeta(db, "project_path")).toBe("/new");
    });
  });

  // -------------------------------------------------------------------------
  // pruneExpired
  // -------------------------------------------------------------------------

  describe("pruneExpired", () => {
    it("removes outputs older than the given calendar days", () => {
      const old_ts = Math.floor(Date.now() / 1000) - 10 * 86400; // 10 days ago
      // Insert directly with a backdated created_at
      db.prepare(`
        INSERT INTO stored_outputs
          (id, project_key, session_id, tool_name, summary, full_content, original_size, summary_size, created_at)
        VALUES ('recall_old00001', ?, '2026-02-19', 'mcp__tool', 'old', 'old content', 100, 3, ?)
      `).run(PROJECT_KEY, old_ts);

      storeOutput(db, makeInput({ summary: "recent" }));
      const deleted = pruneExpired(db, PROJECT_KEY, 7);
      expect(deleted).toBe(1);
      expect(listOutputs(db, { project_key: PROJECT_KEY }).length).toBe(1);
    });

    it("returns 0 when nothing is expired", () => {
      storeOutput(db, makeInput());
      expect(pruneExpired(db, PROJECT_KEY, 7)).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // sessions
  // -------------------------------------------------------------------------

  describe("recordSession / getSessionDays", () => {
    it("records a session date", () => {
      recordSession(db, "2026-03-01");
      expect(getSessionDays(db)).toContain("2026-03-01");
    });

    it("is idempotent — duplicate dates are ignored", () => {
      recordSession(db, "2026-03-01");
      recordSession(db, "2026-03-01");
      expect(getSessionDays(db).length).toBe(1);
    });

    it("returns dates in descending order", () => {
      recordSession(db, "2026-02-28");
      recordSession(db, "2026-03-01");
      const days = getSessionDays(db);
      expect(days[0]).toBe("2026-03-01");
      expect(days[1]).toBe("2026-02-28");
    });
  });

  // -------------------------------------------------------------------------
  // recordAccess
  // -------------------------------------------------------------------------

  describe("recordAccess", () => {
    it("increments access_count", () => {
      const stored = storeOutput(db, makeInput());
      expect(stored.access_count).toBe(0);
      recordAccess(db, stored.id);
      const updated = retrieveOutput(db, stored.id)!;
      expect(updated.access_count).toBe(1);
    });

    it("accumulates on repeated access", () => {
      const stored = storeOutput(db, makeInput());
      recordAccess(db, stored.id);
      recordAccess(db, stored.id);
      recordAccess(db, stored.id);
      expect(retrieveOutput(db, stored.id)!.access_count).toBe(3);
    });

    it("sets last_accessed to a recent timestamp", () => {
      const before = Math.floor(Date.now() / 1000);
      const stored = storeOutput(db, makeInput());
      recordAccess(db, stored.id);
      const after = Math.floor(Date.now() / 1000);
      const updated = retrieveOutput(db, stored.id)!;
      expect(updated.last_accessed).toBeGreaterThanOrEqual(before);
      expect(updated.last_accessed!).toBeLessThanOrEqual(after);
    });
  });

  // -------------------------------------------------------------------------
  // pinOutput
  // -------------------------------------------------------------------------

  describe("pinOutput", () => {
    it("pins an item", () => {
      const stored = storeOutput(db, makeInput());
      expect(stored.pinned).toBe(0);
      pinOutput(db, stored.id, PROJECT_KEY, true);
      expect(retrieveOutput(db, stored.id)!.pinned).toBe(1);
    });

    it("unpins a pinned item", () => {
      const stored = storeOutput(db, makeInput());
      pinOutput(db, stored.id, PROJECT_KEY, true);
      pinOutput(db, stored.id, PROJECT_KEY, false);
      expect(retrieveOutput(db, stored.id)!.pinned).toBe(0);
    });

    it("returns ok when item exists", () => {
      const stored = storeOutput(db, makeInput());
      expect(pinOutput(db, stored.id, PROJECT_KEY, true).ok).toBe(true);
    });

    it("returns not_found for unknown id", () => {
      const outcome = pinOutput(db, "recall_00000000", PROJECT_KEY, true);
      expect(outcome.ok).toBe(false);
      expect(outcome).toMatchObject({ reason: "not_found" });
    });

    // store.max_pinned_mb (#205): pinned items are eviction-exempt, so without a
    // separate cap an unbounded number of pins voids store.max_size_mb.
    const CAP_MB = 1; // 1 MiB = 1_048_576 bytes
    const HALF = 600_000; // one fits under the cap; a second would exceed it

    it("refuses a pin that would exceed max_pinned_mb and leaves the item unpinned", () => {
      const a = storeOutput(db, makeInput({ original_size: HALF }));
      const b = storeOutput(db, makeInput({ original_size: HALF }));
      expect(pinOutput(db, a.id, PROJECT_KEY, true, CAP_MB).ok).toBe(true);
      const outcome = pinOutput(db, b.id, PROJECT_KEY, true, CAP_MB);
      expect(outcome.ok).toBe(false);
      expect(outcome).toMatchObject({ reason: "over_budget", itemBytes: HALF });
      expect(retrieveOutput(db, b.id)!.pinned).toBe(0); // the write did not apply
    });

    it("bounds total pinned bytes even when the caller ignores the error", () => {
      // A client that keeps pinning past the cap must not be able to grow the store.
      for (let i = 0; i < 10; i++) {
        const item = storeOutput(db, makeInput({ original_size: HALF }));
        pinOutput(db, item.id, PROJECT_KEY, true, CAP_MB); // return deliberately ignored
      }
      const { pinnedBytes } = db.prepare(
        "SELECT COALESCE(SUM(original_size),0) as pinnedBytes FROM stored_outputs WHERE project_key = ? AND pinned = 1"
      ).get(PROJECT_KEY) as { pinnedBytes: number };
      expect(pinnedBytes).toBeLessThanOrEqual(CAP_MB * 1024 * 1024);
      expect(pinnedBytes).toBe(HALF); // exactly one pin landed
    });

    it("re-pinning an already-pinned item is a no-op success, not over_budget", () => {
      const a = storeOutput(db, makeInput({ original_size: HALF }));
      expect(pinOutput(db, a.id, PROJECT_KEY, true, CAP_MB).ok).toBe(true);
      // Already counted toward the budget; pinning it again must not be rejected.
      expect(pinOutput(db, a.id, PROJECT_KEY, true, CAP_MB).ok).toBe(true);
      expect(retrieveOutput(db, a.id)!.pinned).toBe(1);
    });

    it("unpinning is never budget-checked", () => {
      const a = storeOutput(db, makeInput({ original_size: HALF }));
      pinOutput(db, a.id, PROJECT_KEY, true, CAP_MB);
      expect(pinOutput(db, a.id, PROJECT_KEY, false, CAP_MB).ok).toBe(true);
      expect(retrieveOutput(db, a.id)!.pinned).toBe(0);
    });

    it("omitting the cap disables enforcement (internal/test callers)", () => {
      const a = storeOutput(db, makeInput({ original_size: HALF }));
      const b = storeOutput(db, makeInput({ original_size: HALF }));
      expect(pinOutput(db, a.id, PROJECT_KEY, true).ok).toBe(true);
      expect(pinOutput(db, b.id, PROJECT_KEY, true).ok).toBe(true); // no cap → both pin
      expect(retrieveOutput(db, b.id)!.pinned).toBe(1);
    });

    it("pruneExpired skips pinned items", () => {
      const old_ts = Math.floor(Date.now() / 1000) - 10 * 86400;
      db.prepare(`
        INSERT INTO stored_outputs
          (id,project_key,session_id,tool_name,summary,full_content,original_size,summary_size,created_at,pinned)
        VALUES ('recall_pin00001',?,?,?,?,?,100,3,?,1)
      `).run(PROJECT_KEY, "2026-02-19", "mcp__tool", "pinned old", "content", old_ts);
      expect(pruneExpired(db, PROJECT_KEY, 7)).toBe(0);
    });

    it("forgetOutputs(all) skips pinned items by default", () => {
      const stored = storeOutput(db, makeInput());
      pinOutput(db, stored.id, PROJECT_KEY, true);
      storeOutput(db, makeInput());
      const deleted = forgetOutputs(db, PROJECT_KEY, { all: true });
      expect(deleted).toBe(1); // only the unpinned one
      expect(retrieveOutput(db, stored.id)).not.toBeNull();
    });

    it("forgetOutputs(all, force) deletes pinned items too", () => {
      const stored = storeOutput(db, makeInput());
      pinOutput(db, stored.id, PROJECT_KEY, true);
      forgetOutputs(db, PROJECT_KEY, { all: true, force: true });
      expect(retrieveOutput(db, stored.id)).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // checkDedup
  // -------------------------------------------------------------------------

  describe("checkDedup", () => {
    it("returns null when no matching hash exists", () => {
      expect(checkDedup(db, PROJECT_KEY, "abc123")).toBeNull();
    });

    it("returns the stored item when hash matches", () => {
      storeOutput(db, makeInput({ input_hash: "hash1234" }));
      const hit = checkDedup(db, PROJECT_KEY, "hash1234");
      expect(hit).not.toBeNull();
      expect(hit!.input_hash).toBe("hash1234");
    });

    it("returns the most recent match when multiple exist", () => {
      const now = Math.floor(Date.now() / 1000);
      db.prepare(`
        INSERT INTO stored_outputs (id,project_key,session_id,tool_name,summary,full_content,original_size,summary_size,created_at,input_hash)
        VALUES ('recall_dedup0001',?,?,?,?,?,100,3,?,?)
      `).run(PROJECT_KEY, "2026-03-01", "mcp__tool", "old", "content", now - 10, "hash1234");
      db.prepare(`
        INSERT INTO stored_outputs (id,project_key,session_id,tool_name,summary,full_content,original_size,summary_size,created_at,input_hash)
        VALUES ('recall_dedup0002',?,?,?,?,?,100,3,?,?)
      `).run(PROJECT_KEY, "2026-03-01", "mcp__tool", "new", "content", now, "hash1234");
      const hit = checkDedup(db, PROJECT_KEY, "hash1234");
      expect(hit!.summary).toBe("new");
    });

    it("does not match hash from a different project", () => {
      storeOutput(db, makeInput({ project_key: "otherproject567", input_hash: "hash1234" }));
      expect(checkDedup(db, PROJECT_KEY, "hash1234")).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // checkOutputDedup / hashContent
  // -------------------------------------------------------------------------

  describe("schema migrations", () => {
    it("applies migrations idempotently and adds the output_hash column", () => {
      const raw = new Database(":memory:");
      initSchema(raw);
      // Second init: duplicate-column ALTERs are swallowed, CREATE INDEX IF NOT
      // EXISTS is a no-op — must not throw.
      expect(() => initSchema(raw)).not.toThrow();
      const cols = (raw.prepare("PRAGMA table_info(stored_outputs)").all() as { name: string }[]).map((c) => c.name);
      expect(cols).toContain("output_hash");
      raw.close();
    });
  });

  describe("content-hash dedup", () => {
    it("storeOutput records output_hash = hashContent(full_content)", () => {
      const stored = storeOutput(db, makeInput({ full_content: "abc123 content body" }));
      expect(stored.output_hash).toBe(hashContent("abc123 content body"));
    });

    it("finds an item with identical content stored under a different call", () => {
      const a = storeOutput(db, makeInput({ tool_name: "mcp__x__alpha", full_content: "same body text" }));
      // Different tool name / input hash, identical content:
      storeOutput(db, makeInput({ tool_name: "mcp__y__beta", full_content: "unrelated body" }));
      const found = checkOutputDedup(db, PROJECT_KEY, hashContent("same body text"));
      expect(found?.id).toBe(a.id);
    });

    it("returns null when no content matches", () => {
      storeOutput(db, makeInput({ full_content: "one thing" }));
      expect(checkOutputDedup(db, PROJECT_KEY, hashContent("another thing"))).toBeNull();
    });

    it("is scoped to the project", () => {
      storeOutput(db, makeInput({ project_key: "otherproject567", full_content: "shared body" }));
      expect(checkOutputDedup(db, PROJECT_KEY, hashContent("shared body"))).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // evictIfNeeded
  // -------------------------------------------------------------------------

  describe("evictIfNeeded", () => {
    it("returns 0 when store is under the size limit", () => {
      storeOutput(db, makeInput({ original_size: 100 }));
      expect(evictIfNeeded(db, PROJECT_KEY, 500)).toBe(0);
    });

    it("evicts least-accessed item when over limit", () => {
      // Two items totalling 600B, limit is effectively 0 (0.0005 MB ≈ 512B)
      const a = storeOutput(db, makeInput({ original_size: 300, summary: "item a" }));
      const b = storeOutput(db, makeInput({ original_size: 300, summary: "item b" }));
      // Give item b more accesses so it survives
      recordAccess(db, b.id);
      recordAccess(db, b.id);
      const evicted = evictIfNeeded(db, PROJECT_KEY, 0.0005);
      expect(evicted).toBeGreaterThan(0);
      // item b (more accessed) should survive longer
      expect(retrieveOutput(db, b.id)).not.toBeNull();
    });

    it("does not evict pinned items", () => {
      const stored = storeOutput(db, makeInput({ original_size: 1000000 }));
      pinOutput(db, stored.id, PROJECT_KEY, true);
      // Even with a 0 limit, pinned item is not evicted
      evictIfNeeded(db, PROJECT_KEY, 0);
      expect(retrieveOutput(db, stored.id)).not.toBeNull();
    });

    it("returns 0 and evicts nothing when all items are pinned", () => {
      const a = storeOutput(db, makeInput({ original_size: 500000 }));
      const b = storeOutput(db, makeInput({ original_size: 500000 }));
      pinOutput(db, a.id, PROJECT_KEY, true);
      pinOutput(db, b.id, PROJECT_KEY, true);
      const evicted = evictIfNeeded(db, PROJECT_KEY, 0);
      expect(evicted).toBe(0);
      expect(retrieveOutput(db, a.id)).not.toBeNull();
      expect(retrieveOutput(db, b.id)).not.toBeNull();
    });

    it("decay keeps a recently-accessed item over an older heavily-accessed one (unlike LFU)", () => {
      const now = 1_000_000_000;
      const day = 86400;
      const old = storeOutput(db, makeInput({ original_size: 300, summary: "old heavy" }));
      const fresh = storeOutput(db, makeInput({ original_size: 300, summary: "fresh light" }));
      // 'old': hit 50 times but not for 60 days. 'fresh': hit twice, just now.
      db.prepare("UPDATE stored_outputs SET access_count = 50, last_accessed = ? WHERE id = ?").run(now - 60 * day, old.id);
      db.prepare("UPDATE stored_outputs SET access_count = 2, last_accessed = ? WHERE id = ?").run(now - 1, fresh.id);

      const evicted = evictIfNeeded(db, PROJECT_KEY, 0.0005, 7, now);

      expect(evicted).toBeGreaterThan(0);
      // Pure LFU would evict 'fresh' (fewer accesses); decay evicts the stale 'old'.
      expect(retrieveOutput(db, fresh.id)).not.toBeNull();
      expect(retrieveOutput(db, old.id)).toBeNull();
    });

    it("uses creation time for recency when an item was never accessed", () => {
      const now = 1_000_000_000;
      const day = 86400;
      const older = storeOutput(db, makeInput({ original_size: 300, summary: "older" }));
      const newer = storeOutput(db, makeInput({ original_size: 300, summary: "newer" }));
      db.prepare("UPDATE stored_outputs SET created_at = ?, last_accessed = NULL WHERE id = ?").run(now - 90 * day, older.id);
      db.prepare("UPDATE stored_outputs SET created_at = ?, last_accessed = NULL WHERE id = ?").run(now - 1, newer.id);

      evictIfNeeded(db, PROJECT_KEY, 0.0005, 7, now);

      expect(retrieveOutput(db, newer.id)).not.toBeNull();
      expect(retrieveOutput(db, older.id)).toBeNull();
    });

    // Asserts the ordering outcome at one half-life, not the 0.5 factor itself: the
    // expects reduce to "recency < 1", so any decreasing decay passes (verified — this
    // stays green with Math.pow(0.9, …)). The decay-vs-LFU test above bounds the
    // constant from above only; no test bounds it from below.
    it("evicts an item aged one half-life over an equally-accessed fresh one", () => {
      const now = 1_000_000_000;
      const day = 86400;
      const halfLife = 4;
      const fresh = storeOutput(db, makeInput({ original_size: 300, summary: "fresh" }));
      const aged = storeOutput(db, makeInput({ original_size: 300, summary: "aged" }));
      // Both accessed once; 'aged' one half-life ago → recency 0.5 → score 1 vs fresh's 2.
      db.prepare("UPDATE stored_outputs SET access_count = 1, last_accessed = ? WHERE id = ?").run(now, fresh.id);
      db.prepare("UPDATE stored_outputs SET access_count = 1, last_accessed = ? WHERE id = ?").run(now - halfLife * day, aged.id);

      evictIfNeeded(db, PROJECT_KEY, 0.0005, halfLife, now);

      expect(retrieveOutput(db, fresh.id)).not.toBeNull();
      expect(retrieveOutput(db, aged.id)).toBeNull();
    });

    it("breaks score + created_at ties deterministically by id", () => {
      const now = 1_000_000_000;
      const x = storeOutput(db, makeInput({ original_size: 300, summary: "x" }));
      const y = storeOutput(db, makeInput({ original_size: 300, summary: "y" }));
      // Identical score and created_at → only the id tiebreak decides.
      for (const id of [x.id, y.id]) {
        db.prepare("UPDATE stored_outputs SET access_count = 1, last_accessed = ?, created_at = ? WHERE id = ?").run(now - 10, now - 100, id);
      }
      const [smaller, larger] = [x.id, y.id].sort();

      evictIfNeeded(db, PROJECT_KEY, 0.0005, 7, now); // sheds ~one item

      expect(retrieveOutput(db, smaller)).toBeNull();
      expect(retrieveOutput(db, larger)).not.toBeNull();
    });

    it("does not crash or NaN-rank when half_life_days is non-positive", () => {
      const now = 1_000_000_000;
      const a = storeOutput(db, makeInput({ original_size: 300, summary: "a" }));
      const b = storeOutput(db, makeInput({ original_size: 300, summary: "b" }));
      db.prepare("UPDATE stored_outputs SET access_count = 0, last_accessed = ? WHERE id = ?").run(now - 100, a.id);
      db.prepare("UPDATE stored_outputs SET access_count = 5, last_accessed = ? WHERE id = ?").run(now - 100, b.id);

      let evicted = 0;
      expect(() => {
        evicted = evictIfNeeded(db, PROJECT_KEY, 0.0005, 0, now);
      }).not.toThrow();
      expect(evicted).toBeGreaterThan(0);
    });

    // #228: Infinity reaches this function from user config (`eviction_half_life_days = inf`
    // is legal TOML and passes z.number().positive()). Math.max(1, Infinity) is Infinity, so
    // every recency factor becomes 1 and eviction silently degrades to pure LFU. The guard
    // must fall back to the finite default so ranking stays recency-aware.
    it("stays recency-ranked when half_life_days is Infinity (does not degrade to LFU)", () => {
      const now = 1_000_000_000;
      const day = 86400;
      const fresh = storeOutput(db, makeInput({ original_size: 300, summary: "fresh" }));
      const old = storeOutput(db, makeInput({ original_size: 300, summary: "old heavy" }));
      // Under LFU (the Infinity bug), 'old' (2 accesses) outscores 'fresh' (1) and 'fresh'
      // is wrongly evicted. Under the finite default, 'old' is 60 days stale → evicted.
      db.prepare("UPDATE stored_outputs SET access_count = 1, last_accessed = ? WHERE id = ?").run(now, fresh.id);
      db.prepare("UPDATE stored_outputs SET access_count = 2, last_accessed = ? WHERE id = ?").run(now - 60 * day, old.id);

      const evicted = evictIfNeeded(db, PROJECT_KEY, 0.0005, Infinity, now);

      expect(evicted).toBeGreaterThan(0);
      expect(retrieveOutput(db, fresh.id)).not.toBeNull();
      expect(retrieveOutput(db, old.id)).toBeNull();
    });

    // #228: NaN cannot come from config (Zod rejects it) but a direct caller can pass it.
    // Math.max(1, NaN) is NaN → every score NaN → the score comparator is NaN (falsy) → sort
    // falls through to the created_at tiebreak, evicting by insertion age, unranked. The guard
    // must fall back to the finite default so recency, not creation order, decides.
    it("stays recency-ranked when half_life_days is NaN", () => {
      const now = 1_000_000_000;
      const day = 86400;
      const fresh = storeOutput(db, makeInput({ original_size: 300, summary: "fresh" }));
      const old = storeOutput(db, makeInput({ original_size: 300, summary: "old" }));
      // created_at is set so the NaN-path tiebreak would evict 'fresh' (older creation) —
      // the opposite of the recency-correct outcome, making the bug observable.
      db.prepare("UPDATE stored_outputs SET access_count = 1, last_accessed = ?, created_at = ? WHERE id = ?").run(now, now - 1000, fresh.id);
      db.prepare("UPDATE stored_outputs SET access_count = 2, last_accessed = ?, created_at = ? WHERE id = ?").run(now - 60 * day, now - 10, old.id);

      let evicted = 0;
      expect(() => {
        evicted = evictIfNeeded(db, PROJECT_KEY, 0.0005, NaN, now);
      }).not.toThrow();
      expect(evicted).toBeGreaterThan(0);
      expect(retrieveOutput(db, fresh.id)).not.toBeNull();
      expect(retrieveOutput(db, old.id)).toBeNull();
    });

    // #228 lower bound: the "evicts an item aged one half-life" test above only bounds decay
    // from ABOVE (it reduces to recency < 1, so any decreasing decay passes). This bounds it
    // from BELOW: an item accessed 4× but one half-life stale must still outrank a fresh,
    // never-accessed item — which holds only if recency at one half-life exceeds 0.25
    // (it is 0.5). Reddens if a future change makes decay too aggressive (e.g. base 0.1).
    it("does not over-decay: a much-accessed item one half-life old outranks a fresh unaccessed one", () => {
      const now = 1_000_000_000;
      const day = 86400;
      const halfLife = 4;
      const freshUnused = storeOutput(db, makeInput({ original_size: 300, summary: "fresh unused" }));
      const agedBusy = storeOutput(db, makeInput({ original_size: 300, summary: "aged busy" }));
      // freshUnused: score (0+1) * 1     = 1
      // agedBusy:    score (3+1) * 0.5   = 2   → freshUnused evicted, agedBusy survives.
      db.prepare("UPDATE stored_outputs SET access_count = 0, last_accessed = ? WHERE id = ?").run(now, freshUnused.id);
      db.prepare("UPDATE stored_outputs SET access_count = 3, last_accessed = ? WHERE id = ?").run(now - halfLife * day, agedBusy.id);

      evictIfNeeded(db, PROJECT_KEY, 0.0005, halfLife, now);

      expect(retrieveOutput(db, freshUnused.id)).toBeNull();
      expect(retrieveOutput(db, agedBusy.id)).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // effective-size accounting under store.retention (#247)
  //
  // A summary-only row (full_retained = 0) occupies ~summary_size on disk, not
  // original_size, so the byte-cap accounting (store.max_size_mb eviction and
  // store.max_pinned_mb pin budget) counts it at its effective size. The
  // *savings* figures in getStats keep reporting original_size.
  // -------------------------------------------------------------------------

  describe("effective-size accounting (#247)", () => {
    it("eviction cap counts summary-only rows at reduced size, so more fit before eviction", () => {
      const cap = 0.0008; // ~838 bytes

      // Full-body rows: effective size == original_size → over the cap → evict.
      const FULL_KEY = "fullkey123456789";
      for (let i = 0; i < 3; i++) {
        storeOutput(db, makeInput({ project_key: FULL_KEY, original_size: 400, summary: `f${i}`, full_retained: 1 }));
      }
      expect(evictIfNeeded(db, FULL_KEY, cap)).toBeGreaterThan(0);

      // Summary-only rows: same original_size but effective size is the tiny
      // summary → well under the cap → nothing evicted.
      const SUMM_KEY = "summkey123456789";
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        ids.push(storeOutput(db, makeInput({ project_key: SUMM_KEY, original_size: 400, summary: `s${i}`, full_retained: 0 })).id);
      }
      expect(evictIfNeeded(db, SUMM_KEY, cap)).toBe(0);
      for (const id of ids) expect(retrieveOutput(db, id)).not.toBeNull();
    });

    it("eviction sheds by effective size: a full row is still evicted when a preceding summary-only row doesn't cover the shortfall", () => {
      const now = 1_000_000_000;
      // s: summary-only, original 1000 but effective ~1 byte; ranks lowest (evicted first).
      const s = storeOutput(db, makeInput({ original_size: 1000, summary: "s", full_retained: 0 }));
      // f: full body, effective 1000; more recent + accessed, so it ranks above s.
      const f = storeOutput(db, makeInput({ original_size: 1000, summary: "a full body row", full_retained: 1 }));
      db.prepare("UPDATE stored_outputs SET access_count = 0, last_accessed = ? WHERE id = ?").run(now - 100000, s.id);
      db.prepare("UPDATE stored_outputs SET access_count = 3, last_accessed = ? WHERE id = ?").run(now, f.id);

      // total effective ≈ 1 + 1000 = 1001; cap 501 bytes → bytesToShed ≈ 500.
      // Correct: shedding s (≈1) doesn't cover 500, so f must also go.
      // Buggy (shed by original_size): s alone "sheds" 1000 ≥ 500 → f wrongly survives.
      const capMb = 501 / (1024 * 1024);
      evictIfNeeded(db, PROJECT_KEY, capMb, 7, now);

      expect(retrieveOutput(db, f.id)).toBeNull();
    });

    it("pin budget counts summary-only rows at reduced size, so more fit than original sizes suggest", () => {
      const cap = 0.001; // ~1049 bytes; 3 × original 800 = 2400 would blow an original-based cap
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        ids.push(storeOutput(db, makeInput({ original_size: 800, summary: `s${i}`, full_retained: 0 })).id);
      }
      for (const id of ids) {
        expect(pinOutput(db, id, PROJECT_KEY, true, cap).ok).toBe(true);
      }
    });

    it("pin budget sums effective size across a MIX of full-retained and summary-only rows", () => {
      const cap = 0.001; // ~1049 bytes
      // Full row: effective == original 600, pinned first → running total 600.
      const full = storeOutput(db, makeInput({ original_size: 600, summary: "f", full_retained: 1 }));
      expect(pinOutput(db, full.id, PROJECT_KEY, true, cap).ok).toBe(true);
      // Summary-only row: original 900 (600 + 900 = 1500 would blow an original-based
      // cap) but its effective size is the tiny summary, so 600 + ~1 fits → ok.
      const summ = storeOutput(db, makeInput({ original_size: 900, summary: "s", full_retained: 0 }));
      expect(pinOutput(db, summ.id, PROJECT_KEY, true, cap).ok).toBe(true);
    });

    it("getStats reports pinned bytes at effective size for summary-only rows", () => {
      const summary = "short summary";
      const s = storeOutput(db, makeInput({ original_size: 5000, summary, full_retained: 0 }));
      pinOutput(db, s.id, PROJECT_KEY, true);
      const stats = getStats(db, PROJECT_KEY);
      expect(stats.pinned_bytes).toBe(Buffer.byteLength(summary, "utf8")); // NOT 5000
    });

    it("getStats savings figures still use original_size regardless of retention", () => {
      storeOutput(db, makeInput({ tool_name: "Bash", original_size: 5000, summary: "short summary", full_retained: 0 }));
      const stats = getStats(db, PROJECT_KEY);
      expect(stats.total_original_bytes).toBe(5000); // savings measured against the full original
    });
  });

  // -------------------------------------------------------------------------
  // command_fp persistence + getBashCommandBreakdown (#251)
  // -------------------------------------------------------------------------

  describe("command fingerprint (#251)", () => {
    it("persists command_fp and returns it on retrieve", () => {
      const s = storeOutput(db, makeInput({ tool_name: "Bash", command_fp: "git diff" }));
      expect(s.command_fp).toBe("git diff");
      expect(retrieveOutput(db, s.id)!.command_fp).toBe("git diff");
    });

    it("stores NULL command_fp when omitted (non-Bash / untagged)", () => {
      const s = storeOutput(db, makeInput({ tool_name: "mcp__github__list_issues" }));
      expect(s.command_fp).toBeNull();
      expect(retrieveOutput(db, s.id)!.command_fp).toBeNull();
    });

    it("groups Bash rows by command family, sorted by original size", () => {
      storeOutput(db, makeInput({ tool_name: "Bash", command_fp: "git diff", original_size: 5000, summary: "a" }));
      storeOutput(db, makeInput({ tool_name: "Bash", command_fp: "git diff", original_size: 3000, summary: "b" }));
      storeOutput(db, makeInput({ tool_name: "Bash", command_fp: "rg", original_size: 1000, summary: "c" }));

      const rows = getBashCommandBreakdown(db, PROJECT_KEY);
      expect(rows.map((r) => r.command_fp)).toEqual(["git diff", "rg"]); // sorted by original bytes desc
      const gitDiff = rows.find((r) => r.command_fp === "git diff")!;
      expect(gitDiff.items).toBe(2);
      expect(gitDiff.original_bytes).toBe(8000);
    });

    it("folds untagged/pre-migration Bash rows into an 'unknown' bucket", () => {
      storeOutput(db, makeInput({ tool_name: "Bash", command_fp: null, original_size: 900, summary: "x" }));
      const rows = getBashCommandBreakdown(db, PROJECT_KEY);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.command_fp).toBe("unknown");
    });

    it("excludes non-Bash rows from the breakdown", () => {
      storeOutput(db, makeInput({ tool_name: "mcp__github__list_issues", summary: "gh" }));
      storeOutput(db, makeInput({ tool_name: "Bash", command_fp: "ls", summary: "ls" }));
      const rows = getBashCommandBreakdown(db, PROJECT_KEY);
      expect(rows.map((r) => r.command_fp)).toEqual(["ls"]);
    });
  });

  // -------------------------------------------------------------------------
  // retrieveSnippet
  // -------------------------------------------------------------------------

  describe("retrieveSnippet", () => {
    it("returns null for unknown id", () => {
      expect(retrieveSnippet(db, "recall_00000000", "query")).toBeNull();
    });

    it("returns a text excerpt when query matches full_content", () => {
      const stored = storeOutput(db, makeInput({
        full_content: "The quick brown fox jumps over the lazy authentication dog",
      }));
      const snippet = retrieveSnippet(db, stored.id, "authentication");
      expect(snippet).not.toBeNull();
      expect(snippet).toContain("authentication");
    });

    it("returns null when query does not match", () => {
      const stored = storeOutput(db, makeInput({ full_content: "hello world" }));
      expect(retrieveSnippet(db, stored.id, "zzznomatch")).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // chunkText
  // -------------------------------------------------------------------------

  describe("chunkText", () => {
    it("returns empty array for empty string", () => {
      expect(chunkText("")).toEqual([]);
    });

    it("returns single chunk for text shorter than CHUNK_SIZE", () => {
      const text = "short text";
      expect(chunkText(text)).toEqual([text]);
    });

    it("returns single chunk for text exactly CHUNK_SIZE", () => {
      const text = "x".repeat(CHUNK_SIZE);
      expect(chunkText(text)).toHaveLength(1);
    });

    it("splits text longer than CHUNK_SIZE into multiple chunks", () => {
      const text = "x".repeat(CHUNK_SIZE * 2);
      expect(chunkText(text).length).toBeGreaterThan(1);
    });

    it("each chunk is at most CHUNK_SIZE characters", () => {
      const text = "a".repeat(CHUNK_SIZE * 3 + 100);
      for (const chunk of chunkText(text)) {
        expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE);
      }
    });

    it("consecutive chunks overlap by CHUNK_OVERLAP characters", () => {
      const text = "abcdefghij".repeat(60); // > CHUNK_SIZE
      const chunks = chunkText(text);
      expect(chunks.length).toBeGreaterThan(1);
      const step = CHUNK_SIZE - CHUNK_OVERLAP;
      // Second chunk starts at step, so first chunk's tail overlaps second chunk's head
      expect(chunks[1]!.slice(0, CHUNK_OVERLAP)).toBe(chunks[0]!.slice(step, step + CHUNK_OVERLAP));
    });

    it("last chunk contains the end of the text", () => {
      const text = "x".repeat(CHUNK_SIZE + 100);
      const chunks = chunkText(text);
      const last = chunks[chunks.length - 1]!;
      expect(text.endsWith(last)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Chunk storage and deletion
  // -------------------------------------------------------------------------

  describe("content_chunks", () => {
    it("stores chunks when an item is stored", () => {
      const longContent = "word ".repeat(200); // > CHUNK_SIZE
      storeOutput(db, makeInput({ full_content: longContent }));
      const count = (
        db.prepare("SELECT COUNT(*) as n FROM content_chunks").get() as { n: number }
      ).n;
      expect(count).toBeGreaterThan(1);
    });

    it("stores a single chunk for short content", () => {
      const stored = storeOutput(db, makeInput({ full_content: "short content" }));
      const count = (
        db.prepare("SELECT COUNT(*) as n FROM content_chunks WHERE output_id = ?")
          .get(stored.id) as { n: number }
      ).n;
      expect(count).toBe(1);
    });

    it("chunk count matches chunkText output for the stored content", () => {
      const content = "z".repeat(CHUNK_SIZE * 2 + 50);
      const stored = storeOutput(db, makeInput({ full_content: content }));
      const expected = chunkText(content).length;
      const actual = (
        db.prepare("SELECT COUNT(*) as n FROM content_chunks WHERE output_id = ?")
          .get(stored.id) as { n: number }
      ).n;
      expect(actual).toBe(expected);
    });

    it("deletes chunks when the item is deleted", () => {
      const stored = storeOutput(db, makeInput({ full_content: "some content to chunk" }));
      db.prepare("DELETE FROM stored_outputs WHERE id = ?").run(stored.id);
      const count = (
        db.prepare("SELECT COUNT(*) as n FROM content_chunks WHERE output_id = ?")
          .get(stored.id) as { n: number }
      ).n;
      expect(count).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // retrieveSnippet — chunk-based retrieval
  // -------------------------------------------------------------------------

  describe("retrieveSnippet (chunked)", () => {
    it("returns the matching chunk when query matches full_content", () => {
      const stored = storeOutput(db, makeInput({
        full_content: "The deployment pipeline uses kubernetes and helm charts for orchestration",
      }));
      const result = retrieveSnippet(db, stored.id, "kubernetes");
      expect(result).not.toBeNull();
      expect(result).toContain("kubernetes");
    });

    it("returned content is the full chunk, not just a short excerpt", () => {
      // Content longer than a snippet window but shorter than CHUNK_SIZE
      const content = "alpha ".repeat(50) + "targetword " + "beta ".repeat(50);
      const stored = storeOutput(db, makeInput({ full_content: content }));
      const result = retrieveSnippet(db, stored.id, "targetword");
      expect(result).not.toBeNull();
      // A full chunk is much longer than a 64-word legacy snippet
      expect(result!.length).toBeGreaterThan(100);
    });

    it("returns the chunk containing the match for a multi-chunk document", () => {
      // Build a document where the match is in a specific chunk
      const prefix = "x ".repeat(300);   // fills first chunk
      const target = "uniquekeyword ";
      const suffix = "y ".repeat(300);
      const content = prefix + target + suffix;
      const stored = storeOutput(db, makeInput({ full_content: content }));
      const result = retrieveSnippet(db, stored.id, "uniquekeyword");
      expect(result).not.toBeNull();
      expect(result).toContain("uniquekeyword");
    });

    it("falls back to legacy FTS snippet for items stored without chunks", () => {
      // Insert directly via SQL — no chunks created
      const now = Math.floor(Date.now() / 1000);
      db.prepare(`
        INSERT INTO stored_outputs
          (id, project_key, session_id, tool_name, summary, full_content, original_size, summary_size, created_at)
        VALUES ('recall_legacy01', ?, 'sess', 'mcp__tool', 'summary', 'legacy content with matchword', 100, 7, ?)
      `).run(PROJECT_KEY, now);

      const result = retrieveSnippet(db, "recall_legacy01", "matchword");
      expect(result).not.toBeNull();
      expect(result).toContain("matchword");
    });

    it("returns null when query matches no chunk and no legacy FTS entry", () => {
      const stored = storeOutput(db, makeInput({ full_content: "completely different content" }));
      expect(retrieveSnippet(db, stored.id, "zzznomatch")).toBeNull();
    });
  });

  describe("getContext hot section", () => {
    // Helper: insert a row directly so we can control created_at / access_count.
    function insertRow(
      id: string,
      createdAt: number,
      accessCount: number,
      lastAccessed: number | null = null,
      toolName = "mcp__github__list_issues",
      pinned = 0
    ) {
      db.prepare(`
        INSERT INTO stored_outputs
          (id, project_key, session_id, tool_name, summary, full_content,
           original_size, summary_size, created_at, access_count, last_accessed, pinned)
        VALUES (?, ?, 'sess', ?, 'a summary', 'full content', 1024, 64, ?, ?, ?, ?)
      `).run(id, PROJECT_KEY, toolName, createdAt, accessCount, lastAccessed, pinned);
    }

    function oldDate(daysAgo: number): { date: string; start: number } {
      const date = new Date(Date.now() - daysAgo * 86400 * 1000).toISOString().slice(0, 10);
      const start = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
      return { date, start };
    }

    it("hot is empty when there is no last session", () => {
      const data = getContext(db, PROJECT_KEY);
      expect(data.hot).toEqual([]);
    });

    it("hot is empty when last session items have access_count of 0", () => {
      const { date, start } = oldDate(14);
      insertRow("recall_hot_t1", start + 3600, 0);
      recordSession(db, date);
      const data = getContext(db, PROJECT_KEY);
      expect(data.hot).toEqual([]);
    });

    it("hot returns accessed items from last session ordered by access_count desc", () => {
      const { date, start } = oldDate(14);
      insertRow("recall_hot_t2a", start + 3600, 5);
      insertRow("recall_hot_t2b", start + 3601, 1);
      insertRow("recall_hot_t2c", start + 3602, 3);
      recordSession(db, date);
      const data = getContext(db, PROJECT_KEY);
      expect(data.hot).toHaveLength(3);
      expect(data.hot[0]!.id).toBe("recall_hot_t2a");
      expect(data.hot[1]!.id).toBe("recall_hot_t2c");
      expect(data.hot[2]!.id).toBe("recall_hot_t2b");
    });

    it("hot excludes items that already appear in recent", () => {
      const { date, start } = oldDate(14);
      const recentAccess = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      insertRow("recall_hot_t3", start + 3600, 3, recentAccess);
      recordSession(db, date);
      const data = getContext(db, PROJECT_KEY);
      expect(data.recent.some((i) => i.id === "recall_hot_t3")).toBe(true);
      expect(data.hot.some((i) => i.id === "recall_hot_t3")).toBe(false);
    });

    it("hot excludes notes", () => {
      const { date, start } = oldDate(14);
      insertRow("recall_hot_t4", start + 3600, 2, null, "recall__note");
      recordSession(db, date);
      const data = getContext(db, PROJECT_KEY);
      expect(data.hot).toEqual([]);
    });

    it("hot excludes pinned items", () => {
      const { date, start } = oldDate(14);
      insertRow("recall_hot_t5", start + 3600, 2, null, "mcp__tool", 1);
      recordSession(db, date);
      const data = getContext(db, PROJECT_KEY);
      expect(data.hot).toEqual([]);
    });
  });
});
