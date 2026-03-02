import { describe, it, expect } from "bun:test";
import { playwrightHandler } from "../src/handlers/playwright";
import { githubHandler } from "../src/handlers/github";
import { filesystemHandler } from "../src/handlers/filesystem";
import { jsonHandler } from "../src/handlers/json";
import { genericHandler } from "../src/handlers/generic";
import { getHandler, extractText } from "../src/handlers/index";

// ---------------------------------------------------------------------------
// extractText
// ---------------------------------------------------------------------------

describe("extractText", () => {
  it("returns string as-is", () => {
    expect(extractText("hello")).toBe("hello");
  });

  it("extracts text from MCP content array", () => {
    const output = { content: [{ type: "text", text: "foo" }, { type: "text", text: "bar" }] };
    expect(extractText(output)).toBe("foo\nbar");
  });

  it("ignores non-text content items", () => {
    const output = { content: [{ type: "image", data: "abc" }, { type: "text", text: "hi" }] };
    expect(extractText(output)).toBe("hi");
  });

  it("falls back to JSON.stringify for unknown shapes", () => {
    const output = { foo: 42 };
    expect(extractText(output)).toBe(JSON.stringify(output));
  });
});

// ---------------------------------------------------------------------------
// playwrightHandler
// ---------------------------------------------------------------------------

