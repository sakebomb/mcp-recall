import { describe, it, expect } from "bun:test";
import { BUILTIN_PATTERNS, isDenied, matchesPattern } from "../src/denylist";
import type { RecallConfig } from "../src/config";

const baseConfig: RecallConfig = {
  store: {
    expire_after_session_days: 7,
    key: "git_root",
    max_size_mb: 500,
    pin_recommendation_threshold: 3,
    stale_item_days: 3,
  },
  retrieve: { default_max_bytes: 8192 },
  denylist: { additional: [], override_defaults: [], allowlist: [] },
  debug: { enabled: false },
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

  it("includes all password manager explicit entries", () => {
    const expected = [
      "mcp__bitwarden__*",
      "mcp__lastpass__*",
      "mcp__dashlane__*",
      "mcp__keeper__*",
      "mcp__hashicorp_vault__*",
      "mcp__vault__*",
      "mcp__doppler__*",
      "mcp__infisical__*",
    ];
    for (const pattern of expected) {
      expect(BUILTIN_PATTERNS).toContain(pattern);
    }
  });
});

describe("isDenied password managers", () => {
  it("denies bitwarden tools whose names contain no keyword", () => {
    // get_item and list_logins have no *secret*/*auth*/*password* substring
    expect(isDenied("mcp__bitwarden__get_item", baseConfig)).toBe(true);
    expect(isDenied("mcp__bitwarden__list_logins", baseConfig)).toBe(true);
  });

  it("denies lastpass tools", () => {
    expect(isDenied("mcp__lastpass__get_account", baseConfig)).toBe(true);
  });

  it("denies dashlane tools", () => {
    expect(isDenied("mcp__dashlane__get_login", baseConfig)).toBe(true);
  });

  it("denies keeper tools", () => {
    expect(isDenied("mcp__keeper__get_record", baseConfig)).toBe(true);
  });

  it("denies hashicorp vault tools whose names contain no keyword", () => {
    expect(isDenied("mcp__hashicorp_vault__read", baseConfig)).toBe(true);
    expect(isDenied("mcp__hashicorp_vault__list", baseConfig)).toBe(true);
  });

  it("denies vault tools", () => {
    expect(isDenied("mcp__vault__get", baseConfig)).toBe(true);
  });

  it("denies doppler tools", () => {
    expect(isDenied("mcp__doppler__get_config", baseConfig)).toBe(true);
  });

  it("denies infisical tools", () => {
    expect(isDenied("mcp__infisical__list_items", baseConfig)).toBe(true);
  });

  it("still allows unrelated tools after adding PM entries", () => {
    expect(isDenied("mcp__github__list_issues", baseConfig)).toBe(false);
    expect(isDenied("mcp__playwright__snapshot", baseConfig)).toBe(false);
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
    expect(isDenied("mcp__get_api_key", baseConfig)).toBe(true);
    expect(isDenied("mcp__oauth_callback", baseConfig)).toBe(true);
    expect(isDenied("mcp__authenticate_user", baseConfig)).toBe(true);
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

describe("isDenied narrowed patterns", () => {
  it("no longer blocks tools with 'key' in non-credential context", () => {
    expect(isDenied("mcp__jira__get_project_keys", baseConfig)).toBe(false);
    expect(isDenied("mcp__notion__get_keyboard_shortcuts", baseConfig)).toBe(false);
    expect(isDenied("mcp__db__get_primary_key", baseConfig)).toBe(false);
  });

  it("still blocks tools with specific key patterns", () => {
    expect(isDenied("mcp__aws__get_api_key", baseConfig)).toBe(true);
    expect(isDenied("mcp__aws__get_access_key", baseConfig)).toBe(true);
    expect(isDenied("mcp__tls__get_private_key", baseConfig)).toBe(true);
    expect(isDenied("mcp__jwt__get_signing_key", baseConfig)).toBe(true);
  });

  it("no longer blocks tools with 'auth' in non-credential context", () => {
    expect(isDenied("mcp__jira__get_author", baseConfig)).toBe(false);
    expect(isDenied("mcp__github__list_authors", baseConfig)).toBe(false);
  });

  it("still blocks oauth and authentication tools", () => {
    expect(isDenied("mcp__oauth_callback", baseConfig)).toBe(true);
    expect(isDenied("mcp__get_auth_token", baseConfig)).toBe(true);
    expect(isDenied("mcp__authenticate_user", baseConfig)).toBe(true);
  });

  it("no longer blocks tools with 'env' in non-credential context", () => {
    expect(isDenied("mcp__github__get_environments", baseConfig)).toBe(false);
    expect(isDenied("mcp__vercel__list_envs", baseConfig)).toBe(false);
    expect(isDenied("mcp__aws__describe_environment", baseConfig)).toBe(false);
  });

  it("still blocks env var tools", () => {
    expect(isDenied("mcp__get_env_var", baseConfig)).toBe(true);
    expect(isDenied("mcp__read_dotenv", baseConfig)).toBe(true);
  });
});

describe("isDenied allowlist", () => {
  it("allowlist overrides denylist for matching tools", () => {
    const config = withDenylist({ allowlist: ["mcp__vault__read_metadata"] });
    // Specific tool is allowed despite mcp__vault__* denylist pattern
    expect(isDenied("mcp__vault__read_metadata", config)).toBe(false);
    // Other vault tools still denied
    expect(isDenied("mcp__vault__get_secret", config)).toBe(true);
  });

  it("allowlist with wildcard un-blocks a whole prefix", () => {
    const config = withDenylist({ allowlist: ["mcp__custom_auth_*"] });
    expect(isDenied("mcp__custom_auth_list", config)).toBe(false);
    expect(isDenied("mcp__custom_auth_detail", config)).toBe(false);
  });

  it("empty allowlist has no effect", () => {
    expect(isDenied("mcp__get_secret", baseConfig)).toBe(true);
  });
});
