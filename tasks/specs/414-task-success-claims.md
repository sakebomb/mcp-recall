# Spec: What the task-success pilot may claim (#414)

> Status: **APPROVED (2026-11-01), committed before any pilot run was graded.**
> The pilot had started: progress lines (cost, turns, patch size) were visible,
> but no patch had been graded and no solve outcome had been read. This file
> fixes the claims, the analysis and the loss rule before those outcomes exist.
> Changing any of it afterwards must be stated in the report as a deviation.

## What

A paired comparison: the same Claude Code agent (2.1.305) on the same SWE-bench
Verified tasks, once with mcp-recall 1.19.0 installed and once without, on three
models (Haiku 5.5, Sonnet 5.5, Opus 5.5). Harness and evidence layout:
`bench/agent/README.md`.

- **Hard set** (primary): the 45 tasks rated "1-4 hours" or ">4 hours"
  (`bench/agent/tasks-hard.txt`), default prompt.
- **Large-output set** (secondary): 10 of them (`tasks-heavy.txt`) with the
  `verify-full` prompt, which makes both arms run complete test files.

## Why

Every published number for mcp-recall so far measures its output (bytes kept,
facts kept), not the agent. A reader who doubts compression wants to know whether
the agent still solves the task. That is the claim this pilot can test.

## The claims we expect to make

- **Primary:** per model, the recall arm's solve rate minus the plain arm's on the
  hard set, with a 95% interval. We expect the interval to include 0, and the
  claim will then be "no measurable effect on solve rate", quoting the interval's
  lower bound as the largest harm the data still allows.
- **How often mcp-recall engaged:** share of recall-arm runs that stored at least
  one output, and that retrieved one, per model and task set. The smoke round
  stored 1 output in 12 runs, so this is reported whatever it shows. A null
  result from a plugin that rarely engaged is a statement about the tasks, and
  the report says so.
- **Secondary, descriptive:** paired differences in cost, input tokens, turns and
  wall time per task, as medians with 95% intervals. No claim of savings unless
  the interval excludes 0.

## Claims we will not make

- That mcp-recall makes Claude solve more tasks, unless the interval for a model
  lies entirely above 0. Even then it is one model on one task set, said as such.
- Anything about models, agents, harnesses or task types we did not run.
- Any reduction percentage as evidence of task quality.
- A pooled "across models" result as the headline. Pooling (stratified by model)
  is a secondary view only.

## Power, stated up front

Simulated exact McNemar test, alpha 0.05, plain solve rate 0.4, 45 paired tasks:

| True difference | Power, noise discordance 0.1 | Power, noise discordance 0.2 |
|---|---|---|
| 10 points | 0.16 | 0.09 |
| 15 points | 0.40 | 0.27 |
| 20 points | 0.69 | 0.52 |
| 25 points | 0.88 | 0.78 |

"Noise discordance" is the share of tasks where two runs of the same arm would
disagree; the smoke round showed it is real (2x swings in turns with the plugin
inert). So the pilot reliably detects only a difference of about 20-25 points per
model. Smaller effects can exist and go unseen, and the report must say so. The
#414 plan comment said 15-20 points; this table corrects it.

## Analysis, fixed now

- **Unit:** a task, paired across arms within one model.
- **Primary test:** exact two-sided McNemar on discordant pairs, per model.
- **Interval:** paired bootstrap over tasks, 10,000 resamples, percentile 95%.
- **Grading:** the official SWE-bench harness (`swebench` 5.0.2) on the patch
  taken against the image's HEAD. A run that hit its `--max-budget-usd` ceiling or
  the timeout is graded on whatever patch it left.
- **Exclusions:** only infrastructure failures (the container or `mcp-recall
  install` failed, or no result event and no patch). Such a pair is dropped from
  that model's primary analysis and counted in the report. Nothing is excluded
  for being slow, expensive or unsolved.
- **Engaged subset:** solve rates on tasks where the recall arm stored at least
  one output are reported as exploratory only, because engagement is observed in
  one arm and is not randomized.

