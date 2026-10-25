/**
 * The config schema, apart from config.ts so the hook loads zod only when a config
 * file exists. zod 4 adds ~10 ms to startup, and most hook calls have no config (#416).
 * The namespace import matters: Bun 1.3's bundler keeps all 64 zod locales for
 * `import { z }` (~600 KB of parse on every hook call) but drops them for this form.
 */
import * as z from "zod";

export const RecallConfigSchema = z.object({
  store: z.object({
    expire_after_session_days: z.number().positive(),
    key: z.enum(["git_root", "cwd"]),
    max_size_mb: z.number().positive(),
    max_pinned_mb: z.number().positive(),
    pin_recommendation_threshold: z.number().int().positive(),
    stale_item_days: z.number().int().positive(),
    // .finite() rejects `inf` (legal TOML that passes bare .positive() since Infinity > 0);
    // a non-finite half-life would collapse decay eviction to plain LFU. See #228.
    eviction_half_life_days: z.number().positive().finite(),
    gc_reminder_mb: z.number().nonnegative(),
    // Which intercepted outputs keep a retrievable full body vs. summary-only.
    // full = keep every body; balanced = keep MCP/web/API, network Bash and
    // content reads (cat, git diff/show/log -p, head/tail, sed -n), drop other
    // reproducible Bash (git log/tests/ls/grep…); minimal = drop all intercepted
    // bodies. Notes always keep their body regardless. See #-retention.
    retention: z.enum(["full", "balanced", "minimal"]),
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

// zod 4 dropped .deepPartial(); every section is a flat object, so one level of
// .partial() per section plus the outer .partial() is the same shape. `satisfies`
// fails the build if a section is added above but not here (it would be stripped).
const sections = RecallConfigSchema.shape;
export const PartialConfigSchema = z
  .object({
    store: sections.store.partial(),
    retrieve: sections.retrieve.partial(),
    denylist: sections.denylist.partial(),
    profiles: sections.profiles.partial(),
    debug: sections.debug.partial(),
  } satisfies Record<keyof typeof sections, z.ZodType>)
  .partial();

export type RecallConfig = z.infer<typeof RecallConfigSchema>;
