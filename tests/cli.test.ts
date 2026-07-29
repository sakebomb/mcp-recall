import { describe, test, expect } from "bun:test";
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
