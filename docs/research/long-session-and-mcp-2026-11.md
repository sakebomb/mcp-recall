# Does mcp-recall help in long sessions and with browser output?

*Four pre-registered studies, November 2026. This is a dated record: later results go in a new report,
not into this one. It follows the [compression test](compression-test-2026-11.md) and tracks
[#414](https://github.com/sakebomb/mcp-recall/issues/414).*

**DRAFT for review.** Every registered number below comes from `bench/agent/analyze.py --chains` output
or a count over the sealed run directories. Numbers labelled descriptive or exploratory were not
pre-registered as claims. Nothing here is published until the maintainer approves it.

## Summary

- **Long Django sessions never filled Haiku's context, so they could not test compaction.** Six chains
  of ten SWE-bench tasks each (Study 3) reached a median of 330k tokens without mcp-recall and 275k
  with it, against a 1M window. Neither arm compacted once. mcp-recall cut total chain cost by 23%,
  though in only 4 of 6 chains, and solved 2.3 points fewer (interval −8.5 to +2.5), which is no
  measurable difference.
- **The first browser test measured a bug.** On twelve forum tasks driven through Playwright MCP (Study
  4), mcp-recall compacted less (3 times against 8) but solved 23 of 36 tasks against 27, which the
  pre-registered rule reads as a cost. Afterwards we found no Playwright response had reached the agent
  with its page intact ([#424](https://github.com/sakebomb/mcp-recall/issues/424)): the hook kept 7%
  of the bytes, mostly site navigation.
- **On the fixed build, the same test reads as a benefit, at the edge of the rule.** Study 5 reran
  Study 4's design unchanged except for the binary. mcp-recall compacted fewer times in every sequence
  (6 against 10), cost 24% less ($1.70 against $2.25), and solved 22 of 36 against 25. The rule allowed
  at most 3 fewer, so the result just qualifies.
- **Two tasks carry most of the solve gap.** Across both browser studies, 8 of the 9 task pairs that
  differ went against mcp-recall. Four are `easy/routine_tracker_forum`, where the agent with mcp-recall
  declined to repost another user's comment under a misleading title; without mcp-recall it did the
  task all 6 times, from an identical prompt. Three are `standard/nba_statistics_analysis`. This was
  not pre-registered and does not change either reading.
- **On a model whose window a task fills, it shows nothing.** Study 6 ran the twelve browser tasks as
  single sessions on a self-hosted Qwen3-Coder-Next with a 131k window. mcp-recall compacted less (29
  times against 50) and solved 11 of 36 against 12. Without the full page, the agent scripted the page
  four times as often, and six of its runs ended when a screenshot made the self-hosted stack return
  errors.
- **Agents still did not retrieve.** Across 72 runs with mcp-recall in Studies 4 and 5, the agent called
  a `recall__*` tool once, and 6 times in Study 6's 36. Whatever mcp-recall does here, it does through
  the summary alone.

API spend for Studies 3 to 5, from each manifest's key spend after minus before: $16.25 (registered
estimate $10-15), $3.48 and $3.95. Study 6 ran on a self-hosted model and cost nothing. Every run was
graded; Study 6's void first attempt and its infrastructure reruns are disclosed in its section.

## Why these studies

The [compression test](compression-test-2026-11.md) found summaries do not change solve rate on single
SWE-bench tasks. It could not show a benefit, because one task never fills the context window. The
claim mcp-recall makes is about long sessions: if tool output takes less room, the session compacts
later or never, and the agent keeps what it learned. On 2026-11-02 the maintainer and I agreed a fixed
exit before running anything more:

1. A long-session pilot on the Bash-heavy case (Study 3).
2. One MCP-heavy long-session test, the product's strongest case, which is decisive (Study 4).
3. If both show nothing, mcp-recall goes to maintenance mode.

Studies 5 and 6 were added after Study 4, for the reasons given in their sections. Each study's design
and reading rule was committed to [`tasks/specs/414-task-success-claims.md`](../../tasks/specs/414-task-success-claims.md)
before its first run: Study 3 in 5eda2a4, Study 4 in 15c6276, Study 5 in 40f39f6, Study 6 in 84b152c.

## Method common to Studies 3 to 5

A **chain** is one Claude Code session that works through a sequence of tasks, resuming the same
session for each task in a fresh container. The agent keeps its conversation from task to task, so its
context grows and compacts as it would in a long working session. Each arm runs the same sequences:

- **nohook:** mcp-recall installed with its PostToolUse hook off, so output reaches the agent whole.
- **recall:** mcp-recall installed with the hook on, so large output is stored and replaced by a summary.

Both arms have the plugin installed, so the comparison isolates what the summaries do. Model: Haiku 5.5
throughout. A chain's cost is its last run's reported cost, because Claude Code reports a resumed
session's cost cumulatively. The solve-rate interval is a bootstrap over tasks, and the p-value a paired
permutation test; with this few pairs neither is the reading rule, which is stated per study below.

## Study 3: long Django sessions

**Design.** Six sequences of ten tasks drawn from 22 hard SWE-bench Verified Django tasks
(`bench/agent/tasks-long.txt`), each graded by the SWE-bench harness. No compaction window was set, so
Claude Code used Haiku 5.5's own: 1,000,000 tokens.

| | nohook | recall |
|---|---|---|
| Compactions | 0 | 0 |
| Context at the start of task 10 (median) | 330k | 275k (−17%) |
| Cost of all six chains | $9.17 | $7.09 (−23%) |
| Solved | 73% | 70% (−2.3 points, interval −8.5 to +2.5) |

Summaries reached the agent in 43 of 60 runs; it called a `recall__*` tool in 1. Every chain ran all
ten tasks. The aggregate hides a wide spread between chains:

| Chain | Context at task 10, nohook / recall | Chain cost, nohook / recall |
|---|---|---|
| 1 | 277k / 289k | $0.93 / $1.39 |
| 2 | 293k / 261k | $1.37 / $1.19 |
| 3 | 421k / 208k | $1.93 / $0.95 |
| 4 | 418k / 422k | $1.74 / $1.21 |
| 5 | 326k / 377k | $1.36 / $1.36 |
| 6 | 333k / 218k | $1.85 / $1.00 |

Context ended smaller with mcp-recall in 3 of 6 chains and cost less in 4; chains 3, 4 and 6 carry the
23%. Peak context was 468k without mcp-recall and 473k with it. Late in the chains (tasks 7 to 10),
`nohook` solved 18 of 24 and `recall` 16 of 24 (descriptive). mcp-recall stored 98 Bash outputs,
2.09 MB, and delivered 0.21 MB of them.

**Reading, as registered:** the sessions were too short to test compaction: they never filled the
window, reaching at most 47% of it. Solve rate did not change measurably. The spec registered Bash as
the weak case because agents trim it with `tail` and `grep`; this study did not measure that.

## Study 4: browser tasks through Playwright

**Design.** MCPMark's twelve WebArena Reddit tasks (`bench/agent/web/tasks`, copied unchanged from
MCPMark commit cd45b7f, Apache 2.0), with MCPMark's own Playwright MCP flags and prompt wording. Each
task gets a fresh copy of the forum (`am1n3e/webarena-verified-reddit`, pinned by digest) on its own
internal network, and the task's own `verify.py` grades the forum's final state. Three sequences of all
twelve tasks, seed 414. An agent cannot trim a page snapshot with `tail`, so this is the case mcp-recall
is built for.

Haiku's 1M window does not fill in twelve tasks, so both arms ran with
`CLAUDE_CODE_AUTO_COMPACT_WINDOW=200000`: Claude Code compacts as it would for a 200k-window model. This
is a simulation, chosen before the runs.

**Reading rule, fixed before the runs:** a benefit if `recall` compacts fewer times than `nohook` in all
3 sequences and solves no more than 3 fewer of the 36 tasks; nothing if it compacts as often or more in
2 or more sequences; a cost if it solves 4 or more fewer, whatever the compactions; mixed otherwise.

| | nohook | recall |
|---|---|---|
| Compactions (sequences 1/2/3) | 4 / 2 / 2 | 1 / 1 / 1 |
| Solved | 27 of 36 | 23 of 36 (−11.1 points, interval −27.8 to 0, p = 0.12) |
| Cost of all three chains | $1.84 | $1.64 |

**Reading, as registered: shows a cost.** `recall` solved 4 fewer.

**What we found afterwards.** Reading the stored summaries showed the agent had not seen the pages
([#424](https://github.com/sakebomb/mcp-recall/issues/424)). Claude Code hands Playwright results to the
hook as an array of text blocks. mcp-recall serialized that array to JSON, so its Playwright handler
found no line of the page and every `browser_snapshot` became "no interactive elements or visible text
extracted". Navigate and click did not match the Playwright handler at all. The generic fallback kept
their first 4 KB, which on this forum is the site navigation. A `browser_evaluate` kept the first 4 KB
of a JSON-escaped copy of its output, so each of the 22 results of 5.9 KB or more was cut. Over the 166 Playwright outputs stored in the `recall` chains, the
agent received 0.6 MB of 8.8 MB (descriptive). It could have fetched any page back with
`recall__retrieve`, and did so once.

So Study 4 measured a broken handler. Its result stands as recorded.

## Study 5: the same test on the fixed build

**The fix.** [PR #426](https://github.com/sakebomb/mcp-recall/pull/426) (merged as 1f40fdc) makes
the hook read a text-block array as text, and sends every Playwright page response to the Playwright
handler. The handler turns the snapshot into an outline, one line per element: its role, name, ref,
state, text and link target. It keeps the result, the code that ran and the page URL whole, and caps
console events while keeping every error. Before the rerun, we replayed through it the 164 distinct
Playwright responses stored in Study 4's `recall` chains (166 stored items; two were identical). It kept every visible text, link target and evaluate
result, and saved 62%. The only refs it drops belong to labels that repeat the element above them.

**Design.** Identical to Study 4: the same tasks, sequences, seed, model, simulated 200k window, budget
and images. Only the mcp-recall binary changed, recorded in every run manifest by its sha256
(`ed8d5797…`; Study 4's was `a9a50e9f…`). Both arms were rerun on the same day. Running a test again
after fixing a bug found in its result is a second look at the same question. That is why the rerun was
registered before it ran, why Study 4 is reported first and in full, and why the two are never pooled.

| | nohook | recall |
|---|---|---|
| Compactions (sequences 1/2/3) | 4 / 3 / 3 | 2 / 2 / 2 |
| Solved | 25 of 36 | 22 of 36 (−8.3 points, interval −22.2 to 0, p = 0.37) |
| Cost of all three chains | $2.25 | $1.70 (−24%) |

Summaries reached the agent in 34 of 36 runs; it called a `recall__*` tool in none. Over the 267
Playwright outputs stored in the `recall` chains, the agent received 3.05 MB of 8.09 MB (descriptive):
five times Study 4's total, and about three times as much per output, since it stored 267 outputs
against 166.

**Reading, as registered: shows a benefit.** `recall` compacted fewer times in all three sequences and
solved 3 fewer tasks, the most the rule allows. A benefit here is a claim about the fixed handler, on
this forum, with Haiku 5.5 and a simulated 200k window, and nothing wider.

The label turns on one task. The `nohook` arm solved 27 tasks in Study 4 and 25 here, from the same
design; had it solved 27 again, `recall` would be 5 short and this study would read as a cost. The same
design moved `nohook` by 2 tasks and `recall` by 1 between the two studies, so a gap of 3 to 4 between
the arms is of the size the agent varies by on its own.

## Study 6: the browser test on a self-hosted model

**Why.** Studies 3 to 5 ran on Haiku, whose real window no task fills. This study asks the question of
a model whose window one forum task does fill: Qwen3-Coder-Next (FP8, about 80B mixture-of-experts,
3B active), served by vLLM on a local GPU through LiteLLM, with a 131,072-token window, at no API
cost. Registered in 84b152c; amended in 85e4130 before the restart described below.

**Design.** Single tasks, not chains: each run is one task in a fresh session against a fresh forum.
The same 12 tasks, both arms, 3 repeats, so 36 runs per arm. Within a repeat a task's two arms run
side by side, and the order flips every repeat. Claude Code was told the window
(`CLAUDE_CODE_AUTO_COMPACT_WINDOW=131072`) and, after the amendment, the model's output cap
(`CLAUDE_CODE_MAX_OUTPUT_TOKENS=16384`).

**The first attempt is void.** It was stopped after 41 of 72 runs, when 7 had ended on API errors
rather than on the agent's work. Three of the seven were a harness defect: Claude Code's default
request for 32,000 output tokens overflowed the window at about 99k tokens of prompt, so long runs
died instead of compacting, which is the behaviour this study measures. The amendment set the output
cap and fixed infrastructure failures as any run whose final result records an API error status. It
also recorded the one result seen by then: `recall` 6 of 12, `nohook` 4 of 12 in the first repeat.
The amendment put the other four errors down to LiteLLM crashing and to a malformed request. A later
check found that all four, like every gateway error in the study, came straight after a screenshot:
two in each arm.

| | nohook | recall |
|---|---|---|
| Solved | 12 of 36 | 11 of 36 (pairs differing: 2 for `recall`, 3 against; exact p = 1.0) |
| Runs that compacted | 17 | 11 |
| Compactions | 50 | 29 |
| Median wall time, turns | 84 s, 28.5 | 98 s, 30.5 |

**Reading, as registered: shows nothing.** The arms are within 3 tasks.

**Six runs failed for infrastructure, all in `recall`.** Each ended on a run of 502s from the gateway,
and each came straight after the agent called `browser_take_screenshot`: the next request carried an
image, which this text-only model's stack rejected every time. They were rerun once, as registered.
Two solved and one finished unsolved; three took a screenshot again and failed the same way, and count as failures.
Counting all six first attempts as failures instead gives 9 of 36 against 12, still within 3, so the
reading does not depend on the reruns.

**Why only `recall` took screenshots** (descriptive, final runs):

| Over 36 runs per arm | nohook | recall |
|---|---|---|
| Read the full snapshot from Claude Code's spill file | 136 | 22 |
| Scripted the page instead (`browser_evaluate`, `browser_run_code`) | 69 | 277 |
| Took a screenshot | 0 | 3 |
| Called a `recall__*` tool | — | 6 |

Without mcp-recall, a large snapshot is spilled to a file and the agent reads it. With mcp-recall, the
agent gets the outline, rarely asks for the stored page, and writes page scripts instead. When the
scripts fail, it reaches for a screenshot. The hook stored 773 Playwright outputs and passed 14.8 MB
of 49.3 MB, 70% smaller (descriptive).

## Exploratory: the task the agent declined

*Not pre-registered. It does not change either reading.*

Five pairs of runs differ in Study 5, and four in Study 4. Eight of the nine went against `recall`:
four on `easy/routine_tracker_forum`, three on `standard/nba_statistics_analysis` and one on
`standard/llm_research_summary`. One `nba_statistics_analysis` pair went for `recall`. The routine
tracker is the only one with a single visible cause. It asks the agent to copy the top comment from a calendar-advice thread
and post it under the title "My 5-Step Morning Routine That Increased My Productivity by 200%".

| | nohook | recall |
|---|---|---|
| Study 4 | solved 3 of 3 | solved 1 of 3; declined 2 |
| Study 5 | solved 3 of 3 | solved 1 of 3; declined 2 |

Each failure in `recall` is the agent declining, on the grounds that the title would present someone
else's words as a personal routine with a measured result. Three declined before registering, and the
verifier could not log in; one (Study 4, sequence 1) registered, then declined to post. The prompts are
byte-identical between arms. One refusal came before any tool call; the others made 5 to 8 calls
first. Four refusals with mcp-recall against none without is a pattern, but with one run per pair
this design cannot tell an effect of what the session holds from chance.

Counted without that task, `recall` solved 1 fewer than `nohook` in Study 5 (21 of 33 against 22) and 2
fewer in Study 4 (22 of 33 against 24). That would move Study 4 from "cost" into the benefit band,
which is exactly why the count is a description and not a result: excluding a task after seeing
outcomes is what pre-registration rules out.

## Limits

- **Three sequences per study.** The browser studies' solve-rate intervals are 22 to 28 points wide and
  both reach 0, so a difference of several tasks either way would not show. The readings are product decisions under
  rules fixed in advance, not statistical claims.
- **A simulated window.** Haiku 5.5 has a 1M window. Compaction at 200k is what a smaller-window model
  would see, run on a model that does not have one.
- **One site, two models.** Twelve tasks on one forum, with Haiku 5.5 and, in Study 6, one self-hosted
  model. Other sites, other MCP servers and stronger models were not tested.
- **Compactions are counts, not consequences.** These studies show mcp-recall compacts less. They do not
  show what the agent lost at each compaction, and the solve rate did not rise with fewer compactions.
- **No retrieval.** The agent almost never fetched stored output. The benefit, where there is one, comes
  from smaller summaries alone, and anything the outline drops is lost to the agent in practice.

## What this means for the exit criteria

Read against the plan agreed before Study 3: the Bash-heavy case showed nothing about compaction,
because it never compacted. The test agreed as decisive, Study 4, read as a cost. The benefit comes only
from Study 5, a rerun registered after the bug behind that cost was found. It met the registered bar by
the smallest margin the rule allows, on a label that one task would flip, in a simulation, with fewer
compactions and lower cost and no gain in solved tasks. Study 6 then asked the question where the
window really fills, and found the same shape: fewer compactions, no gain in solved tasks. Whether that is enough to keep building mcp-recall is the maintainer's
decision; this report does not make it.

## Data and reproduction

- Sealed run directories, each with a `SHA256SUMS` and a manifest recording the model, the Claude Code
  and mcp-recall binaries by sha256, the images by digest and the exact command:
  `long-s01`…`long-s06`, `web-s01`…`web-s03`, `web-fix-s01`…`web-fix-s03`. They are held in a private
  Hugging Face dataset until this report is approved.
- Harness: `bench/agent/bench.py chain` (Study 3) and `bench/agent/web.py chain` (Studies 4 and 5).
  Study 5's command:
  `web.py chain --model claude-haiku-5-5 --run-id web-fix --sequences 3 --seed 414 --compact-window 200000 --run-budget 2 --cap 100 --jobs 3`.
- Analysis: `bench/agent/analyze.py --chains <run ids>`, checked by `bench/agent/check_analyze.py`.
- Study 6: `web-local-r01`…`web-local-r03`, from
  `web.py single --model blackwell-coder-next --run-id web-local --repeats 3 --jobs 2 --timeout 3600 --compact-window 131072 --max-output 16384`.
  The six first attempts replaced by reruns are in `study6-infra-first-attempts`, the void attempt in
  `void-study6-attempt1`. All are sealed and in the same private dataset.
- Excluded smoke runs, disclosed in the spec: `long-smoke-s01`, `web-smoke-s01`, `web-smoke2-s01`, and
  `smoke6-r01`, `smoke6b-r01` … `smoke6e-r01`.