## What counts as a loss

For any model, a hard-set interval lying entirely below 0 is a measured harm. It
is published in `docs/benchmarks.md` and the report as the headline for that
model, with the event streams of the discordant tasks examined in the report.

## Where it lands

| Place | Content |
|---|---|
| `docs/research/task-success-2026-11.md` | The full report: method, results, worked examples from the event streams, limits, deviations from this spec. A dated record, never rewritten |
| `docs/benchmarks.md` | A "Task success" section: the per-model result and interval, linking the report |
| `README.md` | One or two sentences and a link |
| HF dataset `sakebomb/mcp-recall-task-success` | The sealed evidence (`SHA256SUMS`), its layout, how to verify and rerun. Private until the report is approved |

## Follow-up: what caused the Haiku result (added 2026-11-01, before it ran)

The pilot is graded and its primary result stands as reported above; nothing in
this section changes it. On the hard set, Haiku solved 25 tasks without
mcp-recall and 21 with it (4 discordant pairs, all one way; bootstrap interval
below 0, exact McNemar p = 0.125). In 3 of those 4 losses the recall arm stored
no output, so compression did not change what the agent saw. The pilot cannot
tell three explanations apart, and this follow-up is designed to.

**Arms**, on the same 45 hard-set tasks, Haiku 5.5 only, same prompt, harness and
limits as the pilot (`runs/followup-haiku`):

- `plain2`: no plugin, a second time. Against the pilot's `plain` it measures
  run-to-run noise (an A/A comparison).
- `nohook`: `mcp-recall install`, then its `PostToolUse` hook removed from
  `settings.json`. The MCP server, the `SessionStart` hook and the CLAUDE.md block
  stay, so the agent sees everything installing adds except output replacement.

**Comparisons**, each reported with the same statistics as the primary analysis
(paired solve-rate difference, exact McNemar, bootstrap 95% interval):

1. `plain2` vs `plain`: the noise floor.
2. `nohook` vs `plain`: the effect of installing without compression.
3. `recall` vs `nohook`: the effect of compression alone.

**How the result will be read**, decided now:

- If comparison 1 shows a net difference of 4 or more tasks in either direction,
  the pilot's Haiku result is within run-to-run noise, and the report says so.
- If comparison 2 shows a deficit like the pilot's (`nohook` below `plain`) and
  comparison 3 does not, the cost is from installing (the instructions, the
  session-start snapshot or the tool definitions), not from compression.
- If comparison 3 shows the deficit and comparison 2 does not, the cost is from
  compression.
- Any other pattern is reported as it falls, without choosing an explanation.

With one run per arm and 45 tasks, none of these comparisons has more power than
the primary analysis; the follow-up can separate explanations only if the
differences are as large as the pilot's. The report says so whatever it shows.

## Follow-up 2: the compression test (added 2026-11-02, before it ran)

The pilot and the Haiku follow-up are graded and their results stand. They barely tested
compression: summaries reached the agent in 20 of 165 recall-arm runs, because agents piped test output
through `tail`, `head` and `grep`. This follow-up asks the question they could not answer: **with
mcp-recall installed either way, does replacing output with summaries change whether the agent solves
the task?**

**Design.** The same 45 hard-set tasks and harness. The new `full-output` prompt asks for complete,
verbose test runs and forbids truncating command output. Both arms get it.

- `nohook` vs `recall` is the primary comparison. Both have mcp-recall installed, so the only difference
  is whether its `PostToolUse` hook replaces output.
- **Three replicates** (`runs/comp-r1`, `comp-r2`, `comp-r3`), so that each task is run three times per arm.
- **Haiku 5.5**: arms `plain`, `nohook` and `recall` in every replicate. **Sonnet 5.5**: `nohook` and
  `recall`. **Opus 5.5**: `nohook` and `recall`, only with what budget remains after Sonnet, and then
  descriptive only.
