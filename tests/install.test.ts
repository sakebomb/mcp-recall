import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";
import { mkdtemp, rm, symlink, lstat, stat, chmod, mkdir, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import os from "os";
import {
  installCommand,
  uninstallCommand,
  readJsonFile,
  writeJsonFile,
  isOurSessionStartHook,
  isOurPostToolUseHook,
  makeSessionStartEntry,
  makePostToolUseEntry,
  POST_TOOL_USE_MATCHER,
  isClaudeMdInjected,
  injectClaudeMd,
  removeClaudeMd,
  CLAUDE_MD_MARKER_START,
  CLAUDE_MD_MARKER_END,
  CLAUDE_MD_BLOCK,
  statusCommand,
  detectLaunch,
  isStandaloneBinary,
  shellWord,
  shellWords,
  type RecallLaunch,
} from "../src/install/index";

// A RecallLaunch.cli as an npm install writes it: bun and the bundled dist.
const FAKE_CLI    = "bun /fake/mcp-recall/dist/cli.js";
const FAKE_SERVER = "/fake/mcp-recall/dist/server.js";

// Tests pass explicit config paths, and a `launch`, to install/uninstall/status,
// so they never depend on the real build artifacts or the user's config.

let tmpDir: string;
let claudeJsonPath: string;
let settingsPath: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "mcp-recall-install-test-"));
  claudeJsonPath = path.join(tmpDir, ".claude.json");
  settingsPath   = path.join(tmpDir, "settings.json");
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ── isOurSessionStartHook ─────────────────────────────────────────────────────

describe("isOurSessionStartHook", () => {
  it("recognises our hook", () => {
    const entry = makeSessionStartEntry(FAKE_CLI);
    expect(isOurSessionStartHook(entry)).toBe(true);
  });

  it("rejects a different tool's session-start hook", () => {
    expect(isOurSessionStartHook({
      hooks: [{ type: "command", command: "bun /other/tool/cli.js session-start" }],
    })).toBe(false);
  });

  it("rejects null / non-object", () => {
    expect(isOurSessionStartHook(null)).toBe(false);
    expect(isOurSessionStartHook("string")).toBe(false);
  });
});

// ── isOurPostToolUseHook ──────────────────────────────────────────────────────

describe("isOurPostToolUseHook", () => {
  it("recognises our hook", () => {
    const entry = makePostToolUseEntry(FAKE_CLI);
    expect(isOurPostToolUseHook(entry)).toBe(true);
  });

  it("rejects a hook with different matcher", () => {
    expect(isOurPostToolUseHook({
      matcher: "mcp__other__*",
      hooks: [{ type: "command", command: `${FAKE_CLI} post-tool-use` }],
    })).toBe(false);
  });

  it("rejects a hook with our matcher but different command", () => {
    expect(isOurPostToolUseHook({
      matcher: POST_TOOL_USE_MATCHER,
      hooks: [{ type: "command", command: "bun /other/tool/cli.js some-hook" }],
    })).toBe(false);
  });
});

// ── writeJsonFile / readJsonFile ──────────────────────────────────────────────

