import { parse } from "smol-toml";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { z } from "zod";
import { log, setDebugEnabled } from "./log";

export const RecallConfigSchema = z.object({
  store: z.object({
    expire_after_session_days: z.number().positive(),
    key: z.enum(["git_root", "cwd"]),
    max_size_mb: z.number().positive(),
    max_pinned_mb: z.number().positive(),
    pin_recommendation_threshold: z.number().int().positive(),
    stale_item_days: z.number().int().positive(),
    eviction_half_life_days: z.number().positive(),
    gc_reminder_mb: z.number().nonnegative(),
  }),
  retrieve: z.object({
    default_max_bytes: z.number().positive(),
  }),
  denylist: z.object({
    additional: z.array(z.string()),
    override_defaults: z.array(z.string()),
    allowlist: z.array(z.string()),
  }),
  profiles: z.object({
    verify_signature: z.enum(["warn", "error", "skip"]),
  }),
  debug: z.object({
    enabled: z.boolean(),
  }),
});

const PartialConfigSchema = RecallConfigSchema.deepPartial();

// When the user sets max_size_mb but not max_pinned_mb, the pinned cap defaults to
// this fraction of the effective total cap — so lowering max_size_mb alone can never
// manufacture a max_pinned_mb > max_size_mb contradiction. (The static DEFAULTS value
// below covers the no-config and fallback paths, where max_size_mb is also default.)
const DEFAULT_PINNED_FRACTION = 0.5;

export type RecallConfig = z.infer<typeof RecallConfigSchema>;

const DEFAULTS: RecallConfig = {
  store: {
    expire_after_session_days: 30,
    key: "git_root",
    max_size_mb: 500,
    max_pinned_mb: 250,
    pin_recommendation_threshold: 5,
    stale_item_days: 3,
    eviction_half_life_days: 7,
    gc_reminder_mb: 2048,
  },
  retrieve: {
    default_max_bytes: 8192,
  },
  denylist: {
    additional: [],
    override_defaults: [],
    allowlist: [],
  },
  profiles: {
    verify_signature: "warn" as const,
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
      const base = deepMerge(DEFAULTS, result.data);
      // Derive the pinned cap from the effective total cap unless set explicitly,
      // so a user who only lowers max_size_mb doesn't trip the contradiction guard.
      const userSetPinned = result.data.store?.max_pinned_mb !== undefined;
      const max_pinned_mb = userSetPinned
        ? base.store.max_pinned_mb
        : base.store.max_size_mb * DEFAULT_PINNED_FRACTION;
      const merged = { ...base, store: { ...base.store, max_pinned_mb } };
      // Cross-field guard: a pinned cap above the total cap is a contradiction
      // (max_pinned_mb can never bind before max_size_mb does). Only reachable when
      // the user set both explicitly. Reject the whole config to defaults, consistent
      // with how a schema-invalid value is handled. This lives here rather than as a
      // schema .refine() because RecallConfigSchema is deepPartial()'d for user
      // parsing, where a refine would see one or both fields absent.
      if (merged.store.max_pinned_mb > merged.store.max_size_mb) {
        log.warn(
          `invalid config (store.max_pinned_mb ${merged.store.max_pinned_mb} exceeds ` +
            `store.max_size_mb ${merged.store.max_size_mb}); using defaults`
        );
        cached = deepMerge(DEFAULTS, {});
      } else {
        cached = merged;
      }
    } else {
      const issues = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(", ");
      log.warn(`invalid config (${issues}); using defaults`);
      cached = deepMerge(DEFAULTS, {});
    }
  } catch (err: unknown) {
    const isNotFound =
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT";
    if (!isNotFound) {
      log.warn(`failed to load config: ${err}; using defaults`);
    }
    cached = deepMerge(DEFAULTS, {});
  }

  setDebugEnabled(cached.debug.enabled);
  return cached;
}

export function resetConfig(): void {
  cached = null;
  setDebugEnabled(false);
}
