# Does mcp-recall change whether an agent solves the task?

*A paired task-success pilot on SWE-bench Verified, November 2026. This is a dated record: later
results go in a new report, not into this one. Tracks [#414](https://github.com/sakebomb/mcp-recall/issues/414).*

Every registered number below comes from `bench/agent/analyze.py` output or a count
over the sealed event streams. Numbers labelled post hoc (sensitivity intervals, multiplicity and
simulation figures) come from an independent review run after grading. Commit hashes cited for the
harness and the pre-registration are in the tag
[`research/414-original-history`](https://github.com/sakebomb/mcp-recall/tree/research/414-original-history),
the branch as it was before it was rebased to merge.

## Summary

- **No model showed an effect we can tell apart from chance.** On 45 hard SWE-bench Verified tasks,
  Sonnet 5.5 solved 25 with mcp-recall and 25 without (difference 0.0 points, 95% interval −8.9 to +8.9).
  Opus 5.5 solved 37 with and 35 without (+4.4, interval 0.0 to +11.1). The largest harm each interval
  still allows is 8.9 points for Sonnet and 0 for Opus.
- **Haiku 5.5 lost four tasks and gained none, and the pre-registered harm rule fired.** It solved 21
  with and 25 without (−8.9 points, bootstrap interval −17.8 to −2.2). We cannot tell this from noise at
  this size. The exact McNemar test gives p = 0.125. With three models, the rule fires on at least one of
  them about 6% of the time when there is no effect at all. And two identical Haiku runs without the
  plugin disagreed on 8 of the 45 tasks.
- **The follow-up did not identify a cause.** A second plain run solved 25 again, and installs with and
  without the output-replacing hook both solved 21. That is weak evidence that installed Haiku runs solve
  fewer tasks. It cannot separate the cost of installing from the cost of compression, or either from
  chance.
- **mcp-recall rarely engaged on these tasks, and the agent never retrieved.** Summaries replaced output
  in 3 to 8 of each model's 45 runs. Across all 165 recall-arm runs the agent called a `recall__*` tool
  zero times. Where output was cut, it re-ran a narrower command instead. This pilot mostly measured
  having mcp-recall installed, not what its compression does to the agent.

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

The archive is public as the Hugging Face dataset
[`sakebomb/mcp-recall-studies`](https://huggingface.co/datasets/sakebomb/mcp-recall-studies), a copy
with infrastructure details redacted and its checksums regenerated; the original stays private as the
audit record. Layout and verification:
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

The spec quotes each interval's lower bound as the largest harm the data still allows: 17.8 points for
Haiku, 8.9 for Sonnet and 0 for Opus. Opus's interval touches 0 but does not exclude it, so it supports no
claim of benefit. The spec did not say whether an interval that touches 0 counts as lying beside it. We
read it strictly: touching does not count.

**Haiku.** By the registered rule (a percentile bootstrap), Haiku's interval lies entirely below 0. The
rule therefore fired, and this report gives Haiku's result first, as the spec requires. Three things limit
what it shows:

- **The two registered statistics disagree.** All 4 discordant pairs went the same way, and the bootstrap
  reads that as a deficit. The exact McNemar test uses only those 4 pairs and cannot rule out chance
  (p = 0.125).
- **The bootstrap is a poor fit for 4 discordant pairs.** In a simulation with a true effect of −9 points,
  its 95% interval covered the truth 90% of the time, and its near bound is optimistic. We added other
  intervals after seeing the result, so they are a sensitivity check and not part of the registered rule.
  They put the near bound at −0.3 to −0.9 points (Newcombe, Tango, and exact unconditional with p = 0.048
  at 0). All of them agree on direction. They disagree on whether 0 is excluded.
- **Haiku is the most extreme of several looks.** In simulation with no true effect, the rule fires on
  about 2% of 45-task comparisons. Across the three models that makes at least one firing about 6% likely,
  and about 10% counting the follow-up comparisons. The spec applied no multiplicity correction, so the
  rule stands as fired. But being chosen as the extreme of three biases −8.9 away from zero, and a real
  harm, if there is one, is likely smaller.

These checks come from an independent statistical review run after grading. The spec fixed none of them
in advance.

Large-output set (secondary), 10 paired tasks per model, `verify-full` prompt:

| Model | Solved without | Solved with | With − without | 95% interval | Exact McNemar p |
|---|---|---|---|---|---|
| Haiku 5.5 | 6 | 7 | +10.0 pts | 0.0 to +30.0 | 1.000 |
| Sonnet 5.5 | 7 | 5 | −20.0 | −50.0 to 0.0 | 0.500 |
| Opus 5.5 | 9 | 9 | 0.0 | −30.0 to +30.0 | 1.000 |

With 10 tasks the intervals span up to 80 points; this set supports no claim in either direction. Under
the strict reading above, the Sonnet interval (−50.0 to 0.0) touches 0 and does not fire the rule.

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

**Read mechanically, the spec's rules say "installing, not compression":** comparison 1's net difference
(0) is below the noise threshold of 4, comparison 2 repeats the deficit, and comparison 3 shows none. We
do not draw that conclusion, because the design cannot carry it:

- **The noise rule can barely detect noise.** It reads the A/A comparison by its net difference. With
  pure noise at the flip rate observed here, a net of 4 or more turns up only about one time in five. So
  a net of 0 does not rule noise out. The size of the swing is the better noise measure: 8 of 45 tasks
  changed outcome between two identical runs, 4 each way.
- **Comparisons 2 and 3 reuse the pilot's runs.** Comparison 2 measures against the same plain run that
  produced the pilot's loss. If that run was lucky, a second deficit against it is likely: under no true
  effect, about 40% once the loss rule has fired, against about 10% for a fresh baseline. Against the
  fresh baseline, `plain2`, neither installed arm differs significantly: `nohook` is 7 · 3 (p = 0.344) and
  `recall` is 5 · 1 (p = 0.219). These two contrasts were not pre-registered.
- **Comparison 3 does not exclude a compression effect.** Its interval, −11.1 to +11.1, contains the
  whole pilot deficit.
- **The follow-up is underpowered for its question.** If the true harm were −8.9 points, a single
  comparison would show p < 0.05 only 18% of the time.

Haiku's losses are also unstable tasks. Of the four tasks the pilot's plain run solved and its recall
run did not, the second plain run failed three:

| Task | `plain` | `plain2` | `nohook` | `recall` |
|---|---|---|---|---|
| `django__django-11885` | solved | failed | failed | failed |
| `django__django-14011` | solved | solved | failed | failed |
| `pydata__xarray-3993` | solved | failed | solved | failed |
| `sympy__sympy-14248` | solved | failed | failed | failed |

13 of the 45 tasks changed outcome somewhere across the four Haiku runs. The other 32 gave the same result
in all four, so the comparisons turn on a small number of tasks.

**What the four runs do support** is a post hoc observation, not a test: the two plain runs (25, 25)
solved four more tasks than the two installed runs (21, 21). Pooled over tasks, plain beats installed by
8.9 points (task-level bootstrap interval +1.1 to +16.7, permutation p = 0.06 two-sided). That number is
not corrected for having picked Haiku after the pilot or for reusing the pilot's runs. It is weak evidence
that installed Haiku runs solve fewer tasks. Whether the cost comes from installing or from compression,
and whether it is chance, all stay open.

If installing is the cause, the spec named three candidates: the 721-byte CLAUDE.md instruction block,
the session-start snapshot, and 11 tool definitions. This follow-up does not separate them.

### Worked example

This example shows what the agent does with a summary. It is not evidence that the summary caused a
failure.

`django__django-11885` is the one Haiku hard-set loss where a summary replaced output. The agent ran a
compound read, `sed -n 120,330p` of `django/db/models/deletion.py` plus a `grep -A40` of a second file,
11.5 KB of output. mcp-recall delivered a 1.8 KB summary under the header
`[recall:recall_0a3f2345614cb9b9 · 11.5KB→1.8KB (85% reduction) · search: …]`. The agent did not call
`recall__retrieve`. Its next command re-read narrower ranges of the same file with `sed`, plus the first
60 lines of the second file. It then made a change that grouped fast-delete querysets, and its own final
message reports that two existing tests fail with it.

Haiku solved this task in only one of its four runs. `plain2` and `nohook` failed it too, with no
summary anywhere in those runs. The task is unstable for Haiku with or without compression. What the
case does show is the behavior the engagement table counts: cut output is re-read, not retrieved.

## What this means for mcp-recall

*(Interpretation, not a measured claim.)*

- This pilot did not test compression much. Summaries fired in 16 of 135 hard-set recall-arm runs,
  because agents piped test output through `tail`, `head` and `grep`. A null result here says the plugin
  did no measurable harm on Sonnet and Opus. It does not say compression is free.
- Haiku is the open question. Two installed runs both solved four fewer tasks than two plain runs. That
  is weak evidence, and it cannot say whether the cause is installing, compression, or chance. Settling
  it would take repeated runs per task, and a test that removes each install component in turn.
- Agents did not use the retrieval tools at all in headless runs. The recovery path the design relies
  on, retrieving a cut output, was never exercised. That is the clearest finding for the product.

## Limits

- **One pilot, one task source.** SWE-bench Verified Python repositories, 22 of the 45 tasks from Django. Not other
  languages, not long multi-task sessions, not MCP-heavy work such as browser automation.
- **One agent and one version of each component.** Claude Code 2.1.305 and mcp-recall 1.19.0.
- **Power** as above: a null result here is not proof of no effect.
- **One run per task per arm.** The smoke round showed large run-to-run variance with the plugin inert,
  which is noise both arms share but which widens every interval.
- **Engagement is observed, not assigned.** The engaged-subset numbers are exploratory: whether
  mcp-recall engages depends on what the agent did in that run.
- **Headless, single-task sessions.** Every run used `claude -p` with permissions skipped, and the
  mcp-recall store started empty. A long interactive session, where a store fills and an agent might
  search it, was not tested. Nor was an agent that is asked or prompted to retrieve.
- **The follow-up is Haiku only.** Nothing separates installing from compression for Sonnet or Opus.
- **The never-retrieved finding rests on few chances.** Only 20 recall-arm runs (16 hard-set, 4
  large-output) received a summary at all. Zero retrievals in those is clear, but it is 20 chances, not
  165.
- **Time.** The follow-up ran about 4.3 hours after the pilot on the same API endpoint. Within each
  session the two arms ran side by side, but all three registered follow-up comparisons cross sessions.
  A change in the service between sessions would move both follow-up arms together. One second plain
  run matching the first (25 and 25) argues against a large shift but cannot rule one out.
- **Empty patches count as unsolved.** Runs that produced no patch (2, 0, 2 and 1 across `plain`,
  `recall`, `plain2` and `nohook`) are scored as failures, as the spec's exclusion rule implies.

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
- **Engagement measure.** The spec defines engagement as runs that *stored* at least one output. This
  report counts runs where a summary *reached the agent*, from the event stream. That is what changes what
  the agent reads. The stored counts are in `analysis.json`.
- **Pooled view.** The spec asked for a pooled view stratified by model and did not say how. `analyze.py`
  resamples tasks within each model and divides by all 135 pairs.
- **What was visible before grading.** As the spec says, progress lines (cost, turns, patch size) were
  visible while the pilot ran. No solve outcome was.
- **Readings added after the results.** The strict reading of an interval that touches 0, the
  sensitivity intervals, the multiplicity figures, the reuse-of-baseline analysis and the pooled
  plain-against-installed contrast were all added after grading. The spec's rules were applied as
  written. Where we decline a conclusion those rules produce, the follow-up section says so and why.
