import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { tmpdir, homedir } from "os";
import { claudeConfigDir, claudeJsonPath, tildePath } from "../src/claude-paths";

const SRC = resolve(import.meta.dir, "../src");

describe("claude-paths", () => {
  let saved: string | undefined;
  beforeEach(() => { saved = process.env.CLAUDE_CONFIG_DIR; });
  afterEach(() => {
    if (saved === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = saved;
  });

  it("puts every file under CLAUDE_CONFIG_DIR when it is set", () => {
    process.env.CLAUDE_CONFIG_DIR = "/x/claude-alt";
    expect(claudeConfigDir()).toBe("/x/claude-alt");
    expect(claudeJsonPath()).toBe(join("/x/claude-alt", ".claude.json"));
  });

  it("keeps .claude.json in the home dir and the rest in ~/.claude when unset or empty", () => {
    for (const value of [undefined, ""]) {
      if (value === undefined) delete process.env.CLAUDE_CONFIG_DIR;
      else process.env.CLAUDE_CONFIG_DIR = value;
      expect(claudeConfigDir()).toBe(join(homedir(), ".claude"));
      expect(claudeJsonPath()).toBe(join(homedir(), ".claude.json"));
    }
  });

  it("shows the home dir as ~ only at a path boundary", () => {
    expect(tildePath(join(homedir(), ".claude-alt", "x"))).toBe("~/.claude-alt/x");
    expect(tildePath(homedir() + "-other/x")).toBe(homedir() + "-other/x");
    expect(tildePath("/elsewhere/x")).toBe("/elsewhere/x");
  });
});

// os.homedir() is read once per process, so these run the commands in a child
// with a throwaway HOME: a regression writes there, never to the real config.
describe("CLAUDE_CONFIG_DIR end to end (#494)", () => {
  let root: string;
  let home: string;
  let configDir: string;
  let artifact: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "recall-config-dir-"));
    home = join(root, "home");
    configDir = join(root, "claude-alt");
    artifact = join(root, "cli.js");
    for (const d of [home, configDir]) Bun.spawnSync(["mkdir", "-p", d]);
    writeFileSync(artifact, "");
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function run(body: string): string {
    const script = join(root, "run.ts");
    writeFileSync(script, `
      import { installCommand, uninstallCommand, statusCommand } from "${SRC}/install/index";
      import { handleLearnCommand } from "${SRC}/learn/index";
      const launch = {
        cli: "bun ${artifact}",
        server: { type: "stdio", command: "bun", args: ["${artifact}"] },
        artifacts: [{ label: "dist/cli.js", path: "${artifact}" }],
      };
      ${body}
    `);
    const proc = Bun.spawnSync(["bun", script], {
      env: { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: configDir, NO_COLOR: "1" },
    });
    const out = proc.stdout.toString() + proc.stderr.toString();
    if (proc.exitCode !== 0) throw new Error(`child failed (${proc.exitCode}):\n${out}`);
    return out.replace(/\x1b\[[0-9;]*m/g, "");
  }

  it("install writes all three files under CLAUDE_CONFIG_DIR and nothing under HOME", () => {
    run(`await installCommand({ launch, agents: ["claude"] });`);

    const claudeJson = JSON.parse(readFileSync(join(configDir, ".claude.json"), "utf8"));
    expect(claudeJson.mcpServers.recall.args).toEqual([artifact]);
    expect(readFileSync(join(configDir, "settings.json"), "utf8")).toContain("post-tool-use");
    expect(readFileSync(join(configDir, "CLAUDE.md"), "utf8")).toContain("mcp-recall");
    // Bun leaves its own ~/.bun cache in the child's HOME; nothing of Claude's may appear.
    expect(readdirSync(home).filter((f) => f.startsWith(".claude"))).toEqual([]);
  });

  it("status reads and names the CLAUDE_CONFIG_DIR files", () => {
    const out = run(`
      await installCommand({ launch, agents: ["claude"] });
      console.log("---STATUS---");
      await statusCommand({ launch });
    `).split("---STATUS---")[1]!;

    expect(out).toContain("Installation: installed");
    expect(out).toContain(join(configDir, ".claude.json"));
    expect(out).toContain(join(configDir, "settings.json"));
    expect(out).toContain(join(configDir, "CLAUDE.md"));
    expect(out).not.toContain("~/.claude");
  });

  it("uninstall removes the entries from CLAUDE_CONFIG_DIR", () => {
    run(`
      await installCommand({ launch, agents: ["claude"] });
      await uninstallCommand({ launch, agents: ["claude"] });
    `);

    const claudeJson = JSON.parse(readFileSync(join(configDir, ".claude.json"), "utf8"));
    expect(claudeJson.mcpServers?.recall).toBeUndefined();
    expect(readFileSync(join(configDir, "settings.json"), "utf8")).not.toContain("post-tool-use");
    expect(existsSync(join(home, ".claude.json"))).toBe(false);
  });

  it("learn reads the MCP servers from CLAUDE_CONFIG_DIR's .claude.json", () => {
    writeFileSync(join(configDir, ".claude.json"), JSON.stringify({ mcpServers: { "only-here": {} } }));
    const out = run(`await handleLearnCommand(["--dry-run"]);`);

    expect(out).toContain("only-here: skipped");
    expect(out).not.toContain("Could not read");
  });
});
