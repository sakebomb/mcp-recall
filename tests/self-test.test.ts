import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import {
  runSelfTest, pluginHookCommand, formatSelfTest, deliveredText, syntheticGitLog, type SelfTestResult,
} from "../src/install/self-test";
import { statusCommand, type RecallLaunch } from "../src/install/index";

// `mcp-recall status` runs the registered PostToolUse hook on a synthetic
// output, so a user can see the hook work without Claude (#495).

const repo = resolve(import.meta.dir, "..");
const checkoutHook = `'${join(repo, "bin", "recall")}' post-tool-use`;
const selfTestDirs = () => readdirSync(tmpdir()).filter((f) => f.startsWith("mcp-recall-self-test-"));

describe("runSelfTest", () => {
  it("reports the summary the real hook returns for a synthetic git log", async () => {
    const r = await runSelfTest(checkoutHook);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.original).toBe(Buffer.byteLength(syntheticGitLog()));
    expect(r.delivered).toBeLessThan(r.original * 0.75);
  }, 20_000);

  it("fails when the hook hands the output back unchanged", async () => {
    const r = await runSelfTest(`cat >/dev/null; echo '{}'`);
    expect(r).toEqual({ ok: false, reason: "the hook returned the output unchanged" });
  });

  it("fails with the exit code and the first stderr line when the hook errors", async () => {
    const r = await runSelfTest(`cat >/dev/null; echo 'module not found' >&2; echo more >&2; exit 3`);
    expect(r).toEqual({ ok: false, reason: "the hook exited with code 3: module not found" });
  });

  it("gives up at the timeout even when the hook's child holds the pipes open", async () => {
    const start = Date.now();
    const r = await runSelfTest(`cat >/dev/null; sleep 30; true`, {}, 300);
    expect(r).toEqual({ ok: false, reason: "the hook did not finish within 0.3s" });
    expect(Date.now() - start).toBeLessThan(5_000);
  });

  it("fails when the hook replaces the output with something other than a summary", async () => {
    const reply = JSON.stringify({ hookSpecificOutput: { updatedToolOutput: { stdout: "rewritten", stderr: "" } } });
    const r = await runSelfTest(`cat >/dev/null; echo '${reply}'`);
    expect(r).toEqual({ ok: false, reason: "the hook returned the output unchanged" });
  });

  it("points the hook at a throwaway store and removes it afterwards", async () => {
    const before = selfTestDirs().length;
    const r = await runSelfTest(`cat >/dev/null; echo "$RECALL_DB_PATH" >&2; exit 1`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/mcp-recall-self-test-[^/]+\/self-test\.db$/);
    expect(selfTestDirs().length).toBe(before);
  });

  it("expands the variables it is given, as for a plugin's own command", async () => {
    const r = await runSelfTest(`cat >/dev/null; echo "$CLAUDE_PLUGIN_ROOT" >&2; exit 1`, { CLAUDE_PLUGIN_ROOT: "/plugin/root" });
    expect(r).toEqual({ ok: false, reason: "the hook exited with code 1: /plugin/root" });
  });
});

describe("pluginHookCommand", () => {
  it("runs the bundled plugin's own hook command", async () => {
    const root = join(repo, "plugins", "mcp-recall");
    const cmd = pluginHookCommand(root);
    expect(cmd).toContain("${CLAUDE_PLUGIN_ROOT}");
    const r = await runSelfTest(cmd!, { CLAUDE_PLUGIN_ROOT: root });
    expect(r.ok).toBe(true);
  }, 20_000);

  it("returns null for a plugin dir with no hooks.json", () => {
    expect(pluginHookCommand("/nonexistent/plugin")).toBeNull();
  });
});

describe("deliveredText and formatSelfTest", () => {
  it("reads Bash and MCP replacement shapes, and null for no replacement", () => {
    const bash = { hookSpecificOutput: { updatedToolOutput: { stdout: "[recall:x] s", stderr: "" } } };
    expect(deliveredText(JSON.stringify(bash))).toBe("[recall:x] s");
    expect(deliveredText(JSON.stringify({ hookSpecificOutput: { updatedToolOutput: "[recall:y]" } }))).toBe("[recall:y]");
    expect(deliveredText("{}")).toBeNull();
    expect(deliveredText("not json")).toBeNull();
  });

  it("states sizes and the reduction on success", () => {
    expect(formatSelfTest({ ok: true, original: 20_000, delivered: 1_000 })).toMatch(/to 1000B \(95% smaller\)$/);
  });
});

