import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  getDb,
  closeDb,
  storeOutput,
  retrieveOutput,
  recordAccess,
  pinOutput,
  checkDedup,
  evictIfNeeded,
  retrieveSnippet,
  searchOutputs,
  listOutputs,
  forgetOutputs,
  getStats,
  pruneExpired,
  recordSession,
  getSessionDays,
  type StoreInput,
} from "../src/db/index";
import type { Database } from "bun:sqlite";

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
      expect(result.id).toMatch(/^recall_[0-9a-f]{8}$/);
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

    it("returns true when item exists", () => {
      const stored = storeOutput(db, makeInput());
      expect(pinOutput(db, stored.id, PROJECT_KEY, true)).toBe(true);
    });

    it("returns false for unknown id", () => {
      expect(pinOutput(db, "recall_00000000", PROJECT_KEY, true)).toBe(false);
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
});
