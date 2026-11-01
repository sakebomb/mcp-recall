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
