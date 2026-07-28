import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { patternsOverlap, testProfile, cmdList, cmdInstall, cmdRemove, cmdAvailable, verifyManifest } from "../src/profiles/commands";
import { SIGNER_IDENTITY, COMMUNITY_REPO, fetchManifest } from "../src/profiles/shared";
import { clearProfileCache, getShortName } from "../src/profiles/loader";
import { resetConfig } from "../src/config";

let configDir: string | null = null;

/**
 * Pins `profiles.verify_signature` for a block, so no test's outcome depends on
 * the ambient `~/.config/mcp-recall/config.toml` of whoever runs the suite.
 *
 * `"skip"` is for blocks that stub `fetch` with a fixture manifest: such a
 * manifest is unattested by construction, so leaving verification on made
 * `verifyManifest` shell out to a real `gh attestation verify` — a live network
 * call per case whose result depended on the real profiles repo's attestation
 * state. Verification itself is covered by the `verifyManifest` block, and that
 * `fetchManifest` invokes it at all by `describe("fetchManifest")`, which pins
 * `"warn"` for the same don't-trust-ambient-config reason.
 *
 * Also resets the module-level config cache in `src/config.ts`, which is shared
 * across test files in Bun's single process.
 */
function writeConfig(mode: "warn" | "error" | "skip"): void {
  configDir = mkdtempSync(join(tmpdir(), "recall-cfg-"));
  const path = join(configDir, "config.toml");
  writeFileSync(path, `[profiles]\nverify_signature = "${mode}"\n`, "utf8");
  process.env.RECALL_CONFIG_PATH = path;
  resetConfig();
}

function restoreConfig(): void {
  delete process.env.RECALL_CONFIG_PATH;
  resetConfig();
  if (configDir) {
    rmSync(configDir, { recursive: true, force: true });
    configDir = null;
  }
}

// ── patternsOverlap ───────────────────────────────────────────────────────────

describe("patternsOverlap", () => {
  test("two identical exact patterns overlap", () => {
    expect(patternsOverlap("mcp__jira__search", "mcp__jira__search")).toBe(true);
  });

  test("two different exact patterns do not overlap", () => {
    expect(patternsOverlap("mcp__jira__search", "mcp__jira__create")).toBe(false);
  });

  test("exact pattern overlaps with matching wildcard", () => {
    expect(patternsOverlap("mcp__jira__search", "mcp__jira__*")).toBe(true);
  });

  test("exact pattern does not overlap with non-matching wildcard", () => {
    expect(patternsOverlap("mcp__notion__search", "mcp__jira__*")).toBe(false);
  });

  test("two wildcards with same prefix overlap", () => {
    expect(patternsOverlap("mcp__jira__*", "mcp__jira__*")).toBe(true);
  });

  test("two wildcards where one is a prefix of the other overlap", () => {
    expect(patternsOverlap("mcp__jira__*", "mcp__jira__search*")).toBe(true);
  });

  test("two wildcards with completely different prefixes do not overlap", () => {
    expect(patternsOverlap("mcp__jira__*", "mcp__notion__*")).toBe(false);
  });
});

// ── testProfile ───────────────────────────────────────────────────────────────

