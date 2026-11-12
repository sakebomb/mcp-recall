"""MCP-heavy long-session test (#414): Claude Code drives a self-hosted forum through
Playwright MCP, task after task in one resumed session, with mcp-recall's hook on or off.

Tasks are MCPMark's WebArena Reddit tasks (web/tasks, see its NOTICE.md). Each task gets
a private internal network holding a fresh forum container and the agent's container, so
no task sees another's accounts or posts and the forum never reaches the internet. The
task's own verify.py then checks the forum's final state.

    web.py chain --model claude-haiku-5-5 --run-id web --sequences 3 --cap 100
"""
import argparse
import json
import os
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import bench as B

WEB = B.HERE / "web"
AGENT_IMAGE = "mcp-recall-bench-web:0.0.68"
FORUM_IMAGE = ("am1n3e/webarena-verified-reddit@sha256:"
               "0594908059a03e5f610005689440a95c05e776e734006197c7b1eba12734cb46")
VERIFY_IMAGE = "mcp-recall-bench-verify:1.59.0"  # web/verify/Dockerfile
FORUM_URL = "http://forum"
# MCPMark's own flags for the server (src/agents/base_agent.py at the pinned commit).
PLAYWRIGHT_MCP = ["playwright-mcp", "--headless", "--isolated", "--no-sandbox",
                  "--browser", "chromium", "--viewport-size", "1280,720"]
# MCPMark's wrapper around each description (playwright_task_manager.py).
PROMPT = ("Navigate to {url} and complete the following task.\n\n{description}\n\n"
          "Use Playwright MCP tools to complete this task.\n\nNote: Based on your understanding,"
          " solve the task all at once by yourself, don't ask for my opinions on anything.")
CHAIN_PREFIX = ("This is a new task. The forum has been reset to its original state, so accounts"
                " and posts from earlier tasks are gone.\n\n")
# Local backend (Study 6): Ollama's Anthropic Messages API in a container on its own internal
# network, started by hand (see the spec). The agent joins that network instead of the
# default bridge, so a local run has no route to the internet at all.
OLLAMA_MODELS = ("qwen3-coder:64k", "qwen3.6:35b")
# Self-hosted models behind LiteLLM, priced at $0 there: Qwen3-Coder-Next FP8 on vLLM,
# 131,072-token context. These are gateway route names, so set BENCH_FREE_MODELS
# (comma-separated) to match your own gateway's.
FREE_MODELS = tuple(m.strip() for m in os.environ.get("BENCH_FREE_MODELS", "").split(",")
                    if m.strip()) or ("self-hosted-qwen3-coder-next",)
OLLAMA_NET = "recall-bench-llm"


def ollama_env(model):
    """Every model slot Claude Code might pick, background calls included, is the local one."""
    return {"ANTHROPIC_BASE_URL": "http://ollama:11434", "ANTHROPIC_AUTH_TOKEN": "ollama",
            **{k: model for k in ("ANTHROPIC_DEFAULT_HAIKU_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL",
                                  "ANTHROPIC_DEFAULT_OPUS_MODEL", "ANTHROPIC_SMALL_FAST_MODEL")}}


def local(a):
    return getattr(a, "backend", "litellm") == "ollama"


def backend_args(a):
    """docker run flags that point the agent at its model: LiteLLM through the key's env
    file on the default bridge, or the local Ollama container on its internal network."""
    if not local(a):
        return ["--env-file", str(B.ENV_FILE)]
    return ["--network", OLLAMA_NET, *[f for k, v in ollama_env(a.model).items() for f in ("-e", f"{k}={v}")]]


def load_tasks():
    """Every task directory, keyed '<suite>/<name>' (easy and standard share names)."""
    return {f"{d.parent.parent.name}/{d.name}": d
            for d in sorted(WEB.glob("tasks/*/reddit/*")) if (d / "verify.py").exists()}


def compact_window_env(a):
    """Claude Code compacts against min(model window, CLAUDE_CODE_AUTO_COMPACT_WINDOW), so
    setting it makes a 1M-window model compact as a smaller-window one would."""
    return ["-e", f"CLAUDE_CODE_AUTO_COMPACT_WINDOW={a.compact_window}"] if a.compact_window else []


def max_output_env(a):
    """Claude Code asks for 32k output tokens by default. On a 131k self-hosted window that
    request overflows near the compaction point and the run dies with a 400 instead of
    compacting, so cap it at what the served model can actually emit."""
    return ["-e", f"CLAUDE_CODE_MAX_OUTPUT_TOKENS={a.max_output}"] if a.max_output else []


