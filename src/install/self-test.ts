/**
 * `mcp-recall status` self-test (#495): runs the PostToolUse hook command that
 * is registered, the way Claude Code runs it, on a synthetic `git log`, and
 * reports what came back. It exercises the installed hook, not this CLI's own
 * code, and writes to a throwaway store, so the user's store and call counts
 * are untouched.
 */
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { formatBytes } from "../format";

export type SelfTestResult =
  | { ok: true; original: number; delivered: number }
  | { ok: false; reason: string };

/** Same budget Claude Code gives the hook in hooks/hooks.json. */
const TIMEOUT_MS = 10_000;
const COMMITS = 60;

/** A plain `git log` of {@link COMMITS} commits, about 20 KB: output the git handler summarizes. */
export function syntheticGitLog(): string {
  const lines: string[] = [];
  for (let i = 0; i < COMMITS; i++) {
    const sha = (i * 2654435761 >>> 0).toString(16).padStart(8, "0").repeat(5);
    const day = String((i % 28) + 1).padStart(2, "0");
    lines.push(
      `commit ${sha}`,
      `Author: Self Test <self-test@example.invalid>`,
      `Date:   Mon Nov ${day} 10:00:00 2026 +0000`,
      "",
      `    feat: synthetic change number ${i} for the mcp-recall self-test`,
      "",
      `    Body line explaining change ${i}, long enough to look like a real commit message.`,
      `    A second body line so each entry carries the weight a real log does.`,
      "",
    );
  }
  return lines.join("\n");
}

/** The PostToolUse payload Claude Code sends for a Bash call. */
export function selfTestPayload(cwd: string, stdout: string): string {
  return JSON.stringify({
    session_id: "mcp-recall-self-test",
    hook_event_name: "PostToolUse",
    cwd,
    tool_name: "Bash",
    tool_input: { command: "git log" },
    tool_response: { stdout, stderr: "", interrupted: false, isImage: false },
  });
}

/** The text Claude would receive from the hook's stdout, or null when it changed nothing. */
export function deliveredText(hookStdout: string): string | null {
  let out: unknown;
  try { out = JSON.parse(hookStdout); } catch { return null; }
  const updated = (out as { hookSpecificOutput?: { updatedToolOutput?: unknown } } | null)
    ?.hookSpecificOutput?.updatedToolOutput;
  if (typeof updated === "string") return updated;
  const stdout = (updated as { stdout?: unknown } | undefined)?.stdout;
  return typeof stdout === "string" ? stdout : null;
}

/**
 * Runs `command` (a hook command line as registered) with the synthetic payload
 * on stdin. `env` adds variables the command line expands, such as
 * CLAUDE_PLUGIN_ROOT for a marketplace install.
 */
export async function runSelfTest(command: string, env: Record<string, string> = {}): Promise<SelfTestResult> {
  const dir = mkdtempSync(join(tmpdir(), "mcp-recall-self-test-"));
  try {
    const log = syntheticGitLog();
    const proc = Bun.spawn(["sh", "-c", `${command}`], {
      cwd: dir,
      stdin: new TextEncoder().encode(selfTestPayload(dir, log)),
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, ...env, RECALL_DB_PATH: join(dir, "self-test.db") },
    });
    const timer = setTimeout(() => proc.kill(), TIMEOUT_MS);
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited,
    ]);
    clearTimeout(timer);
    if (proc.signalCode) return { ok: false, reason: `the hook did not finish within ${TIMEOUT_MS / 1000}s` };
    if (code !== 0) {
      const first = stderr.trim().split("\n")[0] ?? "";
      return { ok: false, reason: `the hook exited with code ${code}${first ? `: ${first}` : ""}` };
    }
    const text = deliveredText(stdout);
    if (text === null || !text.startsWith("[recall:")) {
      return { ok: false, reason: "the hook returned the output unchanged" };
    }
    return { ok: true, original: Buffer.byteLength(log), delivered: Buffer.byteLength(text) };
  } catch (e) {
    return { ok: false, reason: `could not run the hook: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The PostToolUse command a marketplace plugin registers, from its own hooks.json. */
export function pluginHookCommand(installPath: string): string | null {
  try {
    const hooks = JSON.parse(readFileSync(join(installPath, "hooks", "hooks.json"), "utf8"));
    const entries = (hooks?.hooks?.PostToolUse ?? []) as Array<{ hooks?: Array<{ command?: unknown }> }>;
    const cmd = entries.flatMap((e) => e.hooks ?? []).map((h) => h.command).find((c) => typeof c === "string");
    return typeof cmd === "string" ? cmd : null;
  } catch {
    return null;
  }
}

export function formatSelfTest(r: SelfTestResult): string {
  if (!r.ok) return `Self-test: ${r.reason}`;
  const pct = Math.round((1 - r.delivered / r.original) * 100);
  return `Self-test: the hook summarized a ${formatBytes(r.original)} git log to ${formatBytes(r.delivered)} (${pct}% smaller)`;
}