describe("writeJsonFile / readJsonFile", () => {
  it("round-trips JSON", async () => {
    const filePath = path.join(tmpDir, "test.json");
    await writeJsonFile(filePath, { foo: "bar", nested: { x: 1 } });
    const result = await readJsonFile(filePath);
    expect(result).toEqual({ foo: "bar", nested: { x: 1 } });
  });

  it("returns {} when file does not exist", async () => {
    const result = await readJsonFile(path.join(tmpDir, "nonexistent.json"));
    expect(result).toEqual({});
  });

  it("creates parent directories", async () => {
    const nested = path.join(tmpDir, "a", "b", "c.json");
    await writeJsonFile(nested, { ok: true });
    expect(existsSync(nested)).toBe(true);
  });

  it("writes through a symlink and keeps the link (#373)", async () => {
    const real = path.join(tmpDir, "dotfiles", "settings.json");
    await writeJsonFile(real, { old: true });
    const link = path.join(tmpDir, "settings.json");
    await symlink(real, link);
    await writeJsonFile(link, { updated: true });
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await readJsonFile(real)).toEqual({ updated: true });
  });

  it("writes through a dangling symlink to its target (#373)", async () => {
    const real = path.join(tmpDir, "dotfiles", "missing.json");
    const link = path.join(tmpDir, "dangling.json");
    await symlink(real, link);
    await writeJsonFile(link, { created: true });
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await readJsonFile(real)).toEqual({ created: true });
  });

  it("writes through a dangling chain of symlinks to its end (#373)", async () => {
    const real = path.join(tmpDir, "dotfiles", "end.json");
    const middle = path.join(tmpDir, "middle.json");
    const link = path.join(tmpDir, "chain.json");
    await symlink(real, middle);
    await symlink(middle, link);
    await writeJsonFile(link, { created: true });
    expect((await lstat(middle)).isSymbolicLink()).toBe(true);
    expect(await readJsonFile(real)).toEqual({ created: true });
  });

  it.skipIf(process.platform === "win32")("keeps the mode when a stale temp file is left over (#373)", async () => {
    const filePath = path.join(tmpDir, ".claude.json");
    await writeJsonFile(filePath, { a: 1 });
    await chmod(filePath, 0o600);
    await writeFile(filePath + ".tmp", "stale", { mode: 0o666 }); // left by a crash
    await writeJsonFile(filePath, { a: 2 });
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
    expect(await readJsonFile(filePath)).toEqual({ a: 2 });
  });

  it.skipIf(process.platform === "win32")("keeps the existing file's mode (#373)", async () => {
    const filePath = path.join(tmpDir, ".claude.json");
    await writeJsonFile(filePath, { a: 1 });
    await chmod(filePath, 0o600);
    await writeJsonFile(filePath, { a: 2 });
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
  });

  it("keeps a symlinked CLAUDE.md a symlink through install (#373)", async () => {
    const real = path.join(tmpDir, "dotfiles", "CLAUDE.md");
    await mkdir(path.dirname(real), { recursive: true });
    await writeFile(real, "# mine\n");
    const link = path.join(tmpDir, "CLAUDE.md");
    await symlink(real, link);
    await injectClaudeMd(link);
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await readFile(real, "utf8")).toContain(CLAUDE_MD_MARKER_START);
  });
});

// ── JSON merge logic ─────────────────────────────────────────────────────────
// Test the merge behaviour directly without needing real build artifacts by
// pre-writing config files and calling helpers.

describe("JSON merge — adds our entries non-destructively", () => {
  it("preserves pre-existing hooks in settings.json", async () => {
    const other = {
      hooks: {
        PostToolUse: [
          {
            matcher: "TaskCreate|TaskUpdate",
            hooks: [{ type: "command", command: "/usr/local/bin/vikunja-sync" }],
          },
        ],
      },
    };
    await writeJsonFile(settingsPath, other);

    // Manually perform what installCommand does for PostToolUse
    const settings = await readJsonFile(settingsPath);
    const hooks = (settings["hooks"] as Record<string, unknown[]>);
    const ptuHooks = hooks["PostToolUse"] as unknown[];
    const newPTU = makePostToolUseEntry(FAKE_CLI);
    hooks["PostToolUse"] = [...ptuHooks, newPTU];
    settings["hooks"] = hooks;
    await writeJsonFile(settingsPath, settings);

    const result = await readJsonFile(settingsPath);
    const ptu = (result["hooks"] as any)["PostToolUse"] as unknown[];
    expect(ptu).toHaveLength(2);
    expect((ptu[0] as any).matcher).toBe("TaskCreate|TaskUpdate");
    expect((ptu[1] as any).matcher).toBe(POST_TOOL_USE_MATCHER);
  });

  it("does not duplicate SessionStart on second install", async () => {
    const initial = makeSessionStartEntry(FAKE_CLI);
    await writeJsonFile(settingsPath, {
      hooks: { SessionStart: [initial] },
    });

    const settings = await readJsonFile(settingsPath);
    const hooks = (settings["hooks"] as Record<string, unknown[]>);
    const ssHooks = hooks["SessionStart"] as unknown[];
    const ssIdx = ssHooks.findIndex(isOurSessionStartHook);
    // Already installed — should not append
    expect(ssIdx).toBe(0);
    const newSS = makeSessionStartEntry(FAKE_CLI);
    // Same command → no change
    const currentCmd = (ssHooks[ssIdx] as any)?.hooks?.[0]?.command;
    expect(currentCmd).toBe(newSS.hooks[0].command);
  });

  it("updates stale path on re-run", async () => {
    const stale = makeSessionStartEntry("bun /old/mcp-recall/dist/cli.js");
    await writeJsonFile(settingsPath, {
      hooks: { SessionStart: [stale] },
    });

    const settings = await readJsonFile(settingsPath);
    const hooks = (settings["hooks"] as Record<string, unknown[]>);
    const ssHooks = hooks["SessionStart"] as unknown[];
    const ssIdx = ssHooks.findIndex(isOurSessionStartHook);
    expect(ssIdx).toBe(0);

    const newSS = makeSessionStartEntry(FAKE_CLI);
    ssHooks[ssIdx] = newSS;
    hooks["SessionStart"] = ssHooks;
    settings["hooks"] = hooks;
    await writeJsonFile(settingsPath, settings);

    const result = await readJsonFile(settingsPath);
    const updated = (result["hooks"] as any)["SessionStart"][0];
    expect(updated.hooks[0].command).toBe(`${FAKE_CLI} session-start`);
  });
});