describe("testProfile", () => {
  let userDir: string;

  beforeEach(() => {
    userDir = mkdtempSync(join(tmpdir(), "recall-test-"));
    clearProfileCache();
    process.env.RECALL_USER_PROFILES_PATH = userDir;
    process.env.RECALL_COMMUNITY_PROFILES_PATH = join(tmpdir(), "nonexistent-c");
    process.env.RECALL_BUNDLED_PROFILES_PATH = join(tmpdir(), "nonexistent-b");
  });

  afterEach(() => {
    rmSync(userDir, { recursive: true, force: true });
    delete process.env.RECALL_USER_PROFILES_PATH;
    delete process.env.RECALL_COMMUNITY_PROFILES_PATH;
    delete process.env.RECALL_BUNDLED_PROFILES_PATH;
    clearProfileCache();
  });

  test("matches loaded profile when tool name matches pattern", () => {
    writeFileSync(
      join(userDir, "jira.toml"),
      `[profile]
id = "mcp__jira"
version = "1.0.0"
description = "Jira"
mcp_pattern = "mcp__jira__*"
[strategy]
type = "json_extract"
fields = ["key", "summary"]`
    );

    const content = JSON.stringify({
      key: "PROJ-123",
      summary: "Fix login bug",
      description: "Long description that should be dropped by the extractor",
    });
    const result = testProfile("mcp__jira__search_issues", content);

    expect(result.toolName).toBe("mcp__jira__search_issues");
    expect(result.matchedProfile).not.toBeNull();
    expect(result.matchedProfile!.spec.profile.id).toBe("mcp__jira");
    expect(result.inputBytes).toBeGreaterThan(0);
    expect(result.outputBytes).toBeGreaterThan(0);
    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(0);
  });

  test("returns null matchedProfile when no profile matches", () => {
    const content = JSON.stringify({ foo: "bar" });
    const result = testProfile("mcp__unknown__no_match_here", content);

    expect(result.toolName).toBe("mcp__unknown__no_match_here");
    expect(result.matchedProfile).toBeNull();
    expect(typeof result.handlerName).toBe("string");
    expect(result.handlerName.length).toBeGreaterThan(0);
    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(0);
  });

  test("reductionPct is 0 when originalSize is 0", () => {
    const result = testProfile("mcp__unknown__tool", "");
    expect(result.reductionPct).toBe(0);
  });

  test("inputBytes and outputBytes are non-negative integers", () => {
    const content = JSON.stringify({ message: "hello world", count: 42 });
    const result = testProfile("mcp__unknown__tool", content);

    expect(result.inputBytes).toBeGreaterThanOrEqual(0);
    expect(result.outputBytes).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result.inputBytes)).toBe(true);
    expect(Number.isInteger(result.outputBytes)).toBe(true);
  });
});

// ── cmdCheck via loadProfiles integration ─────────────────────────────────────

describe("profile conflict detection", () => {
  let userDir: string;

  beforeEach(() => {
    userDir = mkdtempSync(join(tmpdir(), "recall-cmd-"));
    clearProfileCache();
    process.env.RECALL_USER_PROFILES_PATH = userDir;
    process.env.RECALL_COMMUNITY_PROFILES_PATH = join(tmpdir(), "nonexistent-c");
    process.env.RECALL_BUNDLED_PROFILES_PATH = join(tmpdir(), "nonexistent-b");
  });

  afterEach(() => {
    rmSync(userDir, { recursive: true, force: true });
    delete process.env.RECALL_USER_PROFILES_PATH;
    delete process.env.RECALL_COMMUNITY_PROFILES_PATH;
    delete process.env.RECALL_BUNDLED_PROFILES_PATH;
    clearProfileCache();
  });

  test("no conflicts when profiles have non-overlapping patterns", () => {
    writeFileSync(
      join(userDir, "jira.toml"),
      `[profile]
id = "mcp__jira"
version = "1.0.0"
description = "Jira"
mcp_pattern = "mcp__jira__*"
[strategy]
type = "json_extract"
fields = ["key"]`
    );
    writeFileSync(
      join(userDir, "notion.toml"),
      `[profile]
id = "mcp__notion"
version = "1.0.0"
description = "Notion"
mcp_pattern = "mcp__notion__*"
[strategy]
type = "text_truncate"`
    );

    const { loadProfiles } = require("../src/profiles/loader");
    const { patternsOverlap } = require("../src/profiles/commands");
    const profiles = loadProfiles();
    expect(profiles).toHaveLength(2);

    // No conflicts: jira vs notion don't overlap
    const a = profiles[0]!;
    const b = profiles[1]!;
    const overlap = a.patterns.some((pa: string) =>
      b.patterns.some((pb: string) => patternsOverlap(pa, pb))
    );
    expect(overlap).toBe(false);
  });

  test("detects conflict when two profiles in same tier have overlapping patterns", () => {
    writeFileSync(
      join(userDir, "jira-broad.toml"),
      `[profile]
id = "mcp__jira"
version = "1.0.0"
description = "Jira broad"
mcp_pattern = "mcp__jira__*"
[strategy]
type = "json_extract"
fields = ["key"]`
    );
    writeFileSync(
      join(userDir, "jira-narrow.toml"),
      `[profile]
id = "mcp__jira__search"
version = "1.0.0"
description = "Jira search only"
mcp_pattern = "mcp__jira__search*"
[strategy]
type = "text_truncate"`
    );

    const { loadProfiles } = require("../src/profiles/loader");
    const { patternsOverlap } = require("../src/profiles/commands");
    const profiles = loadProfiles();
    expect(profiles).toHaveLength(2);

    const a = profiles[0]!;
    const b = profiles[1]!;
    const overlap = a.patterns.some((pa: string) =>
      b.patterns.some((pb: string) => patternsOverlap(pa, pb))
    );
    expect(overlap).toBe(true);
  });
});

