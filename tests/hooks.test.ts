import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { handleSessionStart } from "../src/hooks/session-start";
import { handlePostToolUse } from "../src/hooks/post-tool-use";
import { getDb, closeDb, listOutputs, getSessionDays, retrieveOutput, storeOutput, pinOutput, getMeta } from "../src/db/index";
import { resetConfig } from "../src/config";
import { getProjectKey, getProjectPath } from "../src/project-key";

const TEST_CWD = process.cwd();
const SESSION_ID = "test-session-abc123";

function makeSessionStartInput(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    session_id: SESSION_ID,
    cwd: TEST_CWD,
    hook_event_name: "SessionStart",
    transcript_path: "/tmp/test",
    permission_mode: "default",
    ...overrides,
  });
}

function makePostToolUseInput(
  toolName: string,
  toolResponse: unknown,
  overrides: Record<string, unknown> = {}
): string {
  return JSON.stringify({
    session_id: SESSION_ID,
    cwd: TEST_CWD,
    hook_event_name: "PostToolUse",
    tool_name: toolName,
    tool_input: {},
    tool_response: toolResponse,
    tool_use_id: "toolu_test123",
    transcript_path: "/tmp/test",
    permission_mode: "default",
    ...overrides,
  });
}

// Large enough to compress meaningfully
const LARGE_GITHUB_RESPONSE = JSON.stringify(
  Array.from({ length: 5 }, (_, i) => ({
    number: i + 1,
    title: `Issue number ${i + 1} with a descriptive title`,
    state: "open",
    html_url: `https://github.com/org/repo/issues/${i + 1}`,
    labels: [{ name: "bug" }],
    body: "x".repeat(300),
  }))
);

