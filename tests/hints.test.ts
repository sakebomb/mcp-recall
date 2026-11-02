import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { extractHints } from "../src/hints";
import { getDb, closeDb, storeOutput, searchOutputs } from "../src/db/index";
import type { Database } from "bun:sqlite";

// ── extractHints ────────────────────────────────────────────────────────────

describe("extractHints", () => {
  test("returns empty array for empty or whitespace-only content", () => {
    expect(extractHints("")).toEqual([]);
    expect(extractHints("   \n\t ")).toEqual([]);
  });

  test("returns the most frequent salient term first", () => {
    const content = "checkout checkout checkout page render render done";
    expect(extractHints(content)[0]).toBe("checkout");
  });

  test("excludes common stopwords", () => {
    const content = "the the the and and with this that from checkout";
    const hints = extractHints(content);
    expect(hints).not.toContain("the");
    expect(hints).not.toContain("and");
    expect(hints).toContain("checkout");
  });

  test("boosts identifier-like tokens over plain words of equal frequency", () => {
    const content = "orders sessionToken";
    expect(extractHints(content)[0]).toBe("sessionToken");
  });

  test("treats snake_case as an identifier and boosts it", () => {
    const content = "orders session_token";
    expect(extractHints(content)[0]).toBe("session_token");
  });

  test("dedups case-insensitively, keeping first-seen casing", () => {
    const hints = extractHints("Checkout checkout CHECKOUT orders");
    const lower = hints.map((h) => h.toLowerCase());
    expect(lower.filter((h) => h === "checkout")).toHaveLength(1);
    expect(hints).toContain("Checkout");
  });

  test("caps at 5 hints by default", () => {
    const content = "alpha bravo charlie delta echo foxtrot golf hotel india";
    expect(extractHints(content).length).toBeLessThanOrEqual(5);
  });

  test("respects a custom maxHints", () => {
    const content = "alpha bravo charlie delta echo foxtrot";
    expect(extractHints(content, 3)).toHaveLength(3);
  });

  test("returns empty array when maxHints is zero or negative", () => {
    expect(extractHints("checkout orders", 0)).toEqual([]);
    expect(extractHints("checkout orders", -1)).toEqual([]);
  });

  test("ignores tokens shorter than 3 chars and pure numbers", () => {
    const hints = extractHints("ab a 42 402 checkout");
    expect(hints).not.toContain("ab");
    expect(hints).not.toContain("42");
    expect(hints).not.toContain("402");
    expect(hints).toContain("checkout");
  });

  test("skips excessively long tokens such as base64 blobs", () => {
    const blob = "x".repeat(60);
    expect(extractHints(`${blob} checkout`)).not.toContain(blob);
  });

  test("is deterministic across repeated calls", () => {
    const content = "playwright snapshot button button form input sessionId sessionId";
    expect(extractHints(content)).toEqual(extractHints(content));
  });

  test("orders equal-score tokens alphabetically for stability", () => {
    // all distinct, frequency 1, plain words -> equal score -> alphabetical
    expect(extractHints("delta charlie bravo alpha", 2)).toEqual(["alpha", "bravo"]);
  });

  test("boosts a capitalized (proper-noun) token over a plain word of equal frequency", () => {
    // "Github" is capitalized (+1) but not identifier-shaped; "orders" is plain
    expect(extractHints("orders Github")[0]).toBe("Github");
  });
});

// ── FTS round-trip: every emitted hint must actually retrieve its item ────────

// Structure repeats once per record, so it out-counts the words a reader would
// search for: keys, attributes, roles, URL scaffolding and hex ids never hint.
describe("extractHints — structure is not a hint", () => {
  test("ignores page snapshot roles and attributes, keeping the page's words", () => {
    const rows = ["Alamodome attendance record", "Spurs Alamodome return", "Wembanyama Alamodome debut"];
    const snapshot = rows.flatMap((title, i) => [
      `- generic [ref=e${i * 4}]:`,
      `  - link "${title}" [ref=e${i * 4 + 1}] [cursor=pointer]:`,
      `    - /url: /f/nba/${i}`,
      `  - paragraph [ref=e${i * 4 + 2}]: Submitted by`,
    ]).join("\n");
    const hints = extractHints(snapshot);
    expect(hints[0]).toBe("Alamodome");
    for (const markup of ["generic", "ref", "cursor", "pointer", "link", "url", "paragraph"]) {
      expect(hints).not.toContain(markup);
    }
  });

  test("ignores JSON keys, keeping the values", () => {
    const events = ["Quarterly planning", "Planning retro", "Budget planning"].map((summary) =>
      JSON.stringify({ summary, timeZone: "America/New_York", startDateTime: "2026-11-02", htmlLink: "x" })
    );
    const hints = extractHints(`[${events.join(",\n")}]`);
    expect(hints.map((h) => h.toLowerCase())).toContain("planning");
    for (const key of ["timeZone", "startDateTime", "htmlLink", "summary"]) expect(hints).not.toContain(key);
  });

  test("ignores URL scaffolding, hex ids and opaque ids", () => {
    const content = [
      "https://www.example.com/thread/a197f309f6243d7 deploy rollback MdwqLOBsFOCRitL54HwXzSQY0vnj64cg",
      "https://www.example.com/thread/fd7a0c deploy rollback MdwqLOBsFOCRitL54HwXzSQY0vnj64cg",
      "http://www.example.com/thread/9e1b4c2 deploy MdwqLOBsFOCRitL54HwXzSQY0vnj64cg",
    ].join("\n");
    const hints = extractHints(content);
    for (const noise of ["https", "http", "www", "com", "a197f309f6243d7", "fd7a0c", "MdwqLOBsFOCRitL54HwXzSQY0vnj64cg"]) {
      expect(hints).not.toContain(noise);
    }
    expect(hints).toContain("deploy");
    expect(hints).toContain("rollback");
  });

  test("still hints a key-shaped word that appears as a value", () => {
    expect(extractHints('{"name": "sessionToken", "note": "sessionToken rotated"}')[0]).toBe("sessionToken");
  });
});

describe("extractHints — FTS round-trip", () => {
  const PROJECT_KEY = "hintsroundtrip01";
  let db: Database;

  beforeEach(() => {
    db = getDb(":memory:");
  });
  afterEach(() => {
    closeDb();
  });

  test("each hint returns the stored item via searchOutputs (camelCase + snake_case)", () => {
    const full =
      "The checkout page posts sessionToken sessionToken to the orders endpoint " +
      "with order_id order_id order_id and widgetName widgetName rendered.";
    const stored = storeOutput(db, {
      project_key: PROJECT_KEY,
      session_id: "2026-03-01",
      tool_name: "mcp__playwright__snapshot",
      summary: "checkout snapshot",
      full_content: full,
      original_size: 4096,
    });

    const hints = extractHints(full);
    expect(hints.length).toBeGreaterThan(0);
    // Cover both tokenization shapes explicitly.
    expect(hints).toContain("sessionToken");
    expect(hints).toContain("order_id");

    for (const hint of hints) {
      const ids = searchOutputs(db, hint, { project_key: PROJECT_KEY }).map((r) => r.id);
      expect(ids).toContain(stored.id);
    }
  });
});
