# mcp-recall

**Context compression and persistent retrieval for Claude Code.**

MCP tool outputs — Playwright snapshots, GitHub issues, file reads — can consume tens of kilobytes of context per call. A 200K token context window fills up in ~30 minutes of active MCP use. mcp-recall intercepts those outputs, stores them in full locally, and delivers compressed summaries to Claude instead. When Claude needs more detail, it retrieves exactly what it needs via FTS search — without re-running the tool.

Sessions that used to hit context limits in 30 minutes routinely run for 3+ hours.

---

## How it works

```
MCP tool returns result (e.g. 56KB Playwright snapshot)
              │
              ▼
    [PostToolUse hook fires]
              │
              ├─► denylist check ──────────────► skip: original passes through
              │
              ├─► secret pattern scan ─────────► skip + warn: original passes through
              │
              ├─► compression handler
              │         │
              │         └─► Playwright: extract elements + visible text
              │             GitHub:     number, title, state, body (200 chars)
              │             Filesystem: line count + first 50 lines
              │             JSON:       depth-limited, array-sampled
              │             Text:       first 500 chars + size notice
              │
              ├─► SQLite store (full output + summary, FTS indexed)
              │
              └─► summary (299B) → Claude's context

                  [recall: mcp__playwright__snapshot | 56.2KB → 299B | id: abc12345 | retrieve() for full]

Later, if Claude needs more detail:

    recall__retrieve("abc12345", "login form")
              │
              └─► FTS search within stored output → returns matching section
```

**Two hooks, one MCP server.**

- `SessionStart` hook — records each active day for session-scoped expiry
- `PostToolUse` hook — intercepts MCP tool outputs, compresses, stores, returns summary
- `recall` MCP server — exposes five tools for retrieval, search, and management

