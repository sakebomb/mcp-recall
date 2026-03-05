import { parse } from "smol-toml";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { z } from "zod";

const RecallConfigSchema = z.object({
  store: z.object({
    expire_after_session_days: z.number().positive(),
    key: z.enum(["git_root", "cwd"]),
    max_size_mb: z.number().positive(),
    pin_recommendation_threshold: z.number().int().positive(),
    stale_item_days: z.number().int().positive(),
  }),
  retrieve: z.object({
    default_max_bytes: z.number().positive(),
  }),
  denylist: z.object({
    additional: z.array(z.string()),
    override_defaults: z.array(z.string()),
    allowlist: z.array(z.string()),
  }),
  debug: z.object({
    enabled: z.boolean(),
  }),
});

const PartialConfigSchema = RecallConfigSchema.deepPartial();

export type RecallConfig = z.infer<typeof RecallConfigSchema>;

const DEFAULTS: RecallConfig = {
  store: {
    expire_after_session_days: 7,
    key: "git_root",
    max_size_mb: 500,
    pin_recommendation_threshold: 5,
    stale_item_days: 3,
  },
  retrieve: {
    default_max_bytes: 8192,
  },
  denylist: {
    additional: [],
    override_defaults: [],
    allowlist: [],
  },
  debug: {
    enabled: false,
  },
};

function getConfigPath(): string {
  return (
    process.env.RECALL_CONFIG_PATH ??
    join(homedir(), ".config", "mcp-recall", "config.toml")
  );
}

function deepMerge<T extends Record<string, unknown>>(
  defaults: T,
  overrides: Record<string, unknown>
): T {
  const result = { ...defaults };
  for (const key of Object.keys(overrides) as Array<keyof T>) {
    const override = overrides[key as string];
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
    const raw = readFileSync(getConfigPath(), "utf8");
    const result = PartialConfigSchema.safeParse(parse(raw));
    if (result.success) {
      cached = deepMerge(DEFAULTS, result.data);
    } else {
      const issues = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(", ");
      process.stderr.write(`[recall] invalid config (${issues}); using defaults\n`);
      cached = deepMerge(DEFAULTS, {});
    }
  } catch (err: unknown) {
    const isNotFound =
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT";
    if (!isNotFound) {
      process.stderr.write(`[recall] failed to load config: ${err}; using defaults\n`);
    }
    cached = deepMerge(DEFAULTS, {});
  }

  return cached;
}

export function resetConfig(): void {
  cached = null;
}