- **Order**: Haiku r1, r2, r3, then Sonnet r1, r2, r3, then Opus. **Budget**: the bench key's total
  recorded spend stays under $100. The harness never starts a run that could cross it, so the last
  replicate may stop partway through.

**Calibration, already run and excluded.** Two 5-task Haiku recall-arm rounds tested the prompt
(`runs/superseded/calib-full-output-v1`, `runs/calib-full-output`). Neither was graded; only
engagement was read. The first version of the prompt had summaries in 2 of 5 runs. After adding
"verbose output" it had summaries in 4 of 5. The gate was set at 3 of 5 before the first round.

**Analysis, fixed now** (`analyze.py --replicates`, committed in 6704abb with mutation-tested checks):

- **Unit:** a task. Its outcome is the mean, over the replicates where both arms ran, of
  `recall` solved minus `nohook` solved. The model's result is the mean over tasks, in points.
- **Interval:** percentile bootstrap over tasks, 10,000 resamples, seed 414.
- **Test:** a randomization test that swaps the two arms' labels independently within each replicate
  pair, 10,000 draws, two-sided.
- **Exclusions** as in the pilot. A task with no complete pair is dropped. A task with fewer than three
  pairs counts with the pairs it has.
- **Grading and empty patches** as in the pilot: an empty patch is unsolved.

**How the result will be read**, decided now:

- Per model, an interval lying entirely below 0 is a measured harm from compression. One lying
  entirely above 0 is a measured benefit. An interval that touches 0 does neither.
- Otherwise the claim is "no measurable effect of compression", quoting the lower bound as the largest
  harm the data still allow.
- There are two primary comparisons, Haiku and Sonnet. The report states the chance of at least one
  firing by chance alone. Opus, if run, and any partial replicate are reported but make no claim.
- **Secondary, Haiku only:** `plain` vs `nohook` (the cost of installing) and `plain` vs `recall`, with
  the same method. The cost of installing is a claim only if its interval lies entirely below 0.
- **Engagement**, reported whatever it shows: the share of recall-arm runs that got at least one
  summary, and that called a `recall__*` tool.
- **Exploratory only:** solve rates on the tasks where summaries fired, because engagement is not
  randomized.

**Power** (simulated with the analysis's own test, Haiku-like tasks: 17 always solved, 15 never,
13 mixed), probability of p < 0.05:

| True difference | 2 replicates | 3 replicates |
|---|---|---|
| 5 points | 0.10 | 0.11 |
| 10 points | 0.27 | 0.39 |
| 15 points | 0.50 | 0.72 |
| 20 points | 0.81 | 0.95 |

A compression effect under about 15 points can exist and go unseen. The report says so whatever it shows.

**Known before this was written:** the pilot's and the first follow-up's results, and the calibration
engagement counts above. No outcome of this design has been run or graded.

## Study 3: the long-session pilot (added 2026-11-02, before it ran)

The compression test is graded and its result stands: summaries did not measurably change solve rate.
Each of its sessions was one short task, so context never ran short, and it could not show the benefit
mcp-recall is built for. This pilot asks: **when tasks run back to back in one session, does compression
change how soon and how often the context fills, and does solve rate hold up later in the session?**

**Design.** `bench.py chain` (commit 1b9a241). A sequence of tasks runs in one Claude Code session: each
task gets a fresh container from its own image, the previous task's Claude Code home, config and
mcp-recall store are copied in, and the agent continues with `claude -p --resume`. Every task after the
first opens with one sentence saying the checkout is new and earlier changes are gone. Each task is
graded on its own image as before.