// ── uninstall removes only our entries ───────────────────────────────────────

describe("uninstall", () => {
  it("removes our entries and leaves other hooks intact", async () => {
    const otherHook = {
      matcher: "TaskCreate|TaskUpdate",
      hooks: [{ type: "command", command: "/usr/local/bin/vikunja-sync" }],
    };
    await writeJsonFile(settingsPath, {
      hooks: {
        SessionStart: [makeSessionStartEntry(FAKE_CLI)],
        PostToolUse: [otherHook, makePostToolUseEntry(FAKE_CLI)],
      },
    });
    await writeJsonFile(claudeJsonPath, {
      mcpServers: { recall: { type: "stdio", command: "bun", args: [FAKE_SERVER] } },
    });

    await uninstallCommand({ claudeJsonPath, settingsPath });

    const claude   = await readJsonFile(claudeJsonPath);
    const settings = await readJsonFile(settingsPath);
    const hooks    = (settings["hooks"] as Record<string, unknown[]>);

    expect((claude["mcpServers"] as any)?.["recall"]).toBeUndefined();
    expect((hooks["SessionStart"] ?? [])).toHaveLength(0);
    expect((hooks["PostToolUse"] ?? [])).toHaveLength(1);
    expect((hooks["PostToolUse"] as any)[0].matcher).toBe("TaskCreate|TaskUpdate");
  });

  it("is a no-op when nothing is installed", async () => {
    // Should not throw
    await uninstallCommand({ claudeJsonPath, settingsPath });
  });
});

// ── mcpServers merge ─────────────────────────────────────────────────────────

describe("mcpServers merge", () => {
  it("preserves other MCP servers when adding recall", async () => {
    await writeJsonFile(claudeJsonPath, {
      mcpServers: {
        github: { type: "stdio", command: "bun", args: ["/other/github.js"] },
      },
    });

    const claudeJson = await readJsonFile(claudeJsonPath);
    const mcpServers = (claudeJson["mcpServers"] as Record<string, unknown>) ?? {};
    claudeJson["mcpServers"] = {
      ...mcpServers,
      recall: { type: "stdio", command: "bun", args: [FAKE_SERVER] },
    };
    await writeJsonFile(claudeJsonPath, claudeJson);

    const result = await readJsonFile(claudeJsonPath);
    const servers = result["mcpServers"] as Record<string, unknown>;
    expect(servers["github"]).toBeDefined();
    expect(servers["recall"]).toBeDefined();
  });
});

// ── CLAUDE.md helpers ─────────────────────────────────────────────────────────

describe("isClaudeMdInjected", () => {
  it("returns true when marker is present", () => {
    expect(isClaudeMdInjected(`# My notes\n\n${CLAUDE_MD_BLOCK}\n`)).toBe(true);
  });

  it("returns false when marker is absent", () => {
    expect(isClaudeMdInjected("# My notes\n\nsome content\n")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isClaudeMdInjected("")).toBe(false);
  });
});

