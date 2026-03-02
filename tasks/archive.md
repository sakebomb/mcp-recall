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

**v1 total: 148 tests, 0 failures**

---

## 2026-03-01 (continued) — v2

### v2 Phase 2a — DB Layer
- `src/db/index.ts` — new columns via idempotent `ALTER TABLE` migrations: `pinned`, `access_count`, `last_accessed`, `input_hash`
- New operations: `recordAccess`, `pinOutput`, `checkDedup`, `evictIfNeeded`, `retrieveSnippet`
- Updated: `pruneExpired` skips pinned; `forgetOutputs` skips pinned (unless `force: true`); `storeOutput` accepts optional `input_hash`
- `tests/db.test.ts` — 52 tests (+20)
- Merged via PR #20

### v2 Phase 2b — Hook Updates
- `src/hooks/post-tool-use.ts` — compute `sha256(tool_name + JSON.stringify(tool_input))` as `input_hash`; dedup check before compression returns `[recall:id · cached · YYYY-MM-DD]` on hit; `evictIfNeeded` called after every successful store
- `tests/hooks.test.ts` — 17 tests (+4)
- Merged via PR #21

### v2 Phase 2c — MCP Tools
- `src/tools.ts` — 3 new tools + 3 updated tools
- `src/server.ts` — wired new tools with descriptions
- `recall__pin(id, pinned?)` — pin/unpin items; protected from expiry and LFU eviction
- `recall__note(text, title?)` — store arbitrary text as `tool_name = "recall__note"` for project memory
- `recall__export` — JSON dump of all items, oldest-first
- `recall__retrieve` (updated) — calls `recordAccess` on every fetch; uses `retrieveSnippet` when query provided, falls back to full content slice on no FTS match
- `recall__list_stored` (updated) — `sort: "accessed"` (access_count DESC); pinned items show 📌
- `recall__forget` (updated) — `force` param overrides pin protection
- `tests/tools.test.ts` — 45 tests (+21)
- Merged via PR #22

### v2 Phase 2d — Additional Handlers
- `src/handlers/csv.ts` — header + first 5 data rows as key=value pairs + row/col count; handles quoted fields; `looksLikeCsv()` for content-based dispatch
- `src/handlers/linear.ts` — identifier, title, state, numeric priority (0–4 → label), description excerpt, URL; handles single, array, GraphQL, and Relay shapes
- `src/handlers/slack.ts` — channel, formatted timestamp, user/display_name, message text (200 char cap); handles `{ ok, messages }`, bare arrays, single message; caps at 10
- `src/handlers/index.ts` — added linear, slack, csv name-based routes + CSV content-based fallback
- `tests/handlers.test.ts` — 72 tests (+38)
- Merged via PR #23

**v2 total: 231 tests, 0 failures**

---

## 2026-03-02 — v3

### v3 — FTS Chunking

- `src/db/index.ts` — new `content_chunks` FTS5 table; INSERT trigger on `stored_outputs` populates chunks; DELETE cascade trigger cleans up on item removal
- `CHUNK_SIZE = 512`, `CHUNK_OVERLAP = 64` — overlapping windows for precise retrieval
- `chunkText(text)` — splits text into overlapping fixed-size character chunks; short texts return single-element array
- `storeChunks(db, id, full_content)` — called by `storeOutput` to populate `content_chunks` after every insert
- `retrieveSnippet` updated — chunk-based path first (returns best matching chunk verbatim via `content_chunks MATCH ? AND output_id = ?`); falls back to legacy `snippet()` on `outputs_fts` for items stored before chunking
- `tests/db.test.ts` — 68 tests (+16): `chunkText` (7), `content_chunks` storage/deletion (4), `retrieveSnippet (chunked)` (5)
- Merged via PR #26

**v3 total: 247 tests, 0 failures**

---

## 2026-03-02 (continued) — v4

### v4 — Session Summary Tool

- `src/db/index.ts` — `SessionSummaryOptions`, `SessionSummaryData` types; `getSessionSummary` runs 5 focused SQL queries (aggregate stats, tool counts, top-5 accessed, pinned, notes); filters by `session_id` (exact) or date range (YYYY-MM-DD, defaults today UTC)
- `src/tools.ts` — `toolSessionSummary` formats structured data into a readable digest
- `src/server.ts` — `recall__session_summary` wired as 9th MCP tool with `session_id?` and `date?` params
- `tests/tools.test.ts` — 52 tests (+7): empty state, aggregate stats, tool breakdown, most accessed, pinned, notes, session_id filter
- Merged via PR #27

**v4 total: 254 tests, 0 failures**

### v5 — Context Tool

- `src/db/index.ts` — `ContextOptions`, `ContextData` types; `getContext` runs 4 SQL queries (pinned, unpinned notes, recently accessed within window, last session headline via `getSessionSummary`); section isolation: each item appears in exactly one section
- `src/tools.ts` — `toolContext` formatter; empty-store fallback message
- `src/server.ts` — `recall__context` wired as 10th MCP tool with `days?` and `limit?` params
- `tests/tools.test.ts` — 59 tests (+7): empty store, pinned, notes, recently accessed, outside-window exclusion, last session headline, pinned exclusion from recent
- Merged via PR #28

**v5 total: 261 tests, 0 failures**

### v6 — Shell Handler

- `src/handlers/shell.ts` — `stripAnsi` (ANSI regex covering colors, cursor, erase), `formatLines` (trims trailing empty lines, 50-line stdout cap / 20-line stderr cap with overflow counts), `parseStructured` (detects `{stdout, stderr, returncode/exit_code/output}` JSON), `shellHandler`
- `src/handlers/index.ts` — routing at step 4 for tool names containing `bash`, `shell`, `terminal`, `run_command`; dispatcher comment updated to 10 steps
- `tests/handlers.test.ts` — 87 tests (+15): `stripAnsi` (3), `shellHandler` (9), dispatcher routing (3)
- Merged via PR #30

**v6 total: 276 tests, 0 failures**

---

## 2026-03-02 (continued) — Marketplace Install + Pre-commit Hook

### Marketplace Install

- `plugins/mcp-recall/.claude-plugin/plugin.json` — metadata only (name, description, author) per marketplace convention
- `plugins/mcp-recall/.mcp.json` — MCP server config: `{"recall": {"command": "bun", "args": ["${CLAUDE_PLUGIN_ROOT}/dist/server.js"]}}`
- `plugins/mcp-recall/hooks/hooks.json` — SessionStart + PostToolUse hooks targeting `bin/recall`
- `plugins/mcp-recall/bin/recall` — wrapper calling `dist/cli.js`
- `plugins/mcp-recall/dist/server.js` + `dist/cli.js` — bundled via `bun build --target bun`; npm deps inlined, `bun:sqlite` stays external
- Root `.claude-plugin/plugin.json` — removed `mcpServers` (metadata-only per marketplace convention)
- `.gitignore` — added `!plugins/mcp-recall/dist/` negation to track distribution bundles
- `package.json` — added `build` script
- `README.md` — updated Install section with two-command marketplace flow
- Merged via PR #32

### Pre-commit Hook

- `.githooks/pre-commit` — detects staged `src/` changes; auto-runs `bun run build` and stages `plugins/mcp-recall/dist/`; no-op otherwise
- `package.json` — added `prepare` script: `git config core.hooksPath .githooks` (wires hook on `bun install`)
- Merged via PR #33
