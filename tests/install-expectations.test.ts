import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import path from "path";
import os from "os";
import { scanServers, whatHappensNext } from "../src/install/expectations";
import { installCommand, writeJsonFile, type RecallLaunch } from "../src/install/index";
import { hasDedicatedHandler } from "../src/handlers/index";
import { clearProfileCache } from "../src/profiles";

const PROFILE_ENV = ["RECALL_USER_PROFILES_PATH", "RECALL_COMMUNITY_PROFILES_PATH", "RECALL_BUNDLED_PROFILES_PATH"] as const;

let tmpDir: string;

// No profiles of any tier, so only the TypeScript registry decides.
beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "mcp-recall-expect-test-"));
  for (const k of PROFILE_ENV) process.env[k] = path.join(tmpDir, "no-profiles", k);
  clearProfileCache();
});

afterEach(async () => {
  for (const k of PROFILE_ENV) delete process.env[k];
  clearProfileCache();
  mock.restore();
  await rm(tmpDir, { recursive: true, force: true });
});

const plain = (lines: string[]) => lines.join("\n").replace(/\x1b\[\d+m/g, "");

describe("hasDedicatedHandler", () => {
  it("is true for a server the registry names", () => {
    expect(hasDedicatedHandler("mcp__github__")).toBe(true);
  });

  it("is true for Playwright, whose matcher needs the output to tell", () => {
    expect(hasDedicatedHandler("mcp__plugin_playwright_playwright__")).toBe(true);
  });

  it("is false for a server nothing names", () => {
    expect(hasDedicatedHandler("mcp__acme_internal__")).toBe(false);
  });

  it("is true for a server a bundled profile covers, even for one tool only", () => {
    delete process.env["RECALL_BUNDLED_PROFILES_PATH"];
    clearProfileCache();
    expect(hasDedicatedHandler("mcp__context7__")).toBe(true);
  });
});

describe("scanServers", () => {
  it("splits servers by whether a handler is written for them, leaving recall out", () => {
    const scan = scanServers({ mcpServers: { recall: {}, github: {}, "acme-internal": {} } });
    expect(scan).toEqual({ dedicated: ["github"], fallback: ["acme-internal"] });
  });

  it("returns empty lists when mcpServers is missing or not an object", () => {
    expect(scanServers({})).toEqual({ dedicated: [], fallback: [] });
    expect(scanServers({ mcpServers: "nope" })).toEqual({ dedicated: [], fallback: [] });
    expect(scanServers({ mcpServers: null })).toEqual({ dedicated: [], fallback: [] });
    expect(scanServers({ mcpServers: ["a", "b"] })).toEqual({ dedicated: [], fallback: [] });
  });
});

describe("whatHappensNext", () => {
  it("names stats and statusline", () => {
    const text = plain(whatHappensNext(null, "~/.claude.json"));
    expect(text).toContain("mcp-recall stats");
    expect(text).toContain("mcp-recall statusline");
  });

  it("says where savings come from when there are no MCP servers", () => {
    const text = plain(whatHappensNext({ dedicated: [], fallback: [] }, "~/.claude.json"));
    expect(text).toContain("No user-scope MCP servers in ~/.claude.json");
    expect(text).toMatch(/large\s+Bash output/);
    expect(text).toContain("Project and plugin servers are not");
  });

  it("lists servers with a handler apart from those on the fallback", () => {
    const text = plain(whatHappensNext({ dedicated: ["github"], fallback: ["acme"] }, "~/.claude.json"));
    expect(text).toMatch(/handler or profile for some or all tools: github/);
    expect(text).toMatch(/general summarizer.*acme/);
    expect(text).not.toContain("No user-scope MCP servers");
  });

  it("says nothing about servers when none were scanned", () => {
    const text = plain(whatHappensNext(null, "~/.claude.json"));
    expect(text).not.toContain("MCP servers");
  });
});

describe("install ends with what happens next (#496)", () => {
  let launch: RecallLaunch;
  let paths: { claudeJsonPath: string; settingsPath: string; claudeMdPath: string; piDir: string; opencodeDir: string };

  beforeEach(async () => {
    const binary = path.join(tmpDir, "bin", "mcp-recall");
    await Bun.write(binary, "");
    launch = { cli: binary, server: { type: "stdio", command: binary, args: ["serve"] }, artifacts: [{ label: "binary", path: binary }] };
    paths = {
      claudeJsonPath: path.join(tmpDir, ".claude.json"),
      settingsPath: path.join(tmpDir, "settings.json"),
      claudeMdPath: path.join(tmpDir, "CLAUDE.md"),
      piDir: path.join(tmpDir, "no-pi"),
      opencodeDir: path.join(tmpDir, "no-opencode"),
    };
  });

  const run = async (opts: Parameters<typeof installCommand>[0] = {}) => {
    const log = spyOn(console, "log").mockImplementation(() => {});
    await installCommand({ ...paths, launch, agents: ["claude"], ...opts });
    const out = plain(log.mock.calls.flat().map(String));
    log.mockRestore();
    return out;
  };

  it("prints the block and the user's own servers on a fresh install", async () => {
    await writeJsonFile(paths.claudeJsonPath, { mcpServers: { github: {}, acme: {} } });
    const out = await run();
    expect(out).toContain("What happens next");
    expect(out).toContain("mcp-recall stats");
    expect(out).toMatch(/handler or profile.*github/);
    expect(out).toMatch(/general summarizer.*acme/);
  });

  it("sets the Bash expectation when recall is the only server", async () => {
    const out = await run();
    expect(out).toContain("No user-scope MCP servers in");
  });

  it("stays quiet on a dry run and when nothing changed", async () => {
    expect(await run({ dryRun: true })).not.toContain("What happens next");
    await run();
    expect(await run()).not.toContain("What happens next");
  });
});