def wait_for_forum(agent, timeout=300):
    """The forum container initializes its database on first start (2-3 minutes)."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = B.sh(["docker", "exec", agent, "curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", FORUM_URL + "/"])
        if r.stdout.strip() == "200":
            return True
        time.sleep(5)
    return False


def verify(net, task_dir, ev):
    r = B.sh(["docker", "run", "--rm", "--network", net, "-e", f"WEBARENA_BASE_URL={FORUM_URL}",
              "-v", f"{task_dir}:/task:ro", VERIFY_IMAGE, "python3", "/task/verify.py"], timeout=600)
    (ev / "verify.log").write_text(r.stdout + r.stderr)
    return r.returncode == 0


def run_one(key, task_dir, model, arm, out_dir, a, resume_from=None):
    """One task, as bench.run_one, against a fresh forum; resolved is the verifier's verdict."""
    tid = key.replace("/", "__")
    out = out_dir / model / arm
    out.mkdir(parents=True, exist_ok=True)
    if (out / f"{tid}.json").exists():
        return f"skip {model} {arm} {tid}"
    spend = 0.0 if local(a) else B.key_spend()
    if spend + a.jobs * a.run_budget > a.cap:
        return f"CAP {model} {arm} {tid}: spend ${spend:.2f} + in-flight worst case exceeds ${a.cap:.2f}"
    name = f"web-{out_dir.name}-{arm}-{tid}".replace("_", "-")[:100]
    net, forum, agent = f"{name}-net", f"{name}-forum", f"{name}-agent"
    claude_bin = str(Path(B.shutil.which("claude") or "").resolve())
    teardown = lambda: [B.sh(["docker", "rm", "-f", c]) for c in (agent, forum)] + [B.sh(["docker", "network", "rm", net])]
    teardown()
    try:
        steps = [["docker", "network", "create", "--internal", net],
                 ["docker", "run", "-d", "--name", forum, "--network", net, "--network-alias", "forum", FORUM_IMAGE],
                 ["docker", "run", "-d", "--name", agent, *backend_args(a),
                  "-e", "IS_SANDBOX=1", "-e", "DISABLE_AUTOUPDATER=1", "-e", "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1",
                  *compact_window_env(a), *max_output_env(a),
                  "-v", f"{claude_bin}:/usr/local/bin/claude:ro", "-v", f"{B.RECALL_BIN}:/usr/local/bin/mcp-recall:ro",
                  "-w", "/work", AGENT_IMAGE, "bash", "-c", "mkdir -p /work && sleep infinity"],
                 ["docker", "network", "connect", net, agent]]
        for step in steps:
            r = B.sh(step)
            if r.returncode:
                return f"FAIL setup {tid}: {r.stderr.strip()[:200]}"
        if not wait_for_forum(agent):
            return f"FAIL forum {tid}: not ready"
        inst, resume = None, ""
        if resume_from is not None:
            sid = B.session_id((resume_from / "stream.jsonl").read_text())
            failed = "no session id in the previous stream" if sid is None else B.restore_state(agent, resume_from)
            if failed:
                return f"FAIL resume {tid}: {failed}"
            resume = f"--resume {sid} "
        else:
            add = B.sh(["docker", "exec", agent, "claude", "mcp", "add", "--scope", "user", "playwright", "--", *PLAYWRIGHT_MCP])
            if add.returncode:
                return f"FAIL mcp add {tid}: {add.stderr.strip()[:200]}"
            inst = B.sh(["docker", "exec", agent, "mcp-recall", "install"])
            if inst.returncode:
                return f"FAIL install {tid}: {inst.stderr.strip()[:200]}"
            if arm == "nohook":
                drop = B.sh(["docker", "exec", agent, "python3", "-c", B.DROP_POST_TOOL_USE])
                if drop.returncode:
                    return f"FAIL nohook {tid}: {drop.stderr.strip()[:200]}"
        prompt = PROMPT.format(url=FORUM_URL, description=(task_dir / "description.md").read_text().strip())
        if resume_from is not None:
            prompt = CHAIN_PREFIX + prompt
        (out / f"{tid}.prompt.txt").write_text(prompt)
        B.sh(["docker", "cp", str(out / f"{tid}.prompt.txt"), f"{agent}:/tmp/prompt.txt"])
        # A local model has no price, so Claude Code's own estimate could end a run early.
        budget = "" if local(a) or model in FREE_MODELS else f" --max-budget-usd {a.run_budget}"
        cmd = (f"claude -p \"$(cat /tmp/prompt.txt)\" {resume}--model {model} --output-format stream-json --verbose "
               f"--dangerously-skip-permissions{budget}")
        started_at, t0 = B.now_utc(), time.time()
        try:
            res = B.sh(["docker", "exec", "-w", "/work", agent, "bash", "-lc", cmd], timeout=a.timeout)
            raw, rc, err = res.stdout, res.returncode, res.stderr
        except subprocess.TimeoutExpired as e:
            raw, rc, err = B.as_text(e.stdout), "timeout", B.as_text(e.stderr)
        wall = time.time() - t0
        ev = out / f"{tid}.evidence"
        ev.mkdir(exist_ok=True)
        (ev / "stream.jsonl").write_text(raw)
        (ev / "stderr.txt").write_text(err)
        if inst is not None:
            (ev / "install.log").write_text(inst.stdout + inst.stderr)
        result = B.last_result_event(raw)
        resolved = verify(net, task_dir, ev)
        q = B.sh(["docker", "exec", agent, "python3", "-c",
                  "import sqlite3,glob,json;fs=glob.glob('/root/.local/share/mcp-recall/*.db');"
                  "print(json.dumps([list(r) for f in fs for r in sqlite3.connect(f).execute("
                  "'select tool_name, original_size, summary_size, access_count from stored_outputs')]))"])
        stored = json.loads(q.stdout) if q.returncode == 0 else q.stderr[-300:]
        B.collect_evidence(agent, ev)
        record = {"instance_id": tid, "model": model, "arm": arm, "prompt": "mcpmark", "rc": rc,
                  "started_at": started_at, "ended_at": B.now_utc(), "wall_s": round(wall, 1),
                  "image": FORUM_IMAGE, "image_id": B.image_id(FORUM_IMAGE), "patch_bytes": None,
                  "resolved": resolved, "recall_stored": stored, "claude": result,
                  "resumed": resume_from is not None, "compact_window": a.compact_window,
                  "max_output": a.max_output, "backend": getattr(a, "backend", "litellm")}
        (out / f"{tid}.json").write_text(json.dumps(record, indent=1))
        return (f"done {model} {arm} {tid}: ${result.get('total_cost_usd', 0):.3f} "
                f"{result.get('num_turns')} turns {wall:.0f}s resolved={resolved}")
    finally:
        teardown()


