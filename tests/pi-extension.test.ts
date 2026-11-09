import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, symlink, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import mcpRecall, {
  isHandled, fullOutputText, toHookInput, fromHookOutput, runHook, readLaunch, type PiToolResult,
} from "../src/agents/pi-extension";
import { closeDb, getDb, retrieveOutput } from "../src/db/index";

// Shapes recorded from pi 1.5.0 (#458 spike): pi cuts a large result before
// extensions see it and names the whole output in details.fullOutputPath.
function mcpEvent(text: string, fullOutputPath?: string): PiToolResult {
  return {
    toolName: "mcp__bigdata__list_issues",
    input: {},
    content: [{ type: "text", text }],
    details: fullOutputPath ? { fullOutputPath } : {},
    isError: false,
  };
}

const tmpFiles: string[] = [];
async function piFile(name: string, content: string): Promise<string> {
  const p = path.join(os.tmpdir(), name);
  await writeFile(p, content);
  tmpFiles.push(p);
  return p;
}
afterAll(async () => { await Promise.all(tmpFiles.map((p) => rm(p, { force: true }))); });

describe("pi extension: which results it handles", () => {
  it("handles MCP tools and bash, not recall's own tools or pi's built-ins", () => {
    expect(isHandled("mcp__github__list_issues")).toBe(true);
    expect(isHandled("bash")).toBe(true);
    expect(isHandled("mcp__recall__recall__retrieve")).toBe(false);
    expect(isHandled("read")).toBe(false);
    expect(isHandled("Bash")).toBe(false); // pi's tool is lowercase; "Bash" is Claude Code's
  });

  it("leaves errors and non-text results to pi", () => {
    expect(toHookInput({ ...mcpEvent("x"), isError: true }, "s", "/w")).toBeNull();
    const image: PiToolResult = { toolName: "mcp__shot__take", content: [{ type: "image" }] };
    expect(toHookInput(image, "s", "/w")).toBeNull();
  });
});

describe("pi extension: reading back the full output", () => {
  it("reads pi's own saved file in the temp dir instead of the cut text", async () => {
    const p = await piFile(`pi-mcp-${"a1".repeat(8)}.txt`, "WHOLE OUTPUT");
    expect(fullOutputText(mcpEvent("cut…", p))).toBe("WHOLE OUTPUT");
  });

  it("keeps the delivered text for a path pi would not have written", async () => {
    const elsewhere = await mkdtemp(path.join(os.tmpdir(), "not-pi-"));
    const outside = path.join(elsewhere, `pi-mcp-${"b2".repeat(8)}.txt`);
    await writeFile(outside, "SHOULD NOT BE READ");
    const misnamed = await piFile("secrets.txt", "SHOULD NOT BE READ");
    try {
      expect(fullOutputText(mcpEvent("cut", outside))).toBe("cut");   // not directly in tmpdir
      expect(fullOutputText(mcpEvent("cut", misnamed))).toBe("cut");  // not named as pi names them
      expect(fullOutputText(mcpEvent("cut", "pi-mcp-c3c3.txt"))).toBe("cut"); // relative
      expect(fullOutputText(mcpEvent("cut", path.join(os.tmpdir(), "pi-mcp-dddd.txt")))).toBe("cut"); // missing
    } finally {
      await rm(elsewhere, { recursive: true, force: true });
    }
  });

  it("does not follow a link planted under pi's name", async () => {
    const target = await piFile(`not-pi-target-${process.pid}.txt`, "SHOULD NOT BE READ");
    const link = path.join(os.tmpdir(), `pi-mcp-${"9a".repeat(8)}.txt`);
    await rm(link, { force: true });
    await symlink(target, link);
    tmpFiles.push(link);
    expect(fullOutputText(mcpEvent("cut", link))).toBe("cut");
  });
});

