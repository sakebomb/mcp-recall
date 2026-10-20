# mcp-recall and rtk

[rtk](https://github.com/rtk-ai/rtk) is the tool mcp-recall is most often compared with. Both cut what tool output costs Claude, but they act at different points and keep different things. This page measures both on the same bytes and says where each one loses.

Measured 2026-10-19 with rtk 1.0.1 (built from `rtk-ai/rtk` @ `4ef8730`) and mcp-recall `main` @ `9a97e83`, the 1.17.0 candidate. Every table below is printed by [`scripts/compare-rtk.ts`](../scripts/compare-rtk.ts); see [Regenerate](#regenerate). The script runs rtk with `HOME` pointed at a temporary directory, so it never reads or writes your rtk config, history or recall store.

## What each does

| | rtk | mcp-recall |
|---|---|---|
| When it acts | Before a Bash command runs: its PreToolUse hook rewrites `git diff` to `rtk git diff`, and rtk runs the command and filters what it prints | After any tool returns: its PostToolUse hook replaces the output with a summary |
| Bash | Dedicated filters for many tools across languages (git, cargo, go, pytest, tsc, docker, kubectl, …) | Command-aware handlers for the common families, and a shell fallback for the rest |
| MCP tool output | Not by default. An opt-in pipeline (`rtk:posthook`) adds a PostToolUse filter for other tools, MCP included, with generic methods such as `cap`, `toon` and `minify-json` | By default, with per-server handlers (Playwright, GitHub, Linear, Slack, Sentry, …) and installable profiles |
| Getting elided output back | When a command fails or a filter trims a list, the full output goes to a byte-faithful SQLite store (200 entries, 30 days by default) and the output carries a hint: `rtk recall <hash>` | Every summarised output is stored with full-text search: `recall__retrieve` by id, `recall__search` across all of them. The `balanced` default keeps the body of MCP results, network fetches and content reads, and of a summary that cut a line |
| Across sessions | The recall store persists, and holds only what a filter elided | Notes, pins and a session-start orientation (`recall__context`) |
| Agents | 18, from Claude Code to Gemini CLI, Codex and Cursor | Claude Code |
| Install | One static binary | A Bun package and a Claude Code plugin |

rtk also ships an LLM API proxy (`rtk llm-proxy`); mcp-recall has nothing like it.

## The same bytes through both filters

Each bench fixture goes through mcp-recall's handler and through `rtk pipe -f <filter>`, rtk's stdin mode. *Facts kept* checks each output for the facts listed in the fixture's `keep` field ([`scripts/benchmark.ts`](../scripts/benchmark.ts)): the error count and the last error for `tsc`, the last file and an added line for `git diff`, and so on. A fixture with no rtk filter (`cargo build`, `ls -R`) is left out.

`bun scripts/compare-rtk.ts`

| Fixture | Original | mcp-recall | rtk | Facts kept (mcp-recall · rtk) |
| --- | --- | --- | --- | --- |
| `tsc --noEmit` (60 errors) | 28.5 KB | 2.2 KB (92.4%) | 7.1 KB (74.9%) | 1/2 · 2/2 |
| `git --no-pager diff` (18 files) | 4.1 KB | 1.3 KB (68.1%) | 1.9 KB (55.0%) | 1/2 · 1/2 |
| `rg` (240 matches, 6 files) | 13.6 KB | 1.4 KB (89.7%) | 2.3 KB (82.9%) | 2/2 · 2/2 |
| `journalctl -n 500` (retry loop, 3 messages) | 30.9 KB | 286 B (99.1%) | 180 B (99.4%) | 1/1 · 1/1 |
| `journalctl -b -1` (a unit fails, no line says "error") | 3.3 KB | 2.0 KB (38.0%) | 101 B (97.0%) | 0/2 · 0/2 |
| `grep -n` piped to `head` (one 180 KB minified line) | 191.2 KB | 4.0 KB (97.9%) | 191.2 KB (0.0%) | — |
| `find` (400 paths) | 19.0 KB | 1.2 KB (93.7%) | 185 B (99.1%) | 1/2 · 1/2 |

- **rtk keeps more of a compiler run.** It lists all 60 `tsc` errors grouped by file; mcp-recall gives the count and the first 20.
- **On a small diff they keep different things.** rtk shows changed lines for 13 of the 18 files, then truncates with a re-run hint. mcp-recall gives all 18 files with their line counts but no changed lines, and keeps the body for `recall__retrieve`.
- **Neither reports the failed unit.** rtk's log filter classifies by keyword and prints `0 errors`. mcp-recall's shell fallback keeps the first 25 lines, and the failure is at line 31 ([#358](https://github.com/sakebomb/mcp-recall/issues/358)).
- **rtk passes one huge line through.** mcp-recall cuts any line at 4,000 chars with `… (+N chars)` and keeps the body.

## Your own Bash history

`--transcripts` replays every Bash result recorded in `~/.claude/projects` through mcp-recall's real hook, into a throwaway store, and through rtk's filter for the command's family. It compares single commands only, since a pipe or a sequence is not one filter's input. It prints per-family totals and never a command or an output.

A transcript holds what the hook delivered, so an output mcp-recall had already summarised can't be replayed; those are skipped and counted. The sample therefore leans towards output mcp-recall passed through whole.

`bun scripts/compare-rtk.ts --transcripts`, on one developer's history, 2026-09-18 to 2026-10-19 (24,395 Bash results; 899 skipped):

| Family | Calls | Original | mcp-recall | rtk | Smaller (rtk · mcp-recall) |
| --- | --- | --- | --- | --- | --- |
| all | 893 | 1.7 MB | 1.1 MB (38.0%) | 988.3 KB (43.5%) | 287 · 50 |
| git-diff | 238 | 1.2 MB | 614.7 KB (50.8%) | 705.4 KB (43.5%) | 205 · 33 |
| grep | 588 | 307.6 KB | 284.3 KB (7.6%) | 269.6 KB (12.4%) | 58 · 8 |
| git-log | 21 | 174.6 KB | 173.6 KB (0.6%) | 5.3 KB (97.0%) | 17 · 0 |
| log | 6 | 10.3 KB | 7.0 KB (31.9%) | 522 B (95.0%) | 5 · 0 |
| git-status | 21 | 6.5 KB | 3.5 KB (46.4%) | 6.5 KB (0.0%) | 1 · 9 |
| find | 19 | 1.0 KB | 1.0 KB (0.0%) | 1.0 KB (0.3%) | 1 · 0 |

Overall rtk's filters save more bytes (43.5% against 38.0%), and produce the smaller output on 287 calls against 50. What the large differences contain:

- **git-log:** two outputs, `git log --stat` over 40 and 60 commits, make up 166 KB of the 175 KB. mcp-recall delivered both whole: a commit message in them quotes the pattern its secret scan treats as a GCP key, and it never summarises or stores output that looks like it holds a secret. rtk's `git-log` filter cut each one to about 250 B, keeping 1 commit of 60 (`[+1637 lines omitted]`), with no recall hint in pipe mode. rtk's hook does not run that filter on `git log --stat`: run as `rtk git log --stat`, the whole log came through (see the next table).
- **log:** in one recorded journal rtk's filter printed `0 errors · 0 warnings` for a window that holds `Main process exited, code=exited, status=1` and `Failed with result 'exit-code'`; mcp-recall's summary kept both lines. rtk's hook does not rewrite `journalctl`, so this applies only when you call `rtk log` or `rtk pipe` yourself.
- **git-diff:** mcp-recall is smaller overall and keeps the body, but gives per-file counts, not the changed lines that rtk keeps.

These rows compare filters on identical bytes. rtk as its hook runs it can differ: it rewrites only commands it has a route for, and it can run the command with its own flags.

## Running both

rtk's PreToolUse hook and mcp-recall's PostToolUse hook do not conflict: rtk rewrites the command, and mcp-recall sees rtk's output. Since 1.17.0 mcp-recall recognises the rewrite ([#353](https://github.com/sakebomb/mcp-recall/issues/353)):

- `rtk read`, `rtk recall` and an rtk-run `git diff` count as content reads: delivered whole up to 8 KB, with the body kept above that.
- rtk's output always gets the shell fallback, never a handler for the raw command. rtk reshapes output (its `grep` prints a sample under its true total), and a parser for the raw shape would report the sample's count.
- A summary that cuts one of rtk's recovery hints (`rtk recall <hash>`, `[full diff: rtk … --no-compact]`) appends it.
- Fingerprints read `rtk git diff`, not `rtk`, so `mcp-recall discover` and `recall__stats` stay per command.

Real commands in this repository, run as typed and as `rtk rewrite` turns them, both through mcp-recall's hook:

`bun scripts/compare-rtk.ts --both`

| Command | mcp-recall alone | rtk rewrites it to | rtk alone | rtk + mcp-recall | rtk hints kept |
| --- | --- | --- | --- | --- | --- |
| `git status` (clean tree) | 200 B, whole | `rtk git status` | 34 B | 34 B, whole | — |
| `cat src/handlers/collapse.ts` | 4.6 KB, whole | `rtk read src/handlers/collapse.ts` | 4.6 KB | 4.6 KB, whole | — |
| `cat src/handlers/bash.ts` | 1.2 KB, stored with body | `rtk read src/handlers/bash.ts` | 34.1 KB | 1.2 KB, stored with body | — |
| `git diff db0eb5c~3 db0eb5c` | 2.0 KB, stored with body | `rtk git diff db0eb5c~3 db0eb5c` | 29.2 KB | 1.4 KB, stored with body | 1/1 |
| `git log --stat -20 db0eb5c` | 1.6 KB, stored, no body | `rtk git log --stat -20 db0eb5c` | 24.4 KB | 1.3 KB, stored, no body | — |
| `git log --stat -60 db0eb5c` | 77.0 KB, whole | `rtk git log --stat -60 db0eb5c` | 77.0 KB | 77.0 KB, whole | — |
| `grep -rn export src` | 2.2 KB, stored, no body | `rtk grep -rn export src` | 14.7 KB | 1.9 KB, stored, no body | 2/2 |

("Whole" means the output passed through unchanged: either it was small enough, or, for the 60-commit log, mcp-recall's secret scan skipped it as described above.)

For a command rtk rewrites, you get rtk's filtering and mcp-recall's storage, not both tools' compression. Where rtk's output is already small (`git status`) it passes through. Where it isn't, it gets mcp-recall's generic 25-line head, which says less than mcp-recall's own handler would have: a large `rtk git diff` becomes a head of rtk's diff, not a per-file summary, though the body is kept. Commands rtk does not rewrite (`journalctl`, `sed -n`) and all MCP output get mcp-recall's handlers as usual.

rtk's opt-in PostToolUse pipeline (`rtk:posthook`) also rewrites tool output. Running it alongside mcp-recall's hook has not been measured.

## Which to use

- **Most of your context is MCP output** (browser snapshots, GitHub, Slack, search results): mcp-recall. Out of the box rtk does not touch it.
- **You want to find old output again**, across tools or sessions: mcp-recall, whose store is full-text searchable. rtk's recall store is read by the hash in a hint, or listed with `rtk recall --list`.
- **Bash in many agents, or many languages' toolchains:** rtk, which has far wider command coverage, 18 agent integrations and a single binary.
- **Both:** safe since 1.17.0, with the trade-off above.

## Regenerate

```bash
bun scripts/compare-rtk.ts --rtk /path/to/rtk                 # fixtures (deterministic)
bun scripts/compare-rtk.ts --transcripts --rtk /path/to/rtk   # your Bash history, totals only
bun scripts/compare-rtk.ts --both --rtk /path/to/rtk          # running both, on this repo
```

`--rtk` defaults to `rtk` on `PATH`. The fixture table depends only on the rtk version. `--both` pins its git commands to a commit; `git status`, the two `cat` rows and `grep` reflect your checkout. The rtk claims on this page were checked against rtk's own documentation and source at `4ef8730` (recall store: `docs/guide/getting-started/configuration.md`; agents: `docs/guide/getting-started/supported-agents.md`; the post-hook's MCP support: `src/hooks/posthook.rs`).
