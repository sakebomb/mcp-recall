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
bin/recall              Shell entrypoint for hooks (session-start, post-tool-use)
src/
  server.ts             MCP server — exposes 10 recall__* tools
  cli.ts                Hook CLI dispatcher
  config.ts             TOML config loader (Zod-validated, cached)
  project-key.ts        Git root detection + SHA256 path hash
  db/                   SQLite + FTS5 + chunking layer
  handlers/             Compression handlers per tool type (9 handlers)
  hooks/                Hook implementations (SessionStart, PostToolUse)
  denylist.ts           Built-in + configurable denylist
  secrets.ts            Secret pattern detection before any write
tests/                  Bun tests, co-located by module name
.claude-plugin/         Root plugin manifest (local dev / manual install)
hooks/hooks.json        Hook definitions — canonical source, copied to plugins/ on build
plugins/mcp-recall/     Marketplace-installable plugin bundle
  dist/                 Bundled server.js + cli.js (bun build --target bun)
```

**Hook flow**: `PostToolUse` intercepts all `mcp__*` tools (except `mcp__recall__*`) → denylist check → secret scan → dedup check → compress → store in SQLite → return summary to Claude.

**MCP server tools** (all `recall__` prefixed):
- `recall__retrieve` — fetch stored content by ID, with optional FTS snippet
- `recall__search` — FTS across stored outputs with tool filter
- `recall__forget` — delete by id / tool / session / age / all
- `recall__list_stored` — paginated browse, sortable, with tool filter
- `recall__stats` — session efficiency report (counts, sizes, token savings)
- `recall__pin` — pin/unpin items; protected from expiry and LFU eviction
- `recall__note` — store arbitrary text as project memory
- `recall__export` — JSON dump of all items, oldest-first
- `recall__session_summary` — per-session digest (tool breakdown, top accessed, pinned, notes)
- `recall__context` — orientation snapshot: pinned + notes + recently accessed + last session headline

## Phases

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Scaffold, config, project-key | Complete |
| 2 | Denylist + secret detection | Complete |
| 3 | Compression handlers (9 types) | Complete |
| 4 | SQLite + FTS5 + chunking DB layer | Complete |
| 5 | Hook pipeline (dedup, eviction) | Complete |
| 6 | MCP server tools (10 tools) | Complete |

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

## Denylist Defaults (never store outputs from)

- `mcp__1password__.*`
- Tool names matching: `*secret*`, `*token*`, `*password*`, `*credential*`, `*key*`, `*auth*`, `*env*`
- `mcp__recall__.*` (never intercept own tools)
