# Benchmarks

What mcp-recall delivers to Claude, measured:

- [**Quality benchmark**](#quality-benchmark): whether what Claude receives still carries the facts in the output.
  Rerunnable by anyone on a checked-in corpus.
- [**Task-success benchmark**](#task-success-benchmark): whether the same agent solves more or fewer tasks with
  mcp-recall installed. Paired runs, pre-registered, November 2026.
- [**Compression measurements**](#compression-measurements): how much smaller the output gets, on one developer's
  real store and on per-handler fixtures.

## Quality benchmark

mcp-recall replaces large tool output with a summary. Bytes saved don't say whether the agent was hurt, so this
benchmark asks a narrower question that anyone can rerun: **does what Claude receives still carry the facts in the
output, and does it ever claim something the output contradicts?**

```bash
bun run quality            # print the table
bun run quality --write    # regenerate benchmark/results.md and the results block below
bun run quality --check    # exit 1 if either is stale, or a control fails
```

The scoring runs over a checked-in corpus, so a clean checkout reproduces the table byte for byte. CI runs
`--check` on every pull request (`tests/quality.test.ts`), so a change that loses facts shows up in review.

This is command-level fidelity, not task success. It does not run an agent. Whether compression changes how often
an agent solves a task needs a paired run of the same agent with and without mcp-recall, across models; that is
the [task-success benchmark](#task-success-benchmark) below.

### What it measures

Every case runs through four arms on identical bytes:

| Arm | What Claude would receive |
| --- | --- |
| mcp-recall | The output of the real PostToolUse hook, with the default config except a store size cap high enough that nothing is evicted mid-run. MCP cases go through the hook as their MCP tool. |
| Head, same size | The output's first bytes, cut to the size mcp-recall delivered. The naive alternative at equal cost. |
| First line | The first line, at most 200 bytes. The sabotage control: it must score below mcp-recall in every family, or the run fails, since a benchmark it could pass would prove nothing. |
| Pass-through | The whole output. It must keep every fact, or a fact rule invented one, and the run fails. |

Scores, per family of output:

- **Facts kept.** Facts are extracted mechanically from the raw output by fixed rules (`scripts/quality-facts.ts`):
  failing test ids, error and exception lines, counts, file and line locations, changed lines, merge state, commit
  subjects, and for MCP the string values or the fields an agent reads a GitHub item for. The rules never import
  from `src/`, so a handler bug cannot hide as an extractor bug. A family's score is the mean, over its cases, of
  the share of each case's facts still in what the arm delivers.
- **False claims.** A summary that states something the output contradicts: "clean" over a merge in progress,
  "0 errors" over an error, a match count that disagrees with the lines shown.
- **Reduction.** The share of bytes not delivered.
- **Recovery.** For each fact a summary cut, whether one `recall__search` for the fact's text lists the stored
  output (found), and whether the result also prints it (shown). A head cut has nothing stored to search.

### Corpus

Three kinds of case, each recording how it was made and the tool version that made it. The case table in
[`benchmark/results.md`](../benchmark/results.md#cases) lists all of them.

- **Scripted** (`scripts/quality-corpus.ts`). Each builds a repo state in a throwaway directory and runs the real
  command: a merge stopped on conflicts, a pytest collection error, a formatter exiting 1, many test failures, a
  crash after a long log, a large diff. They reproduce shapes that can hide a failure, so they are chosen to find
  gaps rather than to flatter.
- **Public sample** (`scripts/quality-public.ts`). Real shell output from other people's agent runs, so the corpus
  is not only cases written by us. Source: [nvidia/SWE-Hero-openhands-trajectories](https://huggingface.co/datasets/nvidia/SWE-Hero-openhands-trajectories)
  at a pinned revision, CC BY 4.0, tasks from MIT, Apache-2.0 and BSD repositories only. The sampling rules were
  fixed before any scoring: 100 trajectories at even offsets, and from each the first `execute_bash` output of 4,096
  to 30,000 characters that holds a fact and no secret. Smaller output passes through mcp-recall whole; above
  30,000 characters Claude Code saves Bash output to a file. [`benchmark/ATTRIBUTION.md`](../benchmark/ATTRIBUTION.md)
  credits each case and its repository's licence.
- **MCP captures** (`scripts/quality-mcp.ts`). No public corpus of MCP tool output was found, so these are captured
  from public sources with no credentials: the Hugging Face MCP server (JSON results, which exercise mcp-recall's
  JSON fallback) and the GitHub REST API for this repository, delivered as an MCP server that hands on the API's
  JSON would deliver it. [`benchmark/ATTRIBUTION-MCP.md`](../benchmark/ATTRIBUTION-MCP.md) records each source and
  licence.

The corpus files are test data, not part of the published package, and the public cases stay under their own
licences.

### Results

<!-- quality:results:begin (generated by `bun run quality --write`; do not edit) -->
| Family | Cases (compressed) | Facts | mcp-recall | Head, same size | First line (≤ 200 B) | Pass-through | False claims: mcp-recall · head | Reduction | Cut facts: found · shown |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cargo-test | 1 (1) | 18 | 55.6% | 11.1% | 0.0% | 100.0% | 0 · 0 | 61.9% | 0.0% · 0.0% of 8 |
| crash | 1 (1) | 15 | 53.3% | 0.0% | 0.0% | 100.0% | 0 · 0 | 85.7% | 0.0% · 0.0% of 7 |
| format | 1 (1) | 46 | 43.5% | 52.2% | 0.0% | 100.0% | 0 · 0 | 47.4% | 0.0% · 0.0% of 26 |
| git-diff | 3 (2) | 257 | 44.8% | 46.4% | 1.4% | 100.0% | 0 · 0 | 77.2% | 100.0% · 70.1% of 174 |
| git-log | 2 (2) | 460 | 38.3% | 12.0% | 1.1% | 100.0% | 0 · 0 | 88.1% | 0.0% · 0.0% of 380 |
| git-status | 3 (3) | 255 | 71.7% | 46.8% | 1.3% | 100.0% | 0 · 0 | 49.3% | 0.0% · 0.0% of 88 |
| grep | 15 (7) | 671 | 74.1% | 56.1% | 0.1% | 100.0% | 0 · 0 | 61.2% | 0.5% · 0.5% of 551 |
| lint | 1 (1) | 123 | 22.8% | 9.8% | 0.8% | 100.0% | 0 · 0 | 91.6% | 0.0% · 0.0% of 95 |
| mcp-github | 4 (4) | 360 | 13.1% | 3.6% | 2.0% | 100.0% | 0 · 0 | 96.5% | 88.9% · 82.0% of 306 |
| mcp-json | 4 (4) | 861 | 35.0% | 33.3% | 1.1% | 100.0% | 0 · 0 | 78.0% | 99.7% · 98.9% of 631 |
| other | 3 (2) | 15 | 38.1% | 38.1% | 0.0% | 100.0% | 0 · 0 | 44.3% | 0.0% · 0.0% of 7 |
| pytest | 68 (58) | 207 | 75.8% | 17.4% | 0.0% | 100.0% | 0 · 0 | 85.2% | 30.9% · 0.0% of 68 |
| python | 8 (8) | 163 | 69.3% | 42.6% | 0.5% | 100.0% | 0 · 0 | 71.0% | 0.0% · 0.0% of 94 |

Families where mcp-recall keeps no more facts than the same-size head:

- format: 43.5% against the head's 52.2%
- git-diff: 44.8% against the head's 46.4%
- other: tied at 38.1%
<!-- quality:results:end -->

How to read it:

- Compare the mcp-recall column with **Head, same size**: both deliver the same number of bytes, so the difference
  is what the summary's choices are worth. The list under the table names every family where that difference is
  zero or negative.
- Facts kept below 100% is expected; the point of a summary is to drop most of the output. What matters is which
  facts survive, which is why failing tests, errors and counts are extracted, and whether the rest can be got back.
- **Recovery** is what makes a cut cheaper than a head cut. A fact the summary dropped is still in the store, and the
  last column says how often one search for it finds the output and prints the line.
- Recovery is low or zero for shell families by design: the default `store.retention = "balanced"` keeps
  re-runnable shell output as a summary only, so a cut fact there is recovered by running the command again.

### Limits

- **No agent, no task.** A fact kept is not a task solved. This measures what reaches Claude, not what Claude does
  with it.
- **Literal matching.** A fact counts as kept only when its text (or one fixed pattern, for state facts) is in what
  Claude receives. A correct paraphrase scores as lost, which favours the head cut.
- **Uneven families.** Scripted families have one or a few cases each, and the public sample's mix is whatever those
  agents ran, mostly pytest. A family with one case is one data point.
- **MCP coverage is narrow.** Two sources, and the GitHub cases are the REST API's JSON, not a particular MCP
  server's output. Playwright and docs-lookup servers are not covered. MCP JSON facts are string values, so a count
  or flag a summary drops is not scored.
- **Pass-through is the raw output.** It does not model what Claude Code itself does with very large results, such
  as saving them to a file and showing a notice.
- **Recovery assumes a good search.** It searches for the cut fact's exact text, which an agent may not know to do.
- **Re-capturing moves the numbers.** Scoring the checked-in corpus is reproducible. Re-running the capture scripts
  is not entirely: Hugging Face search results cannot be pinned, and scripted cases depend on the installed tool
  versions recorded per case.

## Task-success benchmark

The same headless Claude Code agent ran the same tasks with and without mcp-recall, and each arm was graded by the
task's own checker. Every study's design and reading rule was committed before it ran
([#414](https://github.com/sakebomb/mcp-recall/issues/414)). The harness is
[`bench/agent/`](../bench/agent/README.md); the full write-ups are in `docs/research/`.

**Result: no study found a change in solved tasks that can be told apart from chance, in either direction.**
Where sessions were long enough to compact, mcp-recall compacted less, and on Haiku it cost less. Agents almost never
called a `recall__*` tool, so what effect there is comes from the summaries alone.

| Study | Tasks and models | Solved: without → with | Other effect | Report |
|---|---|---|---|---|
| Pilot | 45 hard SWE-bench Verified tasks; Haiku, Sonnet, Opus 5.5 | Haiku 25 → 21 (harm rule fired, exact p = 0.125); Sonnet 25 → 25; Opus 35 → 37 | Summaries reached the agent in 3 to 8 of 45 runs per model; 0 retrievals | [task-success](research/task-success-2026-11.md) |
| Compression | Same 45 tasks, 3 runs per arm; Haiku, Sonnet 5.5; installed both ways, hook off vs on | Haiku 51.1% → 53.3% (+2.2 points, −2.2 to +6.7); Sonnet 58.5% → 55.6% (−3.0, −9.6 to +3.7) | Summaries in 98 and 89 of 135 runs; the pilot's Haiku deficit did not recur | [compression test](research/compression-test-2026-11.md) |
| 3: long sessions | 6 chains of 10 Django tasks; Haiku | −2.3 points (−8.5 to +2.5) | No compactions in either arm (1M window); cost −23% | [long session and MCP](research/long-session-and-mcp-2026-11.md) |
| 4: browser | 12 forum tasks via Playwright MCP, 3 sequences; Haiku, simulated 200k window | 27 → 23 of 36 (reads as a cost) | Measured bug [#424](https://github.com/sakebomb/mcp-recall/issues/424): pages reached the agent gutted | same |
| 5: browser, fixed build | Study 4 rerun on the fixed build | 25 → 22 of 36 (reads as a benefit, at the rule's edge) | Compactions 10 → 6; cost −24% | same |
| 6: browser, small real window | 12 forum tasks × 3; self-hosted Qwen3-Coder-Next, 131k window | 12 → 11 of 36 | Compactions 50 → 29 | same |

### Limits

- **Small samples.** The intervals are wide; a difference of several tasks either way would not show. The readings
  are decisions under rules fixed in advance, not statistical claims.
- **Mostly one model.** Studies 3 to 5 ran on Haiku 5.5; only the pilot reached Opus.
- **One site for browser tasks**, with a simulated window in Studies 4 and 5.
- **Studies 5 and 6 predate v1.20.0**, which caps large Playwright sections
  ([#435](https://github.com/sakebomb/mcp-recall/pull/435)).
- **Fewer compactions are a count, not a consequence.** The solve rate did not rise with them.
- **The run data is private for now.** The harness and analysis are in the repo; the sealed runs are in a private
  Hugging Face dataset. The harness's own known limits are in its README.

## Compression measurements

> **Before 1.15.1, these savings did not reach Claude's context on current Claude Code.** The hook returned its summary in a field Claude Code no longer reads, so outputs were stored and searchable but Claude still received them in full ([#298](https://github.com/sakebomb/mcp-recall/issues/298)). 1.15.1 uses the documented field, which delivered MCP summaries. Bash summaries were still dropped: Claude Code checks a built-in tool's replacement against that tool's output shape, and a plain string never matched Bash's. From 1.15.2 the hook returns Bash's own shape, and Bash summaries were verified live on Claude Code 2.1.292 ([#304](https://github.com/sakebomb/mcp-recall/issues/304)). The figures below measure what the compression produces.

### On one developer's store

Measured on 2026-10-13 across one developer's real store: 121 project stores, 107 projects, 36,039 intercepted calls dated 2026-07-21 to 2026-10-13 (older calls had expired). Reproduce on your own store with `bun run measure`, which opens every store read-only and prints aggregates only.

| Figure | Calls | Original | Delivered | Reduction |
|---|---|---|---|---|
| All intercepted calls, as recorded | 36,039 | 66.1 MB | 27.9 MB | **57.9%** |
| Bash, as recorded | 35,857 | 61.0 MB | 24.9 MB | 59.2% |
| MCP, replayed through current handlers | 182 | 5.1 MB | 0.2 MB | **96.6%** |

"As recorded" is what the installed versions' compression produced, using the same accounting as `recall__stats` (notes excluded): 38.3 MB, about 10.0M tokens. Because of #298 that reduction was stored, not delivered to context. The MCP row re-compresses every stored MCP call with today's handlers, because most of those calls were stored by an older release that predated image-block stripping; as recorded they show 41.9%. The replay applies the hook's own rules: a summary that, with its header, saves less than 25% passes the output through, and an empty summary falls back to the generic handler. It uses the 1.15.1 profiles, so Context7 calls are no longer counted as empty summaries ([#299](https://github.com/sakebomb/mcp-recall/issues/299)). This is one person's workload, dominated by Bash, so your mix will differ.

**The Bash rows overstate what 1.16.0 saves.** They were recorded by earlier releases. 1.16.0 delivers more Bash output whole: content reads (`cat`, `git diff`) and reads you bounded (`| head`, `sed -n`) of 8 KB or less, and any summary that would save under 25%. Most Bash bodies are not stored, so `measure` cannot replay them under the new rules. In a replay of recorded `gh` and `cd …` results, the 25% rule alone delivered 0.3–0.5% more of the input.

### What compresses well, and what doesn't

The reduction depends on the shape of the output, not on how large it is. Long, structured, repetitive output compresses well. Short or one-off output has little to remove.

| | Examples (from the measurement above) | Why |
|---|---|---|
| **Excellent, 95–100%** | Tavily extract, Hugging Face, browser automation and screenshots (image blocks stripped) | A dedicated handler or profile keeps only the fields that matter; images carry no searchable text |
| **Good, 73–92%** | Playwright snapshots (88%, before the #424 fix; see below), Tavily search (84%), Gmail search (85%), `git diff` (92%), `git show` (80%), `cat` of large files (73%) | Structured enough for a handler to summarize; the full text stays retrievable |
| **Moderate, 50–70%** | `sed`, `python3`, `gh`, shell loops, Mermaid rendering (60%) | Mixed output with no dedicated handler; the generic fallback trims the head and tail |
| **Weak, 30–46%** | `grep` (37%), `ssh` (38%), `timeout` (32%), `cd …` chains (46%) | Usually short output, or a wrapper that hides the real command from command-aware routing |
| **Fixed in 1.15.1** | Cloudflare docs search: 37% before, 89% with the new bundled profile | No handler matched it; a profile now extracts title, URL and an excerpt |

**The Playwright figures overstate what was useful.** Until [#424](https://github.com/sakebomb/mcp-recall/issues/424), a snapshot reduced to an empty-page notice and other Playwright actions to their first 4 KB, mostly navigation, so part of that reduction was the page itself. The fixed handler keeps every element's name, text, link target and clickable ref, so it saves less; these figures are due a re-measure.

Bash rows in this table are as recorded by earlier releases; see the note above on what 1.16.0 changes. Small tools with very few calls (for example, three Vikunja calls) are too little data to judge. If a tool you use lands in the weak rows, a [profile](profiles-quickstart.md) is usually the fix.

### Per call and per handler

Individual MCP calls:

| Tool | Original | Delivered | Reduction |
|---|---|---|---|
| `mcp__playwright__snapshot` (before #424; see above) | 56.2 KB | 299 B | 99.5% |
| `mcp__github__list_issues` (20 items) | 59.1 KB | 1.1 KB | 98.1% |
| `mcp__filesystem__read_file` (large file) | 85.0 KB | 2.2 KB | 97.4% |
| Analytics CSV (500 rows) | 85.0 KB | 222 B | 99.7% |
| Tavily web extracts (12 calls, one session) | 170.3 KB | 2.0 KB | 99% |

Across a full session: 315 KB of tool output → 5.4 KB delivered to context.

Command-aware Bash compression, per-output on representative fixtures (regenerate with `bun run bench`):

| Command | Original | Delivered | Reduction | Facts kept |
|---|---|---|---|---|
| `journalctl -n 500` (retry loop, 3 messages) | 30.9 KB | 286 B | 99.1% | 1/1 |
| `grep -n` piped to `head` (one 180 KB minified line) | 191.2 KB | 4.0 KB | 97.9% | — |
| `find` (400 paths) | 19.0 KB | 1.2 KB | 93.7% | 1/2 |
| `tsc --noEmit` (60 errors) | 28.5 KB | 2.2 KB | 92.4% | 1/2 |
| `rg` (240 matches, 6 files) | 13.6 KB | 1.4 KB | 89.7% | 2/2 |
| `ssh host rg` (240 matches, 6 files) | 13.6 KB | 1.4 KB | 89.7% | — |
| `ls -R` (deep tree) | 1.5 KB | 207 B | 86.5% | — |
| `cargo build` (typical failure) | 1.9 KB | 581 B | 69.8% | — |
| `journalctl -b -1` (a unit fails, no line says "error") | 3.3 KB | 2.2 KB | 32.2% | 2/2 |
| `git --no-pager diff` (18 files) | 4.1 KB | 3.2 KB | 22.3% | 2/2 |
| `ssh host 'cd /srv && git diff'` (18 files) | 4.1 KB | 3.2 KB | 22.3% | — |

These show what each handler produces on hand-written fixtures; the [quality benchmark](#quality-benchmark) is the measured fidelity score. *Facts kept* counts the facts a fixture lists in `scripts/benchmark.ts` that are still in the summary: the error count and the last error for `tsc`, the last file and an added line for `git diff`, the total and the last path for `find`. A miss is a fact Claude would have to retrieve. The `tsc` and `find` misses are deliberate ([#395](https://github.com/sakebomb/mcp-recall/issues/395)): neither summary keeps the last item past its cap, and in 312 recorded `tsc` and `find` calls Claude never used that item. The `tsc` cap of 20 errors was never reached, and the one `find` past its sample used paths from the middle of the cut, which a tail line would not have shown. From 1.16.0 the hook delivers a diff or file read of 8 KB or less whole, so the `git diff` fixture above would reach Claude unsummarised. The `ssh` rows reach the same handler as the local command since 1.17.0. The `git diff` rows keep the hunks themselves, with only the `index` and `---`/`+++` lines dropped: a larger diff delivers 4 KB of hunks shared across its files, plus a per-file list of what was cut. The `journalctl -b -1` row costs the most for what it keeps: the shell fallback keeps the first 25 lines, then the error/warn lines past them, which carry the failure ([#358](https://github.com/sakebomb/mcp-recall/issues/358)). These are per-output compression ratios, not a whole-session token figure — most outputs are smaller and the generic fallback already caps long output. That is why the measured Bash figure above (59.2%) is lower. For your own session savings, read `recall__stats` (which counts intercepted output only).
