import { describe, test, expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getVersion, printHelp, completionScript } from "../src/cli";

// Every subcommand dispatched by src/profiles/commands.ts. A subcommand that
// dispatches but is absent from the help text or a completion script is shipped
// but undiscoverable — the defect this list exists to catch.
const PROFILES_SUBCOMMANDS = [
  "list", "install", "update", "remove", "available", "info",
  "seed", "feed", "check", "retrain", "test",
] as const;

// Every user-facing top-level command dispatched by src/cli.ts (not the hook
// entry points or `serve`, which Claude Code runs). Same defect class as above.
const TOP_LEVEL_COMMANDS = [
  "install", "uninstall", "status", "stats", "gc", "discover",
  "profiles", "learn", "import", "completions",
] as const;

// ── getVersion ────────────────────────────────────────────────────────────────

describe("getVersion", () => {
  test("returns a semver string matching package.json", async () => {
    const version = await getVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  // #199 shipped with package.json at 1.7.0 and both plugin manifests at 1.0.0,
  // and 1.10.0 reconciled them by hand. Asserting agreement makes that class of
  // drift a test failure instead of something noticed at release time.
  test("all three manifests declare the same version", async () => {
    const read = async (p: string) =>
      (JSON.parse(await Bun.file(join(import.meta.dir, "..", p)).text()) as { version: string }).version;

    const pkg = await read("package.json");
    expect(await read(".claude-plugin/plugin.json")).toBe(pkg);
    expect(await read("plugins/mcp-recall/.claude-plugin/plugin.json")).toBe(pkg);
    expect(await getVersion()).toBe(pkg);
  });
});

// ── printHelp ─────────────────────────────────────────────────────────────────

describe("printHelp", () => {
  test("prints usage and all top-level commands", () => {
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => lines.push(args.join(" "));
    try {
      printHelp();
    } finally {
      console.log = orig;
    }
    const output = lines.join("\n");
    expect(output).toContain("Usage: mcp-recall <command>");
    for (const cmd of TOP_LEVEL_COMMANDS) {
      expect(output).toMatch(new RegExp(`^  ${cmd}\\b`, "m"));
    }
    expect(output).toContain("--help");
    expect(output).toContain("--version");
  });

  test("lists all profiles subcommands", () => {
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => lines.push(args.join(" "));
    try {
      printHelp();
    } finally {
      console.log = orig;
    }
    const output = lines.join("\n");
    for (const sub of PROFILES_SUBCOMMANDS) {
      expect(output).toContain(sub);
    }
  });
});

// ── completionScript ──────────────────────────────────────────────────────────

describe("completionScript", () => {
  test("bash script contains complete command", () => {
    const script = completionScript("bash");
    expect(script).toContain("complete -F _mcp_recall mcp-recall");
    expect(script).toContain("--machine-readable");
  });

  test("bash script includes all top-level commands", () => {
    const list = completionScript("bash").match(/local commands="([^"]+)"/)?.[1].split(" ") ?? [];
    for (const cmd of TOP_LEVEL_COMMANDS) {
      expect(list).toContain(cmd);
    }
  });

  test("zsh script includes all top-level commands", () => {
    const script = completionScript("zsh");
    for (const cmd of TOP_LEVEL_COMMANDS) {
      expect(script).toContain(`'${cmd}:`);
    }
  });

  test("bash script offers every profiles subcommand", () => {
    const script = completionScript("bash");
    const list = script.match(/profiles_cmds="([^"]+)"/)?.[1].split(" ") ?? [];
    for (const sub of PROFILES_SUBCOMMANDS) {
      expect(list).toContain(sub);
    }
  });

  test("zsh script offers every profiles subcommand", () => {
    const script = completionScript("zsh");
    for (const sub of PROFILES_SUBCOMMANDS) {
      expect(script).toContain(`'${sub}:`);
    }
  });

  test("fish script offers every profiles subcommand", () => {
    const script = completionScript("fish");
    for (const sub of PROFILES_SUBCOMMANDS) {
      expect(script).toContain(`-a ${sub} `);
    }
  });

  test("zsh script starts with #compdef", () => {
    const script = completionScript("zsh");
    expect(script).toMatch(/^#compdef mcp-recall/);
  });

  test("zsh script includes dynamic profile ID lookup", () => {
    const script = completionScript("zsh");
    expect(script).toContain("--machine-readable");
  });

  test("fish script includes all top-level commands", () => {
    const script = completionScript("fish");
    const declared = script.match(/set -l commands (.+)/)?.[1].split(" ") ?? [];
    for (const cmd of TOP_LEVEL_COMMANDS) {
      expect(declared).toContain(cmd);
      expect(script).toContain(`-a ${cmd} `);
    }
  });

  test("fish script includes dynamic profile ID lookup", () => {
    const script = completionScript("fish");
    expect(script).toContain("--machine-readable");
  });

  test("throws on unknown shell", () => {
    expect(() => completionScript("elvish")).toThrow(/Unknown shell/);
  });
});

// ── hook startup (#416) ───────────────────────────────────────────────────────

// zod 4 adds ~10 ms to every hook call when it loads, so a hook call with no config
// file must not load it. A preload plugin reports when zod's entry module loads.
describe("hook startup", () => {
  const ZOD_PROBE = `Bun.plugin({ name: "zod-probe", setup(b) {
  // Synchronous: an async onLoad makes zod an async module, which require() rejects.
  b.onLoad({ filter: /node_modules\\/zod\\/index\\.js$/ }, ({ path }) => {
    process.stderr.write("ZOD-LOADED\\n");
    return { contents: require("fs").readFileSync(path, "utf8"), loader: "js" };
  });
} });`;
  const EVENT = JSON.stringify({
    session_id: "startup", cwd: tmpdir(), hook_event_name: "PostToolUse", tool_name: "Bash",
    tool_input: { command: "echo hi" },
    tool_response: { stdout: "hi", stderr: "", interrupted: false, isImage: false },
  });

  function runHook(configToml: string | null): string {
    const dir = mkdtempSync(join(tmpdir(), "recall-startup-"));
    try {
      writeFileSync(join(dir, "probe.ts"), ZOD_PROBE);
      const configPath = join(dir, "config.toml");
      if (configToml !== null) writeFileSync(configPath, configToml);
      const proc = Bun.spawnSync(
        [process.execPath, "--preload", join(dir, "probe.ts"), join(import.meta.dir, "..", "src", "cli.ts"), "post-tool-use"],
        {
          stdin: new TextEncoder().encode(EVENT),
          env: { ...process.env, RECALL_DB_PATH: join(dir, "recall.db"), RECALL_CONFIG_PATH: configPath },
        }
      );
      expect(proc.exitCode).toBe(0);
      return proc.stderr.toString();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test("does not load zod when no config file exists", () => {
    expect(runHook(null)).not.toContain("ZOD-LOADED");
  });

  test("loads zod and warns on a bad value when a config file exists", () => {
    const stderr = runHook("[store]\nmax_size_mb = -1\n");
    expect(stderr).toContain("ZOD-LOADED");
    expect(stderr).toContain("invalid config (store.max_size_mb:");
  });

  // Bun 1.3's bundler keeps all 64 zod locales for `import { z } from "zod"`, about
  // 600 KB the hook parses on every call, and drops them for `import * as z`.
  test("bundled CLI carries no more than zod's default locale", async () => {
    const bundle = await Bun.file(join(import.meta.dir, "..", "plugins", "mcp-recall", "dist", "cli.js")).text();
    const locales = bundle.match(/^\/\/ node_modules\/zod\/v4\/locales\/[^\n]+/gm) ?? [];
    expect(locales.length).toBeLessThanOrEqual(2);
  });
});

// ── uninstall --dry-run (#490) ────────────────────────────────────────────────

// Through the real CLI, since the flag was dropped in cli.ts, not in uninstallCommand.
// Every config path points into a throwaway HOME, so no real config is touched.
describe("uninstall --dry-run", () => {
  function run(home: string, ...args: string[]) {
    const proc = Bun.spawnSync([process.execPath, join(import.meta.dir, "..", "src", "cli.ts"), ...args], {
      env: {
        ...process.env,
        HOME: home,
        XDG_CONFIG_HOME: join(home, ".config"),
        PI_CODING_AGENT_DIR: join(home, ".pi", "agent"),
      },
    });
    expect(proc.exitCode).toBe(0);
    return proc.stdout.toString();
  }

  function snapshot(home: string): Record<string, string> {
    const files = [
      ".claude.json",
      ".claude/settings.json",
      ".claude/CLAUDE.md",
      ".pi/agent/extensions/mcp-recall/index.ts",
      ".pi/agent/extensions/mcp-recall/launch.json",
      ".config/opencode/plugins/mcp-recall.ts",
      ".config/opencode/plugins/mcp-recall.launch.json",
    ];
    return Object.fromEntries(files.map((f) => [f, readFileSync(join(home, f), "utf8")]));
  }

  test("changes no file, and a real uninstall then removes them", () => {
    const home = mkdtempSync(join(tmpdir(), "recall-uninstall-dry-"));
    try {
      mkdirSync(join(home, ".pi", "agent"), { recursive: true });
      mkdirSync(join(home, ".config", "opencode"), { recursive: true });
      run(home, "install");
      const before = snapshot(home);

      const out = run(home, "uninstall", "--dry-run");
      expect(out).toContain("dry run");
      expect(snapshot(home)).toEqual(before);

      // The snapshot can see a removal: without --dry-run the same files go.
      run(home, "uninstall");
      expect(existsSync(join(home, ".pi", "agent", "extensions", "mcp-recall"))).toBe(false);
      expect(existsSync(join(home, ".config", "opencode", "plugins", "mcp-recall.ts"))).toBe(false);
      expect(readFileSync(join(home, ".claude.json"), "utf8")).not.toContain("\"recall\"");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
