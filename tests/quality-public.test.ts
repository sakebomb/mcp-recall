import { describe, expect, it } from "bun:test";
import { bareCommand, bashOutputs, familyOf, pick, stripTrailer } from "../scripts/quality-public";

const TRAILER = "\n[The command completed with exit code 1.]\n[Current working directory: /workspace/x]\n[Python interpreter: /testbed/.venv/bin/python]";

describe("stripTrailer", () => {
  it("removes OpenHands' exit code, directory and interpreter lines, and nothing else", () => {
    expect(stripTrailer(`line one\nline two${TRAILER}`)).toBe("line one\nline two");
    expect(stripTrailer("[The command completed with exit code 0.] said the log\nkept")).toBe("[The command completed with exit code 0.] said the log\nkept");
  });
});

describe("bareCommand and familyOf", () => {
  it("drop the cd, timeout and variable wrappers before naming the family", () => {
    expect(bareCommand("cd /workspace/x && timeout 60 PYTHONPATH=. python -m pytest -x tests")).toBe("python -m pytest -x tests");
    expect(familyOf("cd /workspace/x && python -m pytest -x tests")).toBe("pytest");
    expect(familyOf("cd /repo && git diff HEAD~1")).toBe("git-diff");
    expect(familyOf("python reproduce_issue.py")).toBe("python");
    expect(familyOf("find . -name '*.py' | head")).toBe("other");
  });
});

describe("bashOutputs", () => {
  const call = (name: string, args: object) => ({ function: { name, arguments: JSON.stringify(args) } });

  it("pairs each execute_bash call with the tool message that answers it, in order", () => {
    const outputs = bashOutputs([
      { role: "assistant", content: "", tool_calls: [call("str_replace_editor", { command: "view", path: "/a" }), call("execute_bash", { command: "ls" })] },
      { role: "tool", content: "file view" },
      { role: "tool", content: `a.py${TRAILER}` },
      { role: "assistant", content: "", tool_calls: [call("execute_bash", { command: "git status" })] },
      { role: "tool", content: "clean" },
    ]);
    expect(outputs).toEqual([{ command: "ls", output: "a.py" }, { command: "git status", output: "clean" }]);
  });
});

describe("pick", () => {
  const row = (outputs: [string, string][]) => ({
    repo: "o/r", license: "MIT", trajectory_id: "t",
    trajectory: outputs.flatMap(([command, content]) => [
      { role: "assistant", content: "", tool_calls: [{ function: { name: "execute_bash", arguments: JSON.stringify({ command }) } }] },
      { role: "tool", content },
    ]),
  });
  const traceback = (pad: number) => `${"INFO step\n".repeat(pad)}Traceback (most recent call last):\n  File "/w/a.py", line 3, in main\nKeyError: 'k'`;

  it("takes the first output in the size window that holds a fact", () => {
    const taken = pick(row([["python a.py", traceback(10)], ["python a.py", traceback(500)], ["python b.py", traceback(600)]]));
    expect(taken?.output.length).toBe(traceback(500).length);
    expect(taken?.family).toBe("python");
  });

  it("skips an output past Claude Code's file-save size, one with no fact, and one holding a secret", () => {
    const secret = `${traceback(500)}\nkey=sk-ant-api03-${"A".repeat(95)}`;
    expect(pick(row([["python a.py", traceback(4000)], ["ls -R", "x\n".repeat(3000)], ["python a.py", secret]]))).toBeNull();
  });
});