describe("status self-test", () => {
  let dir: string;
  let settingsPath: string;
  const launch: RecallLaunch = {
    cli: "/opt/recall", server: { type: "stdio", command: "/opt/recall", args: ["serve"] }, artifacts: [],
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "recall-status-selftest-"));
    settingsPath = join(dir, "settings.json");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  async function status(run: (c: string, e: Record<string, string>) => Promise<SelfTestResult>): Promise<string> {
    const log = spyOn(console, "log").mockImplementation(() => {});
    try {
      await statusCommand({
        claudeJsonPath: join(dir, "claude.json"), settingsPath, claudeMdPath: join(dir, "CLAUDE.md"),
        pluginsPath: join(dir, "plugins"), piDir: join(dir, "pi"), opencodeDir: join(dir, "oc"), launch, selfTest: run,
      });
      return log.mock.calls.flat().join("\n").replace(/\x1b\[[0-9;]*m/g, "");
    } finally {
      log.mockRestore();
    }
  }

  it("runs the registered PostToolUse command and prints the result", async () => {
    const cmd = "/opt/recall post-tool-use";
    writeFileSync(settingsPath, JSON.stringify({
      hooks: { PostToolUse: [{ matcher: "mcp__.*|Bash", hooks: [{ type: "command", command: cmd }] }] },
    }));
    const ran: string[] = [];
    const out = await status(async (c) => { ran.push(c); return { ok: true, original: 21_000, delivered: 1_600 }; });
    expect(ran).toEqual([cmd]);
    expect(out).toContain("✓ Self-test: the hook summarized a");
  });

  it("marks a failed self-test and says how to look into it", async () => {
    writeFileSync(settingsPath, JSON.stringify({
      hooks: { PostToolUse: [{ matcher: "mcp__.*|Bash", hooks: [{ type: "command", command: "/opt/recall post-tool-use" }] }] },
    }));
    const out = await status(async () => ({ ok: false, reason: "the hook exited with code 1" }));
    expect(out).toContain("✗ Self-test: the hook exited with code 1");
    expect(out).toContain("RECALL_DEBUG=1");
  });

  it("runs an enabled plugin's own hook, with CLAUDE_PLUGIN_ROOT set, when the CLI registered none", async () => {
    const installPath = join(dir, "cache", "mcp-recall", "1.22.0");
    const cmd = `"\${CLAUDE_PLUGIN_ROOT}/bin/recall" post-tool-use`;
    mkdirSync(join(installPath, "hooks"), { recursive: true });
    writeFileSync(join(installPath, "hooks", "hooks.json"), JSON.stringify({
      hooks: { PostToolUse: [{ matcher: "mcp__.*|Bash", hooks: [{ type: "command", command: cmd }] }] },
    }));
    const key = "mcp-recall@mcp-recall";
    writeFileSync(join(dir, "plugins"), JSON.stringify({
      version: 2, plugins: { [key]: [{ scope: "user", installPath, version: "1.22.0" }] },
    }));
    writeFileSync(settingsPath, JSON.stringify({ enabledPlugins: { [key]: true } }));
    const ran: Array<[string, Record<string, string>]> = [];
    await status(async (c, e) => { ran.push([c, e]); return { ok: true, original: 2, delivered: 1 }; });
    expect(ran).toEqual([[cmd, { CLAUDE_PLUGIN_ROOT: installPath }]]);
  });

  it("skips with a warning when no hook is registered, and runs nothing", async () => {
    writeFileSync(settingsPath, "{}");
    let ran = false;
    const out = await status(async () => { ran = true; return { ok: true, original: 1, delivered: 0 }; });
    expect(ran).toBe(false);
    expect(out).toContain("! Self-test: skipped, no PostToolUse hook is registered");
    expect(existsSync(join(dir, "plugins"))).toBe(false);
  });
});
