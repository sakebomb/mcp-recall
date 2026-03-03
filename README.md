# mcp-recall

![CI](https://github.com/sakebomb/mcp-recall/actions/workflows/ci.yml/badge.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Runtime: Bun](https://img.shields.io/badge/runtime-Bun-f472b6.svg)
![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-plugin-orange.svg)

**Context compression and persistent retrieval for Claude Code.**

MCP tool outputs — Playwright snapshots, GitHub issues, file reads — can consume tens of kilobytes of context per call. A 200K token context window fills up in ~30 minutes of active MCP use. mcp-recall intercepts those outputs, stores them in full locally, and delivers compressed summaries to Claude instead. When Claude needs more detail, it retrieves exactly what it needs via FTS search — without re-running the tool.

Sessions that used to hit context limits in 30 minutes routinely run for 3+ hours.

![mcp-recall demo](demo/demo.gif)

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
               │  Shell      → 50 lines │
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

- `SessionStart` hook — records each active day, prunes expired items, and injects a compact context snapshot before the first message
- `PostToolUse` hook — intercepts MCP tool outputs and native Bash commands; deduplicates identical calls; compresses, stores, and returns summary
- `recall` MCP server — exposes ten tools for retrieval, search, memory, and management

> **Scope**: Compression applies to MCP tools and the native `Bash` built-in. The remaining built-ins (Read, Grep, Glob) pass through unchanged. See [Scope](#scope) for details.

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
# Register mcp-recall as a plugin marketplace (one-time)
claude plugin marketplace add mcp-recall https://github.com/sakebomb/mcp-recall

# Install the plugin
claude plugin install mcp-recall@mcp-recall
```

Both hooks and the MCP server register automatically. No manual config needed.

Verify it loaded:

```bash
claude --debug
# Look for: "loading plugin mcp-recall" with no errors
```

### Update

```bash
claude plugin update mcp-recall@mcp-recall
```

### Uninstall

```bash
claude plugin uninstall mcp-recall@mcp-recall
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

# Access count threshold for pin suggestions in recall__stats.
# Items accessed at least this many times will appear as pin candidates.
pin_recommendation_threshold = 5

# Days since creation before a never-accessed item appears as a stale candidate
# in recall__stats. Helps identify stored output that was never retrieved.
stale_item_days = 3

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

| Tool | Use when |
|---|---|
| `recall__context` | Start of session — get pinned items, notes, and recent activity |
| `recall__retrieve(id, query?)` | Need detail from a prior tool call |
| `recall__search(query, tool?)` | Find stored output by content, no ID needed |
| `recall__pin(id)` | Protect an item from expiry and eviction |
| `recall__note(text, title?)` | Store a conclusion or decision as project memory |
| `recall__stats()` | Session efficiency report with savings and suggestions |
| `recall__session_summary(date?)` | Digest of a specific session's activity |
| `recall__list_stored(sort?, tool?)` | Browse stored items |
| `recall__forget(...)` | Delete by id, tool, session, age, or all |
| `recall__export()` | JSON dump of all stored items |

→ [Full tool reference](docs/tools.md)

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
| Bash | native `Bash` tool | CLI-aware routing on `tool_input.command`: `git diff`/`git show` → changed-files summary with per-file +/- stats; `git log` → 20-commit cap; `terraform plan` → resource action symbols + Plan: summary; everything else → shell handler. |
| Playwright | tool name contains `playwright` and `snapshot` | Interactive elements (buttons, inputs, links), visible text, headings. Drops aria noise. |
| GitHub | `mcp__github__*` | Number, title, state, body (200 chars), labels, URL. Lists: first 10 + overflow count. |
| Shell | tool name contains `bash`, `shell`, `terminal`, `run_command`, `ssh_exec`, `exec_command`, `remote_exec`, or `container_exec` | Strips ANSI escape codes and SSH post-quantum advisory noise. Parses structured `{stdout, stderr, returncode}` JSON; falls back to plain text. Stdout: first 50 lines + overflow count. Stderr: first 20 lines, shown in a separate section. Exit code in header. |
| Linear | tool name contains `linear` | Identifier, title, state, priority (numeric → label), description excerpt (200 chars), URL. Handles single, array, GraphQL, and Relay shapes. |
| Slack | tool name contains `slack` | Channel, formatted timestamp, user/display name, message text (200 chars). Handles `{ok, messages}` wrappers and bare arrays. Lists: first 10 + overflow count. |
| Tavily | tool name contains `tavily` | Query header, synthesized answer in full, per-result title + URL + 150-char content snippet. Drops `raw_content`, `score`, `response_time`. Lists: first 10 + overflow count. |
| Filesystem | `mcp__filesystem__*` or tool name contains `read_file` / `get_file` | Line count header + first 50 lines + truncation notice. |
| CSV | tool name contains `csv`, or content-based detection | Column headers + first 5 data rows as key=value pairs + row/col count. Handles quoted fields. |
| Generic JSON | Any unmatched tool with JSON output | 3-level depth limit, arrays capped at 3 items with overflow count. |
| Generic text | Everything else | First 500 chars + ellipsis. |

The generic JSON handler is intentionally conservative — it keeps structure and marks what was dropped. Correctness matters more than compression ratio.

Credential tools are never stored — `mcp__1password__*`, `*secret*`, `*token*`, `*password*`, `*credential*`, `*key*`, `*auth*`, `*env*` are blocked by default. Output is also scanned for secret patterns (PEM headers, GitHub PATs, AWS keys, etc.) before any write. See [SECURITY.md](SECURITY.md) for details.

---

## Scope

**Compression applies to MCP tools and the native Bash built-in.**

Claude Code's `PostToolUse` hook supports output replacement for MCP tools and the `Bash` tool. mcp-recall intercepts both:

- **MCP tools** (`mcp__*`) — all compression handlers apply (Playwright, GitHub, filesystem, shell/remote-exec, Linear, Slack, Tavily, CSV, JSON, generic text)
- **Bash** — CLI-aware handlers: `git diff` → file-level changed-files summary; `git log` → 20-commit cap; `terraform plan` → resource action summary; everything else → 50-line shell cap with ANSI stripping

The remaining built-in tools — `Read`, `Grep`, `Glob` — do not support output replacement. Their full output enters context directly. If large file reads are your biggest context consumer, consider the [filesystem MCP server](https://github.com/modelcontextprotocol/servers) instead of the built-in Read tool.

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

mcp-recall never breaks a tool call. Every failure mode — hook crash, SQLite error, handler exception, timeout, secret detected — degrades gracefully to the original uncompressed output passing through unchanged. The session gets slightly worse context efficiency. It never gets broken.

---

## Troubleshooting

→ [Troubleshooting guide](docs/troubleshooting.md)

---

## Profile system

mcp-recall compresses tool outputs using declarative TOML profiles — no TypeScript required.

**Auto-generate profiles for all your installed MCPs:**

```bash
mcp-recall learn
```

**Browse and manage profiles:**

```bash
mcp-recall profiles list              # show all installed profiles
mcp-recall profiles seed              # install community profiles for detected MCPs
mcp-recall profiles install mcp__jira # install a specific community profile
mcp-recall profiles feed profile.toml # contribute a profile back to the community
mcp-recall profiles check             # detect pattern conflicts
```

Community profiles live at [sakebomb/mcp-recall-profiles](https://github.com/sakebomb/mcp-recall-profiles). Anyone can contribute a TOML profile without writing TypeScript — see [docs/profile-schema.md](docs/profile-schema.md) for the schema.

---

## Development

```bash
git clone https://github.com/sakebomb/mcp-recall
cd mcp-recall
bun install
bun test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for project structure, workflow, and how to add a new compression handler.

---

## What's next

Community contributions welcome — see the [open issues](https://github.com/sakebomb/mcp-recall/issues) for planned handlers:

- [Jira](https://github.com/sakebomb/mcp-recall/issues/49) — issue fields, description excerpt, comment count
- [Notion](https://github.com/sakebomb/mcp-recall/issues/50) — extract readable text from block metadata
- [Database results](https://github.com/sakebomb/mcp-recall/issues/51) — column names + first N rows
- [Sentry](https://github.com/sakebomb/mcp-recall/issues/52) — exception type, message, top stack frames
- [GitLab](https://github.com/sakebomb/mcp-recall/issues/53) — mirrors the GitHub handler

---

## License

MIT — see [LICENSE](LICENSE)
