"""Checks for analyze.py against hand-computed answers. Each check was shown to
fail on a deliberately broken copy of analyze.py before the pilot was graded.

    .venv/bin/python check_analyze.py            # or pass another analyze.py's directory
"""
import sys, random
from pathlib import Path
sys.path.insert(0, sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parent))
import analyze as A
# McNemar: hand-computed values.
assert A.mcnemar_exact(0, 0) == 1.0
assert abs(A.mcnemar_exact(1, 7) - 2 * 9 / 256) < 1e-12        # 0.0703
assert abs(A.mcnemar_exact(0, 6) - 2 / 64) < 1e-12              # 0.03125
assert A.mcnemar_exact(5, 5) == 1.0
# Synthetic: 10 tasks, plain solves 0-5, recall solves 0-3 and 6-7 -> b=2 (4,5), c=2 (6,7), diff 0.
def run(t, arm, ok, **kw):
    base = dict(model="m", arm=arm, task=f"t{t}", resolved=ok, infra_failure=False, subtype="success",
                cost=1.0, turns=10, wall_s=5.0, in_tok=100, stored=0, summaries_delivered=0, recall_calls=0)
    base.update(kw); return base
runs = [run(t, "plain", t <= 5) for t in range(10)] + [run(t, "recall", t <= 3 or t in (6, 7), cost=0.5) for t in range(10)]
m = A.analyze_model(runs, "m", random.Random(1))
assert (m["n_pairs"], m["plain_only"], m["recall_only"], m["diff"]) == (10, 2, 2, 0.0), m
assert m["secondary"]["cost"]["median_diff"] == -0.5
lo, hi = m["diff_ci95"]; assert lo < 0 < hi, (lo, hi)
# Recall better on 6 tasks only: diff +0.6, CI excludes 0, p = 0.03125.
runs2 = [run(t, "plain", False) for t in range(10)] + [run(t, "recall", t < 6) for t in range(10)]
m2 = A.analyze_model(runs2, "m", random.Random(1))
assert m2["diff"] == 0.6 and m2["diff_ci95"][0] > 0 and abs(m2["mcnemar_p"] - 0.03125) < 1e-12, m2
# Exclusions: infra failure in one arm drops the pair; an ungraded run drops it too; unpaired drops.
runs3 = runs2 + [run(20, "plain", True), run(20, "recall", False, infra_failure=True),
                 run(21, "plain", True), run(21, "recall", None), run(22, "plain", True)]
m3 = A.analyze_model(runs3, "m", random.Random(1))
assert m3["n_pairs"] == 10 and m3["dropped"] == {"infra_failure": ["t20"], "ungraded": ["t21"], "unpaired": ["t22"]}, m3["dropped"]
print("all analyze checks pass")
# Stream parser: 2 recall summaries delivered, 1 recall__ call, 1 plain Bash call, a plain result, junk lines.
import json, pathlib, tempfile
ev = [
    {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Bash"}]}},
    {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "mcp__github__list_issues"}]}},
    {"type": "user", "message": {"content": [{"type": "tool_result", "content": "[recall:recall_ab12 · 12KB→1KB] ..."}]}},
    {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "mcp__recall__recall__retrieve"}]}},
    {"type": "user", "message": {"content": [{"type": "tool_result", "content": [{"type": "text", "text": "[recall:recall_cd34 · cached]"}]}]}},
    {"type": "user", "message": {"content": [{"type": "tool_result", "content": "plain output"}]}},
    {"type": "user", "message": {"content": "a string, not a list"}},
]
p = pathlib.Path(tempfile.mkdtemp()) / "stream.jsonl"
p.write_text("\n".join(json.dumps(e) for e in ev) + "\nnot json\n")
assert A.stream_engagement(p) == (2, 1), A.stream_engagement(p)
assert A.stream_engagement(p.parent / "missing.jsonl") == (None, None)
print("stream checks pass")
# Replicates (compression test): 4 tasks over run ids r1-r3, nohook vs recall.
# A: 0->1 in all three (mean +1). B: 1->1 (0). C: (1,0,1)->(0,0,1), mean -1/3.
# D: r1 0->1; r2 dropped for an infra failure; r3 has no recall run. Task-level diff
# (1 + 0 - 1/3 + 1) / 4 = 5/12; pooling runs instead would give 0.8 - 0.5 = 0.3.
def rep(t, rid, arm, ok, **kw):
    return {**run(t, arm, ok, **kw), "run_id": rid}
R = []
for i, rid in enumerate(("r1", "r2", "r3")):
    R += [rep("A", rid, "nohook", False), rep("A", rid, "recall", True, summaries_delivered=2 if i == 0 else 0)]
    R += [rep("B", rid, "nohook", True), rep("B", rid, "recall", True)]
    R += [rep("C", rid, "nohook", (True, False, True)[i]), rep("C", rid, "recall", i == 2)]
R += [rep("D", "r1", "nohook", False), rep("D", "r1", "recall", True),
      rep("D", "r2", "nohook", False), rep("D", "r2", "recall", True, infra_failure=True),
      rep("D", "r3", "nohook", True)]