Compression only applies to MCP tools. Built-in Claude Code tools (Read, Bash, Grep) receive an `additionalContext` note that the output is stored, but their full output still enters context. See [Scope](#scope).

---

## Results

Real numbers from actual tool calls:

| Tool | Original | Delivered | Reduction |
|---|---|---|---|
| `mcp__playwright__snapshot` | 56.2 KB | 299 B | 99.5% |
| `mcp__github__list_issues` (20 items) | 59.1 KB | 1.1 KB | 98.1% |
| `mcp__filesystem__read_file` (large file) | 85.0 KB | 2.2 KB | 97.4% |
| Analytics CSV (500 rows) | 85.0 KB | 222 B | 99.7% |

Across a full session: 315 KB of output → 5.4 KB delivered to context.

---

## Install

### Prerequisites

- [Claude Code](https://claude.ai/claude-code) installed
- [Bun](https://bun.sh) installed (`curl -fsSL https://bun.sh/install | bash`)

### Install via Claude Code

```bash
claude plugin install mcp-recall
```

That's it. The plugin registers both hooks and the MCP server automatically. No manual config required.

To verify it's working:

```bash
claude --debug
# Look for: "loading plugin mcp-recall" with no errors
```

---

## Configuration

mcp-recall works out of the box with sensible defaults. To customize, create `~/.config/mcp-recall/config.toml`:

```toml
[store]
# Days of actual Claude Code use before stored items expire.
# Vacations and gaps don't count — only days you actively used Claude Code.
expire_after_session_days = 7

# How to identify a project. "git_root" is recommended — stable regardless
# of which directory you launch Claude from. Falls back to "cwd" if not in a git repo.
key = "git_root"

# Hard cap on SQLite store size. When exceeded, least-frequently-accessed
# items are pruned first (LFU eviction). Pinned items are never pruned.
max_size_mb = 500

# mcp-recall suggests pinning an item after this many retrieve() calls.
# Pinned items survive pruning and manual clears (v2 feature).
pin_recommendation_threshold = 3

[retrieve]
# Default max bytes returned by recall__retrieve() when no query is provided.
# Claude can override this per-call via the max_bytes parameter.
default_max_bytes = 8192

[denylist]
# Additional tool name patterns to never store (regex).
# These extend the built-in defaults — they don't replace them.
additional = [
  # "mcp__myserver__.*__secret.*",
]

# Remove specific patterns from the built-in defaults (use sparingly).
# Built-in defaults exist for good reason — only override if you understand the risk.
override_defaults = [
  # "mcp__1password__vault_list",  # safe to store — returns no secrets
]
```

---

## Tools

Once installed, five `recall__*` tools are available to Claude in every session.

### `recall__retrieve`

Fetch stored content from a previous tool call.

```
recall__retrieve(id, query?, max_bytes?)
```

- Pass `query` to return only relevant sections via FTS search (recommended)
- Omit `query` to return up to `max_bytes` of the full stored output (default 8KB)
- Override `max_bytes` when you know you need more (e.g. a large snapshot)

**When Claude uses it**: automatically, when a compressed summary isn't enough and it needs specific detail from a prior tool call.

---

### `recall__search`

Search across all stored outputs by content.

```
recall__search(query, tool?, limit?)
```

- FTS search (BM25 ranking) across all stored tool outputs for the current project
- Filter by tool name pattern with `tool` (e.g. `"mcp__github__.*"`)
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
| `forget(id: "abc12345")` | Delete one item |
| `forget(tool: "mcp__github__.*")` | Delete all GitHub tool outputs |
| `forget(session_id: "xyz")` | Delete everything from a specific session |
| `forget(older_than_days: 3)` | Delete non-pinned items older than 3 session days |
| `forget(all: true)` | Returns warning + item count, requires confirmation |
| `forget(all: true, confirmed: true)` | Wipes the store (preserves session day history) |

---

### `recall__list_stored`

Browse stored items.

```
recall__list_stored(limit?, offset?, tool?, sort?)
```

- Default `limit`: 10
- `sort`: `"recent"` (default) | `"accessed"` | `"size"`
- Returns a compact table with 8-character IDs, tool name, size, access count, and age

---

### `recall__stats`

Aggregate session efficiency report.

```
recall__stats()
```

Returns something like:

```
Session: 47 minutes
Items stored: 23
Original size: 342 KB  (~85,500 tokens)
Delivered to context: 6.1 KB  (~1,525 tokens)
Saved: 98.2%

Top tools:
  mcp__playwright__snapshot  ×8   →  247 KB stored, 2.1 KB delivered
  mcp__github__list_issues   ×6   →  61 KB stored, 2.8 KB delivered
  mcp__filesystem__read_file ×9   →  34 KB stored, 1.2 KB delivered
```

Stats are also written to `~/.local/share/mcp-recall/{project}/stats.json` after every store operation for use by external tooling.

---

## Compression handlers

Handlers are tried in order. First match wins. Every compressed result includes a header so Claude knows what was stored and how to retrieve more.

```
[recall: mcp__playwright__snapshot | 56.2KB → 299B | id: abc12345 | retrieve() for full]
```

| Handler | Matches | Strategy |
|---|---|---|
| Playwright | `mcp__playwright__.*snapshot.*` | Interactive elements, visible text, page title. Drops aria noise. |
| GitHub | `mcp__github__.*` | Number, title, state, body (200 chars), labels, assignees. Lists: first 5 + count. |
| Filesystem | `mcp__filesystem__.*` | Line count + first 50 lines + truncation notice. |
| Generic JSON | Any JSON output | Conservative: 3-level depth limit, 3-item array sample, `_truncated: true` flag. |
| Generic text | Everything else | First 500 chars + `[+N bytes]` notice. |

The generic JSON handler is intentionally conservative. It keeps structure and marks what was dropped. Correctness matters more than compression ratio — Claude needs to trust the summaries.

---

## Denylist

The following tool patterns are **never stored**, regardless of config. This list cannot be fully disabled, only selectively overridden via `denylist.override_defaults`.

| Pattern | Reason |
|---|---|
| `mcp__1password__.*` | Credential manager by definition |
| `mcp__.*__.*secret.*` | Catches `get_secret`, `read_secret`, etc. |
| `mcp__.*__.*token.*` | Auth tokens |
| `mcp__.*__.*password.*` | Passwords |
| `mcp__.*__.*credential.*` | Credentials |
| `mcp__.*__.*key.*` | API keys, private keys |
| `mcp__.*__.*auth.*` | Auth flows |
| `mcp__.*__.*env.*` | Environment variables |
| `mcp__recall__.*` | Prevent circular compression of recall's own tools |

In addition to name-based matching, output is scanned for known secret patterns before any write — PEM headers, GitHub PATs, OpenAI keys, Slack tokens, and others. If a match is found, the output is skipped and a warning is logged.

---

## Scope

**Compression applies to MCP tools only.**

Claude Code's `PostToolUse` hook can replace MCP tool output via `updatedMCPToolOutput`. Built-in tools (Read, Bash, Grep, Glob) don't support output replacement — their full output still enters context. For built-in tools, mcp-recall stores the output and injects an `additionalContext` note so Claude knows it's retrievable later, but no context is saved in the current session.

If your biggest context consumers are built-in tool calls rather than MCP calls, mcp-recall will help less. The right fix there is using MCP servers instead of built-in tools where possible (e.g. the [filesystem MCP server](https://github.com/modelcontextprotocol/servers) instead of Read).

---

## Privacy

All stored data lives locally on your machine at `~/.local/share/mcp-recall/`. Nothing is sent to any external service. The SQLite database contains full tool outputs — treat it accordingly. Run `recall__forget(all: true, confirmed: true)` to wipe it, or delete the directory directly.

---

## Error contract

mcp-recall never breaks a tool call. Every failure mode degrades gracefully:

| Scenario | Result |
|---|---|
| Hook errors or crashes | Original uncompressed output passes through |
| SQLite write fails | Catch, log to stderr, original passes through |
| Compression handler throws | Catch, log, original passes through |
| Hook times out (10s limit) | Claude Code cancels hook, original passes through |
| Secret detected in output | Skip store, log warning, original passes through |

The session gets slightly worse context efficiency on hook failure. It never gets broken.

---

## Roadmap

### v2

- **`recall__pin`** — exempt an item from expiry permanently
- **`recall__note`** — store Claude's own conclusions, not just tool outputs (project memory layer)
- **`recall__export`** — JSON dump before a full clear
- **Auto-dedup** — return cached results for repeated identical tool calls, with staleness signals
- **FTS chunking** — chunk stored content for more precise retrieve results
- **Additional handlers** — CSV/tabular, Linear, Slack

---

## License

MIT — see [LICENSE](LICENSE)
