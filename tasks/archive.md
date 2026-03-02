# archive

Completed work.

## 2026-03-01

### Project Initialization
- `CLAUDE.md` — project-level conventions, architecture, phase roadmap
- `tasks/` — initialized todo, lessons, tests, archive

### Phase 1 — Scaffold, Config, Project Key
- `src/config.ts` — TOML config loader with Zod validation, caching, `resetConfig()`
- `src/project-key.ts` — git root detection + 16-char SHA256 path hash
- `tests/config.test.ts` — 7 tests
- `tests/project-key.test.ts` — 6 tests
- Merged via PR #9

### Phase 2 — Denylist + Secret Detection
- `src/denylist.ts` — glob pattern matching, builtin patterns, config-extensible via `additional` / `override_defaults`
- `src/secrets.ts` — 10 secret patterns (PEM, SSH, GitHub PATs, OpenAI, Anthropic, AWS, Bearer)
- `tests/denylist.test.ts` — 14 tests
- `tests/secrets.test.ts` — 8 tests
- Merged via PR #12

### Phase 3 — Compression Handlers
- `src/handlers/types.ts` — `CompressionResult`, `Handler`, `extractText`
- `src/handlers/playwright.ts` — accessibility tree → interactive elements + visible text
- `src/handlers/github.ts` — GitHub API → field summary, handles single objects and arrays
- `src/handlers/filesystem.ts` — line count header + first 50 lines
- `src/handlers/json.ts` — depth-3 truncation, arrays capped at 3 items
- `src/handlers/generic.ts` — first 500 chars fallback
- `src/handlers/index.ts` — dispatcher by tool name with content-based JSON fallback
- `tests/handlers.test.ts` — 34 tests
- Merged via PR #13

### Phase 4 — SQLite + FTS5 DB Layer
- `src/db/index.ts` — schema, FTS5 virtual table, INSERT/DELETE triggers, all CRUD operations
- Tables: `stored_outputs`, `outputs_fts` (FTS5), `sessions`
- Operations: `storeOutput`, `retrieveOutput`, `searchOutputs`, `listOutputs`, `forgetOutputs`, `getStats`, `pruneExpired`, `recordSession`, `getSessionDays`
- DB path: `~/.local/share/mcp-recall/<project-key>.db` (override via `RECALL_DB_PATH`)
- `tests/db.test.ts` — 32 tests
- Merged via PR #14

### Phase 5 — Hook Pipeline
- `src/hooks/session-start.ts` — records today's date in sessions, prunes expired entries
- `src/hooks/post-tool-use.ts` — full pipeline: denylist → secret scan → compress → store → `updatedMCPToolOutput` with recall header
- `src/cli.ts` — wired subcommands with top-level fail-open error handler
- Output format: `[recall:recall_<id> · <original>→<compressed> (<N>% reduction)]`
- `tests/hooks.test.ts` — 13 tests
- Merged via PR #15

### Phase 6 — MCP Server Tools
- `src/tools.ts` — all 5 tool handler functions (pure, testable)
- `src/server.ts` — thin MCP wiring, initializes project key + DB at startup
- `recall__retrieve` — summary by default; full content (capped) when query provided
- `recall__search` — FTS with tool substring filter and configurable limit
- `recall__forget` — delete by id/tool/session/age/all; safety gate for `all: true`
- `recall__list_stored` — paginated table, sort by recency or size, tool substring filter
- `recall__stats` — item count, sizes, reduction %, estimated token savings, session days
- `tests/tools.test.ts` — 24 tests
- Merged via PR #16

**Total: 148 tests, 0 failures**
