# Does mcp-recall change whether an agent solves the task?

*A paired task-success pilot on SWE-bench Verified, November 2026. This is a dated record: later
results go in a new report, not into this one. Tracks [#414](https://github.com/sakebomb/mcp-recall/issues/414).*

**DRAFT for review.** Every number below comes from `bench/agent/analyze.py` output or a count over the
sealed event streams. Nothing here is published until the maintainer approves it.

## Summary

- **Sonnet 5.5 and Opus 5.5: no measurable effect.** On 45 hard SWE-bench Verified tasks, Sonnet solved
  25 with mcp-recall and 25 without (difference 0.0 points, 95% interval −8.9 to +8.9). Opus solved 37
  with and 35 without (+4.4, interval 0.0 to +11.1).
- **Haiku 5.5: a measured harm by the rule fixed in advance.** It solved 21 with and 25 without
  (−8.9 points, bootstrap interval −17.8 to −2.2, entirely below 0). The exact McNemar test on the same
  pairs is not significant (p = 0.125), and the report gives both.
- **The Haiku cost is not compression.** A pre-registered follow-up installed mcp-recall with its
  output-replacing hook removed: Haiku again solved 21, against 25 in a second plain run. With compression
  added back on top, it still solved 21. What costs Haiku is what installing adds to every session (the
  CLAUDE.md instructions, the session-start snapshot and 11 tool definitions), though no single follow-up
  comparison is significant.
- **mcp-recall rarely engaged on these tasks, and the agent never retrieved.** Summaries replaced output
  in 3 to 8 of each model's 45 runs. Across all 165 recall-arm runs the agent called a `recall__*` tool
  zero times; where output was cut, it re-ran a narrower command instead.

All runs, their full event streams and the grading logs are in the evidence archive, checksummed.
Total API spend for every round, including the smoke round and the superseded attempt: $36.88.

## The question

mcp-recall replaces large tool output with a summary and keeps the full output searchable. Every
earlier measurement of it scored the output: bytes saved, and facts kept against a same-size head cut
([Benchmarks](../benchmarks.md)). None ran an agent. This pilot asks the question those numbers can't
answer: **with mcp-recall installed, does the same agent solve the same tasks as often?**

What the pilot may claim, how it is analyzed, and what counts as a loss were fixed before any run was
graded, in [`tasks/specs/414-task-success-claims.md`](../../tasks/specs/414-task-success-claims.md).
Any deviation from that file is listed under [Deviations](#deviations).

## Setup

| | |
|---|---|
| Agent | Claude Code 2.1.305, headless (`claude -p`), `--dangerously-skip-permissions`, stream-json output |
| Arms | `plain`: no plugin. `recall`: mcp-recall 1.19.0 (release binary, SHA-256 in each run's `manifest.json`), installed with `mcp-recall install` inside the container, default config |
| Models | Claude Haiku 5.5, Sonnet 5.5 and Opus 5.5, via a budget-capped API key |
| Tasks | SWE-bench Verified: the 45 tasks rated "1-4 hours" or ">4 hours" (hard set), and 10 of them again with a prompt that requires running each changed module's full test file (large-output set) |
| Isolation | One fresh container per run, from the task's prebuilt SWE-bench image; the two arms differ only in whether `mcp-recall install` ran |
| Grading | The official SWE-bench harness (`swebench` 5.0.2), on the patch taken against the image's HEAD |
| Limits per run | `--max-budget-usd` 1 (Haiku), 3 (Sonnet), 6 (Opus); 3,600 s timeout |

Both arms get the same prompt, which asks the agent to fix the issue by editing non-test source files.
The large-output prompt adds one sentence: run the complete test file for every changed module and read
the output. It exists because a smoke round on medium tasks showed mcp-recall almost never engaged:
across 12 recall-arm runs it stored one output.

## Evidence

Every run keeps its complete event stream (each tool result exactly as the agent received it), Claude
Code's own transcript and config from inside the container, a snapshot of the mcp-recall store, the
graded patch, the exact prompt, and the SWE-bench grading log. Each `run` invocation appends a manifest
entry pinning the harness commit, binary hashes, image digests and the dataset fingerprint. After
grading, `bench.py seal` checks that the API key appears in no file and writes `SHA256SUMS`.

The archive is the Hugging Face dataset `sakebomb/mcp-recall-task-success`. Layout and verification:
[`bench/agent/README.md`](../../bench/agent/README.md).

## Analysis

As fixed in the spec: per model, the recall arm's solve rate minus the plain arm's on the hard set, an
exact two-sided McNemar test on discordant pairs, and a paired bootstrap 95% interval (10,000 resamples
over tasks, seed 414). The large-output set is secondary. A pair is dropped only for an infrastructure
failure (no result event and no patch). The code is `bench/agent/analyze.py`, with its checks in
`check_analyze.py`.

**Power.** With 45 pairs per model, the pilot reliably detects only a difference of about 20-25 points
(simulated in the spec). A smaller effect in either direction can exist and not show.

## Results

From `analyze.py --run-id pilot-hard` and `--run-id pilot-heavy`. Every run in both sets completed and
was graded; no pair was dropped.

### Solve rate

Hard set (primary), 45 paired tasks per model:

| Model | Solved without | Solved with | With − without | 95% interval | Exact McNemar p | Discordant (without only · with only) |
|---|---|---|---|---|---|---|
| Haiku 5.5 | 25 | 21 | −8.9 pts | −17.8 to −2.2 | 0.125 | 4 · 0 |
| Sonnet 5.5 | 25 | 25 | 0.0 | −8.9 to +8.9 | 1.000 | 2 · 2 |
| Opus 5.5 | 35 | 37 | +4.4 | 0.0 to +11.1 | 0.500 | 0 · 2 |

Pooled across models (secondary): −1.5 points, interval −5.9 to +3.0, 135 pairs.

Under the spec's loss rule, Haiku's interval lying entirely below 0 is a measured harm, and it is reported
as Haiku's headline. The two pre-registered statistics disagree for Haiku: all 4 discordant pairs went
the same way, which the bootstrap reads as a clear deficit, while the exact test, which uses only those 4
pairs, cannot rule out chance (p = 0.125). A percentile bootstrap is known to understate the width of an
interval when discordant pairs are this few, so the McNemar result is the more cautious reading. Neither
statistic was chosen after the fact.

Large-output set (secondary), 10 paired tasks per model, `verify-full` prompt:

| Model | Solved without | Solved with | With − without | 95% interval | Exact McNemar p |
|---|---|---|---|---|---|
| Haiku 5.5 | 6 | 7 | +10.0 pts | 0.0 to +30.0 | 1.000 |
| Sonnet 5.5 | 7 | 5 | −20.0 | −50.0 to 0.0 | 0.500 |
| Opus 5.5 | 9 | 9 | 0.0 | −30.0 to +30.0 | 1.000 |

With 10 tasks the intervals span up to 80 points; this set supports no claim in either direction.

### How often mcp-recall engaged

| Model | Recall-arm runs where a summary replaced output (hard set) | Large-output set | Runs that called a `recall__*` tool |
|---|---|---|---|
| Haiku 5.5 | 5 of 45 | 2 of 10 | 0 |
| Sonnet 5.5 | 3 of 45 | 1 of 10 | 0 |
| Opus 5.5 | 8 of 45 | 1 of 10 | 0 |

Counts come from each run's own event stream: a tool result that reached the agent with a
`[recall:…]` header, and a tool call named `mcp__recall__*`. Every recall-arm run's stream also records
the `recall` MCP server as connected with its 11 tools, and the `SessionStart` hook as having run, so
the plugin was present in every one of them.

The `verify-full` prompt barely raised engagement: summaries replaced output in 4 of 30 recall-arm runs,
against 16 of 135 on the hard set. Agents piped almost every test run through `tail`, `head` or `grep`
(138 of 140 test runs in the large-output set, 701 of 732 in the hard set), which kept the output under
the size where mcp-recall summarizes.

Of the 15 discordant pairs across both sets and all models, 12 had no summary in the recall arm at all,
including 3 of Haiku's 4 hard-set losses. In those runs, compression did not change anything the agent
read.

### Cost, tokens, turns and time

Paired medians, with minus without, hard set. No interval excludes 0, so the spec permits no claim of
savings or cost:

| Model | Cost | Input tokens | Turns | Wall time |
|---|---|---|---|---|
| Haiku 5.5 | −$0.0002 (−0.0007 to +0.0008) | −8,307 (−42,800 to +21,680) | 0 (−2 to +1) | 0 s (−3.2 to +3.5) |
| Sonnet 5.5 | +$0.0019 (−0.0019 to +0.0072) | +1,487 (−1,285 to +6,654) | 0 (0 to 0) | −0.2 s (−1.6 to +1.9) |
| Opus 5.5 | −$0.0010 (−0.0100 to +0.0037) | +2,125 (−17,300 to +12,440) | 0 (−1 to +1) | −1.4 s (−5.2 to +1.3) |

This is what the engagement numbers predict: when a plugin rarely changes what the agent reads, its
effect on cost is too small to see.

### Follow-up: what caused the Haiku result

Pre-registered in the spec after the pilot was graded and before these runs existed. Haiku only, the
same 45 hard-set tasks: `plain2` (no plugin, a second time) and `nohook` (mcp-recall installed with its
`PostToolUse` hook removed, so it never replaces output).

| Comparison | Solved | Difference | 95% interval | Exact McNemar p | Discordant |
|---|---|---|---|---|---|
| 1. Noise: `plain2` vs `plain` | 25 → 25 | 0.0 | −13.3 to +11.1 | 1.000 | 4 · 4 |
| 2. Installing: `nohook` vs `plain` | 25 → 21 | −8.9 pts | −20.0 to +2.2 | 0.289 | 6 · 2 |
| 3. Compression: `recall` vs `nohook` | 21 → 21 | 0.0 | −11.1 to +11.1 | 1.000 | 3 · 3 |

Read by the rules the spec fixed in advance:

- Comparison 1 shows a net difference of 0, below the 4 the spec set as the noise threshold, so the
  pilot's Haiku result is not attributed to run-to-run noise. Noise is still large: 8 of 45 tasks changed
  outcome between two identical runs, 4 each way.
- Comparison 2 shows the pilot's deficit again (25 to 21) with compression switched off, and
  comparison 3 shows none (21 to 21). By the spec's rule, **the cost is from installing, not from
  compression.**
- None of the three comparisons is significant on its own. The finding rests on the same −4 appearing
  twice, in two separate runs with the plugin installed, against 25 in both runs without it. That
  pattern is an observation, not a pre-registered test.

The spec named three things installing adds: the 721-byte CLAUDE.md instruction block, the
session-start snapshot, and 11 tool definitions. This follow-up does not separate them.

### Worked example

`django__django-11885` is the one Haiku hard-set loss where a summary replaced output. The agent ran a
compound read, `sed -n 120,330p` of `django/db/models/deletion.py` plus a `grep -A40` of a second file,
11.5 KB of output. mcp-recall delivered a 1.8 KB summary under the header
`[recall:recall_0a3f2345614cb9b9 · 11.5KB→1.8KB (85% reduction) · search: …]`. The agent did not call
`recall__retrieve`. Its next command re-read narrower ranges of the same file with `sed`. It then made a
change that grouped fast-delete querysets, and its own final message reports that two existing tests
fail with it. The plain run of the same task solved it. One case does not show the summary caused the
failure, but it shows the behavior the engagement table counts: cut output is re-read, not retrieved.

## What this means for mcp-recall

*(Interpretation, not a measured claim.)*

- On coding tasks like these, the compression is close to free in solve rate: for Sonnet, Opus, and Haiku
  with the install held fixed, adding it changed nothing measurable.
- The fixed cost of being installed is the open question. It is the part of mcp-recall that every
  session pays for, whether or not any output is ever summarized, and on the smallest model it lined up
  with four lost tasks out of 45, twice. Which of the three parts matters, and whether it holds beyond
  this one model and task set, needs its own test.
- Agents did not use the retrieval tools at all in headless runs. The recovery path the design relies
  on, retrieving a cut output, was never exercised.

## Limits

- **One pilot, one task source.** SWE-bench Verified Python repositories, 22 of the 45 tasks from Django. Not other
  languages, not long multi-task sessions, not MCP-heavy work such as browser automation.
- **One agent and one version of each component.** Claude Code 2.1.305 and mcp-recall 1.19.0.
- **Power** as above: a null result here is not proof of no effect.
- **One run per task per arm.** The smoke round showed large run-to-run variance with the plugin inert,
  which is noise both arms share but which widens every interval.
- **Engagement is observed, not assigned.** The engaged-subset numbers are exploratory: whether
  mcp-recall engages depends on what the agent did in that run.

## Deviations

- The analysis code was committed 47 seconds after grading began; both files were final before it.
  Details in the spec.
- The follow-up was added to the spec after the pilot was graded. It is labeled as such, it was
  committed before any of its runs existed (`b88a1e3`), and it does not change the primary result.
- `analyze.py` gained a `--compare` option for the follow-up after the pilot analysis ran. The primary
  path is unchanged, and `--compare pilot-hard:plain pilot-hard:recall` reproduces the primary Haiku row
  exactly.
- Two harness checks ran outside the analysis: one pilot-format task before the rerun, and one follow-up
  task (`runs/followup-check`) to confirm the `nohook` arm kept everything but the `PostToolUse` hook.
  Neither is counted.
- The first launch of the follow-up failed on a log path before any run started; it was relaunched
  unchanged. No run was lost or repeated because of it.
