# Changelog

All notable changes to mcp-recall are documented here.

---

## v1.0.0 — 2026-03-02

Initial public release.

### Hook pipeline

- **PostToolUse hook** intercepts all `mcp__*` tool outputs and the native `Bash` tool. Compresses, stores full content in SQLite, and returns a brief summary to Claude. Deduplicates identical calls via `sha256(tool_name + input)` — repeated calls return a `[cached]` header without re-compression.
- **SessionStart hook** records each active day, prunes expired entries, and injects a compact context snapshot before the first message (pinned items, notes, recently accessed items). Capped at 2000 chars with a truncation notice.
- **Denylist** — built-in glob patterns block credential tools (`*secret*`, `*token*`, `*password*`, `*key*`, `*auth*`, `mcp__1password__*`, etc.). Configurable via `denylist.additional` and `denylist.override_defaults`.
- **Secret detection** — 10 patterns (PEM headers, SSH private keys, GitHub PATs, OpenAI, Anthropic, AWS, Bearer tokens). Outputs matching any pattern are skipped and logged.
- **Project key** — stable 16-char SHA256 hash of the git root path; falls back to CWD.
- **Config** — TOML at `~/.config/mcp-recall/config.toml` (Zod-validated); override via `RECALL_CONFIG_PATH`.

### Compression handlers

| Handler | Matches | Strategy |
|---------|---------|----------|
| Bash | native `Bash` tool | CLI-aware: git diff → file-level stats; git log → 20-commit cap; terraform plan → resource actions; fallback → shell |
| Playwright | `playwright` + `snapshot` in tool name | Interactive elements, visible text, headings. Drops aria noise. |
| GitHub | `mcp__github__*` | Number, title, state, body (200 chars), labels, URL. First 10 + overflow. |
| Shell | `bash`, `shell`, `terminal`, `run_command`, `ssh_exec`, `exec_command`, `remote_exec`, `container_exec` | ANSI + SSH noise stripping. Structured JSON support. 50-line stdout cap, 20-line stderr cap. |
| Linear | `linear` in tool name | Identifier, title, state, priority, description (200 chars), URL. |
| Slack | `slack` in tool name | Channel, timestamp, user, message text (200 chars). First 10 + overflow. |
| Tavily | `tavily` in tool name | Query, synthesized answer, per-result title/URL/150-char snippet. Drops raw_content/score. First 10 + overflow. |
| Filesystem | `mcp__filesystem__*` or `read_file`/`get_file` | Line count + first 50 lines. |
| CSV | `csv` in tool name or content-based | Headers + first 5 data rows + row/col count. |
| Generic JSON | Unmatched JSON output | Depth-3 limit, arrays capped at 3 items. |
| Generic text | Everything else | First 500 chars. |

### MCP server tools

Ten `recall__*` tools available in every Claude session:

- **`recall__retrieve`** — fetch stored content by ID; pass `query` for an FTS excerpt focused on the relevant section
- **`recall__search`** — FTS search (BM25) across all stored outputs; each result includes a content snippet
- **`recall__forget`** — delete by id / tool / session / age / all; `force: true` overrides pin protection
- **`recall__list_stored`** — paginated browse; sortable by recent, accessed count, or size
- **`recall__stats`** — aggregate efficiency report with pin suggestions and stale item alerts
- **`recall__pin`** — pin/unpin items; pinned items are exempt from expiry and LFU eviction
- **`recall__note`** — store arbitrary text as project memory; searchable like any stored item
- **`recall__export`** — JSON dump of all stored items, oldest-first
- **`recall__session_summary`** — per-session digest: tool breakdown, top accessed, pinned items, notes
- **`recall__context`** — session orientation: pinned items, notes, recently accessed, last session headline

### Storage

- SQLite + FTS5 at `~/.local/share/mcp-recall/<project-key>.db`
- FTS chunking — content split into overlapping 512-char chunks for precise snippet retrieval on long documents
- Access tracking — `access_count` and `last_accessed` per item; LFU eviction when store exceeds `max_size_mb`
- Session-day expiry — counts active Claude Code days, not calendar days; vacations don't drain your stored context