describe("handleSessionStart", () => {
  beforeEach(() => {
    process.env.RECALL_DB_PATH = ":memory:";
  });

  afterEach(() => {
    closeDb();
    resetConfig();
    delete process.env.RECALL_DB_PATH;
  });

  it("records today's date in the sessions table", () => {
    handleSessionStart(makeSessionStartInput());
    const db = getDb(":memory:");
    const days = getSessionDays(db);
    const today = new Date().toISOString().slice(0, 10);
    expect(days).toContain(today);
  });

  it("records project_path when the resolved path exists", () => {
    handleSessionStart(makeSessionStartInput());
    expect(getMeta(getDb(":memory:"), "project_path")).toBe(getProjectPath(TEST_CWD));
  });

  // The recorded path is absolute by construction (#213), but absolute is not true:
  // a relative payload cwd gets rooted against this process's cwd. Recording a path
  // that doesn't exist would let gc read "path gone, parent present" as orphaned and
  // delete a live project's database. Pathless is kept as legacy-fresh instead.
  it("does not record project_path when the resolved path does not exist", () => {
    handleSessionStart(makeSessionStartInput({ cwd: "definitely-not-a-real-dir-xyz" }));
    const recorded = getMeta(getDb(":memory:"), "project_path");
    expect(recorded).toBeNull();
  });

  // A project path is a directory. An existing *file* would satisfy existsSync and
  // then be classified "active" by gc, which is wrong about what it is.
  it("does not record project_path when the resolved path is a file", () => {
    const dir = mkdtempSync(join(tmpdir(), "recall-file-"));
    try {
      const f = join(dir, "not-a-dir");
      writeFileSync(f, "x");
      handleSessionStart(makeSessionStartInput({ cwd: f }));
      expect(getMeta(getDb(":memory:"), "project_path")).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // setMeta upserts, so skipping leaves a previously-verified path in place rather
  // than clearing it — better evidence than a guess that just failed.
  it("keeps an already-recorded path when a later session cannot verify one", () => {
    handleSessionStart(makeSessionStartInput());
    const first = getMeta(getDb(":memory:"), "project_path");
    expect(first).toBe(getProjectPath(TEST_CWD));

    handleSessionStart(makeSessionStartInput({ cwd: "definitely-not-a-real-dir-xyz" }));
    expect(getMeta(getDb(":memory:"), "project_path")).toBe(first);
  });

  it("is idempotent — running twice records only one session entry", () => {
    handleSessionStart(makeSessionStartInput());
    handleSessionStart(makeSessionStartInput());
    const db = getDb(":memory:");
    const days = getSessionDays(db);
    const today = new Date().toISOString().slice(0, 10);
    expect(days.filter((d) => d === today).length).toBe(1);
  });

  it("does not throw on valid input", () => {
    expect(() => handleSessionStart(makeSessionStartInput())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// handleSessionStart — context snapshot injection
// ---------------------------------------------------------------------------

describe("handleSessionStart — context injection", () => {
  beforeEach(() => {
    process.env.RECALL_DB_PATH = ":memory:";
  });

  afterEach(() => {
    closeDb();
    resetConfig();
    delete process.env.RECALL_DB_PATH;
  });

  it("writes nothing to stdout when the store is empty", () => {
    const spy = spyOn(process.stdout, "write");
    handleSessionStart(makeSessionStartInput());
    const callCount = spy.mock.calls.length;
    spy.mockRestore();
    expect(callCount).toBe(0);
  });

  it("writes context snapshot to stdout when store has a pinned item", () => {
    const db = getDb(":memory:");
    const projectKey = getProjectKey(TEST_CWD);
    const stored = storeOutput(db, {
      project_key: projectKey,
      session_id: "sess-inject-001",
      tool_name: "mcp__github__list_issues",
      summary: "pinned item summary for injection test",
      full_content: "full content here",
      original_size: 100,
    });
    pinOutput(db, stored.id, projectKey, true);

    const spy = spyOn(process.stdout, "write");
    handleSessionStart(makeSessionStartInput());
    const output = spy.mock.calls.map(([chunk]) => String(chunk)).join("");
    spy.mockRestore();

    expect(output).toContain("pinned item summary for injection test");
  });

  it("truncates snapshot at 2000 characters when context is large", () => {
    const db = getDb(":memory:");
    const projectKey = getProjectKey(TEST_CWD);
    // Store enough pinned items to push the formatted snapshot past 2000 chars.
    // toolContext formats each item as ~200 chars; 15 items ≈ 3000 chars.
    for (let i = 0; i < 15; i++) {
      const stored = storeOutput(db, {
        project_key: projectKey,
        session_id: "sess-inject-002",
        tool_name: "mcp__github__list_issues",
        summary: `pinned item ${i} — ${"x".repeat(80)}`,
        full_content: "full",
        original_size: 100,
      });
      pinOutput(db, stored.id, projectKey, true);
    }

    const spy = spyOn(process.stdout, "write");
    handleSessionStart(makeSessionStartInput());
    const output = spy.mock.calls.map(([chunk]) => String(chunk)).join("");
    spy.mockRestore();

    // 2000-char cap + truncation suffix + trailing newline
    expect(output.length).toBeLessThan(2100);
    expect(output).toContain("truncated");
  });

  it("does not inject when the only db content is from an unknown project", () => {
    // Store data under a different project key — should not appear in injection
    const db = getDb(":memory:");
    storeOutput(db, {
      project_key: "completely-different-project-key",
      session_id: "sess-other",
      tool_name: "mcp__github__list_issues",
      summary: "should not appear",
      full_content: "full",
      original_size: 100,
    });

    const spy = spyOn(process.stdout, "write");
    handleSessionStart(makeSessionStartInput());
    const callCount = spy.mock.calls.length;
    spy.mockRestore();

    expect(callCount).toBe(0);
  });
});

describe("handlePostToolUse", () => {
  beforeEach(() => {
    process.env.RECALL_DB_PATH = ":memory:";
  });

  afterEach(() => {
    closeDb();
    resetConfig();
    delete process.env.RECALL_DB_PATH;
  });

  it("returns empty object for denied tools (recall tools)", () => {
    const result = handlePostToolUse(
      makePostToolUseInput("mcp__recall__search", { content: [{ type: "text", text: "x" }] })
    );
    expect(result).toEqual({});
  });

  it("returns empty object for denied tools (1password)", () => {
    const result = handlePostToolUse(
      makePostToolUseInput("mcp__1password__item_lookup", { content: [{ type: "text", text: "secret=abc" }] })
    );
    expect(result).toEqual({});
  });

  it("returns empty object and logs when content contains a secret", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIE...";
    const result = handlePostToolUse(
      makePostToolUseInput("mcp__github__get_file_contents", {
        content: [{ type: "text", text: pem }],
      })
    );
    expect(result).toEqual({});
  });

  it("returns empty object when output is too small to compress", () => {
    const result = handlePostToolUse(
      makePostToolUseInput("mcp__github__list_issues", {
        content: [{ type: "text", text: "tiny" }],
      })
    );
    expect(result).toEqual({});
  });

  it("compresses large output and returns updatedMCPToolOutput", () => {
    const result = handlePostToolUse(
      makePostToolUseInput("mcp__github__list_issues", {
        content: [{ type: "text", text: LARGE_GITHUB_RESPONSE }],
      })
    );
    expect(result.updatedMCPToolOutput).toBeDefined();
    expect(result.suppressOutput).toBe(true);
  });

  // Claude Code reads hookSpecificOutput.updatedToolOutput; the top-level field
  // alone was ignored, so no compressed output ever reached context (#298).
  it("returns the replacement in hookSpecificOutput.updatedToolOutput, stored and cached", () => {
    const input = makePostToolUseInput("mcp__github__list_issues", {
      content: [{ type: "text", text: LARGE_GITHUB_RESPONSE }],
    }, { tool_input: { owner: "org", repo: "repo" } });

    for (const result of [handlePostToolUse(input), handlePostToolUse(input)]) {
      expect(result.hookSpecificOutput?.hookEventName).toBe("PostToolUse");
      expect(result.hookSpecificOutput?.updatedToolOutput).toMatch(/^\[recall:recall_[0-9a-f]{16}/);
      expect(result.hookSpecificOutput?.updatedToolOutput).toBe(result.updatedMCPToolOutput!);
    }
  });

  // Claude Code validates a built-in tool's replacement against that tool's
  // output shape and silently delivers the original on a mismatch, so a string
  // replacement never reached context for Bash.
  const bashResponse = {
    stdout: Array.from({ length: 600 }, (_, i) => `probe line ${i + 1}`).join("\n"),
    stderr: "warning: probe",
    interrupted: false,
    isImage: false,
    noOutputExpected: false,
  };
  for (const [label, response] of [["object", bashResponse], ["JSON string", JSON.stringify(bashResponse)]] as const) {
    it(`returns Bash's own output shape with stdout replaced, stored and cached (${label})`, () => {
      const input = makePostToolUseInput("Bash", response, { tool_input: { command: `seq 600 # ${label}` } });

      for (const result of [handlePostToolUse(input), handlePostToolUse(input)]) {
        const replaced = result.hookSpecificOutput?.updatedToolOutput as Record<string, unknown>;
        expect(typeof replaced).toBe("object");
        expect(Object.keys(replaced).sort()).toEqual(Object.keys(bashResponse).sort());
        expect(replaced.stdout).toMatch(/^\[recall:recall_[0-9a-f]{16}/);
        expect(replaced.stdout).toBe(result.updatedMCPToolOutput!);
        expect(replaced.stderr).toBe("");
        expect(replaced.interrupted).toBe(false);
      }
    });
  }

  it("updatedMCPToolOutput contains recall ID header", () => {
    const result = handlePostToolUse(
      makePostToolUseInput("mcp__github__list_issues", {
        content: [{ type: "text", text: LARGE_GITHUB_RESPONSE }],
      })
    );
    expect(result.updatedMCPToolOutput).toMatch(/^\[recall:recall_[0-9a-f]{16}/);
  });

  it("updatedMCPToolOutput contains size and reduction info", () => {
    const result = handlePostToolUse(
      makePostToolUseInput("mcp__github__list_issues", {
        content: [{ type: "text", text: LARGE_GITHUB_RESPONSE }],
      })
    );
    expect(result.updatedMCPToolOutput).toContain("% reduction");
    expect(result.updatedMCPToolOutput).toMatch(/→\d+(\.\d+)?(B|KB|MB)/);
  });

  it("updatedMCPToolOutput includes retrieval hints", () => {
    const result = handlePostToolUse(
      makePostToolUseInput("mcp__github__list_issues", {
        content: [{ type: "text", text: LARGE_GITHUB_RESPONSE }],
      })
    );
    expect(result.updatedMCPToolOutput).toMatch(/· search: "[^"]+"/);
  });

  it("omits the search hints when no salient terms can be extracted", () => {
    // Content of only stopwords -> no extractable hints, but still compresses.
    const result = handlePostToolUse(
      makePostToolUseInput("mcp__notes__dump", {
        content: [{ type: "text", text: "the\n".repeat(4000) }],
      })
    );
    expect(result.updatedMCPToolOutput).toBeDefined();
    expect(result.updatedMCPToolOutput).not.toContain("search:");
  });

  it("stores the output in the DB", () => {
    handlePostToolUse(
      makePostToolUseInput("mcp__github__list_issues", {
        content: [{ type: "text", text: LARGE_GITHUB_RESPONSE }],
      })
    );
    const db = getDb(":memory:");
    const items = db.prepare("SELECT COUNT(*) as n FROM stored_outputs").get() as { n: number };
    expect(items.n).toBeGreaterThan(0);
  });

  it("stored output preserves session_id from hook input", () => {
    handlePostToolUse(
      makePostToolUseInput("mcp__github__list_issues", {
        content: [{ type: "text", text: LARGE_GITHUB_RESPONSE }],
      })
    );
    const db = getDb(":memory:");
    const allItems = db.prepare("SELECT * FROM stored_outputs").all() as Array<{ session_id: string }>;
    expect(allItems[0]!.session_id).toBe(SESSION_ID);
  });

  it("stored full_content is the extracted text, not raw MCP wrapper", () => {
    handlePostToolUse(
      makePostToolUseInput("mcp__github__list_issues", {
        content: [{ type: "text", text: LARGE_GITHUB_RESPONSE }],
      })
    );
    const db = getDb(":memory:");
    const items = db.prepare("SELECT * FROM stored_outputs").all() as Array<{ id: string }>;
    const item = retrieveOutput(db, items[0]!.id)!;
    // full_content should be the raw JSON text, not the MCP { content: [...] } wrapper
    expect(item.full_content).toContain('"number"');
    expect(item.full_content).not.toContain('"content":[{');
  });

  // -------------------------------------------------------------------------
  // command fingerprint (#251)
  // -------------------------------------------------------------------------

  it("derives and stores a command_fp for a Bash call", () => {
    const bigDiff = "diff --git a/f b/f\n" + "+added line\n".repeat(400);
    handlePostToolUse(
      makePostToolUseInput(
        "Bash",
        JSON.stringify({ stdout: bigDiff, stderr: "", exit_code: 0 }),
        { tool_input: { command: "git --no-pager diff HEAD~1" } }
      )
    );
    const db = getDb(":memory:");
    const row = db
      .prepare("SELECT tool_name, command_fp FROM stored_outputs ORDER BY created_at DESC LIMIT 1")
      .get() as { tool_name: string; command_fp: string | null };
    // normalizeCommand strips --no-pager; fingerprint is the git subcommand, no args.
    expect(row.tool_name).toBe("Bash");
    expect(row.command_fp).toBe("git diff");
  });

  // -------------------------------------------------------------------------
  // Dedup
  // -------------------------------------------------------------------------

  it("returns cached response on second call with same tool_input", () => {
    const input = makePostToolUseInput("mcp__github__list_issues", {
      content: [{ type: "text", text: LARGE_GITHUB_RESPONSE }],
    }, { tool_input: { owner: "org", repo: "repo" } });

    handlePostToolUse(input); // first call — stores item
    const second = handlePostToolUse(input); // second call — cache hit

    expect(second.updatedMCPToolOutput).toMatch(/· cached · \d{4}-\d{2}-\d{2}/);
    expect(second.suppressOutput).toBe(true);
  });

  it("cached header contains the original recall id", () => {
    const input = makePostToolUseInput("mcp__github__list_issues", {
      content: [{ type: "text", text: LARGE_GITHUB_RESPONSE }],
    }, { tool_input: { owner: "org", repo: "repo" } });

    const first = handlePostToolUse(input);
    const idMatch = first.updatedMCPToolOutput!.match(/\[recall:(recall_[0-9a-f]{16})/);
    const originalId = idMatch![1];

    const second = handlePostToolUse(input);
    expect(second.updatedMCPToolOutput).toContain(originalId);
  });

  it("does not store a second item on cache hit", () => {
    const input = makePostToolUseInput("mcp__github__list_issues", {
      content: [{ type: "text", text: LARGE_GITHUB_RESPONSE }],
    }, { tool_input: { owner: "org", repo: "repo" } });

    handlePostToolUse(input);
    handlePostToolUse(input);

    const db = getDb(":memory:");
    const count = (db.prepare("SELECT COUNT(*) as n FROM stored_outputs").get() as { n: number }).n;
    expect(count).toBe(1);
  });

  it("dedups on identical output content even when tool_input differs", () => {
    const response = { content: [{ type: "text", text: LARGE_GITHUB_RESPONSE }] };
    // Same output, DIFFERENT input → input-hash misses, content-hash catches it.
    const first = handlePostToolUse(
      makePostToolUseInput("mcp__github__list_issues", response, { tool_input: { page: 1 } })
    );
    expect(first.updatedMCPToolOutput).toBeDefined();
    const second = handlePostToolUse(
      makePostToolUseInput("mcp__github__list_issues", response, { tool_input: { page: 2 } })
    );

    expect(second.updatedMCPToolOutput).toMatch(/· cached · /);
    const db = getDb(":memory:");
    const count = (db.prepare("SELECT COUNT(*) as n FROM stored_outputs").get() as { n: number }).n;
    expect(count).toBe(1); // second call reused the first item
  });

  // -------------------------------------------------------------------------
  // Eviction
  // -------------------------------------------------------------------------

  it("evicts non-pinned items after storing when store exceeds max_size_mb", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "recall-hooks-test-"));
    const configPath = join(tempDir, "config.toml");
    // ~3KB limit: allows the new item (~2.25KB) but not the pre-inserted + new item together
    writeFileSync(configPath, "[store]\nmax_size_mb = 0.003\n");
    process.env.RECALL_CONFIG_PATH = configPath;
    resetConfig();

    try {
      const db = getDb(":memory:");
      const projectKey = getProjectKey(TEST_CWD);
      const oldTs = Math.floor(Date.now() / 1000) - 60;
      db.prepare(`
        INSERT INTO stored_outputs
          (id, project_key, session_id, tool_name, summary, full_content, original_size, summary_size, created_at)
        VALUES ('recall_evict0001', ?, 'session', 'mcp__old__tool', 'old', 'old content', 2000, 3, ?)
      `).run(projectKey, oldTs);

      handlePostToolUse(
        makePostToolUseInput("mcp__github__list_issues", {
          content: [{ type: "text", text: LARGE_GITHUB_RESPONSE }],
        })
      );

      // Pre-inserted item (older, lower access_count) should have been evicted
      expect(db.prepare("SELECT id FROM stored_outputs WHERE id = 'recall_evict0001'").get()).toBeNull();
    } finally {
      delete process.env.RECALL_CONFIG_PATH;
      resetConfig();
      rmSync(tempDir, { recursive: true });
    }
  });
});

// ---------------------------------------------------------------------------
// handlePostToolUse — malformed input
// ---------------------------------------------------------------------------

describe("handlePostToolUse — malformed input", () => {
  beforeEach(() => {
    process.env.RECALL_DB_PATH = ":memory:";
  });

  afterEach(() => {
    closeDb();
    resetConfig();
    delete process.env.RECALL_DB_PATH;
  });

  it("returns empty object on empty string input", () => {
    const result = handlePostToolUse("");
    expect(result).toEqual({});
  });

  it("returns empty object on plain text input", () => {
    const result = handlePostToolUse("not json at all");
    expect(result).toEqual({});
  });

  it("returns empty object on truncated JSON", () => {
    const result = handlePostToolUse('{"session_id":"x","cwd":"/tmp"');
    expect(result).toEqual({});
  });

  it("returns empty object on JSON array instead of object", () => {
    const result = handlePostToolUse("[]");
    expect(result).toEqual({});
  });

  it("returns empty object on JSON primitive instead of object", () => {
    const result = handlePostToolUse('"just a string"');
    expect(result).toEqual({});
  });

  it("logs invalid JSON error to stderr", () => {
    const spy = spyOn(process.stderr, "write");
    handlePostToolUse("bad input");
    const output = spy.mock.calls.map(([c]) => String(c)).join("");
    spy.mockRestore();
    expect(output).toContain("invalid JSON");
  });

  it("logs shape error to stderr on JSON array", () => {
    const spy = spyOn(process.stderr, "write");
    handlePostToolUse("[]");
    const output = spy.mock.calls.map(([c]) => String(c)).join("");
    spy.mockRestore();
    expect(output).toContain("unexpected input shape");
  });
});

// ---------------------------------------------------------------------------
// handleSessionStart — malformed input
// ---------------------------------------------------------------------------

describe("handleSessionStart — malformed input", () => {
  beforeEach(() => {
    process.env.RECALL_DB_PATH = ":memory:";
  });

  afterEach(() => {
    closeDb();
    resetConfig();
    delete process.env.RECALL_DB_PATH;
  });

  it("does not throw on empty string input", () => {
    expect(() => handleSessionStart("")).not.toThrow();
  });

  it("does not throw on plain text input", () => {
    expect(() => handleSessionStart("not json")).not.toThrow();
  });

  it("does not throw on truncated JSON", () => {
    expect(() => handleSessionStart('{"session_id":"x"')).not.toThrow();
  });

  it("does not throw on JSON array instead of object", () => {
    expect(() => handleSessionStart("[]")).not.toThrow();
  });

  it("logs invalid JSON error to stderr", () => {
    const spy = spyOn(process.stderr, "write");
    handleSessionStart("bad input");
    const output = spy.mock.calls.map(([c]) => String(c)).join("");
    spy.mockRestore();
    expect(output).toContain("invalid JSON");
  });

  it("logs shape error to stderr on JSON array", () => {
    const spy = spyOn(process.stderr, "write");
    handleSessionStart("[]");
    const output = spy.mock.calls.map(([c]) => String(c)).join("");
    spy.mockRestore();
    expect(output).toContain("unexpected input shape");
  });
});

// ---------------------------------------------------------------------------
// handlePostToolUse — debug output
// ---------------------------------------------------------------------------

function captureStderr(fn: () => void): string {
  const spy = spyOn(process.stderr, "write");
  fn();
  const output = spy.mock.calls.map(([c]) => String(c)).join("");
  spy.mockRestore();
  return output;
}

describe("handlePostToolUse — debug output", () => {
  beforeEach(() => {
    process.env.RECALL_DEBUG = "1";
    process.env.RECALL_DB_PATH = ":memory:";
  });

  afterEach(() => {
    closeDb();
    resetConfig();
    delete process.env.RECALL_DEBUG;
    delete process.env.RECALL_DB_PATH;
  });

  it("logs SKIP denylist for denied tools", () => {
    const output = captureStderr(() =>
      handlePostToolUse(
        makePostToolUseInput("mcp__1password__item_lookup", { content: [{ type: "text", text: "x" }] })
      )
    );
    expect(output).toContain("SKIP denylist");
    expect(output).toContain("mcp__1password__item_lookup");
  });

  it("logs SKIP no-compression when output is too small to compress", () => {
    const output = captureStderr(() =>
      handlePostToolUse(
        makePostToolUseInput("mcp__github__list_issues", { content: [{ type: "text", text: "tiny" }] })
      )
    );
    expect(output).toContain("SKIP no-compression");
  });

  it("logs CACHE HIT on second call with same tool_input", () => {
    const input = makePostToolUseInput(
      "mcp__github__list_issues",
      { content: [{ type: "text", text: LARGE_GITHUB_RESPONSE }] },
      { tool_input: { owner: "org", repo: "repo" } }
    );
    handlePostToolUse(input);
    const output = captureStderr(() => handlePostToolUse(input));
    expect(output).toContain("CACHE HIT");
    expect(output).toContain("mcp__github__list_issues");
  });

  it("logs STORED with id and reduction on successful compression", () => {
    const output = captureStderr(() =>
      handlePostToolUse(
        makePostToolUseInput("mcp__github__list_issues", {
          content: [{ type: "text", text: LARGE_GITHUB_RESPONSE }],
        })
      )
    );
    expect(output).toContain("STORED");
    expect(output).toContain("reduction");
  });

  it("logs handler name on successful compression", () => {
    const output = captureStderr(() =>
      handlePostToolUse(
        makePostToolUseInput("mcp__github__list_issues", {
          content: [{ type: "text", text: LARGE_GITHUB_RESPONSE }],
        })
      )
    );
    expect(output).toContain("handler:");
    expect(output).toContain("githubHandler");
  });

  it("logs intercepted size after extractText", () => {
    const output = captureStderr(() =>
      handlePostToolUse(
        makePostToolUseInput("mcp__github__list_issues", {
          content: [{ type: "text", text: LARGE_GITHUB_RESPONSE }],
        })
      )
    );
    expect(output).toContain("intercepted mcp__github__list_issues");
  });
});

// ---------------------------------------------------------------------------
// handlePostToolUse — incompressible image content blocks (#270)
// ---------------------------------------------------------------------------

/** JPEG SOI + APP2/ICC-shaped bytes, ≥30 KB. jsonHandler would keep this string. */
function jpegShapedBase64(byteLength: number): string {
  const raw = Buffer.alloc(byteLength);
  raw[0] = 0xff;
  raw[1] = 0xd8;
  raw[2] = 0xff;
  raw[3] = 0xe2;
  Buffer.from("ICC_PROFILE").copy(raw, 4);
  for (let i = 16; i < byteLength; i++) raw[i] = (i * 17 + 31) & 0xff;
  return raw.toString("base64");
}

function chromeScreenshotPayload(): Array<Record<string, unknown>> {
  return [
    {
      type: "text",
      text: "Successfully captured screenshot (1419x840, jpeg) - ID: ss_135241jnk",
    },
    {
      type: "text",
      text: "\n\nTab Context:\n- https://example.com/dashboard\n- Title: Dashboard",
    },
    { type: "image", mimeType: "image/jpeg", data: jpegShapedBase64(32 * 1024) },
  ];
}

function chromeTextOnlyPayload(): Array<Record<string, unknown>> {
  return [
    { type: "text", text: "Scrolled down 400 pixels" },
    { type: "text", text: "\n\nTab Context:\n- https://example.com/page\n- Title: Page" },
  ];
}

describe("handlePostToolUse — image content blocks (#270)", () => {
  beforeEach(() => {
    process.env.RECALL_DB_PATH = ":memory:";
  });

  afterEach(() => {
    closeDb();
    resetConfig();
    delete process.env.RECALL_DB_PATH;
  });

  it("replaces a screenshot payload with a >90% smaller summary containing capture metadata", () => {
    const payload = chromeScreenshotPayload();
    const imageData = (payload.find((b) => b["type"] === "image") as { data: string }).data;
    const result = handlePostToolUse(
      makePostToolUseInput("mcp__claude-in-chrome__computer", payload)
    );
    expect(result.updatedMCPToolOutput).toBeDefined();
    expect(result.suppressOutput).toBe(true);
    const body = result.updatedMCPToolOutput!;
    expect(body).toContain("ss_135241jnk");
    expect(body).toContain("1419x840");
    expect(body).toContain("jpeg");
    expect(body).toContain("Tab Context");
    expect(body).not.toContain(imageData);
    const pctMatch = body.match(/\((\d+)% reduction\)/);
    expect(pctMatch).not.toBeNull();
    expect(Number(pctMatch![1])).toBeGreaterThan(90);
  });

  it("stores stripped text in full_content, not the image payload", () => {
    const payload = chromeScreenshotPayload();
    const imageData = (payload.find((b) => b["type"] === "image") as { data: string }).data;
    handlePostToolUse(makePostToolUseInput("mcp__claude-in-chrome__computer", payload));
    const db = getDb(":memory:");
    const row = db.prepare("SELECT full_content FROM stored_outputs").get() as
      | { full_content: string }
      | undefined;
    expect(row).toBeDefined();
    expect(row!.full_content).toContain("ss_135241jnk");
    expect(row!.full_content).not.toContain(imageData);
  });

  it("does not refuse a text-only scroll/click payload and keeps its texts", () => {
    const payload = chromeTextOnlyPayload();
    const result = handlePostToolUse(
      makePostToolUseInput("mcp__claude-in-chrome__computer", payload)
    );
    // Pass-through ({}) is existing skip-if-not-smaller behavior, not a refusal.
    expect(result.updatedMCPToolOutput ?? "").not.toMatch(/secret|denied|refus/i);
    if (result.updatedMCPToolOutput) {
      expect(result.updatedMCPToolOutput).toContain("Scrolled down 400 pixels");
      expect(result.updatedMCPToolOutput).toContain("Tab Context");
    }
  });
});

// ---------------------------------------------------------------------------
// handlePostToolUse — empty summaries (#296)
// ---------------------------------------------------------------------------

/** Body after the `[recall:…]` header line: what Claude actually reads. */
const deliveredBody = (result: { updatedMCPToolOutput?: string }) =>
  (result.updatedMCPToolOutput ?? "").split("\n").slice(1).join("\n");

describe("handlePostToolUse — empty summaries (#296)", () => {
  beforeEach(() => {
    process.env.RECALL_DB_PATH = ":memory:";
  });

  afterEach(() => {
    closeDb();
    resetConfig();
    delete process.env.RECALL_DB_PATH;
  });

  it("summarizes a Sentry markdown response instead of delivering nothing", () => {
    // The claude.ai Sentry connector returns markdown in a top-level text block array.
    const markdown =
      "# Issue PROJ-4F2 in **checkout-api**\n\n**Description**: TypeError reading 'id' of undefined\n" +
      "**First Seen**: 2026-09-30T10:00:00Z\n\n## Stack\n" +
      "  at handler (src/routes/checkout.ts:88)\n".repeat(60);
    const result = handlePostToolUse(
      makePostToolUseInput("mcp__claude_ai_Sentry__get_sentry_resource", [{ type: "text", text: markdown }])
    );
    expect(deliveredBody(result)).toContain("# Issue PROJ-4F2");
  });

  it("falls back when a handler returns an empty summary for non-empty output", () => {
    // A Sentry-named tool returning an object with no Sentry event fields makes
    // sentryHandler return "". The hook must not store or deliver that.
    const unrelated = JSON.stringify({ report: "quarterly-numbers ".repeat(200) });
    const result = handlePostToolUse(
      makePostToolUseInput("mcp__sentry__get_report", { content: [{ type: "text", text: unrelated }] })
    );
    expect(deliveredBody(result).trim()).not.toBe("");
    const db = getDb(":memory:");
    const row = db.prepare("SELECT summary FROM stored_outputs").get() as { summary: string };
    expect(row.summary.trim()).not.toBe("");
  });
});

describe("handlePostToolUse — Bash envelope is not output (#306)", () => {
  const stdout = Array.from({ length: 300 }, (_, i) => `shape value ${i} from the build log`).join("\n");
  const stderr = "warning: deprecated flag";
  // Claude Code adds bashEditDiff when the command edited files: those edits,
  // not anything the command printed.
  const bashEditDiff = "diff --git a/x.ts b/x.ts\n" + "+zebrafish quokka axolotl\n".repeat(400);
  const envelope = { stdout, stderr, interrupted: false, isImage: false, noOutputExpected: false, bashEditDiff };
  const text = `${stdout}\n${stderr}`;
  let tempDir: string;

  beforeEach(() => {
    process.env.RECALL_DB_PATH = ":memory:";
    // The default "balanced" retention keeps no body for a local Bash command.
    tempDir = mkdtempSync(join(tmpdir(), "recall-hooks-306-"));
    const configPath = join(tempDir, "config.toml");
    writeFileSync(configPath, '[store]\nretention = "full"\n');
    process.env.RECALL_CONFIG_PATH = configPath;
    resetConfig();
  });

  afterEach(() => {
    closeDb();
    resetConfig();
    delete process.env.RECALL_DB_PATH;
    delete process.env.RECALL_CONFIG_PATH;
    rmSync(tempDir, { recursive: true });
  });

  const run = (shape: "object" | "JSON string") => {
    const response = shape === "object" ? envelope : JSON.stringify(envelope);
    const delivered = handlePostToolUse(
      makePostToolUseInput("Bash", response, { tool_input: { command: "cat build.log" } })
    ).updatedMCPToolOutput ?? "";
    const db = getDb(":memory:");
    const id = delivered.match(/recall_[0-9a-f]+/)?.[0] ?? "";
    return { header: delivered.split("\n")[0], row: retrieveOutput(db, id) };
  };

  for (const shape of ["object", "JSON string"] as const) {
    it(`sizes stdout + stderr for the ${shape} shape`, () => {
      expect(run(shape).row?.original_size).toBe(Buffer.byteLength(text, "utf8"));
    });

    it(`stores stdout + stderr for the ${shape} shape`, () => {
      expect(run(shape).row?.full_content).toBe(text);
    });

    it(`hints from the output, not the envelope, for the ${shape} shape`, () => {
      const { header } = run(shape);
      expect(header).toContain("search:");
      expect(header).not.toContain("isImage");
      expect(header).not.toContain("noOutputExpected");
      expect(header).not.toMatch(/zebrafish|quokka|axolotl/);
      expect(header).not.toMatch(/"n(shape|warning)"/);
    });
  }
});
