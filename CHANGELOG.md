# Changelog

All notable changes to mcp-recall are documented here.

---

## v1.3.0 — 2026-03-03

### `mcp-recall profiles test`

New subcommand to apply a profile to real input and inspect the result — completes the contributor loop.

```bash
mcp-recall profiles test mcp__jira__search_issues --stored recall_abc123
mcp-recall profiles test mcp__stripe__list_customers --input fixture.json
```

Shows which profile matched (ID, tier, pattern, file, strategy), input and output sizes, compression percentage, and the full summary as Claude would receive it. Accepts input from a stored item (`--stored <id>`) or a local file (`--input <file>`).

### Password manager denylist hardening

Eight additional password managers added to the built-in denylist: `mcp__bitwarden__*`, `mcp__lastpass__*`, `mcp__dashlane__*`, `mcp__keeper__*`, `mcp__hashicorp_vault__*`, `mcp__vault__*`, `mcp__doppler__*`, `mcp__infisical__*`. These use tool names like `get_item`, `list_logins`, and `vault read` that don't contain `*secret*`/`*credential*` keywords — explicit entries ensure they're always blocked.

---

## v1.2.0 — 2026-03-03

### Hot cache in `recall__context`

The context snapshot injected at session start now includes a **"Hot from last session"** section: the top accessed items from the previous session, ordered by access count. Items already in pinned, notes, or recent are excluded so nothing appears twice. Helps orient Claude toward the output it retrieved most heavily in the previous session.

### Per-tool breakdown in `recall__stats`

`recall__stats` now includes a **"By tool"** table sorted by original size, showing item count, raw → compressed sizes, and reduction percentage for every tool in the store. Makes it easy to see which MCPs are generating the most context pressure.

### `mcp-recall profiles retrain`

New subcommand: scans stored session data and suggests field paths to add to existing `json_extract` profiles, using frequency analysis across real tool outputs.

```bash
mcp-recall profiles retrain            # dry-run — print suggestions
mcp-recall profiles retrain --apply    # append new fields to matching profiles
mcp-recall profiles retrain --depth 4  # scan deeper (default: 3 levels, a.b.c)
mcp-recall profiles retrain jira       # limit to tools matching "jira"
```

Suggestions require ≥3 stored outputs. Fields appearing in ≥50% of outputs are shown with frequency percentages. `--apply` is additive (never removes existing fields) and bumps the patch version automatically.

Per-profile depth override: add `[retrain] max_depth = N` to any profile TOML.

→ [Full retrain guide](docs/retrain.md)

### Community profiles

Three new profiles added to [sakebomb/mcp-recall-profiles](https://github.com/sakebomb/mcp-recall-profiles): **Vercel**, **HubSpot**, **Google Calendar**. Total: 9 profiles.

### Stats

431 tests, 0 failures (+35 new tests).

---

## v1.1.0 — 2026-03-03

### TOML profile system

Declarative TOML profiles extend compression to any MCP — no TypeScript required. Three strategies: `json_extract` (extract specific fields), `json_truncate` (depth-limited rendering), `text_truncate` (character cap). Priority chain: user → community → bundled → TypeScript handlers → generic.

User profiles: `~/.config/mcp-recall/profiles/<id>/default.toml`

### `mcp-recall profiles` CLI

Seven subcommands for managing profiles:

```bash
mcp-recall profiles list              # show all installed profiles
mcp-recall profiles seed              # install community profiles for detected MCPs
mcp-recall profiles install <id>      # install a specific community profile
mcp-recall profiles update            # update all installed community profiles
mcp-recall profiles remove <id>       # remove a community profile
mcp-recall profiles feed profile.toml # contribute a profile to the community
mcp-recall profiles check             # detect pattern conflicts
```

### `mcp-recall learn`

Auto-generates TOML profile templates by spawning each MCP server, calling `tools/list`, and inferring field names from tool names and descriptions.

```bash
mcp-recall learn            # generate profiles for all MCPs in ~/.claude.json
mcp-recall learn --dry-run  # preview without writing
mcp-recall learn jira       # generate for a specific server
```

### Bundled Jira profile

`profiles/mcp__jira/default.toml` ships with mcp-recall — Jira compression works with no install step.

### Community profiles repo

Shared profiles at [sakebomb/mcp-recall-profiles](https://github.com/sakebomb/mcp-recall-profiles). Launch profiles: Jira (bundled), Confluence, Gmail, AWS, GCP, Figma.

### Stats

396 tests, 0 failures (+51 new tests).

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
