import { describe, it, expect } from "bun:test";
import { playwrightHandler } from "../src/handlers/playwright";
import { githubHandler } from "../src/handlers/github";
import { filesystemHandler } from "../src/handlers/filesystem";
import { shellHandler, stripAnsi, stripSshNoise } from "../src/handlers/shell";
import { csvHandler, looksLikeCsv } from "../src/handlers/csv";
import { linearHandler } from "../src/handlers/linear";
import { slackHandler } from "../src/handlers/slack";
import { jsonHandler } from "../src/handlers/json";
import { genericHandler } from "../src/handlers/generic";
import { getHandler, extractText } from "../src/handlers/index";
import { getBashHandler, gitDiffHandler, gitLogHandler, terraformPlanHandler } from "../src/handlers/bash";
import { tavilyHandler } from "../src/handlers/tavily";

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

  it("routes linear tools to linear handler", () => {
    const h = getHandler("mcp__linear__get_issue", "");
    expect(h).toBe(linearHandler);
  });

  it("routes slack tools to slack handler", () => {
    const h = getHandler("mcp__slack__get_messages", "");
    expect(h).toBe(slackHandler);
  });

  it("routes csv tools to csv handler by name", () => {
    const h = getHandler("mcp__export__get_csv", "");
    expect(h).toBe(csvHandler);
  });

  it("routes CSV-shaped plain text to csv handler", () => {
    const csv = "col1,col2,col3\nv1,v2,v3\nv4,v5,v6\nv7,v8,v9";
    const h = getHandler("mcp__unknown__tool", csv);
    expect(h).toBe(csvHandler);
  });
});

// ---------------------------------------------------------------------------
// csvHandler
// ---------------------------------------------------------------------------

describe("csvHandler", () => {
  const CSV = [
    "name,age,city,country",
    "Alice,30,London,UK",
    "Bob,25,Paris,France",
    "Carol,35,Berlin,Germany",
  ].join("\n");

  it("includes row and column count in summary", () => {
    const { summary } = csvHandler("mcp__csv__export", CSV);
    expect(summary).toContain("3 rows");
    expect(summary).toContain("4 cols");
  });

  it("includes header column names", () => {
    const { summary } = csvHandler("mcp__csv__export", CSV);
    expect(summary).toContain("name");
    expect(summary).toContain("age");
    expect(summary).toContain("city");
  });

  it("includes preview rows with key=value pairs", () => {
    const { summary } = csvHandler("mcp__csv__export", CSV);
    expect(summary).toContain("Alice");
    expect(summary).toContain("row 1");
  });

  it("shows only first 5 data rows with overflow count", () => {
    const rows = Array.from({ length: 10 }, (_, i) => `v${i},x,y`);
    const input = ["a,b,c", ...rows].join("\n");
    const { summary } = csvHandler("mcp__csv__export", input);
    expect(summary).toContain("5 more rows");
  });

  it("handles quoted fields with embedded commas", () => {
    const input = `name,address\nAlice,"123 Main St, Apt 4"\nBob,456 Oak Ave`;
    const { summary } = csvHandler("mcp__csv__export", input);
    expect(summary).toContain("Alice");
    expect(summary).toContain("2 rows");
  });

  it("handles empty CSV input", () => {
    const { summary } = csvHandler("mcp__csv__export", "");
    expect(summary).toContain("empty");
  });

  it("reports originalSize in bytes", () => {
    const { originalSize } = csvHandler("mcp__csv__export", CSV);
    expect(originalSize).toBe(Buffer.byteLength(CSV, "utf8"));
  });

  it("handles MCP content wrapper", () => {
    const { summary } = csvHandler("mcp__csv__export", {
      content: [{ type: "text", text: CSV }],
    });
    expect(summary).toContain("3 rows");
  });
});

// ---------------------------------------------------------------------------
// looksLikeCsv
// ---------------------------------------------------------------------------