- **Arms:** `nohook` and `recall`, both installed, as in the compression test. Prompt `full-output`.
- **Model:** Haiku 5.5. **Tasks:** the 22 Django tasks of the hard set (`tasks-long.txt`).
- **Sequences:** 6, of 10 tasks each, drawn without repeats by `bench.sequences` with seed 414. Both
  arms run the same sequences, in this order (Django instance numbers):
  1. 14631, 14007, 16263, 13212, 13344, 13449, 11400, 12325, 14011, 15629
  2. 12325, 14007, 14011, 16631, 13344, 15268, 12708, 10554, 13449, 15957
  3. 10554, 13449, 15128, 12325, 16631, 13344, 12708, 11400, 13128, 14631
  4. 15128, 15957, 13449, 12708, 13344, 12325, 15268, 14007, 14011, 16631
  5. 15503, 11885, 11400, 15128, 14631, 16263, 15268, 12708, 11138, 15629
  6. 11885, 13128, 16631, 12708, 10554, 15957, 11138, 13344, 15128, 16263
- **Budget:** the key's total recorded spend stays under $100, as before. Expected about $10-15.
- **A chain ends** where a task does not finish its run (an infrastructure failure or the cap), because
  the next task has nothing to resume. Positions it did not reach are reported as not run.

**Smoke check, already run and excluded.** One sequence of 2 tasks per arm (`runs/long-smoke-s01`)
tested the runner: the second task continued the first's session in both arms, started with about 39k
tokens of context against 18k fresh, the store carried over, and `nohook` kept its hook removed. It was
not graded. It showed a Haiku task adds about 20k tokens of context, so sequences are 10 tasks long, not
the 6 first planned, to reach compaction.

**Measures** (`analyze.py --chains long-s01 … long-s06`, with mutation-tested checks):

- **Compactions** per chain and arm, counted from `compact_boundary` events in each task's stream, and
  per sequence `recall` minus `nohook`.
- **Context at the start of each position:** the median over chains of the first model call's input,
  cache-read and cache-write tokens.
- **Solve rate:** by position, and overall with the compression test's method (a sequence standing in for
  a replicate; pairs are the same task in the same sequence).
- **How far each chain got**, cost, and engagement as before.

**How it will be read, decided now.** This is a pilot with 6 sequences, so it makes **no claim** of
benefit or harm. It reports every measure above as it falls, and says how many of the 6 sequences had
fewer compactions with `recall`, more, or the same. It decides what runs next:

- If `nohook` compacts at least once in 3 or more of its 6 chains, the setting produces context
  pressure, and the remaining budget goes to 2-3 Sonnet sequences with the same design.
- Otherwise the sessions were too short to test the question, and the next step is longer sequences,
  not another model.

**Known before this was written:** every result of the pilot and both follow-ups, and the smoke check's
runner behaviour above. No outcome of this design has been run or graded.

## Study 4: the MCP-heavy test (added 2026-11-02, before it ran)

Study 3 ran and is sealed (`runs/long-s01` to `long-s06`). Neither arm compacted once: Haiku 5.5's
context window is 1M tokens, and ten Django tasks reached a median of 330k without mcp-recall. Its
reading rule therefore says the sessions were too short. Bash output is also the weak case, because
agents trim it themselves. This study tests the strong case: browser page snapshots, which the agent
cannot trim, in sessions long enough to compact. It is the decisive test agreed with the maintainer on
2026-11-02: if it shows nothing, mcp-recall goes to maintenance.

**Design.** `web.py chain`. Tasks are MCPMark's 12 WebArena Reddit tasks (`bench/agent/web/tasks`,
copied unchanged from MCPMark commit cd45b7f, Apache 2.0), driven through Playwright MCP 0.0.68 with
MCPMark's own flags and prompt wording. Each task gets a fresh forum container
(`am1n3e/webarena-verified-reddit`, pinned by digest) on its own internal network, and the task's own
`verify.py` grades the forum's final state. Tasks are chained in one resumed session as in Study 3.

- **Arms:** `nohook` and `recall`, both installed. **Model:** Haiku 5.5.
- **Window:** `CLAUDE_CODE_AUTO_COMPACT_WINDOW=200000` in both arms, so Claude Code compacts as it
  would for a 200k-window model. This is a simulation and the report says so; it was chosen with the
  maintainer because a 1M window does not fill in 12 tasks.