def run_chain(seq, tasks, arm, out_dir, a):
    prev = None
    for key in seq:
        line = run_one(key, tasks[key], a.model, arm, out_dir, a, resume_from=prev)
        print(line, flush=True)
        with (out_dir / "run.log").open("a") as log:
            log.write(f"{B.now_utc()} {line}\n")
        if not line.startswith(("done", "skip")):
            return
        prev = out_dir / a.model / arm / f"{key.replace('/', '__')}.evidence"


def selected_tasks(a):
    tasks = load_tasks()
    return {k: v for k, v in tasks.items() if k in a.tasks} if a.tasks else tasks


def spend(a):
    return None if local(a) else B.key_spend()


def stage_meta(a, tasks, keys):
    """The provenance every manifest stage records, whichever subcommand ran."""
    meta = {"started_at": B.now_utc(), "argv": B.sys.argv, "model": a.model, "arms": a.arms,
            "backend": a.backend, "prompt_template": PROMPT, "playwright_mcp": PLAYWRIGHT_MCP,
            "compact_window": a.compact_window, "max_output": a.max_output, "run_budget_usd": a.run_budget, "cap_usd": a.cap,
            "jobs": a.jobs, "timeout_s": a.timeout, "agent_image": B.image_id(AGENT_IMAGE),
            "forum_image": FORUM_IMAGE, "verify_image": B.image_id(VERIFY_IMAGE),
            "tasks_sha256": {k: B.sha256(tasks[k] / "verify.py") for k in keys},
            "key_spend_before_usd": spend(a), **B.tool_versions()}
    if local(a):
        meta["ollama_env"] = ollama_env(a.model)
        meta["ollama_container"] = B.sh(["docker", "inspect", "-f", "{{.Config.Image}} {{.Image}} {{json .Config.Env}}",
                                         "recall-bench-ollama"]).stdout.strip()
        meta["ollama_model_digest"] = B.sh(["docker", "exec", "recall-bench-ollama", "ollama", "show",
                                            "--modelfile", a.model]).stdout.strip()
    return meta