describe("injectClaudeMd", () => {
  it("creates file and adds block when file does not exist", async () => {
    const filePath = path.join(tmpDir, "CLAUDE.md");
    const result = await injectClaudeMd(filePath);
    expect(result).toBe("added");
    const content = await Bun.file(filePath).text();
    expect(content).toContain(CLAUDE_MD_MARKER_START);
    expect(content).toContain(CLAUDE_MD_MARKER_END);
  });

  it("appends block to existing content", async () => {
    const filePath = path.join(tmpDir, "CLAUDE.md");
    await Bun.write(filePath, "# Existing notes\n\nsome content\n");
    await injectClaudeMd(filePath);
    const content = await Bun.file(filePath).text();
    expect(content).toContain("# Existing notes");
    expect(content).toContain(CLAUDE_MD_MARKER_START);
  });

  it("returns 'present' when block is already correct", async () => {
    const filePath = path.join(tmpDir, "CLAUDE.md");
    await injectClaudeMd(filePath);
    const result = await injectClaudeMd(filePath);
    expect(result).toBe("present");
  });

  it("updates stale block and returns 'updated'", async () => {
    const filePath = path.join(tmpDir, "CLAUDE.md");
    const stale = `${CLAUDE_MD_MARKER_START}\nold content\n${CLAUDE_MD_MARKER_END}`;
    await Bun.write(filePath, `# Notes\n\n${stale}\n`);
    const result = await injectClaudeMd(filePath);
    expect(result).toBe("updated");
    const content = await Bun.file(filePath).text();
    expect(content).not.toContain("old content");
    expect(content).toContain(CLAUDE_MD_BLOCK);
  });

  it("dry run does not write the file", async () => {
    const filePath = path.join(tmpDir, "CLAUDE.md");
    const result = await injectClaudeMd(filePath, true);
    expect(result).toBe("added");
    expect(existsSync(filePath)).toBe(false);
  });
});

describe("removeClaudeMd", () => {
  it("removes the block and returns true", async () => {
    const filePath = path.join(tmpDir, "CLAUDE.md");
    await Bun.write(filePath, `# Notes\n\n${CLAUDE_MD_BLOCK}\n`);
    const removed = await removeClaudeMd(filePath);
    expect(removed).toBe(true);
    const content = await Bun.file(filePath).text();
    expect(content).not.toContain(CLAUDE_MD_MARKER_START);
    expect(content).toContain("# Notes");
  });

  it("leaves surrounding content intact", async () => {
    const filePath = path.join(tmpDir, "CLAUDE.md");
    await Bun.write(filePath, `# Before\n\n${CLAUDE_MD_BLOCK}\n\n# After\n`);
    await removeClaudeMd(filePath);
    const content = await Bun.file(filePath).text();
    expect(content).toContain("# Before");
    expect(content).toContain("# After");
    expect(content).not.toContain(CLAUDE_MD_MARKER_START);
  });

  it("returns false when marker is not present", async () => {
    const filePath = path.join(tmpDir, "CLAUDE.md");
    await Bun.write(filePath, "# Notes\n\nno recall block here\n");
    const removed = await removeClaudeMd(filePath);
    expect(removed).toBe(false);
  });

  it("returns false when file does not exist", async () => {
    const filePath = path.join(tmpDir, "nonexistent-CLAUDE.md");
    const removed = await removeClaudeMd(filePath);
    expect(removed).toBe(false);
  });
});

// ── standalone binary launch (#361) ──────────────────────────────────────────

describe("launch detection", () => {
  it("recognises a compiled binary's module root on POSIX and Windows", () => {
    expect(isStandaloneBinary("/$bunfs/root/mcp-recall")).toBe(true);
    expect(isStandaloneBinary("B:\\~BUN\\root\\mcp-recall.exe")).toBe(true);
    expect(isStandaloneBinary("/home/u/mcp-recall/src/install/index.ts")).toBe(false);
    expect(isStandaloneBinary("/usr/lib/node_modules/mcp-recall/plugins/mcp-recall/dist/cli.js")).toBe(false);
  });

  it("launches a binary as itself, with `serve` for the server", () => {
    const launch = detectLaunch(true);
    expect(launch.cli).toBe(process.execPath);
    expect(launch.server).toEqual({ type: "stdio", command: process.execPath, args: ["serve"] });
    expect(launch.artifacts.map((a) => a.path)).toEqual([process.execPath]);
  });

  it("quotes a path a shell would split, and round-trips it through bash", () => {
    expect(shellWord("/usr/local/bin/mcp-recall")).toBe("/usr/local/bin/mcp-recall");
    const paths = [
      "/Users/a b/Application Support/mcp-recall",
      "C:\\Program Files\\mcp-recall\\mcp-recall.exe",
      "C:\\Users\\me\\bin\\mcp-recall.exe", // no space: the backslashes alone need quoting
      "/opt/it's/mcp-recall",
    ];
    for (const p of paths) {
      const echoed = Bun.spawnSync(["bash", "-c", `printf %s ${shellWord(p)}`]).stdout.toString();
      expect(echoed).toBe(p);
    }
  });

  it("launches an npm install through bun and the bundled dist", () => {
    const launch = detectLaunch(false);
    expect(launch.cli).toMatch(/^bun \S+\/plugins\/mcp-recall\/dist\/cli\.js$/);
    expect(launch.server.command).toBe("bun");
    expect(launch.server.args[0]).toMatch(/\/plugins\/mcp-recall\/dist\/server\.js$/);
  });
});

