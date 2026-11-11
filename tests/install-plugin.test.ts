import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import path from "path";
import os from "os";
import {
  statusCommand,
  writeJsonFile,
  injectClaudeMd,
  makeSessionStartEntry,
  makePostToolUseEntry,
  findPluginInstall,
  type RecallLaunch,
} from "../src/install/index";

// A marketplace install writes no mcpServers.recall and no settings.json hooks: Claude
// Code runs the plugin's own .mcp.json and hooks.json. status must recognise it (#456).

const KEY = "mcp-recall@mcp-recall";

let tmpDir: string;
let claudeJsonPath: string;
let settingsPath: string;
let claudeMdPath: string;
let pluginsPath: string;
let piDir: string;
let installPath: string;
let launch: RecallLaunch;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "mcp-recall-plugin-test-"));
  claudeJsonPath = path.join(tmpDir, ".claude.json");
  settingsPath = path.join(tmpDir, "settings.json");
  claudeMdPath = path.join(tmpDir, "CLAUDE.md");
  pluginsPath = path.join(tmpDir, "plugins", "installed_plugins.json");
  piDir = path.join(tmpDir, "no-pi");
  installPath = path.join(tmpDir, "plugins", "cache", "mcp-recall", "mcp-recall", "1.21.0");
  const dist = path.join(tmpDir, "npm", "dist");
  launch = {
    cli: `bun ${path.join(dist, "cli.js")}`,
    server: { type: "stdio", command: "bun", args: [path.join(dist, "server.js")] },
    artifacts: [{ label: "dist/cli.js", path: path.join(dist, "cli.js") }],
  };
});

afterEach(async () => {
  mock.restore();
  await rm(tmpDir, { recursive: true, force: true });
});

/** Claude Code's registry and enabledPlugins as a marketplace install leaves them. */
async function installPlugin(opts: { enabled?: boolean; files?: boolean } = {}) {
  const { enabled = true, files = true } = opts;
  await writeJsonFile(pluginsPath, {
    version: 2,
    plugins: {
      [KEY]: [{ scope: "user", installPath, version: "1.21.0", installedAt: "2026-11-11T00:00:00.000Z" }],
    },
  });
  await writeJsonFile(settingsPath, { enabledPlugins: { [KEY]: enabled } });
  if (files) {
    await Bun.write(path.join(installPath, "dist", "server.js"), "");
    await Bun.write(path.join(installPath, "bin", "recall"), "");
  }
}

async function statusOutput(): Promise<string> {
  const log = spyOn(console, "log").mockImplementation(() => {});
  await statusCommand({ claudeJsonPath, settingsPath, claudeMdPath, pluginsPath, piDir, launch });
  const out = log.mock.calls.flat().join("\n").replace(/\x1b\[[0-9;]*m/g, "");
  log.mockRestore();
  return out;
}

describe("findPluginInstall", () => {
  it("finds a user-scope mcp-recall plugin under any marketplace name", () => {
    const registry = { version: 2, plugins: { "mcp-recall@fork": [{ scope: "user", installPath: "/p" }] } };
    expect(findPluginInstall(registry, {})).toEqual({ key: "mcp-recall@fork", installPath: "/p", enabled: true });
  });

  it("reads enabledPlugins: false as disabled", () => {
    const registry = { plugins: { [KEY]: [{ scope: "user", installPath: "/p" }] } };
    expect(findPluginInstall(registry, { enabledPlugins: { [KEY]: false } })?.enabled).toBe(false);
  });

  it("ignores other plugins, project-scope installs and shapes it does not know", () => {
    expect(findPluginInstall({ plugins: { "playwright@official": [{ scope: "user", installPath: "/p" }] } }, {})).toBeNull();
    expect(findPluginInstall({ plugins: { [KEY]: [{ scope: "local", projectPath: "/x", installPath: "/p" }] } }, {})).toBeNull();
    expect(findPluginInstall({ plugins: { [KEY]: { installPath: "/p" } } }, {})).toBeNull();
    expect(findPluginInstall({ plugins: "nope" }, {})).toBeNull();
    expect(findPluginInstall({}, {})).toBeNull();
  });
});

describe("status with a Claude Code plugin install (#456)", () => {
  it("reports an enabled plugin as installed, checks its files, and asks for no CLI install", async () => {
    await installPlugin();
    await injectClaudeMd(claudeMdPath);
    const out = await statusOutput();
    expect(out).toContain("Installation: installed");
    expect(out).toContain(`Claude Code plugin ${KEY}`);
    expect(out).toContain("✓ dist/server.js");
    expect(out).toContain("✓ bin/recall");
    expect(out).not.toContain("✗ mcpServers.recall");
    expect(out).not.toContain("Run mcp-recall install");
  });

  it("marks a plugin whose files are gone, and points at the plugin, not install", async () => {
    await installPlugin({ files: false });
    await injectClaudeMd(claudeMdPath);
    const out = await statusOutput();
    expect(out).toContain("Installation: partial / stale");
    expect(out).toContain("✗ dist/server.js");
    expect(out).toContain("claude plugin update");
    expect(out).not.toContain("Run mcp-recall install");
  });

  it("points a plugin install without the CLAUDE.md block at the docs, not at install", async () => {
    await installPlugin();
    const out = await statusOutput();
    expect(out).toContain("✗ mcp-recall instructions");
    expect(out).toContain("docs/install.md#claude-instructions");
    expect(out).not.toContain("Run mcp-recall install");
  });

  it("says a disabled plugin is disabled and checks the CLI install as before", async () => {
    await installPlugin({ enabled: false });
    const out = await statusOutput();
    expect(out).toContain(`Claude Code plugin ${KEY}: disabled`);
    expect(out).toContain("Installation: not installed");
    expect(out).toContain("✗ mcpServers.recall");
  });

  it("warns when the plugin and a CLI install are both registered", async () => {
    await installPlugin();
    await writeJsonFile(claudeJsonPath, { mcpServers: { recall: launch.server } });
    await writeJsonFile(settingsPath, {
      enabledPlugins: { [KEY]: true },
      hooks: { SessionStart: [makeSessionStartEntry(launch.cli)], PostToolUse: [makePostToolUseEntry(launch.cli)] },
    });
    const out = await statusOutput();
    expect(out).toContain("registered twice");
    expect(out).toContain("mcp-recall uninstall");
    expect(out).toContain(`claude plugin uninstall ${KEY}`);
  });

  it("is unchanged with no plugin registry, or one it cannot parse", async () => {
    expect(await statusOutput()).toContain("Installation: not installed");
    await Bun.write(pluginsPath, "{ not json");
    const out = await statusOutput();
    expect(out).toContain("Installation: not installed");
    expect(out).not.toContain("Claude Code plugin");
  });
});
