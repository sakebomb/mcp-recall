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
    expect(config.store.expire_after_session_days).toBe(30);
    expect(config.store.key).toBe("git_root");
    expect(config.store.max_size_mb).toBe(500);
    expect(config.store.pin_recommendation_threshold).toBe(5);
    expect(config.store.stale_item_days).toBe(3);
    expect(config.store.eviction_half_life_days).toBe(7);
    expect(config.store.gc_reminder_mb).toBe(2048);
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
    expect(config.store.expire_after_session_days).toBe(30);
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
    expect(config.store.expire_after_session_days).toBe(30);
  });

  // #228: `inf` is legal TOML and passes z.number().positive() (Infinity > 0), so it would
  // silently disable decay eviction. The schema must reject non-finite values so the loader
  // falls back to the finite default rather than degrading eviction to plain LFU.
  it("rejects non-finite eviction_half_life_days and falls back to the default", () => {
    writeFileSync(TEST_CONFIG_PATH, "[store]\neviction_half_life_days = inf\n");
    const config = loadConfig();
    expect(config.store.eviction_half_life_days).toBe(7);
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

  it("max_pinned_mb defaults to 250", () => {
    const config = loadConfig();
    expect(config.store.max_pinned_mb).toBe(250);
  });

  it("defaults max_pinned_mb to half of max_size_mb when only max_size_mb is set", () => {
    // Lowering max_size_mb alone must not manufacture a contradiction with the
    // static 250 default — the pinned cap tracks the effective total cap.
    writeFileSync(TEST_CONFIG_PATH, "[store]\nmax_size_mb = 100\n");
    const config = loadConfig();
    expect(config.store.max_size_mb).toBe(100);
    expect(config.store.max_pinned_mb).toBe(50);
  });

  it("accepts a valid max_pinned_mb below max_size_mb", () => {
    writeFileSync(TEST_CONFIG_PATH, "[store]\nmax_pinned_mb = 128\n");
    const config = loadConfig();
    expect(config.store.max_pinned_mb).toBe(128);
  });

  it("accepts max_pinned_mb equal to max_size_mb", () => {
    writeFileSync(TEST_CONFIG_PATH, "[store]\nmax_size_mb = 300\nmax_pinned_mb = 300\n");
    const config = loadConfig();
    expect(config.store.max_size_mb).toBe(300);
    expect(config.store.max_pinned_mb).toBe(300);
  });

  it("rejects config where max_pinned_mb exceeds max_size_mb, using defaults", () => {
    writeFileSync(TEST_CONFIG_PATH, "[store]\nmax_size_mb = 100\nmax_pinned_mb = 200\n");
    const config = loadConfig();
    // A pinned cap above the total cap is a contradiction; the whole config is
    // rejected to defaults, consistent with any other schema-invalid value.
    expect(config.store.max_size_mb).toBe(500);
    expect(config.store.max_pinned_mb).toBe(250);
  });

  it("debug.enabled defaults to false", () => {
    const config = loadConfig();
    expect(config.debug.enabled).toBe(false);
  });

  it("debug.enabled reads true from TOML", () => {
    writeFileSync(TEST_CONFIG_PATH, "[debug]\nenabled = true\n");
    const config = loadConfig();
    expect(config.debug.enabled).toBe(true);
  });
});
