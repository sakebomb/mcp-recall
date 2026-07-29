# CLAUDE.md – mcp-recall

Project-level conventions. Global `~/.claude/CLAUDE.md` guardrails always take precedence on conflicts.

## Project Overview

**mcp-recall** is a Claude Code plugin that intercepts large MCP tool outputs (Playwright snapshots, GitHub API responses, large file reads), compresses them, stores full versions in SQLite with FTS, and delivers brief summaries to Claude. When Claude needs detail, it retrieves via `recall__*` tools. Goal: enable 3+ hour sessions by preventing context window exhaustion.

## Tech Stack

- **Runtime**: Bun (package manager + test runner — use `bun` not `npm`)
- **Language**: TypeScript strict mode, ESNext target
- **Database**: SQLite with FTS5 (built into Bun via `bun:sqlite`)
- **Schema validation**: Zod
- **Config format**: TOML (`smol-toml`)

## Commands

```bash
bun test              # run all tests
bun test --watch      # watch mode
bun run typecheck     # tsc --noEmit
bun run build         # bundle src/ → plugins/mcp-recall/dist/
bun run start         # MCP server
bun run dev           # MCP server in watch mode
```

No `just` / `make` in this project. Use `bun test` directly (not `just test`).

## Architecture

```
bin/recall              Entrypoint used by hooks/hooks.json (session-start, post-tool-use)
                        and as the npm `bin`. Resolves symlinks before locating src/.
src/
  server.ts             MCP server — exposes the recall__* tools listed below
  cli.ts                Hook CLI dispatcher (mcp-recall install / learn / profiles / …)
  config.ts             TOML config loader (Zod-validated, cached)
  project-key.ts        Git root detection + SHA256 path hash
  log.ts                Unified stderr logging — info/warn/error/debug, gated on RECALL_DEBUG=1
  format.ts             Shared byte-size and relative-time formatting utilities
  hints.ts              Extracts salient search terms for the summary header (deterministic)
  tools.ts              Tool handler logic for all recall__* tools (pure functions; server.ts wires to MCP SDK)
  denylist.ts           Built-in + configurable denylist
  secrets.ts            Secret pattern detection before any write
  db/
    types.ts            All TypeScript interfaces for the DB layer
    schema.ts           DDL, migrations, getDb / closeDb / initSchema / defaultDbPath
    chunking.ts         CHUNK_SIZE, chunkText(), sanitizeFtsQuery()
    queries.ts          Core CRUD — storeOutput, retrieveOutput, evictIfNeeded, forgetOutputs, …
    analytics.ts        Aggregation queries — getStats, getContext, getSessionSummary, getSuggestions, …
    index.ts            Re-export barrel (all db/* in one import surface)
  handlers/             Compression handlers. The 7-step dispatch order is documented
                        canonically above getHandler() in index.ts — read it there rather
                        than trusting a paraphrase. The consequential part: user and
                        community profiles BEAT the TypeScript registry, bundled profiles
                        LOSE to it, and native Bash is routed first, before any of them.
                        Counting handlers is ambiguous (registry entries vs files vs
                        fallbacks), so HANDLER_REGISTRY is the source of truth.
  hooks/                Hook implementations (SessionStart, PostToolUse)
  gc/                   mcp-recall gc — classifies every project DB and reclaims disk.
                        Deletion policy lives in STATUS_POLICY; see the safety note below.
  import/               mcp-recall import — restores a recall__export dump into a store
  install/              mcp-recall install / uninstall / status — writes to ~/.claude.json, settings.json, CLAUDE.md
  learn/                mcp-recall learn — reads ~/.claude.json, spawns MCP servers via stdio, generates TOML profiles
  profiles/             mcp-recall profiles subcommands (list, install, update, remove, seed, feed, check, test, info, available, retrain)
tests/                  Bun tests, co-located by module name
.claude-plugin/         Root plugin manifest (local dev / manual install)
hooks/hooks.json        Hook definitions — canonical source, copied to plugins/ on build
plugins/mcp-recall/     Marketplace-installable plugin bundle
  dist/                 Bundled server.js + cli.js (bun build --target bun)
```

**Hook flow** (`src/hooks/post-tool-use.ts`, whose numbered steps are the source of truth): `PostToolUse` intercepts `mcp__*` (except `mcp__recall__*`) and `Bash` → denylist check → secret scan → dedup check (by `input_hash`, then `output_hash`) → compress → **skip unless the summary is actually smaller than the original** → store in SQLite → evict if over `store.max_size_mb` → return summary to Claude.

That skip guard matters when reasoning about behaviour: output which does not compress usefully — a short, error-dense log, for instance — passes through untouched rather than being stored.

**Deletion safety**: `gc --force` is the only thing in the project that deletes user data. Its rule is "recorded `project_path` gone but its parent present ⇒ project deleted", which is valid *only* for an absolute path — `dirname("")` and `dirname("bare-name")` are both `"."`, which always exists. Non-absolute paths are therefore `unverifiable` and never deleted, and `session-start` only records a path that resolves to a real directory. When changing `src/gc/`, build a store containing the dangerous shapes and assert what survives; do not reason about it.

**MCP server tools** (all `recall__` prefixed):
- `recall__retrieve` — fetch stored content by ID. `mode` = `summary` | `peek` | `full`;
  `peek` returns a bounded window of the best-matching chunks. With no `mode`, a query
  still yields a focused excerpt