- **Sequences:** 3, each all 12 tasks, drawn by `bench.sequences` with seed 414:
  1. standard/budget_europe_travel, standard/ai_data_analyst, standard/movie_reviewer_analysis,
     easy/nba_statistics_analysis, easy/routine_tracker_forum, easy/movie_reviewer_analysis,
     easy/ai_data_analyst, standard/routine_tracker_forum, easy/llm_research_summary,
     standard/buyitforlife_research, standard/llm_research_summary, standard/nba_statistics_analysis
  2. easy/movie_reviewer_analysis, easy/routine_tracker_forum, standard/buyitforlife_research,
     standard/routine_tracker_forum, easy/ai_data_analyst, standard/nba_statistics_analysis,
     standard/llm_research_summary, standard/movie_reviewer_analysis, standard/ai_data_analyst,
     easy/llm_research_summary, standard/budget_europe_travel, easy/nba_statistics_analysis
  3. standard/nba_statistics_analysis, standard/movie_reviewer_analysis, easy/routine_tracker_forum,
     easy/movie_reviewer_analysis, standard/llm_research_summary, easy/nba_statistics_analysis,
     standard/budget_europe_travel, standard/ai_data_analyst, standard/buyitforlife_research,
     easy/ai_data_analyst, easy/llm_research_summary, standard/routine_tracker_forum
- **Limits:** `--max-budget-usd` 2 per task, 1,800 s per task; total key spend under $100. Expected
  about $6-10.

**Smoke checks, already run and excluded** (`runs/web-smoke-s01`, `runs/web-smoke2-s01`): two easy tasks
per arm. Both arms passed `easy/ai_data_analyst` and failed `easy/llm_research_summary` in both rounds.
Snapshots of about 44 KB reached the `recall` agent as about 4 KB. With a 60k compaction window, `nohook`
compacted once in its second task and `recall` did not.

**Measures** (`analyze.py --chains web-s01 web-s02 web-s03`): compactions per chain and arm, context at
the start of each position, solve rate by position and overall (pairs are the same task in the same
sequence), each chain's cost (its last run's, since a resumed session reports its cost so far), and
engagement.

**How it will be read, decided now.** Three sequences make no statistical claim. The reading is a
decision for the product, stated before the runs:

- **Shows a benefit** if `recall` compacts fewer times than `nohook` in all 3 sequences, and its total
  solved tasks are not lower than `nohook`'s by more than 3 of 36.
- **Shows nothing** if `recall` compacts as often as `nohook`, or more, in 2 or more sequences.
- **Shows a cost** if `recall` solves 4 or more fewer of the 36 tasks than `nohook`, whatever the
  compactions.
- Any other pattern is reported as mixed, without choosing a reading.

Cost and context are reported whatever they show, and make no claim.

**Known before this was written:** every earlier result, Study 3's included, and the smoke checks above.
No outcome of this design has been run or graded.

## Study 5: the MCP-heavy test, rerun on the fixed build (added 2026-11-02, before it ran)

