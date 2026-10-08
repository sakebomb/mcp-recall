# Compression handlers

Handlers are selected by tool name, with content-based fallback. Every compressed result includes a header line, ending with a few `search:` hints — salient terms pulled from the stored content so Claude's first `recall__search` lands without guessing keywords:

```
[recall:recall_abc12345 · 56.2KB→299B (99% reduction) · search: "checkout", "sessionToken", "orderId"]
```

Repeated identical tool calls return a cached header instead of re-compressing:

```
[recall:recall_abc12345 · cached · 2026-03-01]
```

| Handler | Matches | Strategy |
|---|---|---|
| Bash | native `Bash` tool | CLI-aware routing on `tool_input.command`: `git diff`/`git show` → changed-files summary with per-file +/- stats; `git log` → 20-commit cap; `terraform plan` → resource action symbols + Plan: summary; `git status` → staged/unstaged counts + branch info; `npm`/`bun`/`yarn`/`pip install` → success or error summary (pnpm → shell compression); `pytest`/`jest`/`bun test`/`vitest`/`go test` → pass/fail counts + failure names; `docker ps` → container name/image/status/ports; `make`/`just` → target + outcome; `gh` → list output compressed to count + first 10 rows, check output to pass/fail summary, view output to key-value metadata; `cargo build`/`check`/`clippy`, `go build`/`vet`, `tsc`, `eslint`, `ruff`, and `npm`/`pnpm`/`yarn`/`bun run typecheck`/`lint`/`build` → error/warning count + individual diagnostics (errors first, capped), never reporting success on a non-zero exit; `grep`/`rg`/`git grep` → match count + files + capped sample; `ls` (`-l`/`-R`) → entry/dir counts; `find`/`fd` → path count + sample; `git branch`/`stash list`/`remote` → ref counts; JSON stdout (any command) → JSON handler; everything else → shell handler. Command routing normalises a leading `cd <dir> && …` and git global options (`--no-pager`, `-C`, `-c`) so wrapped commands still match. |
| Playwright | tool name contains `playwright` and `snapshot` | Interactive elements (buttons, inputs, links), visible text, headings. Drops aria noise. |
| GitHub | `mcp__github__*` | Number, title, state, body (200 chars), labels, URL. Lists: first 10 + overflow count. |
| GitLab | `mcp__gitlab__*` | IID, title, state, description excerpt (200 chars), labels, web URL. Lists: first 10 + overflow count. |
| Stripe | `mcp__stripe__*` | Amount formatting (smallest currency unit, zero-decimal currencies like JPY/KRW handled separately), per-tool routing: customers, invoices, payment intents, subscriptions, products, prices, disputes, payment links, balance, account. |
| Shell | tool name contains `bash`, `shell`, `terminal`, `run_command`, `ssh_exec`, `exec_command`, `remote_exec`, or `container_exec` | Strips ANSI escape codes and SSH post-quantum advisory noise. Parses structured `{stdout, stderr, returncode}` JSON; falls back to plain text. JSON stdout is routed through the JSON handler. Stdout: first 25 lines + overflow count. Stderr: first 20 lines, shown in a separate section. Exit code in header. |
| Linear | tool name contains `linear` | Identifier, title, state, priority (numeric → label), description excerpt (200 chars), URL. Handles single, array, GraphQL, and Relay shapes. |
| Slack | tool name contains `slack` | Channel, formatted timestamp, user/display name, message text (200 chars). Handles `{ok, messages}` wrappers and bare arrays. Lists: first 10 + overflow count. |
| Tavily | tool name contains `tavily` | Query header, synthesized answer in full, per-result title + URL + 150-char content snippet. Drops `raw_content`, `score`, `response_time`. Lists: first 10 + overflow count. |
| Database | tool name contains `postgres`, `mysql`, `sqlite`, or `database` | Row/column count header, column names, first 10 rows as col=value pairs. Handles node-postgres `{rows, fields}`, bare array, and `{results}` wrapper shapes. |
| Sentry | tool name contains `sentry` | Exception type + message, level, environment, release, event ID. Last 8 stack frames (innermost/most relevant). Drops breadcrumbs, SDK info, request headers. |
| Filesystem | `mcp__filesystem__*` or tool name contains `read_file` / `get_file` | Line count header + first 50 lines + truncation notice. |
| CSV | tool name contains `csv`, or content-based detection | Column headers + first 5 data rows as key=value pairs + row/col count. Handles quoted fields. |
| Content blocks | Unmatched tool whose payload is an MCP content-block array with image/audio/resource items | Drops non-text blocks; keeps the text (capture ID, dimensions, tab context) and notes what was stripped. `originalSize` is the pre-strip payload so the hook replaces the screenshot rather than skipping. |
| Generic JSON | Any unmatched tool with JSON output | 3-level depth limit, arrays capped at 3 items with overflow count. |
| Generic text | Everything else | Structure-aware: small output kept whole; long multi-line (logs/traces) → head + tail lines with error/warn lines surfaced from the elided middle; long single-block → head + tail window. Deterministic, no LLM. |

The generic JSON handler is intentionally conservative — it keeps structure and marks what was dropped. Correctness matters more than compression ratio.

User and community [profiles](profiles-quickstart.md) take precedence over these handlers; bundled profiles apply only to tools no handler matches. The dispatch order is documented in [architecture.md](architecture.md#handler-dispatch).

---

→ [README](../README.md) · [Profile schema](profile-schema.md) · [Architecture](architecture.md)
