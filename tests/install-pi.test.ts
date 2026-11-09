import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { existsSync } from "fs";
import os from "os";
import path from "path";
import {
  installCommand, uninstallCommand, statusCommand, detectAgents, parseAgents, readJsonFile, type RecallLaunch,
} from "../src/install/index";
import { PI_EXTENSION_SOURCE, piExtensionDir, defaultPiDir } from "../src/agents/pi";

// install / uninstall / status for pi (#458). Each test gets its own Claude
// config paths and pi dir; nothing touches the real ~/.claude or ~/.pi.

let tmpDir: string;
let claude: { claudeJsonPath: string; settingsPath: string; claudeMdPath: string };
let piDir: string;
let launch: RecallLaunch;
let binary: string;
let log: ReturnType<typeof spyOn>;
const out = () => log.mock.calls.flat().join("\n");

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "mcp-recall-install-pi-"));
  claude = {
    claudeJsonPath: path.join(tmpDir, ".claude.json"),
    settingsPath: path.join(tmpDir, "settings.json"),
    claudeMdPath: path.join(tmpDir, "CLAUDE.md"),
  };
  piDir = path.join(tmpDir, ".pi", "agent");
  binary = path.join(tmpDir, "bin", "mcp-recall");
  await Bun.write(binary, ""); // stands in for the binary; install checks it exists
  launch = { cli: binary, server: { type: "stdio", command: binary, args: ["serve"] }, artifacts: [{ label: "binary", path: binary }] };
  log = spyOn(console, "log").mockImplementation(() => {});
});

afterEach(async () => {
  mock.restore();
  await rm(tmpDir, { recursive: true, force: true });
});

const extIndex = () => path.join(piExtensionDir(piDir), "index.ts");
const extLaunch = () => path.join(piExtensionDir(piDir), "launch.json");

describe("which agents install picks", () => {
  it("is Claude Code alone without pi, and both once pi's dir exists", async () => {
    expect(detectAgents(piDir)).toEqual(["claude"]);
    await mkdir(piDir, { recursive: true });
    expect(detectAgents(piDir)).toEqual(["claude", "pi"]);
  });

  it("parses --agent, comma-separated or repeated, and rejects unknown names", () => {
    expect(parseAgents(["--dry-run"])).toBeUndefined();
    expect(parseAgents(["--agent", "pi"])).toEqual(["pi"]);
    expect(parseAgents(["--agent=claude,pi"])).toEqual(["claude", "pi"]);
    expect(parseAgents(["--agent", "pi", "--agent", "pi"])).toEqual(["pi"]);
    expect(parseAgents(["--agent", "grok"])).toBeNull();
    expect(parseAgents(["--agent"])).toBeNull();
  });

  it("the test preload keeps the default pi dir away from the real one", () => {
    expect(defaultPiDir()).not.toBe(path.join(os.homedir(), ".pi", "agent"));
    expect(existsSync(defaultPiDir())).toBe(false);
  });
});

