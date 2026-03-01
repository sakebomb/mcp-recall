import { parse } from "smol-toml";
import { homedir } from "os";
import { join } from "path";

export interface RecallConfig {
  store: {
    expire_after_session_days: number;
    key: "git_root" | "cwd";
    max_size_mb: number;
    pin_recommendation_threshold: number;
  };
  retrieve: {
    default_max_bytes: number;
  };
  denylist: {
    additional: string[];
    override_defaults: string[];
  };
}

const DEFAULTS: RecallConfig = {
  store: {
    expire_after_session_days: 7,
    key: "git_root",
    max_size_mb: 500,
    pin_recommendation_threshold: 3,
  },
  retrieve: {
    default_max_bytes: 8192,
  },
  denylist: {
    additional: [],
    override_defaults: [],
  },
};

const CONFIG_PATH = join(homedir(), ".config", "mcp-recall", "config.toml");

function deepMerge<T extends Record<string, unknown>>(
  defaults: T,
  overrides: Partial<T>
): T {
  const result = { ...defaults };
  for (const key of Object.keys(overrides) as Array<keyof T>) {
    const override = overrides[key];
    const def = defaults[key];
    if (
      override !== undefined &&
      override !== null &&
      typeof override === "object" &&
      !Array.isArray(override) &&
      typeof def === "object" &&
      def !== null &&
      !Array.isArray(def)
    ) {
      result[key] = deepMerge(
        def as Record<string, unknown>,
        override as Record<string, unknown>
      ) as T[keyof T];
    } else if (override !== undefined) {
      result[key] = override as T[keyof T];
    }
  }
  return result;
}

let cached: RecallConfig | null = null;

export function loadConfig(): RecallConfig {
  if (cached) return cached;

  try {
    const raw = Bun.file(CONFIG_PATH).textSync();
    const parsed = parse(raw) as Partial<RecallConfig>;
    cached = deepMerge(DEFAULTS, parsed);
  } catch {
    // File doesn't exist or is invalid — use defaults silently
    cached = deepMerge(DEFAULTS, {});
  }

  return cached;
}

export function resetConfig(): void {
  cached = null;
}