// ── cmdList --machine-readable ────────────────────────────────────────────────

describe("cmdList --machine-readable", () => {
  let userDir: string;

  beforeEach(() => {
    userDir = mkdtempSync(join(tmpdir(), "recall-cmdlist-"));
    clearProfileCache();
    process.env.RECALL_USER_PROFILES_PATH = userDir;
    process.env.RECALL_COMMUNITY_PROFILES_PATH = join(tmpdir(), "nonexistent-c");
    process.env.RECALL_BUNDLED_PROFILES_PATH = join(tmpdir(), "nonexistent-b");
  });

  afterEach(() => {
    rmSync(userDir, { recursive: true, force: true });
    delete process.env.RECALL_USER_PROFILES_PATH;
    delete process.env.RECALL_COMMUNITY_PROFILES_PATH;
    delete process.env.RECALL_BUNDLED_PROFILES_PATH;
    clearProfileCache();
  });

  test("prints bare profile IDs one per line", () => {
    // cmdList imported at top

    writeFileSync(
      join(userDir, "jira.toml"),
      `[profile]
id = "mcp__jira"
version = "1.0.0"
description = "Jira"
mcp_pattern = "mcp__jira__*"
[strategy]
type = "text_truncate"`
    );
    writeFileSync(
      join(userDir, "grafana.toml"),
      `[profile]
id = "mcp__grafana"
version = "1.0.0"
description = "Grafana"
mcp_pattern = "mcp__grafana__*"
[strategy]
type = "text_truncate"`
    );

    const lines: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown) => {
      if (typeof chunk === "string") lines.push(chunk);
      return true;
    };
    try {
      clearProfileCache();
      cmdList(["--machine-readable"]);
    } finally {
      process.stdout.write = orig;
    }

    const output = lines.join("");
    const ids = output.trim().split("\n");
    // short names (mcp__ prefix stripped)
    expect(ids).toContain("jira");
    expect(ids).toContain("grafana");
    // No extra formatting — each line is just a short name
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9_-]+$/);
    }
  });

  test("outputs nothing when no profiles installed", () => {
    // cmdList imported at top

    const lines: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown) => {
      if (typeof chunk === "string") lines.push(chunk);
      return true;
    };
    try {
      clearProfileCache();
      cmdList(["--machine-readable"]);
    } finally {
      process.stdout.write = orig;
    }

    expect(lines.join("").trim()).toBe("");
  });
});

// ── cmdSeed --all ─────────────────────────────────────────────────────────────

