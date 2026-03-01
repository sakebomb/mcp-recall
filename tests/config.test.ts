import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { loadConfig, resetConfig } from "../src/config";

describe("loadConfig", () => {
  beforeEach(() => resetConfig());
  afterEach(() => resetConfig());

  it("returns defaults when no config file exists", () => {
    const config = loadConfig();
    expect(config.store.expire_after_session_days).toBe(7);
    expect(config.store.key).toBe("git_root");
    expect(config.store.max_size_mb).toBe(500);
    expect(config.store.pin_recommendation_threshold).toBe(3);
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
});