- `recall__search` — FTS across stored outputs with tool filter
- `recall__forget` — delete by id / tool / session / age / all
- `recall__list_stored` — paginated browse, sortable, with tool filter
- `recall__stats` — session efficiency report (counts, sizes, token savings)
- `recall__pin` — pin/unpin items; exempt from expiry and from decay-scored eviction
  (so pinned data can exceed `store.max_size_mb`: reported by `recall__stats`, not
  enforced — see #205)
- `recall__note` — store arbitrary text as project memory
- `recall__export` — JSON dump of all items, oldest-first
- `recall__session_summary` — per-session digest (tool breakdown, top accessed, pinned, notes)
- `recall__context` — orientation snapshot: pinned + notes + recently accessed + last session headline
- `recall__suggest` — surface pin candidates (frequently accessed) and stale items (never accessed) with actionable commands

## CLI Commands

```bash
mcp-recall install            # write MCP entry, hooks, and CLAUDE.md instructions into Claude Code config
mcp-recall uninstall          # reverse of install
mcp-recall status             # report install health (MCP entry, hooks, CLAUDE.md block, store size)
mcp-recall gc [--force]       # list/reclaim orphaned project DBs (--stale-days N, --vacuum). Dry run by default
mcp-recall import <file>      # restore from a recall__export dump (--overwrite, --dry-run; --keep-project-key is broken, see #226)
mcp-recall completions <shell> # emit a zsh/bash/fish completion script
mcp-recall learn [server…]    # auto-generate TOML profiles by inspecting installed MCP servers
mcp-recall profiles list      # list all installed profiles (user + community + built-in)
mcp-recall profiles install <id>   # download a community profile by ID
mcp-recall profiles update    # pull updates for all installed community profiles
mcp-recall profiles remove <id>    # delete an installed community profile
mcp-recall profiles seed      # install community profiles for all detected MCPs
mcp-recall profiles feed      # contribute a local profile back to the community repo
mcp-recall profiles check     # detect pattern conflicts between installed profiles
mcp-recall profiles test <name>    # apply a profile to a stored or file input and show the result
mcp-recall profiles retrain   # analyze stored corpus to suggest improved profile fields
mcp-recall profiles info <id> # show details for a community profile
mcp-recall profiles available # list community profiles available to install
```

## Phases

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Scaffold, config, project-key | Complete |
| 2 | Denylist + secret detection | Complete |
| 3 | Compression handlers | Complete |
| 4 | SQLite + FTS5 + chunking DB layer | Complete |
| 5 | Hook pipeline (dedup, eviction) | Complete |
| 6 | MCP server tools | Complete |
| 7 | Install / uninstall / status CLI | Complete |
| 8 | Profile system (community + user + built-in tiers) | Complete |
| 9 | `mcp-recall learn` — auto-generate profiles from live MCP servers | Complete |
| 10 | Retrieval quality — search hints, graduated retrieval, decay eviction, output dedup, structure-aware fallback | Complete (v1.9.0) |
| 11 | Store lifecycle — `gc`, free-page reclamation, pin-budget reporting | Complete (v1.10.0) |
| 12 | Supply chain — manifest attestation restored (profiles repo), exact signer-identity pinning via `--cert-identity`, old-`gh` diagnosis | Complete (v1.10.0) |
| 12b | Packaging integrity — symlink-safe `bin/recall`, publish-time tag/version guard, packaged-CLI CI job | Complete (v1.10.1) |
| 13 | **Current: stabilize + document.** Docs accuracy, contributor architecture doc, `ROADMAP.md`. No new features | In progress |

Phases 1–9 were planned up front. Everything after was reactive — ported ideas from a
competitive review, then a dogfooding pass, then findings from those. Phase 13 exists to
stop and consolidate before adding more. Its final step is a `ROADMAP.md` stating what is
deliberately out of scope; until that lands, this table is the only statement of direction.

## Testing Conventions

- Test files: `tests/<module>.test.ts`
- Tests use Bun's native test runner (`import { test, expect, describe } from "bun:test"`)
- No external test frameworks
- Name tests: `"<what> <expected>"` (e.g., `"merges user config over defaults"`)
- `resetConfig()` must be called in `afterEach` for config tests to avoid cache bleed

## Key Config Paths

- Default config: `~/.config/mcp-recall/config.toml`
- Override via: `RECALL_CONFIG_PATH` env var
- SQLite DB: `~/.local/share/mcp-recall/<project-key>.db` (override via `RECALL_DB_PATH`)
- SQLite DB excluded from git via `.gitignore` (`*.db*`)
- Debug logging: `RECALL_DEBUG=1`, or `[debug] enabled = true` in config. The config key is
  currently undocumented for users — only the env var appears in `docs/troubleshooting.md`

When adding a config key, it must land in three places or it is undiscoverable: the Zod
schema, `DEFAULTS`, and the user-facing docs. The audit for this is mechanical — compare
`grep -oE "^ {4}[a-z_]+:" src/config.ts` (portable; `\s` is GNU-only) against `README.md` and `docs/`.

## Denylist Defaults (never store outputs from)

Password managers (explicit — tool names like `get_item`, `list_logins`, `vault read` don't match keyword patterns):
- `mcp__1password__*`, `mcp__bitwarden__*`, `mcp__lastpass__*`, `mcp__dashlane__*`, `mcp__keeper__*`
- `mcp__hashicorp_vault__*`, `mcp__vault__*`, `mcp__doppler__*`, `mcp__infisical__*`

Keyword patterns (catch remaining credential-adjacent tool names):
- Broad: `*secret*`, `*password*`, `*credential*`, `*token*`
- Key-specific: `*api_key*`, `*access_key*`, `*private_key*`, `*signing_key*`, `*encrypt*key*`
- Auth-specific: `*oauth*`, `*auth_token*`, `*authenticate*`
- Env-specific: `*env_var*`, `*dotenv*`

Allowlist (`denylist.allowlist` in config) overrides deny patterns for specific tools.

Own tools:
- `mcp__recall__*` (never intercept own tools)
