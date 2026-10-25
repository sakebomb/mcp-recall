import { describe, test, expect } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
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
    expect(output).toContain("install");
    expect(output).toContain("uninstall");
    expect(output).toContain("status");
    expect(output).toContain("profiles");
    expect(output).toContain("learn");
    expect(output).toContain("completions");
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
    const script = completionScript("bash");
    for (const cmd of ["install", "uninstall", "status", "gc", "profiles", "learn", "import", "completions"]) {
      expect(script).toContain(cmd);
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
    for (const cmd of ["install", "uninstall", "status", "gc", "profiles", "learn", "import", "completions"]) {
      expect(script).toContain(`-a ${cmd}`);
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