describe("cmdSeed --all", () => {
  let communityDir: string;
  let originalFetch: typeof globalThis.fetch;

  const fakeManifest = {
    profiles: [
      {
        id: "mcp__grafana",
        version: "1.0.0",
        description: "Grafana",
        mcp_pattern: "mcp__grafana__*",
        file: "profiles/mcp__grafana/default.toml",
        sha256: undefined,
      },
      {
        id: "mcp__jira",
        version: "1.0.0",
        description: "Jira",
        mcp_pattern: "mcp__jira__*",
        file: "profiles/mcp__jira/default.toml",
        sha256: undefined,
      },
    ],
  };

  const fakeToml = (id: string) => `[profile]
id = "${id}"
version = "1.0.0"
description = "Test"
mcp_pattern = "${id}__*"
[strategy]
type = "text_truncate"`;

  beforeEach(() => {
    communityDir = mkdtempSync(join(tmpdir(), "recall-seed-"));
    clearProfileCache();
    process.env.RECALL_COMMUNITY_PROFILES_PATH = communityDir;
    writeConfig("skip");
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      const u = url.toString();
      if (u.includes("manifest.json")) {
        return new Response(JSON.stringify(fakeManifest), { status: 200 });
      }
      if (u.includes("mcp__grafana")) {
        return new Response(fakeToml("mcp__grafana"), { status: 200 });
      }
      if (u.includes("mcp__jira")) {
        return new Response(fakeToml("mcp__jira"), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    rmSync(communityDir, { recursive: true, force: true });
    delete process.env.RECALL_COMMUNITY_PROFILES_PATH;
    clearProfileCache();
    globalThis.fetch = originalFetch;
    restoreConfig();
  });

  test("installs all profiles from manifest when --all is passed", async () => {
    const { cmdSeed } = require("../src/profiles/commands");
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => lines.push(args.join(" "));
    try {
      await cmdSeed(["--all"]);
    } finally {
      console.log = orig;
    }
    const output = lines.join("\n");
    expect(output).toContain("mcp__grafana installed");
    expect(output).toContain("mcp__jira installed");
    expect(output).toContain("2 profile(s) installed");
    expect(output).toContain("0 already installed");
    expect(output).toContain("2 total available");

    // Files should exist on disk
    const { existsSync } = require("fs");
    expect(existsSync(join(communityDir, "mcp__grafana", "default.toml"))).toBe(true);
    expect(existsSync(join(communityDir, "mcp__jira", "default.toml"))).toBe(true);
  });

  test("skips already-installed profiles and reports them in summary", async () => {
    // Pre-install grafana
    mkdirSync(join(communityDir, "mcp__grafana"), { recursive: true });
    writeFileSync(join(communityDir, "mcp__grafana", "default.toml"), fakeToml("mcp__grafana"));

    const { cmdSeed } = require("../src/profiles/commands");
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => lines.push(args.join(" "));
    try {
      clearProfileCache();
      await cmdSeed(["--all"]);
    } finally {
      console.log = orig;
    }
    const output = lines.join("\n");
    expect(output).toContain("mcp__grafana: already installed");
    expect(output).toContain("mcp__jira installed");
    expect(output).toContain("1 profile(s) installed");
    expect(output).toContain("1 already installed");
  });

  test("--all installs profiles without reading claude.json (no Detected MCPs line)", async () => {
    const { cmdSeed } = require("../src/profiles/commands");
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => lines.push(args.join(" "));
    try {
      clearProfileCache();
      await cmdSeed(["--all"]);
    } finally {
      console.log = orig;
    }
    const output = lines.join("\n");
    // --all skips MCP detection entirely
    expect(output).not.toContain("Detected MCPs");
    // Both profiles installed
    expect(output).toContain("2 profile(s) installed");
  });
});

// ── getShortName ──────────────────────────────────────────────────────────────

describe("getShortName", () => {
  test("strips mcp__ prefix when no short_name set", () => {
    const spec = { profile: { id: "mcp__grafana", version: "1.0.0", description: "", mcp_pattern: "" } };
    expect(getShortName(spec)).toBe("grafana");
  });

  test("uses explicit short_name when set", () => {
    const spec = { profile: { id: "mcp__grafana", short_name: "graf", version: "1.0.0", description: "", mcp_pattern: "" } };
    expect(getShortName(spec)).toBe("graf");
  });

  test("leaves ids without mcp__ prefix unchanged", () => {
    const spec = { profile: { id: "custom_profile", version: "1.0.0", description: "", mcp_pattern: "" } };
    expect(getShortName(spec)).toBe("custom_profile");
  });
});

// ── cmdList short names ───────────────────────────────────────────────────────

describe("cmdList short names", () => {
  let userDir: string;

  beforeEach(() => {
    userDir = mkdtempSync(join(tmpdir(), "recall-list-sn-"));
    clearProfileCache();
    process.env.RECALL_USER_PROFILES_PATH = userDir;
    process.env.RECALL_COMMUNITY_PROFILES_PATH = join(tmpdir(), "nonexistent-c");
    process.env.RECALL_BUNDLED_PROFILES_PATH = join(tmpdir(), "nonexistent-b");
  });

  afterEach(() => {
    rmSync(userDir, { recursive: true, force: true });
    delete process.env.RECALL_USER_PROFILES_PATH;
    delete process.env.RECALL_COMMUNITY_PROFILES_PATH;
    delete process.env.RECALL_BUNDLED_PROFILES_PATH;
    clearProfileCache();
  });

  test("table output shows short name column (not full id)", () => {
    writeFileSync(
      join(userDir, "jira.toml"),
      `[profile]
id = "mcp__jira"
version = "1.0.0"
description = "Jira issues"
mcp_pattern = "mcp__jira__*"
[strategy]
type = "text_truncate"`
    );

    const lines: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => lines.push(args.join(" "));
    try {
      clearProfileCache();
      cmdList([]);
    } finally {
      console.log = orig;
    }

    const output = lines.join("\n");
    expect(output).toContain("jira");
    expect(output).toContain("Jira issues");
    // Full id should not appear as a table row value
    expect(output).not.toContain("mcp__jira  ");
  });

  test("explicit short_name appears in table output", () => {
    writeFileSync(
      join(userDir, "g.toml"),
      `[profile]
id = "mcp__grafana"
short_name = "gf"
version = "1.0.0"
description = "Grafana"
mcp_pattern = "mcp__grafana__*"
[strategy]
type = "text_truncate"`
    );

    const lines: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => lines.push(args.join(" "));
    try {
      clearProfileCache();
      cmdList([]);
    } finally {
      console.log = orig;
    }

    expect(lines.join("\n")).toContain("gf");
  });
});

// ── cmdInstall + cmdRemove short name resolution ──────────────────────────────

describe("cmdInstall short name resolution", () => {
  let communityDir: string;
  let originalFetch: typeof globalThis.fetch;

  const fakeManifest = {
    profiles: [
      {
        id: "mcp__grafana",
        short_name: "grafana",
        version: "1.0.0",
        description: "Grafana",
        mcp_pattern: "mcp__grafana__*",
        file: "profiles/mcp__grafana/default.toml",
        mcp_url: "https://github.com/grafana/mcp-grafana",
      },
    ],
  };

  const fakeToml = `[profile]
id = "mcp__grafana"
version = "1.0.0"
description = "Grafana"
mcp_pattern = "mcp__grafana__*"
[strategy]
type = "text_truncate"`;

  beforeEach(() => {
    communityDir = mkdtempSync(join(tmpdir(), "recall-install-sn-"));
    clearProfileCache();
    process.env.RECALL_COMMUNITY_PROFILES_PATH = communityDir;
    writeConfig("skip");
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      const u = url.toString();
      if (u.includes("manifest.json")) return new Response(JSON.stringify(fakeManifest), { status: 200 });
      if (u.includes("mcp__grafana")) return new Response(fakeToml, { status: 200 });
      return new Response("not found", { status: 404 });
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    rmSync(communityDir, { recursive: true, force: true });
    delete process.env.RECALL_COMMUNITY_PROFILES_PATH;
    clearProfileCache();
    globalThis.fetch = originalFetch;
    restoreConfig();
  });

  test("installs profile by short name", async () => {
    // cmdInstall imported at top
    await cmdInstall(["grafana"]);
    expect(existsSync(join(communityDir, "mcp__grafana", "default.toml"))).toBe(true);
  });

  test("installs profile by full id", async () => {
    // cmdInstall imported at top
    await cmdInstall(["mcp__grafana"]);
    expect(existsSync(join(communityDir, "mcp__grafana", "default.toml"))).toBe(true);
  });
});

describe("cmdRemove short name resolution", () => {
  let communityDir: string;

  const fakeToml = `[profile]
id = "mcp__grafana"
version = "1.0.0"
description = "Grafana"
mcp_pattern = "mcp__grafana__*"
[strategy]
type = "text_truncate"`;

  beforeEach(() => {
    communityDir = mkdtempSync(join(tmpdir(), "recall-remove-sn-"));
    clearProfileCache();
    process.env.RECALL_COMMUNITY_PROFILES_PATH = communityDir;
    process.env.RECALL_USER_PROFILES_PATH = join(tmpdir(), "nonexistent-u");
    process.env.RECALL_BUNDLED_PROFILES_PATH = join(tmpdir(), "nonexistent-b");
    mkdirSync(join(communityDir, "mcp__grafana"), { recursive: true });
    writeFileSync(join(communityDir, "mcp__grafana", "default.toml"), fakeToml);
  });

  afterEach(() => {
    rmSync(communityDir, { recursive: true, force: true });
    delete process.env.RECALL_COMMUNITY_PROFILES_PATH;
    delete process.env.RECALL_USER_PROFILES_PATH;
    delete process.env.RECALL_BUNDLED_PROFILES_PATH;
    clearProfileCache();
  });

  test("removes profile by short name", () => {
    // cmdRemove imported at top
    clearProfileCache();
    cmdRemove(["grafana"]);
    expect(existsSync(join(communityDir, "mcp__grafana", "default.toml"))).toBe(false);
  });

  test("removes profile by full id", () => {
    // cmdRemove imported at top
    clearProfileCache();
    cmdRemove(["mcp__grafana"]);
    expect(existsSync(join(communityDir, "mcp__grafana", "default.toml"))).toBe(false);
  });
});

// ── cmdAvailable ──────────────────────────────────────────────────────────────

describe("cmdAvailable", () => {
  let communityDir: string;
  let originalFetch: typeof globalThis.fetch;

  const fakeManifest = {
    profiles: [
      {
        id: "mcp__grafana",
        short_name: "grafana",
        version: "1.0.0",
        description: "Grafana dashboards and alerts",
        mcp_pattern: "mcp__grafana__*",
        file: "profiles/mcp__grafana/default.toml",
        mcp_url: "https://github.com/grafana/mcp-grafana",
        author: "sakebomb",
      },
      {
        id: "mcp__jira",
        short_name: "jira",
        version: "1.0.0",
        description: "Jira issue tracking",
        mcp_pattern: "mcp__jira__*",
        file: "profiles/mcp__jira/default.toml",
        mcp_url: "https://github.com/atlassian/jira-mcp",
        author: "atlassian",
      },
    ],
  };

  const fakeToml = (id: string) => `[profile]
id = "${id}"
version = "1.0.0"
description = "Test"
mcp_pattern = "${id}__*"
[strategy]
type = "text_truncate"`;

  beforeEach(() => {
    communityDir = mkdtempSync(join(tmpdir(), "recall-avail-"));
    clearProfileCache();
    process.env.RECALL_COMMUNITY_PROFILES_PATH = communityDir;
    writeConfig("skip");
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      const u = url.toString();
      if (u.includes("manifest.json")) return new Response(JSON.stringify(fakeManifest), { status: 200 });
      return new Response("not found", { status: 404 });
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    rmSync(communityDir, { recursive: true, force: true });
    delete process.env.RECALL_COMMUNITY_PROFILES_PATH;
    clearProfileCache();
    globalThis.fetch = originalFetch;
    restoreConfig();
  });

  test("lists all profiles with short names", async () => {
    // cmdAvailable imported at top
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => lines.push(args.join(" "));
    try {
      await cmdAvailable([]);
    } finally {
      console.log = orig;
    }
    const output = lines.join("\n");
    expect(output).toContain("grafana");
    expect(output).toContain("jira");
    expect(output).toContain("2 available, 0 installed");
  });

  test("marks installed profiles", async () => {
    // Pre-install grafana
    mkdirSync(join(communityDir, "mcp__grafana"), { recursive: true });
    writeFileSync(join(communityDir, "mcp__grafana", "default.toml"), fakeToml("mcp__grafana"));

    // cmdAvailable imported at top
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => lines.push(args.join(" "));
    try {
      clearProfileCache();
      await cmdAvailable([]);
    } finally {
      console.log = orig;
    }
    const output = lines.join("\n");
    expect(output).toContain("installed");
    expect(output).toContain("2 available, 1 installed");
  });

  test("--verbose shows mcp_url column", async () => {
    // cmdAvailable imported at top
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => lines.push(args.join(" "));
    try {
      await cmdAvailable(["--verbose"]);
    } finally {
      console.log = orig;
    }
    const output = lines.join("\n");
    expect(output).toContain("https://github.com/grafana/mcp-grafana");
    expect(output).toContain("MCP URL");
  });
});

// ── fetchManifest → verifyManifest wiring ─────────────────────────────────────

describe("fetchManifest", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    // Pinned, not ambient: without this the block reads the runner's real
    // ~/.config/mcp-recall/config.toml, and anyone who set verify_signature =
    // "skip" — the documented escape hatch — would see this test fail.
    writeConfig("warn");
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string | URL | Request) =>
      new Response(JSON.stringify({ profiles: [] }), { status: 200 })) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    restoreConfig();
  });

  // The blocks above deliberately configure verify_signature = "skip" so they stay
  // hermetic. This is what stops that from silently becoming "verification is never
  // exercised from the real call path": if fetchManifest stopped calling
  // verifyManifest, nothing else in the suite would notice.
  test("verifies the manifest by default", async () => {
    const commands: string[][] = [];
    const spy = spyOn(Bun, "spawnSync").mockImplementation((cmd: unknown, ..._rest: unknown[]) => {
      commands.push(cmd as string[]);
      return { exitCode: 0, stderr: new Uint8Array(), stdout: new Uint8Array(), success: true } as ReturnType<typeof Bun.spawnSync>;
    });

    try {
      await fetchManifest();
    } finally {
      spy.mockRestore();
    }

    const verify = commands.find((c) => c[1] === "attestation");
    expect(verify).toBeDefined();
    expect(verify!.slice(0, 3)).toEqual(["gh", "attestation", "verify"]);
    expect(verify).toContain("--cert-identity");
  });

  test("skips verification when skipVerify is passed", async () => {
    let calls = 0;
    const spy = spyOn(Bun, "spawnSync").mockImplementation((..._args: unknown[]) => {
      calls++;
      return { exitCode: 0, stderr: new Uint8Array(), stdout: new Uint8Array(), success: true } as ReturnType<typeof Bun.spawnSync>;
    });

    try {
      await fetchManifest(true);
    } finally {
      spy.mockRestore();
    }

    // Counted into a local rather than asserted via `expect(spy)`: mockRestore()
    // clears the spy's own call record, so asserting on it after the finally
    // block passes whether or not gh was ever invoked.
    expect(calls).toBe(0);
  });
});

