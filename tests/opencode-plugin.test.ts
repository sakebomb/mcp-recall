import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { McpRecall, type BashResult, type McpResult } from "../src/agents/opencode-plugin";
import { closeDb, getDb, retrieveOutput } from "../src/db/index";

const { mcpToolName, bashText, toHookInput, applySummary, toolOutputDir } = McpRecall.internals;

// Shapes recorded from OpenCode 1.18.31 (#474 spike). MCP tools are named
// `<server>_<tool>` and the hook gets the raw CallToolResult, whole. bash gets
// OpenCode's cut text, with the whole output saved to metadata.outputPath.
const SERVERS = ["github", "via-plugin", "via", "recall"];
const mcpCall = (tool = "github_list_issues") => ({ tool, sessionID: "ses_1", callID: "c1", args: { state: "open" } });
const mcpOut = (text: string): McpResult => ({ content: [{ type: "text", text }] });

let dataHome: string;
let outDir: string;
const savedXdg = process.env.XDG_DATA_HOME;
beforeAll(async () => {
  dataHome = await mkdtemp(path.join(os.tmpdir(), "oc-data-"));
  process.env.XDG_DATA_HOME = dataHome;
  outDir = path.join(dataHome, "opencode", "tool-output");
  await mkdir(outDir, { recursive: true });
});
afterAll(async () => {
  if (savedXdg === undefined) delete process.env.XDG_DATA_HOME; else process.env.XDG_DATA_HOME = savedXdg;
  await rm(dataHome, { recursive: true, force: true });
});

describe("OpenCode plugin: which results it handles", () => {
  it("maps <server>_<tool> to Claude Code's MCP name by the longest configured server", () => {
    expect(mcpToolName("github_list_issues", SERVERS)).toBe("mcp__github__list_issues");
    expect(mcpToolName("via-plugin_list_issues", SERVERS)).toBe("mcp__via-plugin__list_issues");
    expect(mcpToolName("via_list", SERVERS)).toBe("mcp__via__list");
    // One server's name followed by "_" starts another's: the longer one wins, in either order.
    expect(mcpToolName("git_hub_list", ["git", "git_hub"])).toBe("mcp__git_hub__list");
    expect(mcpToolName("git_hub_list", ["git_hub", "git"])).toBe("mcp__git_hub__list");
    expect(mcpToolName("git_status", ["git", "git_hub"])).toBe("mcp__git__status");
    expect(mcpToolName("read", SERVERS)).toBeNull();     // a built-in tool
    expect(mcpToolName("github_", SERVERS)).toBeNull();  // no tool part
  });

  it("leaves recall's own tools, built-ins, images and odd shapes to OpenCode", () => {
    expect(toHookInput(mcpCall("recall_recall__retrieve"), mcpOut("x"), SERVERS, "/w")).toBeNull();
    expect(toHookInput(mcpCall("read"), mcpOut("x"), SERVERS, "/w")).toBeNull();
    expect(toHookInput(mcpCall(), { content: [{ type: "image" }] }, SERVERS, "/w")).toBeNull();
    expect(toHookInput(mcpCall(), {}, SERVERS, "/w")).toBeNull();
    expect(toHookInput({ tool: "bash", sessionID: "s" }, { output: undefined }, SERVERS, "/w")).toBeNull();
  });
});

