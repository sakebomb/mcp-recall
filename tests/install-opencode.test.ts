import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { existsSync } from "fs";
import os from "os";
import path from "path";
import { installCommand, uninstallCommand, statusCommand, detectAgents, parseAgents, type RecallLaunch } from "../src/install/index";
import { OPENCODE_PLUGIN_SOURCE, opencodePluginPath, defaultOpencodeDir } from "../src/agents/opencode";

// install / uninstall / status for OpenCode (#474). Each test gets its own Claude
// config paths, pi dir and OpenCode dir; nothing touches the real ~/.config/opencode.

let tmpDir: string;
let claude: { claudeJsonPath: string; settingsPath: string; claudeMdPath: string; pluginsPath: string };
let piDir: string;
let opencodeDir: string;
let launch: RecallLaunch;
let binary: string;
let log: ReturnType<typeof spyOn>;
const out = () => log.mock.calls.flat().join("\n");
const dirs = () => ({ ...claude, piDir, opencodeDir, launch });

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "mcp-recall-install-oc-"));
  claude = {
    claudeJsonPath: path.join(tmpDir, ".claude.json"),
    settingsPath: path.join(tmpDir, "settings.json"),
    claudeMdPath: path.join(tmpDir, "CLAUDE.md"),
    pluginsPath: path.join(tmpDir, "plugins", "installed_plugins.json"),
  };
  piDir = path.join(tmpDir, ".pi", "agent");
  opencodeDir = path.join(tmpDir, ".config", "opencode");
  binary = path.join(tmpDir, "bin", "mcp-recall");
  await Bun.write(binary, "");
  launch = { cli: binary, server: { type: "stdio", command: binary, args: ["serve"] }, artifacts: [{ label: "binary", path: binary }] };
  log = spyOn(console, "log").mockImplementation(() => {});
});

afterEach(async () => {
  mock.restore();
  await rm(tmpDir, { recursive: true, force: true });
});

const pluginFile = () => opencodePluginPath(opencodeDir);
const launchFile = () => path.join(opencodeDir, "plugins", "mcp-recall.launch.json");

describe("which agents install picks, with OpenCode", () => {
  it("adds OpenCode once its config dir exists, and accepts --agent opencode", async () => {
    expect(detectAgents(piDir, opencodeDir)).toEqual(["claude"]);
    await mkdir(opencodeDir, { recursive: true });
    expect(detectAgents(piDir, opencodeDir)).toEqual(["claude", "opencode"]);
    await mkdir(piDir, { recursive: true });
    expect(detectAgents(piDir, opencodeDir)).toEqual(["claude", "pi", "opencode"]);
    expect(parseAgents(["--agent", "opencode"])).toEqual(["opencode"]);
    expect(parseAgents(["--agent", "open-code"])).toBeNull();
  });

  it("the test preload keeps the default OpenCode dir away from the real one", () => {
    expect(defaultOpencodeDir()).not.toBe(path.join(os.homedir(), ".config", "opencode"));
    expect(existsSync(defaultOpencodeDir())).toBe(false);
  });
});

describe("install into OpenCode", () => {
  it("writes the plugin verbatim and a launch file, and never touches opencode.json", async () => {
    await mkdir(opencodeDir, { recursive: true });
    const userConfig = JSON.stringify({ mcp: { github: { type: "local", command: ["gh-mcp"] } } });
    await writeFile(path.join(opencodeDir, "opencode.json"), userConfig);
    await installCommand(dirs());

    expect(await readFile(pluginFile(), "utf8")).toBe(OPENCODE_PLUGIN_SOURCE);
    expect(JSON.parse(await readFile(launchFile(), "utf8"))).toEqual({ cli: [binary], server: { command: binary, args: ["serve"] } });
    expect(await readFile(path.join(opencodeDir, "opencode.json"), "utf8")).toBe(userConfig);
    expect(out()).toContain("OpenCode plugin added");
    expect(out()).toContain("Restart OpenCode to activate mcp-recall.");
  });

  it("writes nothing for OpenCode when it is not installed", async () => {
    await installCommand(dirs());
    expect(existsSync(opencodeDir)).toBe(false);
    expect(out()).not.toContain("OpenCode");
  });

  it("is idempotent, and --agent opencode leaves Claude Code's config alone", async () => {
    await mkdir(opencodeDir, { recursive: true });
    await installCommand({ ...dirs(), agents: ["opencode"] });
    expect(existsSync(claude.claudeJsonPath)).toBe(false);
    log.mockClear();
    await installCommand({ ...dirs(), agents: ["opencode"] });
    expect(out()).toContain("OpenCode plugin already installed");
  });
});

describe("uninstall from OpenCode", () => {
  it("removes our two files, and nothing else in the plugins dir", async () => {
    await mkdir(path.join(opencodeDir, "plugins"), { recursive: true });
    const theirs = path.join(opencodeDir, "plugins", "someone-elses.ts");
    await writeFile(theirs, "export const X = async () => ({});\n");
    await installCommand(dirs());
    await uninstallCommand(dirs());
    expect(existsSync(pluginFile())).toBe(false);
    expect(existsSync(launchFile())).toBe(false);
    expect(existsSync(theirs)).toBe(true);
    expect(out()).toContain("Removed OpenCode plugin");
  });

  it("says nothing about OpenCode to someone without it, and says so when asked by name", async () => {
    await uninstallCommand(dirs());
    expect(out()).not.toContain("OpenCode");
    await uninstallCommand({ ...dirs(), agents: ["opencode"] });
    expect(out()).toContain("OpenCode plugin not present");
  });
});

describe("status for OpenCode", () => {
  it("says nothing about OpenCode when it is absent", async () => {
    await statusCommand(dirs());
    expect(out()).not.toContain("OpenCode:");
  });

  it("reports an installed plugin and the binary it runs", async () => {
    await mkdir(opencodeDir, { recursive: true });
    await installCommand(dirs());
    log.mockClear();
    await statusCommand(dirs());
    expect(out()).toMatch(/OpenCode: .*installed/);
    expect(out()).not.toMatch(/OpenCode: .*partial/);
    expect(out()).toContain("mcp-recall.launch.json");
  });

  it("calls it stale when the plugin is another version's", async () => {
    await mkdir(opencodeDir, { recursive: true });
    await installCommand({ ...dirs(), agents: ["opencode"] });
    await writeFile(pluginFile(), "// an older plugin\n");
    log.mockClear();
    await statusCommand(dirs());
    expect(out()).toMatch(/OpenCode: .*partial \/ stale/);
    expect(out()).toContain("plugin (from another version)");
  });
});