describe("playwrightHandler", () => {
  const snapshot = [
    '- document "Page"',
    '  - heading "Welcome"',
    '  - button "Submit"',
    '  - textbox "Email"',
    '  - link "Home"',
    '  - statictext "Some visible text here"',
  ].join("\n");

  it("extracts interactive elements", () => {
    const { summary } = playwrightHandler("mcp__playwright__browser_snapshot", snapshot);
    expect(summary).toContain('[button "Submit"]');
    expect(summary).toContain('[textbox "Email"]');
    expect(summary).toContain('[link "Home"]');
  });

  it("extracts visible text from headings and statictext", () => {
    const { summary } = playwrightHandler("mcp__playwright__browser_snapshot", snapshot);
    expect(summary).toContain("Welcome");
    expect(summary).toContain("Some visible text here");
  });

  it("reports originalSize in bytes", () => {
    const { originalSize } = playwrightHandler("mcp__playwright__browser_snapshot", snapshot);
    expect(originalSize).toBe(Buffer.byteLength(snapshot, "utf8"));
  });

  it("handles MCP content wrapper", () => {
    const output = { content: [{ type: "text", text: snapshot }] };
    const { summary } = playwrightHandler("mcp__playwright__browser_snapshot", output);
    expect(summary).toContain('[button "Submit"]');
  });

  it("returns fallback message for empty snapshot", () => {
    const { summary } = playwrightHandler("mcp__playwright__browser_snapshot", "");
    expect(summary).toContain("no interactive elements");
  });

  it("caps interactive elements at 20", () => {
    const lines = Array.from({ length: 25 }, (_, i) => `- button "Btn${i}"`).join("\n");
    const { summary } = playwrightHandler("mcp__playwright__browser_snapshot", lines);
    const matches = summary.match(/\[button/g) ?? [];
    expect(matches.length).toBeLessThanOrEqual(20);
  });
});

// ---------------------------------------------------------------------------
// githubHandler
// ---------------------------------------------------------------------------

describe("githubHandler", () => {
  it("summarises a single issue object", () => {
    const issue = {
      number: 42,
      title: "Fix the thing",
      state: "open",
      html_url: "https://github.com/org/repo/issues/42",
      labels: [{ name: "bug" }, { name: "P1: High" }],
      body: "This is broken.",
    };
    const { summary } = githubHandler("mcp__github__issue_read", JSON.stringify(issue));
    expect(summary).toContain("#42");
    expect(summary).toContain('"Fix the thing"');
    expect(summary).toContain("[open]");
    expect(summary).toContain("bug");
    expect(summary).toContain("This is broken.");
  });

  it("summarises an array of items", () => {
    const issues = [
      { number: 1, title: "First", state: "open" },
      { number: 2, title: "Second", state: "closed" },
    ];
    const { summary } = githubHandler("mcp__github__list_issues", JSON.stringify(issues));
    expect(summary).toContain("#1");
    expect(summary).toContain("#2");
  });

  it("truncates arrays longer than 10 items", () => {
    const items = Array.from({ length: 15 }, (_, i) => ({ number: i + 1, title: `Item ${i + 1}`, state: "open" }));
    const { summary } = githubHandler("mcp__github__list_issues", JSON.stringify(items));
    expect(summary).toContain("5 more");
  });

  it("truncates long body excerpts", () => {
    const issue = { number: 1, title: "T", state: "open", body: "x".repeat(300) };
    const { summary } = githubHandler("mcp__github__issue_read", JSON.stringify(issue));
    expect(summary).toContain("…");
  });

  it("falls back gracefully for non-JSON text", () => {
    const { summary } = githubHandler("mcp__github__get_file_contents", "plain text response");
    expect(summary).toContain("plain text response");
  });

  it("reports originalSize in bytes", () => {
    const raw = JSON.stringify({ number: 1, title: "T", state: "open" });
    const { originalSize } = githubHandler("mcp__github__issue_read", raw);
    expect(originalSize).toBe(Buffer.byteLength(raw, "utf8"));
  });
});

// ---------------------------------------------------------------------------
// filesystemHandler
// ---------------------------------------------------------------------------

describe("filesystemHandler", () => {
  it("includes line count header", () => {
    const content = "line1\nline2\nline3";
    const { summary } = filesystemHandler("mcp__filesystem__read_file", content);
    expect(summary).toContain("3 lines");
  });

  it("shows all lines when under the limit", () => {
    const content = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join("\n");
    const { summary } = filesystemHandler("mcp__filesystem__read_file", content);
    expect(summary).toContain("line 1");
    expect(summary).toContain("line 10");
    expect(summary).not.toContain("…");
  });

  it("truncates and marks when over 50 lines", () => {
    const content = Array.from({ length: 80 }, (_, i) => `line ${i + 1}`).join("\n");
    const { summary } = filesystemHandler("mcp__filesystem__read_file", content);
    expect(summary).toContain("showing first 50");
    expect(summary).toContain("…");
    expect(summary).not.toContain("line 51");
  });

  it("handles single-line content", () => {
    const { summary } = filesystemHandler("mcp__filesystem__read_file", "one line");
    expect(summary).toContain("1 line");
  });

  it("reports originalSize in bytes", () => {
    const content = "hello\nworld";
    const { originalSize } = filesystemHandler("mcp__filesystem__read_file", content);
    expect(originalSize).toBe(Buffer.byteLength(content, "utf8"));
  });
});

// ---------------------------------------------------------------------------
// jsonHandler
// ---------------------------------------------------------------------------

describe("jsonHandler", () => {
  it("pretty-prints JSON at depth limit", () => {
    // MAX_DEPTH=3: values at depth 4 are replaced, so a.b.c is visible but a.b.c.d is "…"
    const obj = { a: { b: { c: { d: "deep" } } } };
    const { summary } = jsonHandler("mcp__some__tool", JSON.stringify(obj));
    const parsed = JSON.parse(summary);
    expect(parsed.a.b.c.d).toBe("…");
  });

  it("truncates arrays to 3 items with count", () => {
    const obj = { items: [1, 2, 3, 4, 5] };
    const { summary } = jsonHandler("mcp__some__tool", JSON.stringify(obj));
    const parsed = JSON.parse(summary);
    expect(parsed.items).toHaveLength(4); // 3 items + "…2 more"
    expect(parsed.items[3]).toContain("2 more");
  });

  it("preserves short arrays unchanged", () => {
    const obj = { items: [1, 2] };
    const { summary } = jsonHandler("mcp__some__tool", JSON.stringify(obj));
    const parsed = JSON.parse(summary);
    expect(parsed.items).toEqual([1, 2]);
  });

  it("falls back to plain excerpt for non-JSON", () => {
    const { summary } = jsonHandler("mcp__some__tool", "not json at all");
    expect(summary).toContain("not json at all");
  });

  it("reports originalSize in bytes", () => {
    const raw = JSON.stringify({ x: 1 });
    const { originalSize } = jsonHandler("mcp__some__tool", raw);
    expect(originalSize).toBe(Buffer.byteLength(raw, "utf8"));
  });
});

// ---------------------------------------------------------------------------
// genericHandler
// ---------------------------------------------------------------------------

describe("genericHandler", () => {
  it("returns content under 500 chars unchanged", () => {
    const content = "short content";
    const { summary } = genericHandler("mcp__some__tool", content);
    expect(summary).toBe(content);
  });

  it("truncates at 500 chars and appends ellipsis", () => {
    const content = "x".repeat(600);
    const { summary } = genericHandler("mcp__some__tool", content);
    expect(summary.length).toBeLessThanOrEqual(502); // 500 chars + "\n…"
    expect(summary).toContain("…");
  });

  it("reports originalSize in bytes", () => {
    const content = "hello";
    const { originalSize } = genericHandler("mcp__some__tool", content);
    expect(originalSize).toBe(Buffer.byteLength(content, "utf8"));
  });
});

// ---------------------------------------------------------------------------
// getHandler dispatcher
// ---------------------------------------------------------------------------

describe("getHandler", () => {
  it("routes playwright snapshot to playwright handler", () => {
    const h = getHandler("mcp__plugin_playwright_playwright__browser_snapshot", "");
    expect(h).toBe(playwrightHandler);
  });

  it("routes github tools to github handler", () => {
    const h = getHandler("mcp__github__list_issues", "");
    expect(h).toBe(githubHandler);
  });

  it("routes filesystem tools to filesystem handler", () => {
    const h = getHandler("mcp__filesystem__read_file", "");
    expect(h).toBe(filesystemHandler);
  });

  it("routes JSON output to json handler when tool name is unrecognised", () => {
    const h = getHandler("mcp__unknown__tool", '{"key": "value"}');
    expect(h).toBe(jsonHandler);
  });

  it("routes plain text to generic handler when tool name is unrecognised", () => {
    const h = getHandler("mcp__unknown__tool", "plain text output");
    expect(h).toBe(genericHandler);
  });
});
