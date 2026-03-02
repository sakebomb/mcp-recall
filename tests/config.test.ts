import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadConfig, resetConfig } from "../src/config";

const TEST_CONFIG_PATH = join(tmpdir(), `mcp-recall-test-${process.pid}.toml`);

describe("loadConfig", () => {
  beforeEach(() => {
    process.env.RECALL_CONFIG_PATH = TEST_CONFIG_PATH;
    resetConfig();
  });

  afterEach(() => {
    resetConfig();
    try {
      unlinkSync(TEST_CONFIG_PATH);
    } catch {}
    delete process.env.RECALL_CONFIG_PATH;
  });

  it("returns defaults when no config file exists", () => {
    const config = loadConfig();
    expect(config.store.expire_after_session_days).toBe(7);
    expect(config.store.key).toBe("git_root");
    expect(config.store.max_size_mb).toBe(500);
    expect(config.retrieve.default_max_bytes).toBe(8192);
    expect(config.denylist.additional).toEqual([]);
    expect(config.denylist.override_defaults).toEqual([]);
  });

  it("returns the same instance on repeated calls (cached)", () => {
    const a = loadConfig();
    const b = loadConfig();
    expect(a).toBe(b);
  });

  it("resets cache after resetConfig()", () => {
    const a = loadConfig();
    resetConfig();
    const b = loadConfig();
    expect(a).not.toBe(b);
  });

  it("merges partial TOML override with defaults", () => {
    writeFileSync(TEST_CONFIG_PATH, "[store]\nmax_size_mb = 1024\n");
    const config = loadConfig();
    expect(config.store.max_size_mb).toBe(1024);
    expect(config.store.expire_after_session_days).toBe(7);
    expect(config.store.key).toBe("git_root");
    expect(config.retrieve.default_max_bytes).toBe(8192);
  });

  it("falls back to defaults when config has an invalid value", () => {
    writeFileSync(TEST_CONFIG_PATH, '[store]\nkey = "invalid_value"\n');
    const config = loadConfig();
    expect(config.store.key).toBe("git_root");
  });

  it("falls back to defaults on malformed TOML", () => {
    writeFileSync(TEST_CONFIG_PATH, "this is not @@## valid toml");
    const config = loadConfig();
    expect(config.store.expire_after_session_days).toBe(7);
  });

  it("strips unknown keys from TOML", () => {
    writeFileSync(
      TEST_CONFIG_PATH,
      "[store]\nmax_size_mb = 256\nunknown_key = true\n"
    );
    const config = loadConfig();
    expect(config.store.max_size_mb).toBe(256);
    expect((config.store as Record<string, unknown>).unknown_key).toBeUndefined();
  });
});
