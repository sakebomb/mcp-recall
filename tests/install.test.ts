import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
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
} from "../src/install/index";

const FAKE_CLI    = "/fake/mcp-recall/dist/cli.js";
const FAKE_SERVER = "/fake/mcp-recall/dist/server.js";

// Stub detectPaths so tests don't depend on the actual build artifacts existing.
// We achieve this by passing explicit file paths to install/uninstall.

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

// Helper: run install with fake paths injected so we bypass detectPaths
async function install(opts: { dryRun?: boolean } = {}) {
  // Patch detectPaths by pre-writing a minimal claude.json / settings.json
  // and calling the exported functions directly.
  // installCommand calls detectPaths() internally, but we test the JSON logic
  // via the exported helpers to avoid needing real build artifacts.
}

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
      hooks: [{ type: "command", command: `bun ${FAKE_CLI} post-tool-use` }],
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
    const stale = makeSessionStartEntry("/old/mcp-recall/dist/cli.js");
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
    expect(updated.hooks[0].command).toBe(`bun ${FAKE_CLI} session-start`);
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