describe("pi extension: translating to and from the hook", () => {
  it("gives an MCP result the content-block shape Claude Code sends", () => {
    const input = toHookInput(mcpEvent("hello"), "sess-1", "/work");
    expect(input).toEqual({
      session_id: "sess-1", cwd: "/work", hook_event_name: "PostToolUse",
      tool_name: "mcp__bigdata__list_issues", tool_input: {},
      tool_response: [{ type: "text", text: "hello" }],
    });
  });

  it("gives bash Claude Code's Bash name and response object", async () => {
    const p = await piFile(`pi-bash-${"e4".repeat(8)}.log`, "1\n2\n3\n");
    const event: PiToolResult = {
      toolName: "bash", input: { command: "seq 1 3" },
      content: [{ type: "text", text: "3\n\n[Showing lines 3-3 of 3. Full output: …]" }],
      details: { fullOutputPath: p }, isError: false,
    };
    expect(toHookInput(event, "s", "/w")).toMatchObject({
      tool_name: "Bash", tool_input: { command: "seq 1 3" },
      tool_response: { stdout: "1\n2\n3\n", stderr: "", interrupted: false },
    });
  });

  it("reads a string summary and a Bash response object back as text", () => {
    const str = JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", updatedToolOutput: "SUM" } });
    const obj = JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", updatedToolOutput: { stdout: "SUM2", stderr: "" } } });
    expect(fromHookOutput(str)).toEqual([{ type: "text", text: "SUM" }]);
    expect(fromHookOutput(obj)).toEqual([{ type: "text", text: "SUM2" }]);
    expect(fromHookOutput(JSON.stringify({ suppressOutput: true }))).toBeNull(); // passed through
    expect(fromHookOutput("")).toBeNull();
    expect(fromHookOutput("not json")).toBeNull();
  });

  it("runHook resolves empty, not throwing, when mcp-recall can't be run", async () => {
    expect(await runHook(["/nonexistent/mcp-recall"], "post-tool-use", {})).toBe("");
    expect(await runHook([], "post-tool-use", {})).toBe("");
  });

  it("runHook gives up at the timeout on a hook that ignores SIGTERM", async () => {
    const stubborn = `process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);`;
    const started = Date.now();
    expect(await runHook(["bun", "-e", stubborn], "post-tool-use", {}, undefined, 300)).toBe("");
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it("runHook keeps multibyte characters whole across pipe chunks", async () => {
    // One ASCII byte, then two-byte characters: every even-sized pipe chunk boundary splits one.
    const out = await runHook(["bun", "-e", `process.stdout.write("a" + "é".repeat(150000))`], "post-tool-use", {});
    expect(out.length).toBe(150001);
    expect(out).not.toContain("�");
  });

  it("readLaunch rejects a missing or malformed launch.json", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "pi-launch-"));
    try {
      expect(readLaunch(dir)).toBeNull();
      await writeFile(path.join(dir, "launch.json"), JSON.stringify({ cli: "bun x" }));
      expect(readLaunch(dir)).toBeNull();
      const ok = { cli: ["bun", "/x/cli.js"], server: { command: "bun", args: ["/x/server.js"] } };
      await writeFile(path.join(dir, "launch.json"), JSON.stringify(ok));
      expect(readLaunch(dir)).toEqual(ok);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// The whole path: pi's event → the extension → the real `post-tool-use` hook
// (this checkout's CLI) → a scratch store → the summary pi delivers.
describe("pi extension: end to end through the real hook", () => {
  let dir: string;
  let dbPath: string;
  const saved = { db: process.env.RECALL_DB_PATH, cfg: process.env.RECALL_CONFIG_PATH };

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "pi-e2e-"));
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

  function fakePi() {
    const handlers: Record<string, (e: unknown, ctx: unknown) => unknown> = {};
    const servers: Record<string, Record<string, unknown>> = {};
    return {
      handlers, servers,
      api: {
        on: (name: string, h: (e: unknown, ctx: unknown) => unknown) => { handlers[name] = h; },
        registerMcpServer: (name: string, cfg: Record<string, unknown>) => { servers[name] = cfg; },
      },
    };
  }

  it("stores the whole saved output and delivers a recall summary", async () => {
    const rows = Array.from({ length: 400 }, (_, i) => ({
      number: i + 1, title: `Issue ${i + 1}: flaky test in module ${i % 17}`, labels: ["bug", `area-${i % 9}`],
    }));
    const whole = JSON.stringify(rows, null, 2);
    const p = await piFile(`pi-mcp-${"f5".repeat(8)}.txt`, whole);
    const cli = ["bun", path.resolve("src/cli.ts")];
    const pi = fakePi();
    mcpRecall(pi.api as never, { cli, server: { command: "bun", args: ["/x/server.js"] } });

    expect(pi.servers["recall"]).toEqual({ command: "bun", args: ["/x/server.js"], exposure: "direct" });
    const ctx = { cwd: dir, sessionManager: { getSessionId: () => "pi-session-1" } };
    const out = (await pi.handlers["tool_result"]!(mcpEvent(whole.slice(0, 20_000) + "\n[Full output: …]", p), ctx)) as
      { content: Array<{ type: string; text: string }> } | undefined;

    expect(out).toBeDefined();
    const text = out!.content[0]!.text;
    const id = /^\[recall:(recall_[0-9a-f]+) /.exec(text)?.[1];
    expect(id).toBeDefined();
    expect(text.length).toBeLessThan(whole.length / 4);

    closeDb();
    const stored = retrieveOutput(getDb(dbPath), id!);
    expect(stored?.full_content).toBe(whole); // the saved file, not pi's 20 KB cut
    expect(stored?.session_id).toBe("pi-session-1");
  });

  it("returns nothing for a result the hook passes through", async () => {
    const pi = fakePi();
    mcpRecall(pi.api as never, { cli: ["bun", path.resolve("src/cli.ts")], server: { command: "bun", args: [] } });
    const ctx = { cwd: dir, sessionManager: { getSessionId: () => "pi-session-1" } };
    expect(await pi.handlers["tool_result"]!(mcpEvent("short"), ctx)).toBeUndefined();
    expect(await pi.handlers["tool_result"]!({ ...mcpEvent("x"), toolName: "read" }, ctx)).toBeUndefined();
  });

  it("never throws into pi, whatever the event or context looks like", async () => {
    const pi = fakePi();
    mcpRecall(pi.api as never, { cli: ["bun", path.resolve("src/cli.ts")], server: { command: "bun", args: [] } });
    const ctx = { cwd: dir, sessionManager: { getSessionId: () => "pi-session-1" } };
    const broken = { toolName: "mcp__x__y", content: [null] } as unknown as PiToolResult;
    expect(await pi.handlers["tool_result"]!(broken, ctx)).toBeUndefined();
    const badCtx = { cwd: dir, sessionManager: { getSessionId: () => { throw new Error("no session"); } } };
    expect(await pi.handlers["tool_result"]!(mcpEvent("x"), badCtx)).toBeUndefined();
    expect(await pi.handlers["session_start"]!({}, badCtx)).toBeUndefined();
  });
});
