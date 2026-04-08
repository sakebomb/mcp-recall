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
  getContext,
  chunkText,
  CHUNK_SIZE,
  CHUNK_OVERLAP,
  sanitizeFtsQuery,
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
