# todo

Active work and upcoming tasks.

## In Progress

_nothing in progress_

## Up Next — v1.1: MCP-Agnostic Profile System

### Design decisions (locked)

| Question | Decision |
|----------|----------|
| Sampling strategy | Hybrid: schema inspection (default) + paste real output (opt-in) + corpus retrain over time |
| Profile storage | Two-tier: local `~/.config/mcp-recall/profiles/` (user) + `sakebomb/mcp-recall-profiles` (community) |
| Priority chain | Local user > Community installed > Bundled profiles > TypeScript handlers > Generic |
| Zero-code goal | TOML profiles for structured JSON tools. TypeScript handlers for complex parsing (Playwright, git diff, terraform) |
| Runtime layer | Hold — Layer 2 (`recall__register_profile`) deferred to v2.0 |
| Deconfliction | Triggered per request. Specificity wins (exact > wildcard). Cache profiles in memory, invalidate on mtime change |
| `seed` command | Auto-pull community profiles for all detected installed MCPs |
| `feed` command | `gh` CLI to open PR on `mcp-recall-profiles` repo. Clipboard fallback |
| Pending issues (#59–#63) | Become seed TOML profiles in community repo instead of TypeScript handlers |

---

### Step 1 — Define the TOML profile schema spec

**Goal**: Lock the format before building anything that consumes it.

Decisions to make and document:
- Supported strategies: `json_extract`, `text_truncate`, `key_value`, `table`
- Required metadata fields: `mcp_name`, `strategy`, `version`, `description`
- Optional fields: `fields`, `max_items`, `max_chars`, `pattern`
- Wildcard syntax: `mcp__jira__*` vs regex
- Multiple-strategy chaining (e.g. extract then truncate)

**Output**: `docs/profile-schema.md` + one example profile (`profiles/mcp__github__*.toml`)

---

### Step 2 — Create `sakebomb/mcp-recall-profiles` repo ✓ DONE

- https://github.com/sakebomb/mcp-recall-profiles
- `profiles/mcp__jira/default.toml` — seed profile
- `scripts/validate.ts` — required fields, type checks, numeric limits
- `scripts/manifest.ts` — generates `manifest.json` index
- CI: `ci.yml` (validate on push/PR) + `manifest.yml` (regen on profile changes to main)
- `manifest.json` — machine-readable index for `mcp-recall profiles seed`

---

### Step 3 — Build profile evaluator (`src/profiles/`)

Files:
- `src/profiles/loader.ts` — reads TOML from local + installed community paths, caches by mtime
- `src/profiles/resolver.ts` — priority chain lookup + deconfliction (exact > wildcard)
- `src/profiles/strategies.ts` — `json_extract`, `text_truncate`, `key_value`, `table` implementations

Integration point: `src/handlers/index.ts` → `getHandler()` checks profile resolver before TypeScript dispatch.

Tests: `tests/profiles.test.ts` — ≥10 tests covering loader, resolver priority, each strategy, mtime cache invalidation, fallback behavior.

---

### Step 4 — Implement `profiles` subcommand in CLI ✓ DONE

- `src/profiles/commands.ts` — all 7 subcommands (list/install/update/remove/seed/feed/check)
- `src/cli.ts` — intercepts `profiles` before stdin read, routes to commands.ts
- `tests/profiles-commands.test.ts` — 9 tests (patternsOverlap + conflict detection integration)

---

### Step 5 — Implement `mcp-recall learn` ✓ DONE

- `src/learn/client.ts` — stdio MCP client (LineReader, initialize handshake, tools/list, 10s timeout)
- `src/learn/generate.ts` — TOML generator (list-verb heuristic, items_path suggestion, common fields)
- `src/learn/index.ts` — orchestrator (reads ~/.claude.json, skips HTTP/SSE, handles failures gracefully)
- `src/cli.ts` — `learn` wired before stdin read
- `tests/learn.test.ts` — 18 tests (impliesList + generateProfile)

---

### Step 6 — Seed profiles for pending issues

Create TOML profiles in `mcp-recall-profiles` repo for:
- #59 Confluence
- #60 Gmail
- #61 AWS CLI/SDK
- #62 GCP
- #63 Figma

---

### Step 7 — Update README + docs

- Add `mcp-recall learn` to README
- Add `profiles` subcommand docs
- Update compression handler table (profiles section)
- Bump version to 1.1.0

---

## Open Issues (paused / backlog)

| # | Title | Priority | Notes |
|---|-------|----------|-------|
| #58 | Hot cache / smarter SessionStart | P3 | After profile system ships |
| #64 | Vercel handler | P3 | Seed profile instead |
| #65 | HubSpot handler | P3 | Seed profile instead |
| #66 | Calendar handler | P3 | Seed profile instead |
| #67 | User-extensible handlers | P2 | This IS the profile system — resolve against #67 when shipping |
| Claude Code | Runtime config via `/mcp` | — | On hold |
| OpenCode | `tool.execute.after` output mod | — | On hold, v2.0 |
