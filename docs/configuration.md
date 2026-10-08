# Configuration

mcp-recall works out of the box. To customize, create `~/.config/mcp-recall/config.toml`:

```toml
[store]
# Days of actual Claude Code use before stored items expire.
# Vacations and context switches to other projects don't count —
# only days you actively used Claude Code on this project.
# See "Session days" below.
expire_after_session_days = 30

# How to identify a project.
# "git_root" is recommended — stable regardless of launch directory.
# Falls back to "cwd" if not inside a git repo.
key = "git_root"

# Target store size in megabytes. When exceeded, non-pinned items are evicted
# lowest-value-first by the decay score described under eviction_half_life_days.
# This bounds unpinned content only — pinned items are never evicted, so a store
# of mostly-pinned data can exceed it. recall__stats reports when it does.
max_size_mb = 500

# Bound on pinned data in megabytes. Pinned items are exempt from eviction, so
# without a separate cap an unbounded number of pins would silently void
# max_size_mb. recall__pin enforces this at pin time: a pin that would push total
# pinned bytes over the cap is refused with an actionable message, so the bound
# holds even if the caller ignores it. Must not exceed max_size_mb (a config that
# sets it higher is rejected). If you set max_size_mb but leave this unset, it
# defaults to half of max_size_mb rather than the 250 shown here, so lowering the
# total cap alone never creates a contradiction. Existing over-cap pins are never
# auto-deleted — unpin or recall__forget to reclaim.
max_pinned_mb = 250

# Access count threshold for pin suggestions in recall__stats.
# Items accessed at least this many times will appear as pin candidates.
pin_recommendation_threshold = 5

# Days since creation before a never-accessed item appears as a stale candidate
# in recall__stats. Helps identify stored output that was never retrieved.
stale_item_days = 3

# Half-life (in days) for eviction scoring when the store exceeds max_size_mb.
# Eviction ranks items by a recency-weighted access frequency, so a steadily
# used recent item outranks one accessed many times but long ago. Lower =
# recency matters more; higher = frequency dominates. Pinned items are exempt.
eviction_half_life_days = 7

# When the on-disk store (all project databases combined) grows past this many
# megabytes, session start injects a one-line reminder to run `mcp-recall gc`.
# Set to 0 to disable the reminder. Detection is cheap (no databases are opened).
gc_reminder_mb = 2048

# Which intercepted outputs keep a retrievable verbatim body vs. summary-only:
#   full     = keep every intercepted body (most retrievable, most disk)
#   balanced = keep MCP/web/API results + network Bash (curl/wget/gh api);
#              store reproducible Bash (git, tests, ls, grep, cat, docker ps,
#              build/lint) summary-only — an old copy is either trivially
#              reproducible or misleadingly stale, so it isn't worth keeping
#   minimal  = drop every intercepted body (summary-only for all)
# Notes stored via recall__note always keep their body, regardless of this.
# Only affects future writes; existing bodies are untouched. When a body was
# not retained, recall__retrieve returns the summary and says to re-run.
# max_size_mb / eviction and the max_pinned_mb pin budget count each item's
# EFFECTIVE size (a summary-only row costs its summary size, not the original),
# so lowering retention both reduces bytes-on-disk and raises the number of
# items the store holds before eviction fires.
retention = "balanced"

[retrieve]
# Max bytes returned by recall__retrieve(mode: "full").
# Claude can override this per-call via the max_bytes parameter.
default_max_bytes = 8192

[denylist]
# Additional tool name glob patterns to never store.
# These extend the built-in defaults — they don't replace them.
additional = [
  # "*myserver*secret*",
]

# Allowlist — tools matching these patterns are always stored,
# even if they match a deny pattern. Use when a legitimate tool
# is blocked by a keyword pattern (e.g. *token* blocking your
# analytics tool).
allowlist = [
  # "mcp__myservice__list_authors",
]

# Replace built-in defaults entirely (use sparingly).
# Must re-specify any defaults you still want.
override_defaults = [
  # "mcp__recall__*",
  # "mcp__1password__*",
]

[profiles]
# Manifest signature verification mode when installing/updating community profiles.
# Requires the gh CLI. Options: "warn" (default), "error", "skip".
verify_signature = "warn"

[debug]
# Write diagnostic logging to stderr — handler dispatch, denylist skips, profile
# load errors. Equivalent to setting RECALL_DEBUG=1, but persistent.
enabled = false
```

## Environment variables

Every path below has a sensible default; override only when you need to relocate state (for example, to keep a project's store on a different volume).

| Variable | Overrides | Default |
|---|---|---|
| `RECALL_CONFIG_PATH` | Config file location | `~/.config/mcp-recall/config.toml` |
| `RECALL_DB_PATH` | SQLite store location | `~/.local/share/mcp-recall/<project-key>.db` |
| `RECALL_DEBUG` | Set to `1` for stderr debug logging | off (same as `debug.enabled`) |
| `RECALL_USER_PROFILES_PATH` | User profile directory | `~/.config/mcp-recall/profiles/` |
| `RECALL_COMMUNITY_PROFILES_PATH` | Installed community profile directory | `~/.local/share/mcp-recall/profiles/community/` |
| `RECALL_BUNDLED_PROFILES_PATH` | Built-in profile directory | the installed package's own `profiles/` directory |

## Session days

The `expire_after_session_days` setting counts **days you actively use Claude Code on this project** — not calendar days. If you work on a task on Monday, leave for a week, and come back the following Tuesday, your stored context is still exactly as you left it. The counter only advances when you open a session.

This means a 7-day setting gives you 7 working sessions of stored context, regardless of how much calendar time passes between them.

---

→ [README](../README.md) · [Tools](tools.md) · [Maintenance](maintenance.md)