def finish(a, dirs, stages):
    after = spend(a)
    for out_dir, stage in zip(dirs, stages):
        B.append_manifest(out_dir, {**stage, "ended_at": B.now_utc(), "key_spend_after_usd": after})
    print(f"key spend after run {after}")


def cmd_chain(a):
    tasks = selected_tasks(a)
    seqs = B.sequences(tasks, a.sequences, a.length or len(tasks), a.seed)
    dirs = [B.RUNS / f"{a.run_id}-s{k + 1:02d}" for k in range(len(seqs))]
    stages = []
    for out_dir, seq in zip(dirs, seqs):
        out_dir.mkdir(parents=True, exist_ok=True)
        stages.append({**stage_meta(a, tasks, seq), "sequence": seq, "seed": a.seed, "chain_prefix": CHAIN_PREFIX})
    print(f"== {a.model} web chains (key spend so far {spend(a)})", flush=True)
    jobs = [(seq, arm, out_dir) for out_dir, seq in zip(dirs, seqs) for arm in a.arms]
    with ThreadPoolExecutor(a.jobs) as pool:
        list(pool.map(lambda j: run_chain(j[0], tasks, j[1], j[2], a), jobs))
    finish(a, dirs, stages)


def cmd_single(a):
    """Each task on its own, in a fresh session, --repeats times. Repeat r goes to
    <run-id>-rNN; within a repeat the arms alternate per task, so a slow drift in the
    machine's speed or the forum image lands on both arms alike."""
    tasks = selected_tasks(a)
    dirs = [B.RUNS / f"{a.run_id}-r{r + 1:02d}" for r in range(a.repeats)]
    stages = []
    for out_dir in dirs:
        out_dir.mkdir(parents=True, exist_ok=True)
        stages.append(stage_meta(a, tasks, list(tasks)))
    print(f"== {a.model} web single tasks, {len(tasks)} x {len(a.arms)} arms x {a.repeats}", flush=True)
    jobs = [(key, arm, out_dir) for r, out_dir in enumerate(dirs) for key in tasks
            for arm in (a.arms if r % 2 == 0 else a.arms[::-1])]

    def one(j):
        line = run_one(j[0], tasks[j[0]], a.model, j[1], j[2], a)
        print(line, flush=True)
        with (j[2] / "run.log").open("a") as log:
            log.write(f"{B.now_utc()} {line}\n")

    with ThreadPoolExecutor(a.jobs) as pool:
        list(pool.map(one, jobs))
    finish(a, dirs, stages)


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("chain")
    c.add_argument("--run-id", required=True, help="prefix: sequence k goes to <run-id>-sNN")
    c.add_argument("--sequences", type=int, default=3)
    c.add_argument("--length", type=int, help="tasks per sequence (default: all)")
    c.add_argument("--seed", type=int, default=414)
    s = sub.add_parser("single")
    s.add_argument("--run-id", required=True, help="prefix: repeat r goes to <run-id>-rNN")
    s.add_argument("--repeats", type=int, default=3)
    for q in (c, s):
        q.add_argument("--model", required=True, choices=sorted(B.RUN_BUDGET) + list(FREE_MODELS) + list(OLLAMA_MODELS))
        q.add_argument("--backend", choices=["litellm", "ollama"], default="litellm",
                       help="ollama: the local container on " + OLLAMA_NET + "; no spend, no budget flag")
        q.add_argument("--tasks", nargs="+", help="task keys to use (default: all 12)")
        q.add_argument("--run-budget", type=float, default=2.0, help="claude --max-budget-usd per task")
        q.add_argument("--compact-window", type=int, help="tokens; sets CLAUDE_CODE_AUTO_COMPACT_WINDOW")
        q.add_argument("--max-output", type=int, help="tokens; sets CLAUDE_CODE_MAX_OUTPUT_TOKENS")
        q.add_argument("--cap", type=float, default=100.0)
        q.add_argument("--arms", nargs="+", choices=B.INSTALLED, default=list(B.INSTALLED))
        q.add_argument("--jobs", type=int, default=2)
        q.add_argument("--timeout", type=int, default=1800, help="seconds per task")
    a = p.parse_args()
    if local(a) != (a.model in OLLAMA_MODELS):
        p.error(f"--backend ollama goes with a local model ({', '.join(OLLAMA_MODELS)}), and only with one")
    {"chain": cmd_chain, "single": cmd_single}[a.cmd](a)


if __name__ == "__main__":
    main()