describe("OpenCode plugin: reading back bash's full output", () => {
  const cut = (outputPath: unknown, truncated = true): BashResult =>
    ({ output: "...output truncated...", metadata: { exit: 0, truncated, outputPath } });

  it("reads OpenCode's own saved file instead of the cut text", async () => {
    const p = path.join(outDir, "tool_1ce0e2a81001f0K4VvVs3NzGIr");
    await writeFile(p, "WHOLE OUTPUT");
    expect(toolOutputDir()).toBe(outDir);
    expect(bashText(cut(p))).toBe("WHOLE OUTPUT");
  });

  it("keeps the delivered text for a path OpenCode would not have written", async () => {
    const elsewhere = await mkdtemp(path.join(os.tmpdir(), "not-oc-"));
    const outside = path.join(elsewhere, "tool_abc");
    await writeFile(outside, "SHOULD NOT BE READ");
    const misnamed = path.join(outDir, "secrets.txt");
    await writeFile(misnamed, "SHOULD NOT BE READ");
    try {
      expect(bashText(cut(outside))).toBe("...output truncated...");                  // not in tool-output
      expect(bashText(cut(misnamed))).toBe("...output truncated...");                 // not named tool_<id>
      expect(bashText(cut("tool_abc"))).toBe("...output truncated...");               // relative
      expect(bashText(cut(path.join(outDir, "tool_missing")))).toBe("...output truncated...");
      expect(bashText(cut(path.join(outDir, "tool_1ce0e2a81001f0K4VvVs3NzGIr"), false))).toBe("...output truncated..."); // not cut
    } finally {
      await rm(elsewhere, { recursive: true, force: true });
    }
  });

  it("does not follow a link planted under OpenCode's name", async () => {
    const target = path.join(dataHome, "target.txt");
    await writeFile(target, "SHOULD NOT BE READ");
    const link = path.join(outDir, "tool_planted");
    await symlink(target, link);
    expect(bashText(cut(link))).toBe("...output truncated...");
  });
});

describe("OpenCode plugin: translating to and from the hook", () => {
  it("gives an MCP result Claude Code's name and content blocks", () => {
    expect(toHookInput(mcpCall(), mcpOut("hello"), SERVERS, "/work")).toEqual({
      session_id: "ses_1", cwd: "/work", hook_event_name: "PostToolUse",
      tool_name: "mcp__github__list_issues", tool_input: { state: "open" },
      tool_response: [{ type: "text", text: "hello" }],
    });
  });

  it("gives bash Claude Code's Bash name, response object and exit code", () => {
    const out: BashResult = { output: "FAIL tests/x.test.ts", metadata: { exit: 1, truncated: false } };
    expect(toHookInput({ tool: "bash", sessionID: "s", args: { command: "bun test" } }, out, SERVERS, "/w")).toMatchObject({
      tool_name: "Bash", tool_input: { command: "bun test" },
      tool_response: { stdout: "FAIL tests/x.test.ts", stderr: "", interrupted: false, exit_code: 1 },
    });
  });

  it("puts the summary where OpenCode reads each kind of result", () => {
    const bash: BashResult = { output: "long", metadata: { exit: 0 } };
    applySummary({ tool: "bash", sessionID: "s" }, bash, "SUM");
    expect(bash.output).toBe("SUM");
    const mcp: McpResult = { content: [{ type: "text", text: "long" }], structuredContent: { rows: [1] } };
    applySummary(mcpCall(), mcp, "SUM");
    expect(mcp).toEqual({ content: [{ type: "text", text: "SUM" }] });
  });
});

// Kept identical to the pi extension's copies: both files must be self-contained,
// since each is written verbatim into its agent's config dir.
describe("OpenCode plugin: shared helpers match the pi extension", () => {
  it("runHook and fromHookOutput are the same code in both adapters", async () => {
    // From `function name(` to its closing brace; `export` and the doc comment above may differ.
    const fn = (src: string, name: string) => {
      const start = src.search(new RegExp(`^(export )?function ${name}\\(`, "m"));
      if (start < 0) return null;
      return src.slice(start, src.indexOf("\n}\n", start)).replace(/^export /, "");
    };
    const [pi, oc] = await Promise.all([
      readFile("src/agents/pi-extension.ts", "utf8"), readFile("src/agents/opencode-plugin.ts", "utf8"),
    ]);
    for (const name of ["runHook", "fromHookOutput"]) {
      expect(fn(oc, name)).not.toBeNull();
      expect(fn(oc, name)).toBe(fn(pi, name));
    }
  });
});