describe("looksLikeCsv", () => {
  it("returns true for CSV-shaped text with 3+ lines and 2+ commas in first line", () => {
    expect(looksLikeCsv("a,b,c\n1,2,3\n4,5,6")).toBe(true);
  });

  it("returns false for plain text", () => {
    expect(looksLikeCsv("hello world\nno commas here\nstill no commas")).toBe(false);
  });

  it("returns false for fewer than 3 lines", () => {
    expect(looksLikeCsv("a,b,c\n1,2,3")).toBe(false);
  });

  it("returns false for JSON (handled earlier in dispatcher)", () => {
    expect(looksLikeCsv('{"key": "value"}\n{"a": "b"}\n{"c": "d"}')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// linearHandler
// ---------------------------------------------------------------------------

describe("linearHandler", () => {
  const SINGLE_ISSUE = JSON.stringify({
    identifier: "ENG-123",
    title: "Fix authentication bug",
    state: { name: "In Progress" },
    priority: 2,
    description: "The login form throws a 500 on invalid credentials.",
    url: "https://linear.app/org/issue/ENG-123",
  });

  it("includes identifier and title for a single issue", () => {
    const { summary } = linearHandler("mcp__linear__get_issue", SINGLE_ISSUE);
    expect(summary).toContain("ENG-123");
    expect(summary).toContain("Fix authentication bug");
  });

  it("includes state label", () => {
    const { summary } = linearHandler("mcp__linear__get_issue", SINGLE_ISSUE);
    expect(summary).toContain("[In Progress]");
  });

  it("maps numeric priority to human label", () => {
    const { summary } = linearHandler("mcp__linear__get_issue", SINGLE_ISSUE);
    expect(summary).toContain("Priority: High");
  });

  it("includes description excerpt", () => {
    const { summary } = linearHandler("mcp__linear__get_issue", SINGLE_ISSUE);
    expect(summary).toContain("500 on invalid credentials");
  });

  it("includes URL", () => {
    const { summary } = linearHandler("mcp__linear__get_issue", SINGLE_ISSUE);
    expect(summary).toContain("https://linear.app");
  });

  it("summarises an array of issues with count header", () => {
    const arr = JSON.stringify([
      { identifier: "ENG-1", title: "Issue one", state: { name: "Todo" }, priority: 3 },
      { identifier: "ENG-2", title: "Issue two", state: { name: "Done" }, priority: 4 },
    ]);
    const { summary } = linearHandler("mcp__linear__list_issues", arr);
    expect(summary).toContain("2 Linear issues");
    expect(summary).toContain("ENG-1");
    expect(summary).toContain("ENG-2");
  });

  it("caps list at 10 items with overflow count", () => {
    const arr = JSON.stringify(
      Array.from({ length: 15 }, (_, i) => ({
        identifier: `ENG-${i + 1}`,
        title: `Issue ${i + 1}`,
        state: { name: "Todo" },
        priority: 0,
      }))
    );
    const { summary } = linearHandler("mcp__linear__list_issues", arr);
    expect(summary).toContain("5 more");
  });

  it("handles GraphQL wrapper { data: { issue: {...} } }", () => {
    const gql = JSON.stringify({
      data: { issue: { identifier: "ENG-99", title: "GraphQL issue", state: { name: "Backlog" }, priority: 4 } },
    });
    const { summary } = linearHandler("mcp__linear__get_issue", gql);
    expect(summary).toContain("ENG-99");
  });

  it("handles Relay-style { nodes: [...] } wrapper", () => {
    const relay = JSON.stringify({
      nodes: [
        { identifier: "ENG-10", title: "Node issue", state: { name: "Todo" }, priority: 3 },
      ],
    });
    const { summary } = linearHandler("mcp__linear__list_issues", relay);
    expect(summary).toContain("ENG-10");
  });

  it("falls back gracefully for non-JSON input", () => {
    const { summary } = linearHandler("mcp__linear__get_issue", "not json");
    expect(summary).toContain("not json");
  });

  it("reports originalSize in bytes", () => {
    const { originalSize } = linearHandler("mcp__linear__get_issue", SINGLE_ISSUE);
    expect(originalSize).toBe(Buffer.byteLength(SINGLE_ISSUE, "utf8"));
  });
});

// ---------------------------------------------------------------------------
// slackHandler
// ---------------------------------------------------------------------------

describe("slackHandler", () => {
  const MESSAGES_WRAPPER = JSON.stringify({
    ok: true,
    messages: [
      { ts: "1740825600.000000", user: "U12345", text: "Hello team, standup in 5 minutes" },
      { ts: "1740825660.000000", user: "U67890", text: "On my way, be there shortly" },
    ],
    channel: "C_GENERAL",
  });

  it("includes message count in summary", () => {
    const { summary } = slackHandler("mcp__slack__get_messages", MESSAGES_WRAPPER);
    expect(summary).toContain("2 messages");
  });

  it("includes user identifier in output", () => {
    const { summary } = slackHandler("mcp__slack__get_messages", MESSAGES_WRAPPER);
    expect(summary).toContain("U12345");
  });

  it("includes message text excerpt", () => {
    const { summary } = slackHandler("mcp__slack__get_messages", MESSAGES_WRAPPER);
    expect(summary).toContain("standup in 5 minutes");
  });

  it("formats timestamp as readable date", () => {
    const { summary } = slackHandler("mcp__slack__get_messages", MESSAGES_WRAPPER);
    expect(summary).toMatch(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\]/);
  });

  it("includes channel identifier when present", () => {
    const { summary } = slackHandler("mcp__slack__get_messages", MESSAGES_WRAPPER);
    expect(summary).toContain("C_GENERAL");
  });

  it("handles bare array of messages", () => {
    const arr = JSON.stringify([
      { ts: "1740825600.000000", user: "alice", text: "bare array message" },
      { ts: "1740825660.000000", user: "bob", text: "another message" },
      { ts: "1740825720.000000", user: "carol", text: "third message" },
    ]);
    const { summary } = slackHandler("mcp__slack__get_messages", arr);
    expect(summary).toContain("3 messages");
    expect(summary).toContain("bare array message");
  });

  it("caps messages at 10 with overflow count", () => {
    const msgs = Array.from({ length: 15 }, (_, i) => ({
      ts: String(1740825600 + i),
      user: "U123",
      text: `message ${i}`,
    }));
    const { summary } = slackHandler("mcp__slack__get_messages", JSON.stringify({ messages: msgs }));
    expect(summary).toContain("5 more messages");
  });

  it("uses display_name from user_profile when available", () => {
    const input = JSON.stringify({
      messages: [{
        ts: "1740825600.000000",
        user: "U12345",
        user_profile: { display_name: "alice_display" },
        text: "hello",
      }],
    });
    const { summary } = slackHandler("mcp__slack__get_messages", input);
    expect(summary).toContain("alice_display");
  });

  it("truncates long message text at 200 chars", () => {
    const input = JSON.stringify({
      messages: [{ ts: "1740825600.000000", user: "U1", text: "x".repeat(300) }],
    });
    const { summary } = slackHandler("mcp__slack__get_messages", input);
    expect(summary).toContain("…");
  });

  it("falls back gracefully for unrecognised JSON shapes", () => {
    const { summary } = slackHandler("mcp__slack__get_messages", '{"unrelated": true}');
    expect(summary).toContain("unrelated");
  });

  it("reports originalSize in bytes", () => {
    const { originalSize } = slackHandler("mcp__slack__get_messages", MESSAGES_WRAPPER);
    expect(originalSize).toBe(Buffer.byteLength(MESSAGES_WRAPPER, "utf8"));
  });
});

// ---------------------------------------------------------------------------
// stripAnsi
// ---------------------------------------------------------------------------

describe("stripAnsi", () => {
  it("removes color escape sequences", () => {
    expect(stripAnsi("\x1b[32mhello\x1b[0m")).toBe("hello");
  });

  it("removes bold and reset sequences", () => {
    expect(stripAnsi("\x1b[1mbold\x1b[0m text")).toBe("bold text");
  });

  it("leaves plain text unchanged", () => {
    expect(stripAnsi("plain output")).toBe("plain output");
  });
});

// ---------------------------------------------------------------------------
// shellHandler
// ---------------------------------------------------------------------------

describe("shellHandler", () => {
  it("includes line count in header for plain output", () => {
    const input = "line1\nline2\nline3";
    const { summary } = shellHandler("mcp__bash__execute", input);
    expect(summary).toContain("3 lines");
  });

  it("strips ANSI codes from plain output", () => {
    const input = "\x1b[32mgreen text\x1b[0m\nnormal text";
    const { summary } = shellHandler("mcp__bash__execute", input);
    expect(summary).toContain("green text");
    expect(summary).not.toContain("\x1b[");
  });

  it("truncates at 50 lines with overflow count", () => {
    const input = Array.from({ length: 60 }, (_, i) => `line${i + 1}`).join("\n");
    const { summary } = shellHandler("mcp__bash__execute", input);
    expect(summary).toContain("line1");
    expect(summary).toContain("+10 more lines");
    expect(summary).not.toContain("line60");
  });

  it("handles structured stdout/stderr output", () => {
    const input = JSON.stringify({ stdout: "hello world", stderr: "", returncode: 0 });
    const { summary } = shellHandler("mcp__bash__execute", input);
    expect(summary).toContain("hello world");
    expect(summary).toContain("exit:0");
  });

  it("shows exit code in header", () => {
    const input = JSON.stringify({ stdout: "output", returncode: 1 });
    const { summary } = shellHandler("mcp__bash__execute", input);
    expect(summary).toContain("exit:1");
  });

  it("shows stderr section when stderr is non-empty", () => {
    const input = JSON.stringify({ stdout: "ok", stderr: "warning: something", returncode: 0 });
    const { summary } = shellHandler("mcp__bash__execute", input);
    expect(summary).toContain("stderr:");
    expect(summary).toContain("warning: something");
  });

  it("handles alternate output field name", () => {
    const input = JSON.stringify({ output: "result text", exit_code: 0 });
    const { summary } = shellHandler("mcp__bash__execute", input);
    expect(summary).toContain("result text");
    expect(summary).toContain("exit:0");
  });

  it("handles empty output gracefully", () => {
    const { summary } = shellHandler("mcp__bash__execute", "");
    expect(summary).toContain("0 lines");
  });

  it("reports originalSize in bytes", () => {
    const input = "line1\nline2";
    const { originalSize } = shellHandler("mcp__bash__execute", input);
    expect(originalSize).toBe(Buffer.byteLength(input, "utf8"));
  });

  it("routes bash tools to shell handler", () => {
    expect(getHandler("mcp__bash__execute", "output")).toBe(shellHandler);
  });

  it("routes shell tools to shell handler", () => {
    expect(getHandler("mcp__shell__run", "output")).toBe(shellHandler);
  });

  it("routes terminal tools to shell handler", () => {
    expect(getHandler("mcp__terminal__execute", "output")).toBe(shellHandler);
  });

  it("routes ssh_exec tools to shell handler", () => {
    expect(getHandler("mcp__mcp-remote-exec__ssh_exec_command", "output")).toBe(shellHandler);
  });

  it("routes exec_command tools to shell handler", () => {
    expect(getHandler("mcp__mcp-remote-exec__proxmox_container_exec_command", "output")).toBe(shellHandler);
  });

  it("routes remote_exec tools to shell handler", () => {
    expect(getHandler("mcp__remote_exec__run", "output")).toBe(shellHandler);
  });

  it("routes container_exec tools to shell handler", () => {
    expect(getHandler("mcp__docker__container_exec", "output")).toBe(shellHandler);
  });
});

// ---------------------------------------------------------------------------
// stripSshNoise
// ---------------------------------------------------------------------------

describe("stripSshNoise", () => {
  const PQ_WARNING = [
    "** WARNING: connection is not using a post-quantum key exchange algorithm.",
    "** This session may be vulnerable to \"store now, decrypt later\" attacks.",
    "** The server may need to be upgraded. See https://openssh.com/pq.html for details.",
  ].join("\n");

  it("removes post-quantum SSH warning lines", () => {
    const result = stripSshNoise(PQ_WARNING);
    expect(result).toBe("");
  });

  it("preserves real output after the warning block", () => {
    const input = `${PQ_WARNING}\nuid=0(root) gid=0(root) groups=0(root)`;
    const result = stripSshNoise(input);
    expect(result).toBe("uid=0(root) gid=0(root) groups=0(root)");
  });

  it("collapses blank lines left behind by removed noise", () => {
    const input = `${PQ_WARNING}\n\nreal output`;
    const result = stripSshNoise(input);
    expect(result).toBe("real output");
  });

  it("leaves plain output unchanged", () => {
    const input = "uid=0(root) gid=0(root)";
    expect(stripSshNoise(input)).toBe(input);
  });

  it("does not strip lines with ** that are real output", () => {
    // Lines that start with ** followed by a space are stripped; lines that
    // just contain ** or start with ** without a trailing space are kept.
    const input = "**bold text** still present";
    expect(stripSshNoise(input)).toBe(input);
  });

  it("shellHandler strips SSH noise from plain string output", () => {
    const input = `${PQ_WARNING}\nHello, world!`;
    const { summary } = shellHandler("mcp__mcp-remote-exec__ssh_exec_command", input);
    expect(summary).toContain("Hello, world!");
    expect(summary).not.toContain("post-quantum");
  });

  it("shellHandler strips SSH noise from structured stderr", () => {
    const input = JSON.stringify({
      stdout: "Hello, world!",
      stderr: PQ_WARNING,
      returncode: 0,
    });
    const { summary } = shellHandler("mcp__mcp-remote-exec__ssh_exec_command", input);
    // SSH noise in stderr should be stripped — no stderr section should appear
    expect(summary).not.toContain("stderr:");
    expect(summary).not.toContain("post-quantum");
    expect(summary).toContain("Hello, world!");
  });
});

// ---------------------------------------------------------------------------
// getBashHandler dispatcher
// ---------------------------------------------------------------------------

describe("getBashHandler", () => {
  it("routes Bash tool to shell handler when no command", () => {
    expect(getHandler("Bash", "output", undefined)).toBe(getBashHandler(undefined));
  });

  it("routes git diff to gitDiffHandler", () => {
    expect(getBashHandler({ command: "git diff HEAD" })).toBe(gitDiffHandler);
  });

  it("routes git show to gitDiffHandler", () => {
    expect(getBashHandler({ command: "git show abc123" })).toBe(gitDiffHandler);
  });

  it("routes git log to gitLogHandler", () => {
    expect(getBashHandler({ command: "git log --oneline -10" })).toBe(gitLogHandler);
  });

  it("routes terraform plan to terraformPlanHandler", () => {
    expect(getBashHandler({ command: "terraform plan -out=tfplan" })).toBe(terraformPlanHandler);
  });

  it("routes unrecognised commands to shellHandler", () => {
    expect(getBashHandler({ command: "npm test" })).toBe(shellHandler);
  });

  it("getHandler routes Bash tool name to bash dispatcher", () => {
    const handler = getHandler("Bash", "output", { command: "git diff HEAD" });
    expect(handler).toBe(gitDiffHandler);
  });
});

// ---------------------------------------------------------------------------
// gitDiffHandler
// ---------------------------------------------------------------------------

const SAMPLE_DIFF = `diff --git a/src/foo.ts b/src/foo.ts
index abc123..def456 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -10,7 +10,7 @@ function doThing() {
 context line
-old line
+new line
 context line
@@ -50,3 +50,5 @@
 more context
+added line 1
+added line 2
diff --git a/src/bar.ts b/src/bar.ts
index 111111..222222 100644
--- a/src/bar.ts
+++ b/src/bar.ts
@@ -1,3 +1,2 @@
 keep
-remove this
`;

describe("gitDiffHandler", () => {
  it("shows file count and line stats in header", () => {
    const { summary } = gitDiffHandler("Bash", { stdout: SAMPLE_DIFF, stderr: "", exit_code: 0 });
    expect(summary).toContain("2 files changed");
    expect(summary).toContain("+3");
    expect(summary).toContain("-2");
  });

  it("lists each changed file with per-file stats", () => {
    const { summary } = gitDiffHandler("Bash", { stdout: SAMPLE_DIFF, stderr: "", exit_code: 0 });
    expect(summary).toContain("src/foo.ts");
    expect(summary).toContain("src/bar.ts");
  });

  it("shows hunk count per file", () => {
    const { summary } = gitDiffHandler("Bash", { stdout: SAMPLE_DIFF, stderr: "", exit_code: 0 });
    expect(summary).toContain("2 hunks");
    expect(summary).toContain("1 hunk");
  });

  it("returns no-changes message for empty diff", () => {
    const { summary } = gitDiffHandler("Bash", { stdout: "", stderr: "", exit_code: 0 });
    expect(summary).toContain("no changes");
  });

  it("reports originalSize correctly", () => {
    const output = { stdout: SAMPLE_DIFF, stderr: "", exit_code: 0 };
    const { originalSize } = gitDiffHandler("Bash", output);
    expect(originalSize).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// gitLogHandler
// ---------------------------------------------------------------------------

const ONELINE_LOG = `abc1234 Fix authentication bug in login flow
def5678 Add new user profile feature
7890abc Update dependencies to latest versions
`;

const FULL_LOG = `commit abc1234567890abcdef
Author: Jane Dev <jane@example.com>
Date:   Sun Mar 2 10:00:00 2026 -0800

    Fix authentication bug in login flow

    More details about the fix.

commit def5678901234abcde
Author: John Dev <john@example.com>
Date:   Sat Mar 1 09:00:00 2026 -0800

    Add new user profile feature
`;

describe("gitLogHandler", () => {
  it("handles --oneline format with commit count header", () => {
    const { summary } = gitLogHandler("Bash", { stdout: ONELINE_LOG, stderr: "", exit_code: 0 });
    expect(summary).toContain("3 commits");
    expect(summary).toContain("Fix authentication bug");
  });

  it("handles full format and extracts subject lines", () => {
    const { summary } = gitLogHandler("Bash", { stdout: FULL_LOG, stderr: "", exit_code: 0 });
    expect(summary).toContain("2 commits");
    expect(summary).toContain("Fix authentication bug in login flow");
    expect(summary).toContain("Add new user profile feature");
  });

  it("truncates at 20 commits with overflow count", () => {
    const manyCommits = Array.from({ length: 25 }, (_, i) => `abc${String(i).padStart(4, "0")} commit ${i}`).join("\n");
    const { summary } = gitLogHandler("Bash", { stdout: manyCommits, stderr: "", exit_code: 0 });
    expect(summary).toContain("+5 more commits");
  });

  it("returns no-commits message for empty log", () => {
    const { summary } = gitLogHandler("Bash", { stdout: "", stderr: "", exit_code: 0 });
    expect(summary).toContain("no commits");
  });
});

// ---------------------------------------------------------------------------
// terraformPlanHandler
// ---------------------------------------------------------------------------

const SAMPLE_PLAN = `
Terraform used the selected providers to generate the following execution
plan. Resource actions are indicated with the following symbols:
  + create
  ~ update in-place
  - destroy

Terraform will perform the following actions:

  # aws_instance.web will be created
  + resource "aws_instance" "web" {
      + ami = "ami-12345678"
    }

  # aws_security_group.main will be updated in-place
  ~ resource "aws_security_group" "main" {
      ~ ingress = []
    }

  # aws_s3_bucket.old will be destroyed
  - resource "aws_s3_bucket" "old" {}

Plan: 2 to add, 1 to change, 1 to destroy.
`;

describe("terraformPlanHandler", () => {
  it("includes the Plan: summary line", () => {
    const { summary } = terraformPlanHandler("Bash", { stdout: SAMPLE_PLAN, stderr: "", exit_code: 0 });
    expect(summary).toContain("Plan: 2 to add, 1 to change, 1 to destroy");
  });

  it("lists each resource with action symbol", () => {
    const { summary } = terraformPlanHandler("Bash", { stdout: SAMPLE_PLAN, stderr: "", exit_code: 0 });
    expect(summary).toContain("+ aws_instance.web");
    expect(summary).toContain("~ aws_security_group.main");
    expect(summary).toContain("- aws_s3_bucket.old");
  });

  it("falls back to shell handler for non-plan output", () => {
    const plainOutput = { stdout: "Initializing the backend...\nSuccess!", stderr: "", exit_code: 0 };
    const { summary } = terraformPlanHandler("Bash", plainOutput);
    // Falls back to shellHandler — no terraform-specific content, just plain output
    expect(summary).toContain("lines");
  });
});

// ---------------------------------------------------------------------------
// tavilyHandler
// ---------------------------------------------------------------------------

const TAVILY_SEARCH = JSON.stringify({
  query: "bun runtime benchmarks",
  answer: "Bun is a fast all-in-one JavaScript runtime. Benchmarks show it is 3x faster than Node.js for many workloads.",
  results: [
    {
      title: "Bun vs Node.js Performance",
      url: "https://example.com/bun-benchmarks",
      content: "Bun achieves significant speed improvements over Node.js in HTTP throughput and startup time.",
      raw_content: "FULL PAGE CONTENT ".repeat(500),
      score: 0.98,
    },
    {
      title: "Runtime Comparison 2026",
      url: "https://example.com/comparison",
      content: "Comparing Bun, Deno, and Node.js across a variety of workloads including I/O and CPU tasks.",
      raw_content: "FULL PAGE CONTENT ".repeat(500),
      score: 0.91,
    },
  ],
  response_time: 1.23,
});

describe("tavilyHandler", () => {
  it("includes the query in the summary", () => {
    const { summary } = tavilyHandler("mcp__tavily__tavily_search", TAVILY_SEARCH);
    expect(summary).toContain("bun runtime benchmarks");
  });

  it("includes the synthesized answer in full", () => {
    const { summary } = tavilyHandler("mcp__tavily__tavily_search", TAVILY_SEARCH);
    expect(summary).toContain("3x faster than Node.js");
  });

  it("includes result titles and URLs", () => {
    const { summary } = tavilyHandler("mcp__tavily__tavily_search", TAVILY_SEARCH);
    expect(summary).toContain("Bun vs Node.js Performance");
    expect(summary).toContain("https://example.com/bun-benchmarks");
  });

  it("includes a content snippet for each result", () => {
    const { summary } = tavilyHandler("mcp__tavily__tavily_search", TAVILY_SEARCH);
    expect(summary).toContain("significant speed improvements");
  });

  it("drops raw_content and score — summary is much smaller than original", () => {
    const { summary, originalSize } = tavilyHandler("mcp__tavily__tavily_search", TAVILY_SEARCH);
    expect(Buffer.byteLength(summary, "utf8")).toBeLessThan(originalSize * 0.1);
  });

  it("truncates content snippets at 150 characters", () => {
    const longContent = "x".repeat(300);
    const input = JSON.stringify({
      query: "test",
      results: [{ title: "T", url: "https://example.com", content: longContent, raw_content: "", score: 1 }],
    });
    const { summary } = tavilyHandler("mcp__tavily__tavily_search", input);
    expect(summary).toContain("…");
  });

  it("caps results at 10 with overflow count", () => {
    const manyResults = Array.from({ length: 15 }, (_, i) => ({
      title: `Result ${i}`,
      url: `https://example.com/${i}`,
      content: `Content for result ${i}`,
      raw_content: "",
      score: 0.9,
    }));
    const input = JSON.stringify({ query: "test", results: manyResults });
    const { summary } = tavilyHandler("mcp__tavily__tavily_search", input);
    expect(summary).toContain("5 more");
    expect(summary).not.toContain("Result 14");
  });

  it("works without an answer field", () => {
    const input = JSON.stringify({
      query: "no answer",
      results: [{ title: "T", url: "https://example.com", content: "some content", raw_content: "", score: 1 }],
    });
    const { summary } = tavilyHandler("mcp__tavily__tavily_search", input);
    expect(summary).toContain("no answer");
    expect(summary).toContain("some content");
  });

  it("falls back gracefully for non-JSON output", () => {
    const { summary } = tavilyHandler("mcp__tavily__tavily_search", "plain text response");
    expect(summary).toContain("plain text response");
  });

  it("reports originalSize in bytes", () => {
    const { originalSize } = tavilyHandler("mcp__tavily__tavily_search", TAVILY_SEARCH);
    expect(originalSize).toBe(Buffer.byteLength(TAVILY_SEARCH, "utf8"));
  });

  it("routes tavily tools to tavily handler", () => {
    expect(getHandler("mcp__tavily__tavily_search", "{}")).toBe(tavilyHandler);
    expect(getHandler("mcp__tavily__tavily_research", "{}")).toBe(tavilyHandler);
    expect(getHandler("mcp__tavily__tavily_extract", "{}")).toBe(tavilyHandler);
  });
});