s = A.replicate_stats(R, "nohook", "recall")
assert (s["n_tasks"], s["n_pairs"], s["tasks_changed"]) == (4, 10, 3), s
assert abs(s["diff"] - 5 / 12) < 1e-12, s["diff"]
assert (s["nohook_solve_rate"], s["recall_solve_rate"]) == (0.5, 0.8), s
assert s["engagement"] == {"summaries_delivered": "1/10", "recall_calls": "0/10"}, s["engagement"]
# Randomization p: 6 tasks, 3 pairs each, all +1, so only 2 of 2^18 sign patterns are as extreme.
S = [rep(t, rid, arm, arm == "recall") for t in range(6) for rid in ("r1", "r2", "r3") for arm in ("nohook", "recall")]
strong = A.replicate_stats(S, "nohook", "recall")
assert strong["diff"] == 1.0 and strong["perm_p"] < 0.001 and strong["diff_ci95"] == (1.0, 1.0), strong
# Mixed signs within a task: 5 tasks of (+1, -1, +1) give diff 1/3, and the test is not extreme.
M = [rep(t, rid, arm, (arm == "recall") == (rid != "r2")) for t in range(5) for rid in ("r1", "r2", "r3")
     for arm in ("nohook", "recall")]
mixed = A.replicate_stats(M, "nohook", "recall")
assert abs(mixed["diff"] - 1 / 3) < 1e-12 and 0.05 < mixed["perm_p"] < 1.0, mixed
# No differences at all -> p = 1.
same = A.replicate_stats([r for r in R if r["task"] == "tB"], "nohook", "recall")
assert same["diff"] == 0 and same["perm_p"] == 1.0, same
print("replicate checks pass")
# Chains (long-session pilot): s1 runs A B C, s2 runs B C A. nohook s2 stops after C;
# recall s2 has no C, so its A (5 compactions) is past the chain's end and must not count.
def ch(rid, t, arm, ok, comp, ctx):
    return {**run(t, arm, ok), "run_id": rid, "compactions": comp, "first_ctx": ctx}
C2 = [ch("s1", "A", "nohook", True, 0, 10), ch("s1", "B", "nohook", False, 1, 50), ch("s1", "C", "nohook", True, 1, 30),
      ch("s1", "A", "recall", True, 0, 10), ch("s1", "B", "recall", True, 0, 40), ch("s1", "C", "recall", False, 0, 60),
      ch("s2", "B", "nohook", False, 0, 10), ch("s2", "C", "nohook", True, 2, 70),
      ch("s2", "B", "recall", True, 0, 10), ch("s2", "A", "recall", True, 5, 90)]
cs = A.chain_stats(C2, {"s1": ["tA", "tB", "tC"], "s2": ["tB", "tC", "tA"]}, "nohook", "recall")
nh, rc = cs["arms"]["nohook"], cs["arms"]["recall"]
assert nh["compactions"] == {"s1": 2, "s2": 2} and rc["compactions"] == {"s1": 0, "s2": 0}, cs
assert nh["positions_run"] == {"s1": 3, "s2": 2} and rc["positions_run"] == {"s1": 3, "s2": 1}, cs
assert cs["compaction_diff"] == {"s1": -2, "s2": -2}, cs
assert nh["first_ctx_by_position"] == [10, 60, 30] and rc["first_ctx_by_position"] == [10, 40, 60], cs
assert nh["solved_by_position"] == ["1/2", "1/2", "1/1"] and rc["solved_by_position"] == ["2/2", "1/1", "0/1"], cs
assert (nh["cost"], rc["cost"]) == (5.0, 4.0), cs
# Solve pairs by (sequence, task): A (0), B (+1, +1), C (-1) -> task means 0, 1, -1, diff 0.
assert (cs["solve"]["n_pairs"], cs["solve"]["diff"]) == (4, 0), cs["solve"]
# Context by position is a median: 10, 20, 90 give 20 (a mean would give 40).
c3 = A.chain_stats([ch(s, "A", arm, True, 0, x) for s, x in (("s1", 10), ("s2", 20), ("s3", 90))
                    for arm in ("nohook", "recall")], {"s1": ["tA"], "s2": ["tA"], "s3": ["tA"]}, "nohook", "recall")
assert c3["arms"]["nohook"]["first_ctx_by_position"] == [20], c3
# Stream context: two compactions, first call 100 tokens, largest 900; junk and non-dict lines skipped.
ctx_ev = [
    {"type": "system", "subtype": "init", "session_id": "x"},
    {"type": "assistant", "message": {"usage": {"input_tokens": 10, "cache_read_input_tokens": 60, "cache_creation_input_tokens": 30}}},
    {"type": "system", "subtype": "compact_boundary", "compact_metadata": {"trigger": "auto"}},
    {"type": "assistant", "message": {"usage": {"input_tokens": 5, "cache_read_input_tokens": 800, "cache_creation_input_tokens": 95}}},
    {"type": "user", "message": {"usage": {"input_tokens": 99999}}},
    {"type": "system", "subtype": "compact_boundary"},
    {"type": "assistant", "message": {"usage": {"input_tokens": 1, "cache_read_input_tokens": 200}}},
]
q = pathlib.Path(tempfile.mkdtemp()) / "stream.jsonl"
q.write_text("\n".join(json.dumps(e) for e in ctx_ev) + "\n[1, 2]\nnot json\n")
assert A.stream_context(q) == (2, 100, 900), A.stream_context(q)
assert A.stream_context(q.parent / "missing.jsonl") == (None, None, None)
print("chain checks pass")