// ── verifyManifest ────────────────────────────────────────────────────────────

describe("verifyManifest", () => {
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = join(tmpdir(), `test-manifest-${process.pid}.json`);
    writeFileSync(tmpFile, JSON.stringify({ profiles: [] }), "utf8");
  });

  afterEach(() => {
    try { rmSync(tmpFile); } catch { /* already gone */ }
  });

  test("skip mode does nothing regardless of gh availability", () => {
    const spy = spyOn(Bun, "spawnSync");
    verifyManifest(tmpFile, "skip");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("warn mode warns to stderr when gh exits non-zero", () => {
    const spy = spyOn(Bun, "spawnSync").mockImplementation((cmd: unknown, ..._rest: unknown[]) => {
      const args = cmd as string[];
      // probe passes, attestation verify fails
      if (args[1] === "--version") return { exitCode: 0, stderr: new Uint8Array(), stdout: new Uint8Array(), success: true } as ReturnType<typeof Bun.spawnSync>;
      return { exitCode: 1, stderr: new TextEncoder().encode("error: no attestation found"), stdout: new Uint8Array(), success: false } as ReturnType<typeof Bun.spawnSync>;
    });

    const stderrLines: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (msg: string | Uint8Array, ..._rest: unknown[]) => {
      stderrLines.push(typeof msg === "string" ? msg : new TextDecoder().decode(msg));
      return true;
    };

    try {
      verifyManifest(tmpFile, "warn");
    } finally {
      process.stderr.write = origWrite;
      spy.mockRestore();
    }

    expect(stderrLines.join("")).toContain("[recall] manifest signature verification failed");
  });

  test("warn mode does not throw when gh exits non-zero", () => {
    const spy = spyOn(Bun, "spawnSync").mockImplementation((cmd: unknown, ..._rest: unknown[]) => {
      const args = cmd as string[];
      if (args[1] === "--version") return { exitCode: 0, stderr: new Uint8Array(), stdout: new Uint8Array(), success: true } as ReturnType<typeof Bun.spawnSync>;
      return { exitCode: 1, stderr: new Uint8Array(), stdout: new Uint8Array(), success: false } as ReturnType<typeof Bun.spawnSync>;
    });

    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = () => true;

    try {
      expect(() => verifyManifest(tmpFile, "warn")).not.toThrow();
    } finally {
      process.stderr.write = origWrite;
      spy.mockRestore();
    }
  });

  test("error mode throws when gh exits non-zero", () => {
    const spy = spyOn(Bun, "spawnSync").mockImplementation((cmd: unknown, ..._rest: unknown[]) => {
      const args = cmd as string[];
      if (args[1] === "--version") return { exitCode: 0, stderr: new Uint8Array(), stdout: new Uint8Array(), success: true } as ReturnType<typeof Bun.spawnSync>;
      return { exitCode: 1, stderr: new TextEncoder().encode("verification failed"), stdout: new Uint8Array(), success: false } as ReturnType<typeof Bun.spawnSync>;
    });

    try {
      expect(() => verifyManifest(tmpFile, "error")).toThrow(
        /manifest signature verification failed/
      );
    } finally {
      spy.mockRestore();
    }
  });

  test("warn mode warns to stderr when gh is not in PATH", () => {
    const spy = spyOn(Bun, "spawnSync").mockImplementation((..._args: unknown[]) => {
      throw new Error("spawn ENOENT");
    });

    const stderrLines: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (msg: string | Uint8Array, ..._rest: unknown[]) => {
      stderrLines.push(typeof msg === "string" ? msg : new TextDecoder().decode(msg));
      return true;
    };

    try {
      verifyManifest(tmpFile, "warn");
    } finally {
      process.stderr.write = origWrite;
      spy.mockRestore();
    }

    expect(stderrLines.join("")).toContain("gh CLI not found");
  });

  test("error mode does not throw when gh is not in PATH (degrade gracefully)", () => {
    const spy = spyOn(Bun, "spawnSync").mockImplementation((..._args: unknown[]) => {
      throw new Error("spawn ENOENT");
    });

    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = () => true;

    try {
      expect(() => verifyManifest(tmpFile, "error")).not.toThrow();
    } finally {
      process.stderr.write = origWrite;
      spy.mockRestore();
    }
  });

  test("pins the exact signer identity, not just the repo", () => {
    let verifyArgs: string[] = [];
    const spy = spyOn(Bun, "spawnSync").mockImplementation((cmd: unknown, ..._rest: unknown[]) => {
      const args = cmd as string[];
      if (args[1] !== "--version") verifyArgs = args;
      return { exitCode: 0, stderr: new Uint8Array(), stdout: new Uint8Array(), success: true } as ReturnType<typeof Bun.spawnSync>;
    });

    try {
      verifyManifest(tmpFile, "warn");
    } finally {
      spy.mockRestore();
    }

    // Repo scope alone accepts an attestation from any workflow in the repo.
    const flagIdx = verifyArgs.indexOf("--cert-identity");
    expect(flagIdx).toBeGreaterThan(-1);
    expect(verifyArgs[flagIdx + 1]).toBe(SIGNER_IDENTITY);

    // Shape, not a second copy of the literal, so renaming COMMUNITY_REPO doesn't
    // break a test that is really asserting format. `--cert-identity` matches the
    // whole SAN exactly, so a bare path or a missing @ref would never match.
    expect(SIGNER_IDENTITY).toStartWith(`https://github.com/${COMMUNITY_REPO}/`);
    expect(SIGNER_IDENTITY).toMatch(
      /^https:\/\/github\.com\/[^/]+\/[^/]+\/\.github\/workflows\/[\w.-]+\.ya?ml@refs\/heads\/[\w.-]+$/
    );
  });

  // "unknown flag" is gh too old for --cert-identity; "unknown command" is gh < 2.49,
  // which has no `attestation` subcommand at all. Same remedy, so same branch.
  test.each([
    ["unknown flag: --cert-identity"],
    ['unknown command "attestation" for "gh"'],
  ])("reports an old gh (%s) as a tooling gap, not a failed signature", (ghStderr) => {
    const spy = spyOn(Bun, "spawnSync").mockImplementation((cmd: unknown, ..._rest: unknown[]) => {
      const args = cmd as string[];
      if (args[1] === "--version") return { exitCode: 0, stderr: new Uint8Array(), stdout: new Uint8Array(), success: true } as ReturnType<typeof Bun.spawnSync>;
      return { exitCode: 1, stderr: new TextEncoder().encode(ghStderr), stdout: new Uint8Array(), success: false } as ReturnType<typeof Bun.spawnSync>;
    });

    const stderrLines: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (msg: string | Uint8Array, ..._rest: unknown[]) => {
      stderrLines.push(typeof msg === "string" ? msg : new TextDecoder().decode(msg));
      return true;
    };

    try {
      // error mode must not throw: gh being too old is not evidence of tampering.
      expect(() => verifyManifest(tmpFile, "error")).not.toThrow();
    } finally {
      process.stderr.write = origWrite;
      spy.mockRestore();
    }

    const out = stderrLines.join("");
    expect(out).toContain("upgrade gh");
    expect(out).not.toContain("verification failed");
  });

  test("warn mode succeeds silently when gh exits zero", () => {
    const spy = spyOn(Bun, "spawnSync").mockImplementation((..._args: unknown[]) => ({
      exitCode: 0, stderr: new Uint8Array(), stdout: new Uint8Array(), success: true,
    } as ReturnType<typeof Bun.spawnSync>));

    const stderrLines: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (msg: string | Uint8Array, ..._rest: unknown[]) => {
      stderrLines.push(typeof msg === "string" ? msg : new TextDecoder().decode(msg));
      return true;
    };

    try {
      expect(() => verifyManifest(tmpFile, "warn")).not.toThrow();
      expect(stderrLines.join("")).toBe("");
    } finally {
      process.stderr.write = origWrite;
      spy.mockRestore();
    }
  });
});