// The whole path: OpenCode's hooks → the plugin → the real `post-tool-use` hook
// (this checkout's CLI) → a scratch store → the summary OpenCode delivers.
describe("OpenCode plugin: end to end through the real hook", () => {
  let dir: string;
  let dbPath: string;
  const saved = { db: process.env.RECALL_DB_PATH, cfg: process.env.RECALL_CONFIG_PATH };
  const launch = { cli: ["bun", path.resolve("src/cli.ts")], server: { command: "bun", args: ["/x/server.js"] } };

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "oc-e2e-"));
    dbPath = path.join(dir, "recall.db");
    process.env.RECALL_DB_PATH = dbPath;
    process.env.RECALL_CONFIG_PATH = path.join(dir, "absent.toml");
  });
  afterAll(async () => {
    closeDb();
    if (saved.db === undefined) delete process.env.RECALL_DB_PATH; else process.env.RECALL_DB_PATH = saved.db;
    if (saved.cfg === undefined) delete process.env.RECALL_CONFIG_PATH; else process.env.RECALL_CONFIG_PATH = saved.cfg;
    await rm(dir, { recursive: true, force: true });
  });

  async function loaded(cfg: { mcp?: Record<string, unknown> } = { mcp: { github: { type: "local", command: ["x"] } } }) {
    const hooks = await McpRecall({ directory: dir }, { launch });
    await hooks.config!(cfg as never);
    return { hooks, cfg };
  }

  it("registers the recall server without replacing one the user already has", async () => {
    const { cfg } = await loaded();
    expect(cfg.mcp!["recall"]).toEqual({ type: "local", command: ["bun", "/x/server.js"], enabled: true });
    const mine = { type: "local", command: ["my-recall"] };
    const { cfg: theirs } = await loaded({ mcp: { recall: mine } });
    expect(theirs.mcp!["recall"]).toBe(mine);
  });

  it("stores the whole MCP result and delivers a recall summary", async () => {
    const rows = Array.from({ length: 400 }, (_, i) => ({
      number: i + 1, title: `Issue ${i + 1}: flaky test in module ${i % 17}`, labels: ["bug", `area-${i % 9}`],
    }));
    const whole = JSON.stringify(rows, null, 2);
    const { hooks } = await loaded();
    const out = mcpOut(whole);
    await hooks["tool.execute.after"]!(mcpCall() as never, out as never);

    const text = out.content![0]!.text!;
    const id = /^\[recall:(recall_[0-9a-f]+) /.exec(text)?.[1];
    expect(id).toBeDefined();
    expect(text.length).toBeLessThan(whole.length / 4);
    closeDb();
    const stored = retrieveOutput(getDb(dbPath), id!);
    expect(stored?.full_content).toBe(whole);
    expect(stored?.session_id).toBe("ses_1");
  });

  it("leaves a result the hook passes through unchanged", async () => {
    const { hooks } = await loaded();
    const out = mcpOut("short");
    await hooks["tool.execute.after"]!(mcpCall() as never, out as never);
    expect(out).toEqual(mcpOut("short"));
  });

  it("never throws into OpenCode, whatever the input looks like", async () => {
    const { hooks } = await loaded();
    expect(await hooks["tool.execute.after"]!(null as never, null as never)).toBeUndefined();
    expect(await hooks["tool.execute.after"]!(mcpCall() as never, { content: [null] } as never)).toBeUndefined();
    expect(await hooks.event!({ event: null } as never)).toBeUndefined();
    expect(await hooks.event!({ event: { type: "session.created", properties: {} } } as never)).toBeUndefined();
    expect(await hooks.config!(null as never)).toBeUndefined();
  });

  it("does nothing without a launch file", async () => {
    expect(await McpRecall({ directory: dir }, {})).toEqual({});
  });
});
