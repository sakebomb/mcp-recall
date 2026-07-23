import { describe, test, expect } from "bun:test";
import { extractHints } from "../src/hints";

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
});
