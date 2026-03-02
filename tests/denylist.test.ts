import { describe, it, expect } from "bun:test";
import { BUILTIN_PATTERNS, isDenied, matchesPattern } from "../src/denylist";
import type { RecallConfig } from "../src/config";

const baseConfig: RecallConfig = {
  store: {
    expire_after_session_days: 7,
    key: "git_root",
    max_size_mb: 500,
    pin_recommendation_threshold: 3,
  },
  retrieve: { default_max_bytes: 8192 },
  denylist: { additional: [], override_defaults: [] },
};

function withDenylist(
  partial: Partial<RecallConfig["denylist"]>
): RecallConfig {
  return { ...baseConfig, denylist: { ...baseConfig.denylist, ...partial } };
}

describe("matchesPattern", () => {
  it("exact match with no wildcards", () => {
    expect(matchesPattern("mcp__github__get_file", "mcp__github__get_file")).toBe(true);
  });

  it("trailing wildcard matches prefix", () => {
    expect(matchesPattern("mcp__recall__search", "mcp__recall__*")).toBe(true);
    expect(matchesPattern("mcp__recall__retrieve", "mcp__recall__*")).toBe(true);
  });

  it("trailing wildcard does not match different prefix", () => {
    expect(matchesPattern("mcp__github__search", "mcp__recall__*")).toBe(false);
  });

  it("surrounding wildcards match substring", () => {
    expect(matchesPattern("mcp__get_secret_value", "*secret*")).toBe(true);
    expect(matchesPattern("my_token_store", "*token*")).toBe(true);
  });

  it("surrounding wildcards do not match unrelated names", () => {
    expect(matchesPattern("mcp__playwright__snapshot", "*secret*")).toBe(false);
  });

  it("leading wildcard matches suffix", () => {
    expect(matchesPattern("get_password", "*password")).toBe(true);
    expect(matchesPattern("get_password_hash", "*password")).toBe(false);
  });

  it("escapes regex special characters in non-wildcard segments", () => {
    // dot in pattern is literal, not a regex wildcard — does not match underscore
    expect(matchesPattern("mcp_recall_search", "mcp.recall.search")).toBe(false);
    expect(matchesPattern("mcp.recall.search", "mcp.recall.search")).toBe(true);
    expect(matchesPattern("mcp__recall__search", "mcp__recall__search")).toBe(true);
  });
});

describe("BUILTIN_PATTERNS", () => {
  it("includes mcp__recall__* to protect own tools", () => {
    expect(BUILTIN_PATTERNS).toContain("mcp__recall__*");
  });

  it("includes mcp__1password__* to protect secrets manager", () => {
    expect(BUILTIN_PATTERNS).toContain("mcp__1password__*");
  });
});

describe("isDenied", () => {
  it("denies recall tools via builtin", () => {
    expect(isDenied("mcp__recall__search", baseConfig)).toBe(true);
    expect(isDenied("mcp__recall__retrieve", baseConfig)).toBe(true);
  });

  it("denies 1password tools via builtin", () => {
    expect(isDenied("mcp__1password__item_lookup", baseConfig)).toBe(true);
  });

  it("denies tools matching sensitive name patterns", () => {
    expect(isDenied("mcp__get_secret", baseConfig)).toBe(true);
    expect(isDenied("mcp__read_token", baseConfig)).toBe(true);
    expect(isDenied("mcp__fetch_credentials", baseConfig)).toBe(true);
    expect(isDenied("mcp__load_env", baseConfig)).toBe(true);
  });

  it("allows tools not matching any builtin pattern", () => {
    expect(isDenied("mcp__playwright__snapshot", baseConfig)).toBe(false);
    expect(isDenied("mcp__github__list_issues", baseConfig)).toBe(false);
  });

  it("additional patterns extend builtins", () => {
    const config = withDenylist({ additional: ["mcp__custom__*"] });
    expect(isDenied("mcp__custom__do_thing", config)).toBe(true);
    expect(isDenied("mcp__playwright__snapshot", config)).toBe(false);
  });

  it("override_defaults replaces builtins but additional still applies", () => {
    const config = withDenylist({
      override_defaults: ["mcp__custom__*"],
      additional: ["mcp__extra__*"],
    });
    // custom is now the only base pattern
    expect(isDenied("mcp__custom__do_thing", config)).toBe(true);
    // builtins no longer active
    expect(isDenied("mcp__1password__item_lookup", config)).toBe(false);
    // additional still applies
    expect(isDenied("mcp__extra__thing", config)).toBe(true);
  });

  it("empty override_defaults falls back to builtins", () => {
    const config = withDenylist({ override_defaults: [] });
    expect(isDenied("mcp__recall__search", config)).toBe(true);
  });
});