Study 4 ran and is sealed (`runs/web-s01` to `web-s03`). Its pre-registered reading is **shows a
cost**: `recall` compacted less (1/1/1 against 4/2/2) but solved 23 of 36 against 27. Reading the
stored summaries afterwards found why, and it is a defect in mcp-recall, not in the design: every
Playwright response reached the agent without its page
([#424](https://github.com/sakebomb/mcp-recall/issues/424)). `browser_snapshot` became an empty-page
notice; navigate and click kept their first 4 KB, mostly site navigation; an evaluate kept under 1 KB
of the data the agent had asked for. The agent could have re-read pages through `recall__retrieve`,
and called it once in 36 runs. Study 4 therefore measured a broken handler. Its result stands as
recorded and is reported, with this cause.

This study runs the **identical design** on a build with #424 fixed, to measure the handler as
intended. Only the mcp-recall binary changes.

- **Build:** mcp-recall at commit `2f54ba5` (PR #426, branch `fix/playwright-snapshots`), standalone
  binary built with Bun 1.3.14, sha256
  `ed8d579778177ba187a71c8c072d4be7f1f7a95b03a041b2ecce3b3252ac4872`. It still reports version
  1.19.0, so runs are told apart by this hash, which every run manifest records. The Study 4 binary
  (`a9a50e9f…`) is kept in `bench/agent/bin/v1.19.0/`. Playwright pages now reach the agent as an
  outline that keeps every element's name, text, link target and clickable ref; the result, the code
  and the page URL are kept whole; console events are capped, keeping every error. Over the 164
  Playwright responses stored in Study 4's smoke and main runs, it saves 62%.
- **Everything else as Study 4:** the same 12 tasks, the same 3 sequences (seed 414), Haiku 5.5, both
  arms installed, `CLAUDE_CODE_AUTO_COMPACT_WINDOW=200000`, `--max-budget-usd` 2 and 1,800 s per task,
  the same images by digest. `nohook` is rerun too, so both arms share the day and the API. Run ids
  `web-fix-s01` to `web-fix-s03`.
- **Measures and reading:** exactly Study 4's, applied to these three sequences alone. The rules for
  benefit, nothing, cost and mixed are unchanged, and Study 4's runs are never pooled with these.
- **Expected spend:** about $4; key spend so far $85.01 of the $100 cap.

**What this rerun can and cannot show.** Fixing a bug found after seeing a result, then rerunning, is
a second look at the same question. That is disclosed here and in the report: both studies are
reported side by side, Study 4 first, and neither is dropped. A benefit here would be a claim about
the fixed handler on this site and this model, nothing wider.

**Known before this was written:** Study 4's results and cause (above), every earlier result, and the
164 stored responses used to check the fix. No outcome of this design on the fixed build has been run
or graded.

## Study 6: the MCP-heavy test on a self-hosted model (added 2026-11-02, before it ran)

Studies 3 to 5 ran on Claude models with 200k-token or larger windows, where few tasks fill the
context. This study asks the same question of a smaller, self-hosted model whose window a single
forum task does fill, at no API cost.

- **Model:** Qwen/Qwen3-Coder-Next-FP8 (about 80B mixture-of-experts, 3B active), served by vLLM
  0.29.0 on blackwell (RTX PRO 6000, prefix caching on, fp8 KV cache), reached through LiteLLM as
  `blackwell-coder-next`, priced at $0 there. Its context is 131,072 tokens and its output is capped
  at 16,384, and `CLAUDE_CODE_AUTO_COMPACT_WINDOW=131072` tells Claude Code so. `--max-budget-usd` is
  not passed: Claude Code would price the unknown model and could end runs early.
- **Build:** mcp-recall at main `b1c72bd` (#424, #428, #430 and #425 fixed), standalone binary built
  with Bun 1.3.14, sha256 `307d9793dd46e90dbbf00df98bf2d88f7662651d3c98e4fa354acaee9f8ef842`, recorded
  in every manifest. Study 5's binary is kept in `bench/agent/bin/fix-424/`.
- **Design:** single tasks, each in a fresh session against a fresh forum (`web.py single`): the same
  12 tasks, both arms installed as before, 3 repeats, so 36 runs per arm. Within a repeat, each task's
  two arms are queued together, and the order flips every repeat; two run at a time, so a task's two
  arms usually run side by side. 3,600 s per task. Run ids `web-local-r01` to `web-local-r03`.
- **Primary measure:** tasks solved out of 36 per arm, by each task's own `verify.py`.
- **Reading, fixed now:** **shows a benefit** if `recall` solves at least 4 more than `nohook`;
  **shows nothing** if the two are within 3; **shows a cost** if `recall` solves at least 4 fewer. A
  paired exact test on the 36 task-repeat pairs is reported beside it, with no claim resting on it.
- **Secondary, reported whatever the primary says:** compactions per run, wall time and turns per
  run, Playwright bytes stored and returned, `recall__*` calls.
- **Reruns:** a run that fails for infrastructure (setup failure, the gateway or vLLM returning an
  error, the forum not starting) is rerun once and the failure disclosed. A run the agent finishes
  is never rerun, whatever its result.

**Amendment, 2026-11-02, before the restart: the first attempt is void.** The first attempt was
stopped after 41 of 72 runs, and its runs are kept in `bench/agent/runs/void-study6-attempt1/`,
excluded from the analysis. Seven of the 41 ended on an API error rather than on the agent's own
work, four in `recall` and three in `nohook`. Two got a 502 while LiteLLM was crashing, and two
were ended by a LiteLLM 400 ("Input should be a valid string", a request sent to vLLM in the wrong
shape). The third error was ours: Claude Code asks for 32,000 output tokens, so a prompt of about 99k plus the
request overflowed the 131k window. Three runs died with that 400 when they should have compacted.
Rerunning once could not have fixed this, because it recurs on every long run, and compaction is
what this study is about. The restart changes two things and nothing else:

- `--max-output 16384` sets `CLAUDE_CODE_MAX_OUTPUT_TOKENS`, the served model's real output cap, and
  is recorded in every run and manifest.
- A run whose final result carries a non-null `api_error_status` is an infrastructure failure,
  under the reruns rule above. That status is read from the record, not judged by eye.

Known when this was written: in the void attempt's first repeat, `recall` solved 6 of 12 and
`nohook` 4 of 12. The reading, measures and tasks above stand unchanged.

**Smoke runs, disclosed and excluded from the analysis.** `smoke6`: qwen3-coder 30B on jupiter's
Ollama, 64k window, solved 0 of 2 easy tasks (it never registered), so it failed the floor.
`smoke6b`: qwen3.6 35B on jupiter, solved 1 of 2, but 6 to 22 minutes a task with a third of the
model on the CPU. `smoke6c`: this model, `nohook`, solved `easy/movie_reviewer_analysis` in 72 s
with no compaction and failed `easy/llm_research_summary` after 81 turns and 8 compactions, each at
about 104k tokens. `smoke6d`: this model, `recall`, solved `easy/movie_reviewer_analysis` in 55 s,
storing 11 Playwright responses at about 60% smaller. The smokes ran on Study 5's binary except
`smoke6d`. `smoke6e`, after the amendment: this model, `nohook`, main's binary, `--max-output 16384`,
`easy/llm_research_summary`. It compacted once at 106,947 tokens and finished in 39 turns with no
API error, unsolved.

**What this can and cannot show.** A result is about this model, this site and this harness. A
benefit here would say mcp-recall helps a model whose window a task fills; it would not say the same
of Claude, which Studies 3 to 5 measured directly.

**Known before this was written:** every earlier result and the four smoke runs above. No run of
this design has been graded.

## Already disclosed

- Study 5's section says the fix was checked on the Playwright responses "stored in Study 4's smoke
  and main runs". They came from Study 4's `recall` chains only (`web-s01` to `web-s03`): 166 stored
  items, 164 distinct. Corrected here after the run; the section above is left as registered.
- The same section says an evaluate "kept under 1 KB of the data the agent had asked for". In Study 4
  each evaluate went to the generic fallback, which kept the first 4 KB of a JSON-escaped copy: the 22
  results, 5.9 KB or more each, were all cut, but not to under 1 KB.

- The smoke round (`runs/smoke1`, 4 medium tasks) predates full recording; it is
  cited only as the costing round, never pooled with the pilot.
- A first pilot attempt was stopped after 144 runs because it kept no transcripts
  (`runs/superseded/`). Its outcomes were never graded. The pilot was rerun in full.
- The analysis code (`bench/agent/analyze.py`, `check_analyze.py`) was committed in
  56c4a9f at 17:35:54 -05:00 on 2026-11-01, 47 seconds after the grader wrote its first
  pilot report (17:35:07). Its commit message says "before grading", which is wrong by
  those 47 seconds. Both files were last modified before grading began (17:23:26 and
  17:32:20), and no pilot report was opened before the commit.