describe("shellWords", () => {
  it("reads back the words shellWord wrote", () => {
    const paths = [
      "/usr/local/bin/mcp-recall",
      "/Users/a b/Application Support/mcp-recall",
      "C:\\Program Files\\mcp-recall\\mcp-recall.exe",
      "C:\\Users\\me\\bin\\mcp-recall.exe",
      "/opt/it's/mcp-recall",
    ];
    for (const p of paths) {
      expect(shellWords(`${shellWord(p)} post-tool-use`)).toEqual([p, "post-tool-use"]);
      expect(shellWords(`bun ${shellWord(p)} session-start`)).toEqual(["bun", p, "session-start"]);
    }
  });
});

describe("status checks the launch that is registered, not its own (#364)", () => {
  let claudeMdPath: string;
  let npm: RecallLaunch;
  let binary: RecallLaunch;
  let bin: string;

  beforeEach(async () => {
    claudeMdPath = path.join(tmpDir, "CLAUDE.md");
    const dist = path.join(tmpDir, "dist");
    bin = path.join(tmpDir, "bin", "mcp-recall");
    for (const f of [path.join(dist, "server.js"), path.join(dist, "cli.js"), bin]) await Bun.write(f, "");
    npm = {
      cli: `bun ${path.join(dist, "cli.js")}`,
      server: { type: "stdio", command: "bun", args: [path.join(dist, "server.js")] },
      artifacts: [{ label: "dist/cli.js", path: path.join(dist, "cli.js") }],
    };
    binary = { cli: bin, server: { type: "stdio", command: bin, args: ["serve"] }, artifacts: [{ label: "binary", path: bin }] };
  });

  afterEach(() => mock.restore());

  async function statusOf(launch: RecallLaunch): Promise<string> {
    const log = spyOn(console, "log").mockImplementation(() => {});
    await statusCommand({ claudeJsonPath, settingsPath, claudeMdPath, launch });
    const out = log.mock.calls.flat().join("\n").replace(/\x1b\[[0-9;]*m/g, "");
    log.mockRestore();
    return out;
  }

  async function installAs(launch: RecallLaunch) {
    const log = spyOn(console, "log").mockImplementation(() => {});
    await installCommand({ claudeJsonPath, settingsPath, claudeMdPath, launch });
    log.mockRestore();
  }

  it("is installed when what is registered exists, with no note when it is this install", async () => {
    await installAs(npm);
    const out = await statusOf(npm);
    expect(out).toContain("Installation: installed");
    expect(out).toContain(npm.server.args[0]!);
    expect(out).not.toContain("this is");
  });

  it("is stale when the registered binary is gone, even run from an intact npm install", async () => {
    await installAs(binary);
    await rm(bin);
    const out = await statusOf(npm);
    expect(out).not.toContain("Installation: installed");
    expect(out).toContain("partial / stale");
    expect(out).toMatch(new RegExp(`✗ .*${bin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  });

  it("says which install is registered when another one runs status", async () => {
    await installAs(npm);
    const out = await statusOf(binary);
    expect(out).toContain("Installation: installed");
    expect(out).toContain("Registered: the npm install");
    expect(out).toContain(`this is the binary at ${bin}`);
  });

  it("is stale when the hooks name an install that is gone, though the server is intact", async () => {
    await installAs(npm);
    const settings = await readJsonFile(settingsPath) as any;
    settings.hooks.PostToolUse[0].hooks[0].command = "bun /gone/mcp-recall/dist/cli.js post-tool-use";
    await writeJsonFile(settingsPath, settings);
    const out = await statusOf(npm);
    expect(out).toContain("partial / stale");
    expect(out).toContain("✗ /gone/mcp-recall/dist/cli.js");
  });

  it("checks only recall's hook in a shared entry, not a neighbour that names the same event", async () => {
    await installAs(npm);
    const settings = await readJsonFile(settingsPath) as any;
    settings.hooks.PostToolUse[0].hooks.push({ type: "command", command: "/gone/notify post-tool-use" });
    await writeJsonFile(settingsPath, settings);
    const out = await statusOf(npm);
    expect(out).toContain("Installation: installed");
    expect(out).not.toContain("/gone/notify");
  });

  it("is stale when the registered bun itself is gone", async () => {
    await installAs(npm);
    const claudeJson = await readJsonFile(claudeJsonPath) as any;
    claudeJson.mcpServers.recall.command = "/gone/.bun/bin/bun";
    await writeJsonFile(claudeJsonPath, claudeJson);
    const out = await statusOf(npm);
    expect(out).toContain("partial / stale");
    expect(out).toContain("✗ /gone/.bun/bin/bun");
  });
});

describe("install / uninstall / status with a binary launch", () => {
  let binary: string;
  let claudeMdPath: string;
  let launch: RecallLaunch;
  const quiet = () => spyOn(console, "log").mockImplementation(() => {});

  beforeEach(async () => {
    binary = path.join(tmpDir, "bin", "mcp-recall");
    await Bun.write(binary, ""); // stands in for the binary; install checks it exists
    claudeMdPath = path.join(tmpDir, "CLAUDE.md");
    launch = { cli: binary, server: { type: "stdio", command: binary, args: ["serve"] }, artifacts: [{ label: "binary", path: binary }] };
  });

  afterEach(() => mock.restore());

  it("replaces an npm install's entries with the binary's", async () => {
    await writeJsonFile(claudeJsonPath, { mcpServers: { recall: { type: "stdio", command: "bun", args: [FAKE_SERVER] } } });
    await writeJsonFile(settingsPath, {
      hooks: { SessionStart: [makeSessionStartEntry(FAKE_CLI)], PostToolUse: [makePostToolUseEntry(FAKE_CLI)] },
    });
    quiet();
    await installCommand({ claudeJsonPath, settingsPath, claudeMdPath, launch });

    const claudeJson = await readJsonFile(claudeJsonPath) as any;
    const settings = await readJsonFile(settingsPath) as any;
    expect(claudeJson.mcpServers.recall).toEqual({ type: "stdio", command: binary, args: ["serve"] });
    expect(settings.hooks.SessionStart).toHaveLength(1);
    expect(settings.hooks.SessionStart[0].hooks[0].command).toBe(`${binary} session-start`);
    expect(settings.hooks.PostToolUse).toHaveLength(1);
    expect(settings.hooks.PostToolUse[0].hooks[0].command).toBe(`${binary} post-tool-use`);
  });

  it("is idempotent, and uninstall removes the binary's entries", async () => {
    const log = quiet();
    await installCommand({ claudeJsonPath, settingsPath, claudeMdPath, launch });
    log.mockClear();
    await installCommand({ claudeJsonPath, settingsPath, claudeMdPath, launch });
    expect(log.mock.calls.flat().join("\n")).toContain("MCP server already registered");
    expect(log.mock.calls.flat().join("\n")).toContain("PostToolUse hook already registered");

    await uninstallCommand({ claudeJsonPath, settingsPath, claudeMdPath });
    const claudeJson = await readJsonFile(claudeJsonPath) as any;
    const settings = await readJsonFile(settingsPath) as any;
    expect(claudeJson.mcpServers.recall).toBeUndefined();
    expect(settings.hooks.SessionStart).toEqual([]);
    expect(settings.hooks.PostToolUse).toEqual([]);
  });

  it("status reports the binary as the artifact and calls the install complete", async () => {
    const log = quiet();
    await installCommand({ claudeJsonPath, settingsPath, claudeMdPath, launch });
    log.mockClear();
    await statusCommand({ claudeJsonPath, settingsPath, claudeMdPath, launch });
    const out = log.mock.calls.flat().join("\n");
    expect(out).toContain("installed");
    expect(out).not.toContain("partial");
    expect(out).toContain(binary);
    expect(out).not.toContain("dist/server.js");
  });

  it("status calls the install stale when the registered binary is gone", async () => {
    const log = quiet();
    await installCommand({ claudeJsonPath, settingsPath, claudeMdPath, launch });
    await rm(binary);
    log.mockClear();
    await statusCommand({ claudeJsonPath, settingsPath, claudeMdPath, launch });
    expect(log.mock.calls.flat().join("\n")).toContain("partial / stale");
  });
});

describe("install keeps the user's edits to recall's entries (#365)", () => {
  let claudeMdPath: string;
  let npm: RecallLaunch;
  let binary: RecallLaunch;
  const quiet = () => spyOn(console, "log").mockImplementation(() => {});

  beforeEach(async () => {
    claudeMdPath = path.join(tmpDir, "CLAUDE.md");
    const dist = path.join(tmpDir, "dist");
    const bin = path.join(tmpDir, "bin", "mcp-recall");
    for (const f of [path.join(dist, "server.js"), path.join(dist, "cli.js"), bin]) await Bun.write(f, "");
    npm = {
      cli: `bun ${path.join(dist, "cli.js")}`,
      server: { type: "stdio", command: "bun", args: [path.join(dist, "server.js")] },
      artifacts: [{ label: "dist/cli.js", path: path.join(dist, "cli.js") }],
    };
    binary = { cli: bin, server: { type: "stdio", command: bin, args: ["serve"] }, artifacts: [{ label: "binary", path: bin }] };
  });

  afterEach(() => mock.restore());

  /** An install by `from`, then the edits a user makes to recall's entries. */
  async function editedInstall(from: RecallLaunch) {
    quiet();
    await installCommand({ claudeJsonPath, settingsPath, claudeMdPath, launch: from });
    const claudeJson = await readJsonFile(claudeJsonPath) as any;
    claudeJson.mcpServers.recall.env = { RECALL_DB_PATH: "/custom/db" };
    claudeJson.mcpServers.recall.alwaysAllow = ["recall__search"];
    await writeJsonFile(claudeJsonPath, claudeJson);
    const settings = await readJsonFile(settingsPath) as any;
    settings.hooks.SessionStart[0].hooks[0].timeout = 20;
    // Recall's PostToolUse hook is no longer first in its entry, and shares it.
    settings.hooks.PostToolUse[0].hooks.unshift({ type: "command", command: "audit-log" });
    settings.hooks.PostToolUse[0].hooks[1].timeout = 30;
    await writeJsonFile(settingsPath, settings);
  }

  for (const [name, from, to] of [["npm -> binary", () => npm, () => binary], ["binary -> npm", () => binary, () => npm]] as const) {
    it(`${name}: the server keeps its env and other fields, with the new launch`, async () => {
      await editedInstall(from());
      await installCommand({ claudeJsonPath, settingsPath, claudeMdPath, launch: to() });
      const recall = (await readJsonFile(claudeJsonPath) as any).mcpServers.recall;
      expect(recall).toEqual({ ...to().server, env: { RECALL_DB_PATH: "/custom/db" }, alwaysAllow: ["recall__search"] });
    });

    it(`${name}: hooks keep their timeout and neighbours, with the new command`, async () => {
      await editedInstall(from());
      await installCommand({ claudeJsonPath, settingsPath, claudeMdPath, launch: to() });
      const hooks = (await readJsonFile(settingsPath) as any).hooks;
      expect(hooks.SessionStart).toHaveLength(1);
      expect(hooks.SessionStart[0].hooks).toEqual([{ type: "command", command: `${to().cli} session-start`, timeout: 20 }]);
      expect(hooks.PostToolUse).toHaveLength(1);
      expect(hooks.PostToolUse[0].hooks).toEqual([
        { type: "command", command: "audit-log" },
        { type: "command", command: `${to().cli} post-tool-use`, timeout: 30 },
      ]);
    });
  }

  it("finds recall's hook when it is not first in its entry, and leaves it alone", async () => {
    await editedInstall(npm);
    const before = await Bun.file(settingsPath).text();
    const log = quiet();
    await installCommand({ claudeJsonPath, settingsPath, claudeMdPath, launch: npm });
    expect(log.mock.calls.flat().join("\n")).toContain("PostToolUse hook already registered");
    expect(await Bun.file(settingsPath).text()).toBe(before);
  });
});

describe("a binary renamed without \"recall\" in its path (#366)", () => {
  let dir: string;
  let bin: string;
  let claudeMdPath: string;
  let mr: RecallLaunch;
  let npm: RecallLaunch;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "mr-test-"));
    bin = path.join(dir, "mr");
    // Precondition: with "recall" anywhere in the path, these tests prove nothing.
    if (bin.includes("recall")) throw new Error(`renamed-binary path contains "recall": ${bin}`);
    claudeMdPath = path.join(tmpDir, "CLAUDE.md");
    const dist = path.join(tmpDir, "dist");
    for (const f of [path.join(dist, "server.js"), path.join(dist, "cli.js"), bin]) await Bun.write(f, "");
    mr = { cli: bin, server: { type: "stdio", command: bin, args: ["serve"] }, artifacts: [{ label: "binary", path: bin }] };
    npm = {
      cli: `bun ${path.join(dist, "cli.js")}`,
      server: { type: "stdio", command: "bun", args: [path.join(dist, "server.js")] },
      artifacts: [{ label: "dist/cli.js", path: path.join(dist, "cli.js") }],
    };
    spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    mock.restore();
    await rm(dir, { recursive: true, force: true });
  });

  const commands = async (event: string) =>
    ((await readJsonFile(settingsPath) as any).hooks?.[event] ?? []).map((e: any) => e.hooks.map((h: any) => h.command));

  it("installing twice leaves one hook per event", async () => {
    await installCommand({ claudeJsonPath, settingsPath, claudeMdPath, launch: mr });
    await installCommand({ claudeJsonPath, settingsPath, claudeMdPath, launch: mr });
    expect(await commands("SessionStart")).toEqual([[`${bin} session-start`]]);
    expect(await commands("PostToolUse")).toEqual([[`${bin} post-tool-use`]]);
  });

  it("install removes duplicates an earlier version left, keeping a neighbour hook", async () => {
    await writeJsonFile(claudeJsonPath, { mcpServers: { recall: mr.server } });
    await writeJsonFile(settingsPath, {
      hooks: {
        SessionStart: [makeSessionStartEntry(bin), makeSessionStartEntry(bin)],
        PostToolUse: [
          makePostToolUseEntry(bin),
          { matcher: POST_TOOL_USE_MATCHER, hooks: [{ type: "command", command: "audit-log" }, makePostToolUseEntry(bin).hooks[0]] },
        ],
      },
    });
    await installCommand({ claudeJsonPath, settingsPath, claudeMdPath, launch: mr });
    expect(await commands("SessionStart")).toEqual([[`${bin} session-start`]]);
    expect(await commands("PostToolUse")).toEqual([[`${bin} post-tool-use`], ["audit-log"]]);
  });

  it("uninstall by the renamed binary removes all its hooks, keeping a neighbour hook", async () => {
    await installCommand({ claudeJsonPath, settingsPath, claudeMdPath, launch: mr });
    const settings = await readJsonFile(settingsPath) as any;
    settings.hooks.PostToolUse[0].hooks.push({ type: "command", command: "audit-log" });
    settings.hooks.SessionStart.push(makeSessionStartEntry(bin)); // a duplicate from before the fix
    await writeJsonFile(settingsPath, settings);
    await uninstallCommand({ claudeJsonPath, settingsPath, claudeMdPath, launch: mr });
    expect(await commands("SessionStart")).toEqual([]);
    expect(await commands("PostToolUse")).toEqual([["audit-log"]]);
  });

  it("uninstall from the npm install removes the hooks of the renamed binary it finds registered", async () => {
    await installCommand({ claudeJsonPath, settingsPath, claudeMdPath, launch: mr });
    await uninstallCommand({ claudeJsonPath, settingsPath, claudeMdPath, launch: npm });
    expect((await readJsonFile(claudeJsonPath) as any).mcpServers.recall).toBeUndefined();
    expect(await commands("SessionStart")).toEqual([]);
    expect(await commands("PostToolUse")).toEqual([]);
  });
});
