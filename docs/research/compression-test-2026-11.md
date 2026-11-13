# Does mcp-recall's compression change whether an agent solves the task?

*A replicated, pre-registered test on SWE-bench Verified, November 2026. This is a dated record: later
results go in a new report, not into this one. It follows the
[task-success pilot](task-success-2026-11.md) and tracks [#414](https://github.com/sakebomb/mcp-recall/issues/414).*

Every registered number below comes from `bench/agent/analyze.py --replicates`
output or a count over the sealed event streams. Numbers labelled descriptive or post hoc were not
pre-registered as claims. Commit hashes cited for the harness and the pre-registration are in the
tag [`research/414-original-history`](https://github.com/sakebomb/mcp-recall/tree/research/414-original-history),
the branch as it was before it was rebased to merge.

## Summary

- **Compression made no measurable difference to solve rate on Haiku 5.5 or Sonnet 5.5.** With
  mcp-recall installed either way, turning on the hook that replaces output with summaries moved Haiku
  from 51.1% to 53.3% (+2.2 points, 95% interval −2.2 to +6.7) and Sonnet from 58.5% to 55.6% (−3.0
  points, interval −9.6 to +3.7). Both intervals cross 0, so neither is a harm or a benefit under the
  pre-registered rule. The largest harm the bootstrap interval still allows is 2.2 points for Haiku and
  9.6 for Sonnet; other interval methods put it about half a point larger.
- **This time compression actually ran.** Summaries reached the agent in 98 of 135 Haiku runs and 89 of
  135 Sonnet runs, against 20 of 165 in the pilot. The pilot mostly measured having mcp-recall
  installed; this test measures what its summaries do.
- **Agents retrieved for the first time.** 11 Haiku and 24 Sonnet runs called a `recall__*` tool, 63
  calls in all, against none in the pilot. In 13 of those 35 runs the agent's first call named the item
  wrongly and failed, and its retry asked for the summary it already had, so it saw nothing new.
- **The pilot's Haiku deficit did not come back.** Haiku without the plugin and Haiku installed with
  the hook off solved within 2.2 points of each other (interval −2.2 to +7.4).

Haiku and Sonnet each ran 45 hard tasks, three times per arm: 675 runs, all graded, none excluded. Opus
did not run: the budget rule left too little for it. API spend for this test: $28.16.

## The question

The pilot asked whether having mcp-recall installed changes how often an agent solves a task. It could
not answer the narrower question that matters for the product, because compression almost never fired:
agents piped test output through `tail`, `head` and `grep`, which kept it under the size mcp-recall
summarizes. This test asks: **with mcp-recall installed either way, does replacing output with
summaries change whether the agent solves the task?**

The design, the analysis and the reading rules were fixed and committed before any run, in
[`tasks/specs/414-task-success-claims.md`](../../tasks/specs/414-task-success-claims.md) (section
"Follow-up 2", commit 9fa8367, 01:40:26 UTC on 2026-11-02). The first run started 22 seconds later from
that same commit with a clean tree. Any deviation is listed under [Deviations](#deviations).

## Setup

As in the pilot (agent, isolation, grading and limits are described in its
[Setup](task-success-2026-11.md#setup)), with these differences:

| | |
|---|---|
| Arms | `nohook`: mcp-recall 1.19.0 installed, then its `PostToolUse` hook removed, so the MCP server, the `SessionStart` hook and the CLAUDE.md block stay. `recall`: installed with the hook. `plain` (Haiku only): no plugin |
| Prompt | `full-output`: the pilot's prompt, plus a request to run the complete test file for every changed module with verbose output, and not to pipe, truncate or redirect command output. Both arms get it |
| Replicates | Three (`comp-r1`, `comp-r2`, `comp-r3`), so each task runs three times per arm |
| Models | Haiku 5.5 (`plain`, `nohook`, `recall`) and Sonnet 5.5 (`nohook`, `recall`). Opus 5.5 was planned with what budget remained, and none did |
| Versions | Claude Code 2.1.305, mcp-recall 1.19.0, `swebench` 5.0.2, harness commit 9fa8367; hashes in each run's `manifest.json` |

The prompt exists to make compression fire, so it is not how agents work unprompted. Two calibration
rounds of 5 Haiku recall-arm runs chose it, with a gate of 3 of 5 runs getting a summary set before the
first round. The first version reached 2 of 5. Adding "verbose output" reached 4 of 5. Neither round was
graded, and both are excluded.

## Evidence

The same as the pilot's: each run's full event stream, Claude Code's transcript and config, the
mcp-recall store, the graded patch, the exact prompt and the grading log, checksummed by
`bench.py seal`. The runs are public in the Hugging Face dataset
[`sakebomb/mcp-recall-studies`](https://huggingface.co/datasets/sakebomb/mcp-recall-studies) under
`runs/comp-r1` to `runs/comp-r3`, a copy with infrastructure details redacted and its checksums
regenerated. The original stays private as the audit record.

## Analysis

As fixed in the spec:

- **Unit:** a task. Its outcome is the mean, over the replicates where both arms ran, of `recall`
  solved minus `nohook` solved. A model's result is the mean over tasks, in points.
- **Interval:** percentile bootstrap over tasks, 10,000 resamples, seed 414.
- **Test:** a randomization test that swaps the two arms' labels independently within each replicate
  pair, 10,000 draws, two-sided.
- **Reading:** an interval lying entirely below 0 is a measured harm from compression, one entirely
  above 0 a measured benefit. There are two primary comparisons, Haiku and Sonnet.
- **Secondary, Haiku only:** `plain` vs `nohook` (the cost of installing) and `plain` vs `recall`.
- **Empty patches** count as unsolved. A pair is dropped only for an infrastructure failure.

The checks in `check_analyze.py`, mutation-tested before any run, passed again before the comparisons
ran.

**Power** (simulated in the spec): about 0.39 to detect a true 10-point difference and 0.72 for 15
points. A compression effect under about 15 points can exist and go unseen.

## Results

### Solve rate

Primary: compression, with mcp-recall installed in both arms.

| Model | `nohook` | `recall` | Difference | 95% interval | p | Tasks whose outcome changed |
|---|---|---|---|---|---|---|
| Haiku 5.5 | 51.1% | 53.3% | +2.2 | −2.2 to +6.7 | 0.60 | 13 of 45 |
| Sonnet 5.5 | 58.5% | 55.6% | −3.0 | −9.6 to +3.7 | 0.50 | 12 of 45 |

Both intervals include 0. Under the spec, the result for each model is "no measurable effect of
compression". With two primary comparisons, at least one would show an effect by chance alone at most
about 10% of the time; neither did. The bootstrap's near bound runs slightly optimistic here as in the
pilot: other interval methods (post hoc) give lower bounds of about −2.5 to −2.7 for Haiku and −10.0 for
Sonnet.

Secondary, Haiku only:

| Comparison | Difference | 95% interval | p |
|---|---|---|---|
| `plain` → `nohook` (installing) | +2.2 | −2.2 to +7.4 | 0.57 |
| `plain` → `recall` (installing and compression) | +4.4 | +0.7 to +8.1 | 0.24 |

The cost of installing is a claim only if its interval lies entirely below 0, and it does not. The
`plain` → `recall` interval lies just above 0, but the spec gives that comparison no claim rule, the
randomization test does not agree (p = 0.24), and the pilot's review found this bootstrap's near bound
optimistic. It is not a finding.

Solved per replicate:

| Model | Arm | r1 | r2 | r3 | Empty patches |
|---|---|---|---|---|---|
| Haiku 5.5 | `plain` | 22 | 22 | 22 | 5 |
| | `nohook` | 22 | 24 | 23 | 3 |
| | `recall` | 25 | 20 | 27 | 7 |
| Sonnet 5.5 | `nohook` | 27 | 26 | 26 | 0 |
| | `recall` | 25 | 25 | 25 | 0 |

Haiku's `recall` arm ranged from 20 to 27 across replicates while `plain` and `nohook` stayed within 22
to 24, so a single run per arm, as in the pilot, could have read either way. Haiku's `recall` arm also
left more empty patches (7, against 3 for `nohook` and 5 for `plain`); they count as unsolved.

### How often compression engaged

| Model | Recall-arm runs with a summary | Summaries delivered | Runs that called a `recall__*` tool | Calls |
|---|---|---|---|---|
| Haiku 5.5 | 98 of 135 | 258 | 11 of 135 | 17 |
| Sonnet 5.5 | 89 of 135 | 155 | 24 of 135 | 46 |

Counted from each run's own event stream, as in the pilot. The calls were `recall__retrieve` (61) and
`recall__search` (2). Post hoc, by what each call asked for:

| Call | Haiku | Sonnet | What it returns |
|---|---|---|---|
| `mode: "full"` | 13 | 15 | The stored output |
| A query, or `mode: "peek"` | 0 | 4 | The best-matching part of it |
| `id` only | 2 | 16 | The summary again, the documented default |
| No `id` (`recall_id` instead, or nothing) | 2 | 11 | A validation error |

In 13 of the 35 runs that retrieved (2 Haiku, 11 Sonnet), the first call failed validation: 6 passed
the item as `recall_id`, the word the `[recall:recall_…]` header shows, and 7 passed nothing. Each retry
passed only `id`, which returns the summary, and the agent stopped there. So in those runs it asked for
detail and never got any. Returning the summary by default is deliberate and documented in the tool's
description, so this is a usability finding, not a defect, and nothing here ties it to a solve-rate
change.

**Exploratory only** (engagement is not randomized): recall-arm runs with a summary solved 59 of 98
(Haiku) and 58 of 89 (Sonnet); runs without one solved 13 of 37 and 17 of 46. Runs that reach the full
test step are runs that got further, so this says nothing about compression's effect.

### Cost, tokens and turns

Descriptive only: the spec registered no claim on them, and no interval was computed. Paired medians,
`recall` minus `nohook`, over task-replicate pairs:

| Model | Cost | Input tokens | Turns | Total cost, `nohook` → `recall` |
|---|---|---|---|---|
| Haiku 5.5 | −$0.0005 | +15,200 | +2 | $1.84 → $1.76 |
| Sonnet 5.5 | −$0.012 | −147 | 0 | $12.56 → $10.25 |

Totals, post hoc: with summaries, Sonnet wrote 1.63M tokens to the prompt cache against 2.59M without,
and read 22.7M against 20.5M. Turns rose in both models' totals, by 13% for Haiku (1,833 to 2,074) and
11% for Sonnet (1,023 to 1,132), although Sonnet's median paired difference is 0. Smaller cache writes
fit Sonnet's lower cost, but nothing here tests that as the cause, and Haiku wrote less too while its
cost barely moved. On these short tasks compression did not save Haiku context: it read more input.
The run that stopped itself (below) recorded no cost, so its arm's total is slightly low.

### One run ended without a result

`django__django-11138` (Haiku, `recall`, r3) ran a command to stop leftover test processes. The command
also stopped the agent, which exited with code 143 and no result event after 672 s. It had already
left a patch, which the grader resolved. Under the spec a run is graded on the patch it left, and an
infrastructure failure needs no patch as well as no result, so the run counts as solved.

## What this means for mcp-recall

- **Summaries do not measurably cost solve rate on these tasks.** When compression replaced output in
  66% of Sonnet runs and 73% of Haiku runs, both models solved about as often as with the hook off. The
  intervals still allow a harm of a few points for Haiku and about 10 for Sonnet, and smaller effects
  can go unseen.
- **The pilot's Haiku result is not reproduced.** Here, installing cost Haiku nothing measurable and
  compression cost it nothing measurable. This test used a different prompt, so it cannot say whether
  the pilot's −8.9 points was noise or a real effect under the default prompt.
- **Retrieval is used once summaries are common, and it is easy to get wrong.** Agents named the item
  `recall_id`, the word the summary header shows, and an `id`-only call returns the summary they already
  had. Accepting the header's wording, or making an `id`-only call return something new, are changes
  worth considering; this test does not show either would change outcomes.
- **This test cannot show a benefit.** Each session is one short task, so context never runs short.
  The benefit mcp-recall is built for, longer sessions before the context fills, needs a long-session
  benchmark.

## Limits

- **An instructed setting.** The prompt asks for full, verbose test output so that compression fires.
  Agents left to themselves trim output and compression rarely fires (the pilot).
- **Short sessions.** One task per session, 7 to 13 turns at the median. Nothing here measures long
  sessions, compaction or context pressure.
- **Bash output only.** No MCP server besides mcp-recall's own ran, so none of the MCP output mcp-recall
  is designed around (browser snapshots, API responses) appears here.
- **`nohook` did not always see full output.** Claude Code itself saves a tool result over about 30 KB
  to a file and shows the agent a short notice, in both arms. By a line-level count (post hoc,
  approximate), that happened in 26 to 27 of each model's 135 `nohook` runs, and in the recall arm
  some summaries reached the agent inside that notice. So the comparison is summaries against
  Claude Code's own handling, not against full output every time.
- **Two models.** Opus did not run. Results may not carry to other models, agents or task sets.
- **Power.** Effects under about 15 points can go unseen; the Sonnet interval still allows a 9.6-point
  harm.
- **Headless and empty.** `claude -p` in a fresh container, with an empty mcp-recall store and no
  project memory.
- **One harness version.** mcp-recall 1.19.0 and Claude Code 2.1.305 only.

## Deviations

- **Opus did not run.** The spec allowed it only with budget left after Sonnet. The cap counts the
  key's total spend: $65.14 by then ($36.98 before this test, $28.16 in it), and adding the
  harness's worst-case reserve for six Opus jobs ($36) would have crossed $100, so it started
  none. This follows the spec's budget rule; it is stated here because Opus was in the plan.
- **comp-r1 was graded twice.** The capped Opus stage left an empty Opus directory in `comp-r1`, and the
  grader stopped on it before reaching Sonnet. The empty directory, which held no run, was moved out of
  the run tree and `comp-r1` was graded again. The grader skipped every Haiku instance it had already
  graded, and the Haiku totals match the first pass's grading log (22, 22, 25). Sonnet's comp-r1 arms were graded only
  in the second pass.
- **Post hoc, not registered:** the breakdown of retrieval calls by argument, the cache-token and turn
  totals, the alternative interval bounds, the count of Claude Code's own file spills, and the note on
  the run that stopped itself.
