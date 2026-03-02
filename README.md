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
               │   Compression handler  │
               │                        │
               │  Playwright → elements │
               │  GitHub     → key fields│
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
   └─────────────────┘  │  session_days           │
                        └────────────┬────────────┘
                                     │
                        ┌────────────┴────────────┐
                        │     recall__* tools     │
                        │                         │
                        │  retrieve(id, query?)   │
                        │  search(query)          │
                        │  list_stored()          │
                        │  stats()                │
                        │  forget(...)            │
                        └─────────────────────────┘
```

**Two hooks, one MCP server.**

- `SessionStart` hook — records each active day for session-scoped expiry
- `PostToolUse` hook — intercepts MCP tool outputs, compresses, stores, returns summary
- `recall` MCP server — exposes five tools for retrieval, search, and management

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

# Hard cap on store size in megabytes.
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

Five `recall__*` tools are available to Claude in every session.

### `recall__retrieve`

Fetch stored content from a previous tool call.

```
recall__retrieve(id, query?, max_bytes?)
```

- Pass `query` to return the full stored content (capped at `max_bytes`) — useful when you need more detail than the summary provides
- Omit `query` to return the compressed summary
- Override `max_bytes` when you know you need more than the default 8 KB

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

### `recall__forget`

Delete stored items.

```
recall__forget(id?, tool?, session_id?, older_than_days?, all?, confirmed?)
```

| Usage | Effect |
|---|---|
| `forget(id: "recall_abc12345")` | Delete one item |
| `forget(tool: "mcp__github__list_issues")` | Delete all items from that tool |
| `forget(session_id: "xyz")` | Delete everything from a specific session |
| `forget(older_than_days: 3)` | Delete items older than 3 calendar days |
| `forget(all: true, confirmed: true)` | Wipe the entire store |

---

### `recall__list_stored`

Browse stored items.

```
recall__list_stored(limit?, offset?, tool?, sort?)
```

- Default `limit`: 10
- `sort`: `"recent"` (default) | `"size"`
- `tool` uses substring matching — `"playwright"` matches all Playwright tools
- Returns a compact table with recall IDs, tool names, dates, and size/reduction info

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

## Compression handlers

Handlers are selected by tool name, with content-based fallback. Every compressed result includes a header line:

```
[recall:recall_abc12345 · 56.2KB→299B (99% reduction)]
```

| Handler | Matches | Strategy |
|---|---|---|
| Playwright | tool name contains `playwright` and `snapshot` | Interactive elements (buttons, inputs, links), visible text, headings. Drops aria noise. |
| GitHub | `mcp__github__*` | Number, title, state, body (200 chars), labels, URL. Lists: first 10 + overflow count. |
| Filesystem | `mcp__filesystem__*` or tool name contains `read_file` / `get_file` | Line count header + first 50 lines + truncation notice. |
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
│   │   ├── filesystem.ts
│   │   ├── json.ts
│   │   ├── generic.ts
│   │   └── types.ts
│   └── hooks/
│       ├── session-start.ts
│       └── post-tool-use.ts
└── tests/                  # 148 tests, 8 files
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

### v2

- **`recall__pin`** — exempt an item from expiry permanently
- **`recall__note`** — store Claude's own conclusions, not just tool outputs (project memory layer)
- **`recall__export`** — JSON dump before a full clear
- **Access tracking** — `sort: "accessed"` in `list_stored`, LFU eviction when store exceeds `max_size_mb`
- **Auto-dedup** — return cached results for repeated identical tool calls, with staleness signals
- **FTS chunking** — chunk stored content for more precise retrieve results
- **Additional handlers** — CSV/tabular, Linear, Slack

---

## License

MIT — see [LICENSE](LICENSE)
