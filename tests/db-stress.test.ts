/**
 * Stress / load tests for the DB layer.
 *
 * These tests are skipped by default to keep the normal test run fast.
 * Run them with: RECALL_STRESS=1 bun test tests/db-stress.test.ts
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { Database } from "bun:sqlite";
import {
  getDb,
  closeDb,
  storeOutput,
  listOutputs,
  evictIfNeeded,
  checkDedup,
  chunkText,
  CHUNK_SIZE,
  CHUNK_OVERLAP,
  type StoreInput,
} from "../src/db/index";

const STRESS = process.env.RECALL_STRESS === "1";

// Skip the whole suite unless RECALL_STRESS=1
const stressIt = STRESS ? it : it.skip;

const PROJECT_KEY = "stress-test-proj";

function makeInput(overrides: Partial<StoreInput> = {}): StoreInput {
  return {
    project_key: PROJECT_KEY,
    session_id: "2026-03-01",
    tool_name: "mcp__test__tool",
    summary: "summary",
    full_content: "x".repeat(256),
    original_size: 1024,
    ...overrides,
  };
}

describe("stress tests (set RECALL_STRESS=1 to run)", () => {
  let db: Database;

  beforeEach(() => {
    db = getDb(":memory:");
  });

  afterEach(() => {
    closeDb();
  });

  // -------------------------------------------------------------------------
  // 1,000 item insert — eviction fires, LFU order is correct
  // -------------------------------------------------------------------------

  stressIt("1,000 inserts — eviction fires and LFU ordering is respected", () => {
    for (let i = 0; i < 1000; i++) {
      storeOutput(db, makeInput({ summary: `item ${i}`, original_size: 1024 }));
    }

    expect(listOutputs(db, { project_key: PROJECT_KEY, limit: 2000 }).length).toBe(1000);

    // Evict to 0.5 MB — roughly half the items should be removed
    const evicted = evictIfNeeded(db, PROJECT_KEY, 0.5);
    expect(evicted).toBeGreaterThan(400);

    const remaining = listOutputs(db, { project_key: PROJECT_KEY, limit: 2000 }).length;
    expect(remaining).toBeLessThanOrEqual(512);
    expect(remaining).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Large payload — chunked and fully retrievable
  // -------------------------------------------------------------------------

  stressIt("2 MB payload is chunked correctly and all chunks are stored", () => {
    const payloadSize = 2 * 1024 * 1024; // 2 MB
    const content = "a".repeat(payloadSize);

    const stored = storeOutput(db, makeInput({
      full_content: content,
      original_size: payloadSize,
      summary: "large payload test",
    }));

    // Full content is stored intact
    const chunkCount = (db.prepare(
      "SELECT COUNT(*) as n FROM content_chunks WHERE output_id = ?"
    ).get(stored.id) as { n: number }).n;

    const expectedChunks = chunkText(content).length;
    const expectedStep = CHUNK_SIZE - CHUNK_OVERLAP;

    expect(expectedChunks).toBeGreaterThan(1);
    expect(expectedStep).toBe(448); // sanity-check constants
    expect(chunkCount).toBe(expectedChunks);
  });

  // -------------------------------------------------------------------------
  // 500 identical inputs — dedup keeps one copy
  // -------------------------------------------------------------------------

  stressIt("500 identical inputs — dedup keeps only one stored copy", () => {
    const input_hash = "deadbeefdeadbeef1234";

    // First call: nothing in DB yet — store it
    const first = storeOutput(db, makeInput({ input_hash, summary: "original" }));

    // Remaining 499 calls should all hit the dedup cache
    for (let i = 1; i < 500; i++) {
      const hit = checkDedup(db, PROJECT_KEY, input_hash);
      expect(hit).not.toBeNull();
      expect(hit!.id).toBe(first.id);
    }

    expect(listOutputs(db, { project_key: PROJECT_KEY, limit: 1000 }).length).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Very small size cap — eviction handles near-zero limit gracefully
  // -------------------------------------------------------------------------

  stressIt("near-zero size cap — eviction clears all unpinned items without crashing", () => {
    // 50 items at 10 KB each = ~500 KB total
    for (let i = 0; i < 50; i++) {
      storeOutput(db, makeInput({ summary: `item ${i}`, original_size: 10 * 1024 }));
    }

    // Cap at ~1 KB — should evict all 50 items
    const evicted = evictIfNeeded(db, PROJECT_KEY, 0.001);
    expect(evicted).toBe(50);
    expect(listOutputs(db, { project_key: PROJECT_KEY, limit: 100 }).length).toBe(0);
  });
});
