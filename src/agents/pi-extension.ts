/**
 * mcp-recall for pi (https://pi.dev) — installed by `mcp-recall install` (#458).
 *
 * pi loads this file from ~/.pi/agent/extensions/mcp-recall/index.ts. It is the
 * pi side of what Claude Code's hooks do: each MCP or bash result goes through
 * mcp-recall's own `post-tool-use` hook, unchanged, and the summary it returns
 * replaces the result before the model sees it. The extension adds no logic of
 * its own; it translates pi's event into the hook's input and back.
 *
 * Self-contained by design: it imports only node builtins, because it runs
 * inside pi, and mcp-recall may be a standalone binary with no JS to import.
 * `launch.json` beside it says how to run mcp-recall; `mcp-recall install`
 * writes both files, and re-running it after an update refreshes them.
 */
import { spawn } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

export interface Launch {
  /** argv that runs the mcp-recall CLI, e.g. ["bun", "/…/dist/cli.js"] or ["/…/mcp-recall"]. */
  cli: string[];
  /** The MCP server, in pi's mcp.json shape. */
  server: { command: string; args: string[] };
}

interface TextBlock { type: "text"; text: string }

/** The fields of pi's `tool_result` event this extension reads. */
export interface PiToolResult {
  toolName: string;
  input?: unknown;
  content?: Array<{ type: string; text?: string }>;
  details?: { fullOutputPath?: unknown } | null;
  isError?: boolean;
}

/** Claude Code's hook timeout for mcp-recall's own hooks, in ms. */
const HOOK_TIMEOUT_MS = 10_000;
/** The hook reads back at most this much of a saved full output, as it does for Claude Code. */
const MAX_FULL_OUTPUT_BYTES = 20 * 1024 * 1024;
/** pi's own names for the files it saves a cut result to. */
const PI_FULL_OUTPUT = /^pi-(mcp|bash)-[0-9a-f]+\.(txt|log)$/;

/** Results mcp-recall handles: MCP tools other than its own, and bash. */
export function isHandled(toolName: string): boolean {
  return toolName === "bash" || (toolName.startsWith("mcp__") && !toolName.startsWith("mcp__recall__"));
}

/**
 * The whole output of a result. pi cuts a large result before extensions see
 * it (MCP to ~20 KB, bash to its last 2,000 lines) and saves the whole output
 * to a file named in `details.fullOutputPath`. Read it back only when it is
 * plainly pi's file: absolute, directly in the OS temp dir, named as pi names
 * them, and not huge. Anything else keeps the text pi delivered.
 */
export function fullOutputText(event: PiToolResult, tmp = tmpdir()): string {
  const delivered = (event.content ?? []).map((c) => c.text ?? "").join("\n");
  const p = event.details?.fullOutputPath;
  if (typeof p !== "string" || !isAbsolute(p)) return delivered;
  if (resolve(dirname(p)) !== resolve(tmp) || !PI_FULL_OUTPUT.test(basename(p))) return delivered;
  try {
    if (statSync(p).size > MAX_FULL_OUTPUT_BYTES) return delivered;
    return readFileSync(p, "utf8");
  } catch {
    return delivered;
  }
}

/**
 * The PostToolUse input Claude Code would send for this result, or null when
 * mcp-recall should leave it alone: another tool, an error (Claude Code runs
 * PostToolUse only on success), or a result carrying an image or other
 * non-text block (the hook passes those through anyway).
 */
export function toHookInput(event: PiToolResult, sessionId: string, cwd: string): Record<string, unknown> | null {
  if (!isHandled(event.toolName) || event.isError) return null;
  if ((event.content ?? []).some((c) => c.type !== "text")) return null;
  const text = fullOutputText(event);
  const bash = event.toolName === "bash";
  return {
    session_id: sessionId,
    cwd,
    hook_event_name: "PostToolUse",
    tool_name: bash ? "Bash" : event.toolName,
    tool_input: event.input ?? {},
    tool_response: bash ? { stdout: text, stderr: "", interrupted: false } : [{ type: "text", text }],
  };
}

/** The content to deliver from the hook's stdout, or null to keep pi's result. */
export function fromHookOutput(stdout: string): TextBlock[] | null {
  let out: unknown;
  try {
    out = JSON.parse(stdout);
  } catch {
    return null;
  }
  const updated = (out as { hookSpecificOutput?: { updatedToolOutput?: unknown } } | null)
    ?.hookSpecificOutput?.updatedToolOutput;
  if (typeof updated === "string") return [{ type: "text", text: updated }];
  const stdoutField = (updated as { stdout?: unknown } | null | undefined)?.stdout;
  if (typeof stdoutField === "string") return [{ type: "text", text: stdoutField }];
  return null;
}

/** Runs one mcp-recall hook with `input` on stdin; resolves to its stdout, "" on any failure. */
export function runHook(cli: string[], hook: string, input: unknown, signal?: AbortSignal): Promise<string> {
  return new Promise((done) => {
    const [program, ...args] = cli;
    if (!program) return done("");
    let stdout = "";
    const child = spawn(program, [...args, hook], { stdio: ["pipe", "pipe", "ignore"], signal });
    const timer = setTimeout(() => child.kill(), HOOK_TIMEOUT_MS);
    child.stdout.on("data", (d) => { stdout += d; });
    child.on("error", () => { clearTimeout(timer); done(""); });
    child.on("close", () => { clearTimeout(timer); done(stdout); });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(input));
  });
}

/** launch.json from the directory this file was installed to. */
export function readLaunch(dir: string): Launch | null {
  try {
    const launch = JSON.parse(readFileSync(join(dir, "launch.json"), "utf8")) as Launch;
    return Array.isArray(launch.cli) && typeof launch.server?.command === "string" ? launch : null;
  } catch {
    return null;
  }
}

interface PiContext {
  cwd: string;
  signal?: AbortSignal;
  sessionManager: { getSessionId(): string };
}

interface PiApi {
  on(event: "session_start", handler: (event: unknown, ctx: PiContext) => unknown): void;
  on(event: "tool_result", handler: (event: PiToolResult, ctx: PiContext) => unknown): void;
  registerMcpServer(name: string, config: Record<string, unknown>): void;
}

export default function mcpRecall(pi: PiApi, launch = readLaunch(import.meta.dirname ?? dirname(new URL(import.meta.url).pathname))): void {
  if (!launch) return; // no launch.json: re-run `mcp-recall install`
  pi.registerMcpServer("recall", { ...launch.server, exposure: "direct" });

  pi.on("session_start", async (_event, ctx) => {
    await runHook(launch.cli, "session-start", {
      session_id: ctx.sessionManager.getSessionId(),
      cwd: ctx.cwd,
      hook_event_name: "SessionStart",
    });
  });

  pi.on("tool_result", async (event, ctx) => {
    const input = toHookInput(event, ctx.sessionManager.getSessionId(), ctx.cwd);
    if (!input) return undefined;
    const content = fromHookOutput(await runHook(launch.cli, "post-tool-use", input, ctx.signal));
    return content ? { content } : undefined;
  });
}