describe("install into pi", () => {
  it("writes the extension verbatim and a launch.json for this install when pi is present", async () => {
    await mkdir(piDir, { recursive: true });
    await installCommand({ ...claude, piDir, launch });

    expect(await readFile(extIndex(), "utf8")).toBe(PI_EXTENSION_SOURCE);
    expect(JSON.parse(await readFile(extLaunch(), "utf8"))).toEqual({
      cli: [binary], server: { command: binary, args: ["serve"] },
    });
    expect(out()).toContain("pi extension added");
    // Claude Code is still installed alongside.
    expect(((await readJsonFile(claude.claudeJsonPath)) as any).mcpServers.recall.command).toBe(binary);
  });

  it("writes nothing for pi when pi is not installed", async () => {
    await installCommand({ ...claude, piDir, launch });
    expect(existsSync(piDir)).toBe(false);
    expect(out()).not.toContain("pi extension");
  });

  it("splits an npm launch into argv words for the extension", async () => {
    await mkdir(piDir, { recursive: true });
    const npm: RecallLaunch = {
      cli: `bun '${path.join(tmpDir, "my dist", "cli.js")}'`,
      server: { type: "stdio", command: "bun", args: [path.join(tmpDir, "my dist", "server.js")] },
      artifacts: [],
    };
    await installCommand({ ...claude, piDir, launch: npm, agents: ["pi"] });
    expect(JSON.parse(await readFile(extLaunch(), "utf8")).cli).toEqual(["bun", path.join(tmpDir, "my dist", "cli.js")]);
  });

  it("is idempotent, and updates when the launch moves", async () => {
    await mkdir(piDir, { recursive: true });
    await installCommand({ ...claude, piDir, launch, agents: ["pi"] });
    log.mockClear();
    await installCommand({ ...claude, piDir, launch, agents: ["pi"] });
    expect(out()).toContain("pi extension already installed");

    const moved = path.join(tmpDir, "elsewhere", "mcp-recall");
    await Bun.write(moved, "");
    log.mockClear();
    await installCommand({ ...claude, piDir, agents: ["pi"],
      launch: { cli: moved, server: { type: "stdio", command: moved, args: ["serve"] }, artifacts: [] } });
    expect(out()).toContain("pi extension updated");
    expect(JSON.parse(await readFile(extLaunch(), "utf8")).cli).toEqual([moved]);
  });

  it("--agent pi leaves Claude Code's config alone, and --agent claude leaves pi alone", async () => {
    await mkdir(piDir, { recursive: true });
    await installCommand({ ...claude, piDir, launch, agents: ["pi"] });
    expect(existsSync(claude.claudeJsonPath)).toBe(false);
    expect(existsSync(claude.settingsPath)).toBe(false);

    await rm(piExtensionDir(piDir), { recursive: true });
    await installCommand({ ...claude, piDir, launch, agents: ["claude"] });
    expect(existsSync(extIndex())).toBe(false);
  });

  it("--dry-run writes nothing", async () => {
    await mkdir(piDir, { recursive: true });
    await installCommand({ ...claude, piDir, launch, agents: ["pi"], dryRun: true });
    expect(existsSync(extIndex())).toBe(false);
    expect(out()).toContain("pi extension added");
  });
});

describe("uninstall from pi", () => {
  it("removes the extension dir, and only it", async () => {
    await mkdir(path.join(piDir, "extensions", "someone-elses"), { recursive: true });
    await installCommand({ ...claude, piDir, launch });
    await uninstallCommand({ ...claude, piDir, launch });
    expect(existsSync(piExtensionDir(piDir))).toBe(false);
    expect(existsSync(path.join(piDir, "extensions", "someone-elses"))).toBe(true);
    expect(out()).toContain("Removed pi extension");
  });

  it("says so when there is nothing to remove", async () => {
    await uninstallCommand({ ...claude, piDir, launch, agents: ["pi"] });
    expect(out()).toContain("pi extension not present");
  });

  it("says nothing about pi to someone without pi", async () => {
    await uninstallCommand({ ...claude, piDir, launch });
    expect(out()).not.toContain("pi extension");
  });
});

describe("status for pi", () => {
  it("says nothing about pi when pi is absent", async () => {
    await statusCommand({ ...claude, piDir, launch });
    expect(out()).not.toContain("pi:");
  });

  it("reports an installed extension and the binary it runs", async () => {
    await mkdir(piDir, { recursive: true });
    await installCommand({ ...claude, piDir, launch });
    log.mockClear();
    await statusCommand({ ...claude, piDir, launch });
    expect(out()).toMatch(/pi: .*installed/);
    expect(out()).not.toMatch(/pi: .*partial/);
    expect(out()).toContain(binary);
  });

  it("calls it stale when the binary it runs is gone, or the extension is another version's", async () => {
    await mkdir(piDir, { recursive: true });
    await installCommand({ ...claude, piDir, launch, agents: ["pi"] });
    await rm(binary);
    log.mockClear();
    await statusCommand({ ...claude, piDir, launch });
    expect(out()).toMatch(/pi: .*partial \/ stale/);

    await Bun.write(binary, "");
    await writeFile(extIndex(), "// an older extension\n");
    log.mockClear();
    await statusCommand({ ...claude, piDir, launch });
    expect(out()).toMatch(/pi: .*partial \/ stale/);
    expect(out()).toContain("from another version");
  });

  it("reports pi as not installed when pi is present but the extension is not", async () => {
    await mkdir(piDir, { recursive: true });
    await statusCommand({ ...claude, piDir, launch });
    expect(out()).toMatch(/pi: .*not installed/);
  });
});
