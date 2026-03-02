# Changelog

All notable changes to mcp-recall are documented here.

---

## v1.0.0 — 2026-03-01

Initial release.

### Core pipeline

- **PostToolUse hook** intercepts all `mcp__*` tool outputs (except `mcp__recall__*`), compresses them, stores full content in SQLite, and returns a brief summary to Claude.
- **SessionStart hook** records each active day and prunes expired entries.
- **Denylist** — built-in glob patterns block credential tools (`*secret*`, `*token*`, `*password*`, `*key*`, `*auth*`, `mcp__1password__*`, etc.). Configurable via `denylist.additional` and `denylist.override_defaults`.
- **Secret detection** — 10 patterns (PEM headers, SSH private keys, GitHub PATs, OpenAI, Anthropic, AWS, Bearer tokens). Outputs matching any pattern are skipped and logged.
- **Project key** — stable 16-char SHA256 hash of the git root path; falls back to CWD.
- **Config** — TOML at `~/.config/mcp-recall/config.toml` (Zod-validated); override via `RECALL_CONFIG_PATH`.

### Compression handlers (v1)

Playwright (accessibility tree), GitHub (key fields), Filesystem (50-line head), JSON (depth-3 truncation), Generic text (500-char truncation).

### MCP tools (v1)

`recall__retrieve`, `recall__search`, `recall__forget`, `recall__list_stored`, `recall__stats`.

---

## v2.0.0 — 2026-03-01

### Features

- **`recall__pin`** — pin/unpin items; pinned items are exempt from expiry, LFU eviction, and bulk-forget (unless `force: true`).
- **`recall__note`** — store arbitrary text as project memory; searchable and retrievable like any other item.
- **`recall__export`** — JSON dump of all stored items, oldest-first.
- **Access tracking** — `access_count` and `last_accessed` on every retrieval; `sort: "accessed"` in `recall__list_stored`; LFU eviction when store exceeds `max_size_mb`.
- **Auto-dedup** — `sha256(tool_name + input)` fingerprint; identical repeated calls return a `[cached]` header without re-compression or a second DB write.
- **FTS snippets** — `recall__retrieve(id, query)` returns a focused excerpt via `snippet()` rather than a full content slice.

### Additional handlers

CSV (header + 5 data rows), Linear (identifier, title, state, priority, URL), Slack (channel, timestamp, user, text; capped at 10 messages).

---

## v3.0.0 — 2026-03-02

### Features

- **FTS chunking** — full content split into overlapping 512-char chunks (64-char overlap) stored in a `content_chunks` FTS5 table. `recall__retrieve(id, query)` uses chunk-based retrieval first (verbatim match) with a legacy `snippet()` fallback for pre-v3 items.

---

## v4.0.0 — 2026-03-02

### Features

- **`recall__session_summary`** — digest of a single session or calendar day: item count, compression savings, tool breakdown, top-5 accessed items, pinned items, notes. Filter by `session_id` or `date` (YYYY-MM-DD, defaults today UTC).

---

## v5.0.0 — 2026-03-02

### Features

- **`recall__context`** — single-call session orientation: pinned items, unpinned notes, recently accessed items (configurable `days` lookback, default 7), and a one-line last-session headline. Each item appears in exactly one section. Call at the start of every session.

---

## v6.0.0 — 2026-03-02

### Features

- **Shell handler** — dedicated compression for `bash`, `shell`, `terminal`, and `run_command` tools. Strips ANSI escape codes. Parses structured `{stdout, stderr, returncode}` JSON; falls back to plain string. Caps stdout at 50 lines and stderr at 20 lines with overflow counts.
