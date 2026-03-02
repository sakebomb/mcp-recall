# mcp-recall

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Runtime: Bun](https://img.shields.io/badge/runtime-Bun-f472b6.svg)
![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-plugin-orange.svg)

**Context compression and persistent retrieval for Claude Code.**

MCP tool outputs — Playwright snapshots, GitHub issues, file reads — can consume tens of kilobytes of context per call. A 200K token context window fills up in ~30 minutes of active MCP use. mcp-recall intercepts those outputs, stores them in full locally, and delivers compressed summaries to Claude instead. When Claude needs more detail, it retrieves exactly what it needs via FTS search — without re-running the tool.

Sessions that used to hit context limits in 30 minutes routinely run for 3+ hours.

---

## How it works

```
                    MCP tool response
                    (e.g. 56 KB snapshot)
                           │
                    PostToolUse hook
                           │
               ┌───────────┴────────────┐
               │     Security checks    │
               │  ┌──────────────────┐  │
               │  │ denylist match?  ├──┼──► skip: original passes through
               │  │ secret detected? ├──┼──► skip + warn: original passes through
               │  └──────────────────┘  │
               └───────────┬────────────┘
                           │
               ┌───────────┴────────────┐
               │      Dedup check       │
               │                        │
               │  sha256(name+input) ───┼──► [cached] header on hit
               └───────────┬────────────┘
                           │ (miss)
               ┌───────────┴────────────┐
               │   Compression handler  │
               │                        │
               │  Playwright → elements │
               │  GitHub     → key fields│
               │  Linear     → issues   │
               │  Slack      → messages │
               │  CSV        → row/col  │
               │  Filesystem → 50 lines │
               │  JSON       → depth 3  │
               │  Text       → 500 chars│
               └──────┬─────────────────┘
                      │
            ┌─────────┴──────────┐
            │                    │
            ▼                    ▼
   ┌─────────────────┐  ┌────────────────────────┐
   │     Context     │  │      SQLite store       │
   │                 │  │                         │
   │  299 B summary  │  │  full_content  (56 KB)  │
   │  + recall header│  │  summary       (299 B)  │
   │                 │  │  FTS index              │
   └─────────────────┘  │  access tracking        │
                        │  session_days           │
                        └────────────┬────────────┘
                                     │
                        ┌────────────┴────────────┐
                        │     recall__* tools     │
                        │                         │
                        │  retrieve(id, query?)   │
                        │  search(query)          │
                        │  pin(id)                │
                        │  note(text)             │
                        │  export()               │
                        │  list_stored()          │
                        │  forget(...)            │
                        │  stats()                │
                        │  session_summary()      │
                        │  context()              │
                        └─────────────────────────┘
```

**Two hooks, one MCP server.**

- `SessionStart` hook — records each active day for session-scoped expiry
- `PostToolUse` hook — intercepts MCP tool outputs; deduplicates identical calls; compresses, stores, and returns summary
- `recall` MCP server — exposes ten tools for retrieval, search, memory, and management

> **Scope**: Compression applies to MCP tools only. Claude Code's `PostToolUse` hook can replace MCP tool output via `updatedMCPToolOutput`. Built-in tools (Read, Bash, Grep) don't support output replacement — their full output still enters context directly. See [Scope](#scope) for details and the recommended workaround.

---

## Results

Real numbers from actual tool calls:

| Tool | Original | Delivered | Reduction |
|---|---|---|---|
| `mcp__playwright__snapshot` | 56.2 KB | 299 B | 99.5% |
| `mcp__github__list_issues` (20 items) | 59.1 KB | 1.1 KB | 98.1% |
| `mcp__filesystem__read_file` (large file) | 85.0 KB | 2.2 KB | 97.4% |
| Analytics CSV (500 rows) | 85.0 KB | 222 B | 99.7% |

Across a full session: 315 KB of tool output → 5.4 KB delivered to context.

---

## Install

### Prerequisites

- [Claude Code](https://claude.ai/claude-code) installed
- [Bun](https://bun.sh) installed — `curl -fsSL https://bun.sh/install | bash`

### Install

```bash
claude plugin install mcp-recall
```

Both hooks and the MCP server register automatically. No manual config needed.

Verify it loaded:

```bash
claude --debug
# Look for: "loading plugin mcp-recall" with no errors
```

### Update

```bash
claude plugin update mcp-recall
```

### Uninstall

```bash
claude plugin uninstall mcp-recall
```

---

## Configuration

mcp-recall works out of the box. To customize, create `~/.config/mcp-recall/config.toml`:

```toml
[store]
# Days of actual Claude Code use before stored items expire.
# Vacations and context switches to other projects don't count —
# only days you actively used Claude Code on this project.
# See "Session days" below.
expire_after_session_days = 7

# How to identify a project.
# "git_root" is recommended — stable regardless of launch directory.
# Falls back to "cwd" if not inside a git repo.
key = "git_root"

# Hard cap on store size in megabytes. Least-frequently-accessed
# non-pinned items are evicted when this limit is exceeded.
max_size_mb = 500

[retrieve]
# Max bytes returned by recall__retrieve() when no query is provided.
# Claude can override this per-call via the max_bytes parameter.
default_max_bytes = 8192

[denylist]
# Additional tool name glob patterns to never store.
# These extend the built-in defaults — they don't replace them.
additional = [
  # "*myserver*secret*",
]

# Replace built-in defaults entirely (use sparingly).
# Must re-specify any defaults you still want.
override_defaults = [
  # "mcp__recall__*",
  # "mcp__1password__*",
]
```

### Session days

The `expire_after_session_days` setting counts **days you actively use Claude Code on this project** — not calendar days. If you work on a task on Monday, leave for a week, and come back the following Tuesday, your stored context is still exactly as you left it. The counter only advances when you open a session.

This means a 7-day setting gives you 7 working sessions of stored context, regardless of how much calendar time passes between them.

---

## Tools

Ten `recall__*` tools are available to Claude in every session.

### `recall__retrieve`

Fetch stored content from a previous tool call.

```
recall__retrieve(id, query?, max_bytes?)
```

- Omit `query` to return the compressed summary
- Pass `query` to return an FTS excerpt focused on the relevant section — falls back to full content (capped at `max_bytes`) if the query has no match
- Override `max_bytes` when you need more than the default 8 KB on a full-content retrieval

Every call records an access, which informs `sort: "accessed"` and LFU eviction order.

**When Claude uses it**: when a compressed summary isn't enough and it needs specific detail from a prior tool call.

---

### `recall__search`

Search across all stored outputs by content.

```
recall__search(query, tool?, limit?)
```

- FTS search (BM25 ranking) across all stored tool outputs for the current project
- Filter by tool name with `tool` (substring match — e.g. `"github"` matches all `mcp__github__*` tools)
- Default `limit`: 5 results

**When Claude uses it**: when it doesn't have an ID but knows what it's looking for — e.g. *"find the Playwright snapshot that had the login form"*.

---

### `recall__pin`

Pin an item to protect it from expiry and eviction.

```
recall__pin(id, pinned?)
```

- `pinned` defaults to `true`; pass `false` to unpin
- Pinned items are excluded from `pruneExpired`, LFU eviction, and `forget(all: true)` (unless `force: true`)

**When Claude uses it**: to preserve an important result indefinitely — architectural decisions, key findings, expensive snapshots.

---

### `recall__note`

Store arbitrary text as a recall note.

```
recall__note(text, title?)
```

- Stores as `tool_name = "recall__note"` — searchable and retrievable like any other item
- Use for conclusions, findings, and context that should survive a context reset
- `title` appears in list/search output; defaults to `(note)`

**When Claude uses it**: to record its own conclusions or project context that doesn't come from a tool call.

---

### `recall__export`

Export all stored items as JSON.

```
recall__export()
```

- Returns a JSON array of all stored items for the current project, ordered oldest-first
- Use before `forget(all: true)` to preserve data

---

### `recall__forget`

Delete stored items.

```
recall__forget(id?, tool?, session_id?, older_than_days?, all?, confirmed?, force?)
```

| Usage | Effect |
|---|---|
| `forget(id: "recall_abc12345")` | Delete one item |
| `forget(tool: "mcp__github__list_issues")` | Delete all items from that tool |
| `forget(session_id: "xyz")` | Delete everything from a specific session |
| `forget(older_than_days: 3)` | Delete items older than 3 calendar days |
| `forget(all: true, confirmed: true)` | Wipe the entire store |
| `forget(all: true, confirmed: true, force: true)` | Wipe including pinned items |

Pinned items are skipped by default. Pass `force: true` to override pin protection.

---

### `recall__list_stored`

Browse stored items.

```
recall__list_stored(limit?, offset?, tool?, sort?)
```

- Default `limit`: 10
- `sort`: `"recent"` (default) | `"accessed"` | `"size"`
  - `"accessed"` orders by access count descending — most-used items first
- `tool` uses substring matching — `"playwright"` matches all Playwright tools
- Returns a compact table with recall IDs, tool names, dates, size/reduction info, and 📌 for pinned items

---

### `recall__stats`

Aggregate session efficiency report.

```
recall__stats()
```

Example output:

```
Session stats for current project:
  Items stored:      23
  Original size:     342KB
  Compressed size:   6.1KB
  Saved:             98.2% reduction
  ~Tokens saved:     ~84,000
  Session days:      4
```

---

### `recall__session_summary`

Digest of a single session's activity.

```
recall__session_summary(session_id?, date?)
```

- Defaults to today (UTC). Pass `date` (YYYY-MM-DD) for a specific day, or `session_id` for a specific Claude session.
- Shows: items stored, compression savings, tool breakdown by count, most-accessed items, pinned items, and notes stored that session.

Example output:

```
Session Summary — 2026-03-02
────────────────────────────────────
Stored: 12 items · 847KB → 23KB (97% reduction)
Retrieved: 5 items · 8 total accesses

Tools stored:
  mcp__playwright__browser_snapshot            ×4
  mcp__github__list_issues                     ×3
  mcp__filesystem__read_file                   ×2
  recall__note                                 ×1
  + 2 more

Most accessed:
  recall_ab12cd (×3) mcp__playwright__browser_snapshot
    Page: Dashboard · 12 interactive elements…

Pinned: 1
  📌 recall_ef34gh  recall__note
    Auth flow: use JWT with 1h expiry…
```

**When Claude uses it**: to review what happened in a session, or to hand off context to a new session.

---

### `recall__context`

Session orientation — the first thing to call when starting a new session.

```
recall__context(days?, limit?)
```

- Returns pinned items, recent notes, recently accessed items (default: last 7 days, up to 5), and a one-line last-session headline.
- Each item appears in exactly one section — pinned items are never duplicated in the recently accessed section.
- `days` controls the lookback window for recently accessed items. `limit` caps how many recent items are shown.

Example output:

```
Context — 2026-03-02
════════════════════════════════════

Pinned (1):
  📌 recall_ab12  recall__note                          2026-03-01
    Auth flow: use JWT with 1h expiry, refresh at 80%…

Notes (1):
  recall_cd34  2026-03-01
    Deploy checklist: run migrations, restart workers…

Recently accessed (last 7 days, 2 items):
  recall_ef56  mcp__github__list_issues    2026-03-02  ×3
    #42 "Add session summary" [open]…

Last session (2026-03-01):
  12 items stored · 847KB → 23KB (97% reduction)
```

**When Claude uses it**: at the start of every session to re-orient to prior work without having to remember IDs.

---

## Compression handlers

Handlers are selected by tool name, with content-based fallback. Every compressed result includes a header line:

```
[recall:recall_abc12345 · 56.2KB→299B (99% reduction)]
```

Repeated identical tool calls return a cached header instead of re-compressing:

```
[recall:recall_abc12345 · cached · 2026-03-01]
```

| Handler | Matches | Strategy |
|---|---|---|
| Playwright | tool name contains `playwright` and `snapshot` | Interactive elements (buttons, inputs, links), visible text, headings. Drops aria noise. |
| GitHub | `mcp__github__*` | Number, title, state, body (200 chars), labels, URL. Lists: first 10 + overflow count. |
| Linear | tool name contains `linear` | Identifier, title, state, priority (numeric → label), description excerpt (200 chars), URL. Handles single, array, GraphQL, and Relay shapes. |
| Slack | tool name contains `slack` | Channel, formatted timestamp, user/display name, message text (200 chars). Handles `{ok, messages}` wrappers and bare arrays. Lists: first 10 + overflow count. |
| Filesystem | `mcp__filesystem__*` or tool name contains `read_file` / `get_file` | Line count header + first 50 lines + truncation notice. |
| CSV | tool name contains `csv`, or content-based detection | Column headers + first 5 data rows as key=value pairs + row/col count. Handles quoted fields. |
| Generic JSON | Any unmatched tool with JSON output | 3-level depth limit, arrays capped at 3 items with overflow count. |
| Generic text | Everything else | First 500 chars + ellipsis. |

The generic JSON handler is intentionally conservative — it keeps structure and marks what was dropped. Correctness matters more than compression ratio. Claude needs to trust the summaries.

---

## Denylist

The following tool glob patterns are **never stored**, regardless of config:

| Pattern | Reason |
|---|---|
| `mcp__recall__*` | Prevent circular compression of recall's own tools |
| `mcp__1password__*` | Credential manager by definition |
| `*secret*` | Catches `get_secret`, `read_secret`, etc. |
| `*token*` | Auth tokens |
| `*password*` | Passwords |
| `*credential*` | Credentials |
| `*key*` | API keys, private keys |
| `*auth*` | Auth flows |
| `*env*` | Environment variables |

Output is also scanned for known secret patterns before any write — PEM headers, SSH private keys, GitHub PATs (classic and fine-grained), OpenAI keys, Anthropic keys, AWS access key IDs, and generic Bearer tokens. Matches are skipped and logged as warnings to stderr.

Extend the defaults via `denylist.additional`. Replace them entirely via `denylist.override_defaults` (you must re-specify any defaults you still want).

---

## Scope

**Compression applies to MCP tools only.**

Claude Code's `PostToolUse` hook can replace MCP tool output via `updatedMCPToolOutput`. Built-in tools (Read, Bash, Grep, Glob) don't support output replacement — their full output still enters context directly and mcp-recall has no way to intercept it.

If your biggest context consumers are built-in tool calls, consider switching to MCP equivalents where possible — for example, the [filesystem MCP server](https://github.com/modelcontextprotocol/servers) instead of the built-in Read tool.

---

## Privacy

All stored data lives locally on your machine at `~/.local/share/mcp-recall/`. Nothing is sent to any external service. The SQLite database contains full tool outputs — treat it accordingly.

To wipe all stored data for the current project:

```
recall__forget(all: true, confirmed: true)
```

Or delete the directory directly:

```bash
rm -rf ~/.local/share/mcp-recall/
```

---

## Error contract

mcp-recall never breaks a tool call. Every failure mode degrades gracefully to the original uncompressed output:

| Scenario | Result |
|---|---|
| Hook errors or crashes | Original output passes through (exit 0) |
| SQLite write fails | Catch, log to stderr, original passes through |
| Compression handler throws | Catch, log, original passes through |
| Hook times out (10s limit) | Claude Code cancels, original passes through |
| Secret detected in output | Skip store, log warning, original passes through |
| Output too small to compress | Passthrough — no point storing |

The session gets slightly worse context efficiency on failure. It never gets broken.

---

## Troubleshooting

**Plugin not loading**

```bash
claude --debug
# Look for plugin loading errors
```

If the plugin isn't appearing, confirm Bun is installed and on your PATH:

```bash
bun --version
```

**Hook not firing**

The most common cause is the hook script not being executable:

```bash
ls -la $(claude plugin path mcp-recall)/bin/recall
# Should show -rwxr-xr-x
```

If not executable, reinstall the plugin. If the issue persists, [open an issue](https://github.com/sakebomb/mcp-recall/issues).

**Stats showing zero after first session**

The `SessionStart` hook records the first day. Stats accumulate from the second session onward if nothing was stored in the first session. Run `recall__stats()` after any MCP tool call to confirm data is flowing.

**MCP tools not appearing in Claude**

Restart Claude Code after installing the plugin. The MCP server registers at startup.

---

## Development

```bash
git clone https://github.com/sakebomb/mcp-recall
cd mcp-recall
bun install
bun test
```

### Project structure

```
mcp-recall/
├── .claude-plugin/
│   └── plugin.json         # plugin manifest
├── hooks/
│   └── hooks.json          # SessionStart + PostToolUse hook definitions
├── bin/
│   └── recall              # hook entrypoint (shell script → src/cli.ts)
├── src/
│   ├── server.ts           # MCP server (wires recall__* tools)
│   ├── cli.ts              # CLI dispatcher for hook subcommands
│   ├── tools.ts            # recall__* tool handler logic
│   ├── config.ts           # TOML config loader (Zod-validated)
│   ├── denylist.ts         # glob pattern denylist
│   ├── secrets.ts          # secret pattern detection
│   ├── project-key.ts      # git root detection + SHA256 project key
│   ├── db/
│   │   └── index.ts        # SQLite + FTS5 layer
│   ├── handlers/
│   │   ├── index.ts        # dispatcher
│   │   ├── playwright.ts
│   │   ├── github.ts
│   │   ├── linear.ts
│   │   ├── slack.ts
│   │   ├── csv.ts
│   │   ├── filesystem.ts
│   │   ├── json.ts
│   │   ├── generic.ts
│   │   └── types.ts
│   └── hooks/
│       ├── session-start.ts
│       └── post-tool-use.ts
└── tests/                  # 261 tests, 8 files
```

### Running locally

To test the plugin against a live Claude Code session:

```bash
# Install from local directory instead of marketplace
claude plugin install ./mcp-recall --scope local
claude --debug  # verify plugin loads
```

### Contributing

Issues and PRs welcome. For significant changes, open an issue first to discuss the approach. Please include tests for new handlers and maintain the error contract — mcp-recall must never break a tool call under any failure condition.

---

## Roadmap

### v2 — shipped

- **`recall__pin`** — exempt items from expiry and eviction permanently
- **`recall__note`** — store Claude's own conclusions as project memory
- **`recall__export`** — JSON dump before a full clear
- **Access tracking** — `sort: "accessed"` in `list_stored`; LFU eviction when store exceeds `max_size_mb`
- **Auto-dedup** — `[cached]` header for repeated identical tool calls; no re-compression or second DB write
- **FTS snippets** — `retrieve(query)` returns a focused excerpt via `snippet()` rather than a full content dump
- **Additional handlers** — CSV, Linear, Slack

### v3 — shipped

- **FTS chunking** — split large stored content into overlapping chunks for more precise snippet retrieval on long documents

### v4 — shipped

- **`recall__session_summary`** — digest of a single session: tools called, compression savings, most-accessed items, pinned items, notes. Filter by date or session ID.

### v5 — shipped

- **`recall__context`** — single-call session orientation: pinned items, recent notes, recently accessed items (configurable lookback), and last session headline. Call at the start of every session.

---

## License

MIT — see [LICENSE](LICENSE)
