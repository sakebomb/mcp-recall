# mcp-recall

[![CI](https://github.com/sakebomb/mcp-recall/actions/workflows/ci.yml/badge.svg)](https://github.com/sakebomb/mcp-recall/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/mcp-recall.svg)](https://www.npmjs.com/package/mcp-recall)
[![npm downloads](https://img.shields.io/npm/dw/mcp-recall.svg)](https://www.npmjs.com/package/mcp-recall)
![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)
![Runtime: Bun](https://img.shields.io/badge/runtime-Bun-f472b6.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)
![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-plugin-orange.svg)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)


**Your context window is finite. Tool outputs aren't. mcp-recall bridges the gap.**

MCP tool outputs (Playwright snapshots, GitHub API responses, Linear queries) and long Bash output can consume tens of kilobytes of context per call, and a busy session fills even a large context window long before the work is done. mcp-recall intercepts those outputs, stores them in full locally, and delivers compressed summaries to Claude instead. When Claude needs more detail, it can search the stored output and retrieve it, without re-running the tool.

It works in [Claude Code](https://claude.ai/claude-code), [pi](https://pi.dev), [OpenCode](https://opencode.ai) and xAI's `grok` CLI. [Where it runs](#where-it-runs) gives every agent's status, including the ones still to come.

The goal is sessions that run for hours instead of hitting the context limit in minutes. [Results](#results) shows what is measured today, and the [quality benchmark](docs/benchmarks.md) what the summaries keep.

**Status: maintenance mode since 2026-11-04.** Fixes keep shipping on a weekly release; new features are not planned. Why, and what it deliberately won't become: [ROADMAP.md](ROADMAP.md).

![mcp-recall demo](demo/demo.gif)

---

## Is it for you?

**It is likely to help if:**

- Your sessions run long and lean on MCP tools that return large, structured output, such as browser automation, GitHub, or search and API results. In the browser studies, sessions compacted less often with mcp-recall: 10 compactions fell to 6, and 50 to 29.
- You pay per token on a smaller model. In two Haiku studies, one of long sessions and one of browser tasks, runs cost about a quarter less.
- You want tool output from an earlier session to stay searchable instead of gone.

**It will do little if:**

- Your sessions are short, or your tools return small output. Output that a summary can't shrink by at least a quarter passes through untouched.
- Most of your context goes to the built-in Read, Grep and Glob tools. Claude Code doesn't let a hook replace their output, so mcp-recall never sees it.

**What it has not shown:** that Claude solves more tasks. In paired runs with and without it, no study found a difference in solved tasks larger than chance. Claude also almost never fetched the stored output, so the summaries carry the effect. See the [task-success benchmark](docs/benchmarks.md#task-success-benchmark) for every study and its limits.

**What it costs you:** an install that edits your Claude Code config, and a local SQLite store on your own disk. Nothing leaves your machine, and credentials are never stored: see [Safety and privacy](#safety-and-privacy).

---

## Where it runs

mcp-recall needs an agent that lets a hook rewrite a tool's result before the model sees it, without marking the result as an error. Each supported agent runs the same pipeline through a thin adapter.

| Agent | Status | Setup |
|---|---|---|
| [Claude Code](https://claude.ai/claude-code) | **Supported** | `mcp-recall install`, or the [plugin marketplace](docs/install.md#option-b--claude-code-plugin-marketplace) |
| [pi](https://pi.dev) | **Supported** | `mcp-recall install` adds an extension ([details](docs/install.md#pi)) |
| [OpenCode](https://opencode.ai) | **Supported** | `mcp-recall install` adds a plugin ([details](docs/install.md#opencode)) |
| xAI `grok` CLI | **Supported** in folders you trust in grok | Reads Claude Code's setup ([details](docs/install.md#grok)) |
| GitHub Copilot CLI | **On request** | Its documented hooks should work, untested; ask in [#476](https://github.com/sakebomb/mcp-recall/issues/476) |
| OpenAI Codex CLI | **Waiting on Codex** | A hook can't yet replace a result without an error ([openai/codex#38135](https://github.com/openai/codex/issues/38135)) |
| Gemini CLI, Qwen Code | **Not possible today** | A hook can replace a result only by reporting an error |
| Cursor | **Not possible today** | Its hook doesn't say which MCP server a result came from |

Using an agent that isn't listed? Say so in [#473](https://github.com/sakebomb/mcp-recall/issues/473).

---

## Quick start

You need [Claude Code](https://claude.ai/claude-code) and [Bun](https://bun.sh) (`curl -fsSL https://bun.sh/install | bash`). To run without Bun, use the [standalone binary](docs/install.md#option-d--standalone-binary-no-bun).

```bash
bun add -g mcp-recall    # or: npm i -g mcp-recall
mcp-recall install       # register the hooks and MCP server in Claude Code
mcp-recall profiles seed # optional: compression profiles for the MCPs you use
```

Restart Claude Code, then run `mcp-recall status`: every check should be green. That's it. Claude now receives summaries, and uses the `recall__*` tools when it needs the full output.

`mcp-recall install` writes the MCP server entry and hooks to `~/.claude.json` and `~/.claude/settings.json`, and adds a short instruction block to `~/.claude/CLAUDE.md`. It is idempotent, so re-run it after every update.

→ [All install options, updating and uninstalling](docs/install.md) (plugin marketplace, from source, standalone binary)

---

## How it works

```mermaid
flowchart LR
    A["MCP tool output\n(e.g. 56 KB snapshot)"] -->|"PostToolUse hook"| B(["mcp-recall"])
    B -->|"~300 B summary"| C["Claude's context"]
    B -->|"full content + FTS index"| D[("SQLite")]
    D <-->|"recall__retrieve · recall__search"| C
```

The [architecture guide](docs/architecture.md#the-capture-pipeline) walks through the full pipeline step by step.

**Two hooks, one MCP server.**

- `SessionStart` hook: injects a short snapshot of pinned items, notes and recent activity before the first message, records the active day, and prunes expired items. Under pi and OpenCode it records and prunes but shows no snapshot.
- `PostToolUse` hook: replaces large MCP and Bash output with a summary and stores the full output. A Bash read of 8 KB or less (`cat`, `git diff`, `| head -40`, `sed -n 900,1000p`) is delivered whole, and identical output from the same tool and command returns a cached header.
- `recall` MCP server: eleven `recall__*` tools Claude uses to search and retrieve what was stored.

**What it covers.** MCP tools (`mcp__*`, except mcp-recall's own) and the native Bash tool. Each output is routed to a handler built for its shape, so `git diff`, test runners, compilers and `grep` get summaries that put failures and errors first. The [handler reference](docs/handlers.md) lists every handler and what it keeps. A result that carries an image, such as a browser screenshot, is delivered unchanged, since a text summary can't carry the picture. The built-in Read, Grep and Glob pass through unchanged; if large file reads are your biggest cost, the [filesystem MCP server](https://github.com/modelcontextprotocol/servers) can be intercepted where Read can't.

---

## Using it

Here is one real call, from the public [benchmark corpus](benchmark/corpus/mcp-github-list-issues.json): the GitHub MCP server's `list_issues`, returning five issues and pull requests from this repository. Without mcp-recall, all 31.2 KB of the GitHub API's JSON lands in Claude's context: every URL, user record and timestamp. With it, Claude receives this instead (shortened here; `…` marks the cuts):

```
[recall:recall_6abcf99290d6b4e7 · 31.2KB→1.6KB (95% reduction) · search: "sakebomb", "github", "api", "users", "mcp"]
#6 · "Phase 6: MCP Server" · [closed] · https://github.com/sakebomb/mcp-recall/issues/6 · labels: feature, P1: High, L · body: ## Summary
The MCP server exposing all `recall__*` tools Claude can invoke. Five tools in v1. …
#7 · "Phase 7: Polish + README" · [closed] · https://github.com/sakebomb/mcp-recall/issues/7 · labels: chore, docs, P2: Medium, S · body: ## Summary
Final polish before v1.0.0 release — README, benchmarks, plugin manifest verification, and marketplace submission. …
#8 … #10 follow in the same shape
```

The header line names the stored item, its sizes, and a few `search:` hints, which are salient terms from the full content so Claude's first `recall__search` lands without guessing keywords. Each issue keeps its number, title, state, link, labels and the start of its body. Everything else is stored, not lost. Issue #8's body is cut at "Exempt item from LFU expir…", and if Claude needs the rest it asks for it (the reply is shortened the same way):

```
recall__retrieve(id: "recall_6abcf99290d6b4e7", query: "LFU expiry")

[recall:recall_6abcf99290d6b4e7 · mcp__github__list_issues · 2026-11-09 · 31.2KB→1.6KB]
… ### `recall__pin(id)`\n- Exempt item from LFU expiry — survives indefinitely until manually forgotten\n- `pinned = 1` column already in v1 schema …
```

The excerpt is the matching part of the original output, verbatim, escapes and all. In practice Claude rarely needs this step: in the [task-success studies](docs/benchmarks.md#task-success-benchmark) agents almost never called a `recall__*` tool, so the summaries alone carried the effect.

Repeated identical tool calls return a cached header instead of re-compressing:

```
[recall:recall_abc12345 · cached · 2026-03-01]
```

Eleven `recall__*` tools are available to Claude in every session. You don't call them yourself; Claude uses them when it needs detail.

| Tool | Use when |
|---|---|
| `recall__context` | Start of session — get pinned items, notes, and recent activity |
| `recall__retrieve(id, query?, mode?)` | Need detail from a prior tool call — `summary` / `peek` / `full` tiers |
| `recall__search(query, tool?)` | Find stored output by content, no ID needed |
| `recall__pin(id)` | Protect an item from expiry and eviction |
| `recall__note(text, title?)` | Leave a short project note, shown again by `recall__context` |
| `recall__stats()` | Session efficiency report with savings and suggestions |
| `recall__session_summary(date?)` | Digest of a specific session's activity |
| `recall__list_stored(sort?, tool?)` | Browse stored items |
| `recall__forget(...)` | Delete by id, tool, session, age, or all |
| `recall__export()` | JSON dump of all stored items |
| `recall__suggest()` | Surface pin candidates and stale items, with the command to act on each |

→ [Full tool reference](docs/tools.md)

---

## Results

- **How much smaller.** On one developer's real store, the 182 MCP calls came out 96.6% smaller when replayed through current handlers. Across all 36,039 intercepted calls, mostly Bash, earlier releases saved 57.9%; current ones pass more small reads through whole, so today's figure is lower. Your mix will differ: `bun run measure` reports it for your own store.
- **What the summaries keep.** A smaller summary only helps if it keeps what Claude needs. The [quality benchmark](docs/benchmarks.md#quality-benchmark) checks each summary for the facts in the original, against simply cutting the output to the same size. It runs on a public corpus anyone can rerun with `bun run quality`, and lists every kind of output where mcp-recall does no better than the plain cut.
- **Whether Claude still solves the task.** No measured change either way. [Is it for you?](#is-it-for-you) has the short version, and the [task-success benchmark](docs/benchmarks.md#task-success-benchmark) has every study and its limits.

Long, structured, repetitive output (browser snapshots, API JSON, large diffs, test logs) compresses well; short or one-off output has little to remove. Every figure, how it was measured, and its caveats: [Benchmarks](docs/benchmarks.md).

---

## Profiles

Profiles teach mcp-recall how to compress output from specific MCPs, as declarative TOML with no TypeScript required. Five profiles ship built in (Jira, Gmail, Context7, Docker, Cloudflare docs), and **[26 community profiles](https://github.com/sakebomb/mcp-recall-profiles)** cover Stripe, Grafana, Shopify, Datadog, Notion, Teams, and more.

```bash
mcp-recall profiles seed        # install community profiles for your connected MCPs
mcp-recall profiles available   # browse the catalog
mcp-recall profiles update      # keep installed profiles up to date
mcp-recall learn                # generate profiles from your installed MCPs
```

→ [Profiles quickstart](docs/profiles-quickstart.md) · [Profile schema](docs/profile-schema.md) · [retrain guide](docs/retrain.md) · [AI profile guide](docs/ai-profile-guide.md) · [Contributing a profile](CONTRIBUTING.md#contributing-a-profile)

---

## Configuration

mcp-recall works out of the box. To customize it, create `~/.config/mcp-recall/config.toml`. The settings most people change:

| Setting | Default | What it does |
|---|---|---|
| `store.expire_after_session_days` | `30` | Days you **actively use** Claude Code on a project before stored items expire. Calendar time away doesn't count |
| `store.max_size_mb` | `500` | Target store size; past it, unpinned items are evicted lowest-value first |
| `store.retention` | `"balanced"` | Which outputs keep a retrievable full body: `full`, `balanced` (reproducible Bash is stored summary-only), or `minimal` |
| `denylist.additional` / `denylist.allowlist` | empty | Extra tool patterns never to store, or tools to store despite a deny pattern |
| `debug.enabled` | `false` | Diagnostic logging to stderr (same as `RECALL_DEBUG=1`) |

→ [Full configuration reference](docs/configuration.md): every key with its trade-offs, environment variables, and how session days work.

---

## Maintenance and CLI

```bash
mcp-recall install              # register hooks + MCP server in Claude Code
mcp-recall uninstall            # remove hooks + MCP server
mcp-recall status               # report install health and store size
mcp-recall serve                # run the MCP server on stdio (Claude Code starts it)
mcp-recall gc [--force]         # reclaim disk (dry run unless --force)
mcp-recall discover [--all]     # rank output routed to fallback handlers (--since, --limit)
mcp-recall learn                # generate profiles from your installed MCPs
mcp-recall profiles <cmd>       # manage compression profiles (see Profiles above)
mcp-recall import <file>        # restore items from a recall__export dump
mcp-recall completions <shell>  # print a bash / zsh / fish completion script
```

`mcp-recall --help` lists every subcommand. Update with `bun update -g mcp-recall && mcp-recall install`.

Each project gets its own SQLite database under `~/.local/share/mcp-recall/`. `mcp-recall gc` is a dry run by default and never deletes a database whose project might still exist. Shell completions: `mcp-recall completions zsh > ~/.zfunc/_mcp-recall`.

→ [Maintenance details](docs/maintenance.md): what `gc` deletes and why, `--vacuum`, and import options.

---

## Safety and privacy

- **Credentials are never stored.** Password-manager MCPs (1Password, Bitwarden, Vault and others) are blocked by name, credential-like tool names (`*secret*`, `*token*`, `*api_key*`, …) by pattern, and every output is scanned for secrets (PEM headers, GitHub PATs, AWS keys) before any write. A tool blocked by mistake goes in `denylist.allowlist`. Full lists: [SECURITY.md](SECURITY.md).
- **Everything stays on your machine**, in `~/.local/share/mcp-recall/`. Nothing is sent anywhere. The database holds full tool outputs, so treat it accordingly. `recall__forget(all: true, confirmed: true)` wipes the current project; deleting the directory wipes everything.
- **Running alongside rtk:** its command-rewriting hook was measured with mcp-recall, and the [install guide](docs/install.md#running-alongside-rtk) says what changes. Its PostToolUse pipeline is untested.

### Error contract

mcp-recall never breaks a tool call. Every failure mode — hook crash, SQLite error, handler exception, timeout, secret detected — degrades gracefully to the original uncompressed output passing through unchanged. The session gets slightly worse context efficiency. It never gets broken.

---

## How it compares

Other tools already shrink what tool *definitions* and multi-step workflows put in the context window. None of them stops a large MCP result from filling the window while keeping the full output searchable later. That is the gap mcp-recall fills.

Without it, [Claude Code](https://code.claude.com/docs/en/mcp) puts an MCP result into the window whole when it is under 25,000 tokens (`MAX_MCP_OUTPUT_TOKENS`) and 50,000 characters. A larger result is saved to a file that Claude reads in chunks. Neither can be searched in a later session. mcp-recall swaps the result for a summary before it reaches the window and keeps the full output searchable. If Claude Code has already saved the result to a file, mcp-recall stores and summarizes the file's content instead of the notice.

| Where context goes | What helps |
|---|---|
| **① Tool definitions:** every connected MCP server loads its full schema up front, about 500 tokens per tool | [Claude Code Tool Search](https://code.claude.com/docs/en/mcp#scale-with-mcp-tool-search) (built in) · Switchboard |
| **② Multi-step workflows:** each intermediate result passes back through context | [Code Mode](https://blog.cloudflare.com/code-mode/) · [FastMCP 3.1](https://www.jlowin.dev/blog/fastmcp-3-1-code-mode) |
| **③ Large MCP results:** in the window whole, or in a file read in chunks | **mcp-recall** |
| **④ Earlier sessions' output:** gone, or at best a model-written summary | **mcp-recall** keeps it verbatim and searchable (it is not a memory layer) |

In the API, [context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing), [compaction](https://platform.claude.com/docs/en/build-with-claude/compaction) and the [memory tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool) also reduce context, by dropping old content or summarizing it. None of them keeps the original output retrievable, and all of them work alongside mcp-recall.

---

## Learn more

- **Deciding whether to install:** the [FAQ](docs/faq.md) answers the common questions in a line or two each.
- **All the docs:** the [documentation index](docs/README.md) lists every page by what you came to do, with a glossary of the terms used here.
- **Something not working:** [Troubleshooting guide](docs/troubleshooting.md).
- **Contributing:** the easiest contribution is a TOML profile, with no TypeScript and no clone of this repo. Check the [community profiles repo](https://github.com/sakebomb/mcp-recall-profiles) or open a [profile request](https://github.com/sakebomb/mcp-recall/issues/new?template=profile-request.md). TypeScript handlers are welcome for complex non-JSON output (HTML, DOM trees, binary formats): [CONTRIBUTING.md](CONTRIBUTING.md) has the workflow (`bun install && bun test`) and how to add one, and [docs/architecture.md](docs/architecture.md) the pipeline and the invariants a change must not break.
- **Where it's headed:** [ROADMAP.md](ROADMAP.md), including what it deliberately won't become.
- **Release history:** [CHANGELOG.md](CHANGELOG.md).
- **License:** Apache-2.0, see [LICENSE](LICENSE) and [NOTICE](NOTICE). Releases up to 1.19.0 were published under MIT and stay under it.
