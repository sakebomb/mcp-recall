/**
 * mcp-recall for OpenCode (https://opencode.ai) — installed by `mcp-recall install` (#474).
 *
 * OpenCode loads this file from ~/.config/opencode/plugins/mcp-recall.ts. It is
 * the OpenCode side of what Claude Code's hooks do: each MCP or bash result goes
 * through mcp-recall's own `post-tool-use` hook, unchanged, and the summary it
 * returns replaces the result before the model sees it. The plugin adds no logic
 * of its own; it translates OpenCode's shapes into the hook's input and back.
 *
 * Self-contained by design: it imports only node builtins, because it runs
 * inside OpenCode, and mcp-recall may be a standalone binary with no JS to
 * import. `mcp-recall.launch.json` beside it says how to run mcp-recall;
 * `mcp-recall install` writes both files. OpenCode treats every function this
 * module exports as a plugin, so the helpers ride on `McpRecall.internals`.
 */
import { spawn } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface Launch {
  /** argv that runs the mcp-recall CLI, e.g. ["bun", "/…/dist/cli.js"] or ["/…/mcp-recall"]. */
  cli: string[];
  /** The MCP server's command and arguments. */
  server: { command: string; args: string[] };
}

interface TextBlock { type: "text"; text: string }

/** What `tool.execute.after` gets for an MCP tool: the server's raw CallToolResult. */
export interface McpResult { content?: Array<{ type: string; text?: string } | null>; [key: string]: unknown }

/** What `tool.execute.after` gets for bash. */
export interface BashResult {
  title?: string;
  output?: unknown;
  metadata?: { exit?: unknown; truncated?: unknown; outputPath?: unknown; [key: string]: unknown } | null;
}

/** The first argument of `tool.execute.after`. */
export interface ToolCall { tool: string; sessionID: string; callID?: string; args?: unknown }

/** Claude Code's hook timeout for mcp-recall's own hooks, in ms. */
const HOOK_TIMEOUT_MS = 10_000;
/** The hook reads back at most this much of a saved full output, as it does for Claude Code. */
const MAX_FULL_OUTPUT_BYTES = 20 * 1024 * 1024;
/** OpenCode's own names for the files it saves a cut bash result to. */
const OPENCODE_FULL_OUTPUT = /^tool_[0-9A-Za-z]+$/;
const LAUNCH_FILE = "mcp-recall.launch.json";

/** Where OpenCode saves cut output: its data dir, as OpenCode resolves it. */
function toolOutputDir(): string {
  return join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "opencode", "tool-output");
}

/**
 * Claude Code's name for an OpenCode MCP tool. OpenCode names one `<server>_<tool>`,
 * keeping the server name as configured, so the longest configured server that
 * prefixes the name is its server. Null for anything else (a built-in tool).
 */
function mcpToolName(tool: string, servers: string[]): string | null {
  const server = servers
    .filter((s) => tool.startsWith(`${s}_`) && tool.length > s.length + 1)
    .sort((a, b) => b.length - a.length)[0];
  return server === undefined ? null : `mcp__${server}__${tool.slice(server.length + 1)}`;
}

/**
 * The whole output of a bash result. OpenCode cuts a large one before plugins see
 * it and saves the whole output to the file named in `metadata.outputPath`. Read
 * it back only when it is plainly OpenCode's file: absolute, directly in its
 * tool-output dir, named as OpenCode names them, a regular file rather than a
 * link, and not huge. Anything else keeps the text OpenCode delivered.
 */
function bashText(out: BashResult): string {
  const delivered = typeof out.output === "string" ? out.output : "";
  const p = out.metadata?.outputPath;
  if (out.metadata?.truncated !== true || typeof p !== "string" || !isAbsolute(p)) return delivered;
  if (resolve(dirname(p)) !== resolve(toolOutputDir()) || !OPENCODE_FULL_OUTPUT.test(basename(p))) return delivered;
  try {
    const st = lstatSync(p);
    if (!st.isFile() || st.size > MAX_FULL_OUTPUT_BYTES) return delivered;
    return readFileSync(p, "utf8");
  } catch {
    return delivered;
  }
}

/**
 * The PostToolUse input Claude Code would send for this result, or null when
 * mcp-recall should leave it alone: a built-in tool other than bash, recall's own
 * tools, or an MCP result carrying an image or other non-text block (the hook
 * passes those through anyway). OpenCode throws on an MCP error, so none arrive.
 */
function toHookInput(call: ToolCall, output: unknown, servers: string[], cwd: string): Record<string, unknown> | null {
  const base = { session_id: call.sessionID, cwd, hook_event_name: "PostToolUse", tool_input: call.args ?? {} };
  if (call.tool === "bash") {
    const out = output as BashResult;
    if (typeof out?.output !== "string") return null;
    const exit = out.metadata?.exit;
    const response = { stdout: bashText(out), stderr: "", interrupted: false };
    return { ...base, tool_name: "Bash", tool_response: typeof exit === "number" ? { ...response, exit_code: exit } : response };
  }
  const name = mcpToolName(call.tool, servers);
  if (name === null || name.startsWith("mcp__recall__")) return null;
  const content = (output as McpResult)?.content;
  if (!Array.isArray(content) || content.length === 0 || content.some((c) => c?.type !== "text")) return null;
  return { ...base, tool_name: name, tool_response: content.map((c) => ({ type: "text", text: c?.text ?? "" })) };
}

/** Puts the summary where OpenCode reads each kind of result. */
function applySummary(call: ToolCall, output: unknown, text: string): void {
  if (call.tool === "bash") {
    (output as BashResult).output = text;
    return;
  }
  const mcp = output as McpResult;
  mcp.content = [{ type: "text", text }];
  delete mcp["structuredContent"]; // the model would otherwise still see the full data
}

/** The content to deliver from the hook's stdout, or null to keep OpenCode's result. */
function fromHookOutput(stdout: string): TextBlock[] | null {
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

/**
 * Runs one mcp-recall hook with `input` on stdin; resolves to its stdout, ""
 * on any failure. Never rejects, and never waits past `timeoutMs`: a hook
 * that hangs is killed and OpenCode keeps its own result.
 */
function runHook(
  cli: string[], hook: string, input: unknown, signal?: AbortSignal, timeoutMs = HOOK_TIMEOUT_MS,
): Promise<string> {
  return new Promise((done) => {
    const [program, ...args] = cli;
    if (!program) return done("");
    let settled = false;
    const finish = (out: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done(out);
    };
    let stdout = "";
    const child = spawn(program, [...args, hook], { stdio: ["pipe", "pipe", "ignore"], signal });
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish(""); }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d: string) => { stdout += d; });
    child.on("error", () => finish(""));
    child.on("close", () => finish(stdout));
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(input));
  });
}

function asLaunch(value: unknown): Launch | null {
  const launch = value as Launch | null | undefined;
  return Array.isArray(launch?.cli) && typeof launch?.server?.command === "string" && Array.isArray(launch.server.args)
    ? launch
    : null;
}

/** The launch file beside this plugin, or null when it is missing or malformed. */
function readLaunch(file: string): Launch | null {
  try {
    return asLaunch(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

interface OpenCodeEvent { type?: string; properties?: { sessionID?: unknown; info?: { id?: unknown } } }
interface OpenCodeConfig { mcp?: Record<string, unknown> }

/** The plugin. `options.launch` stands in for the launch file in tests. */
async function plugin(ctx: { directory?: string } | null, options?: { launch?: unknown } | null) {
  const launch = asLaunch(options?.launch) ?? readLaunch(join(dirname(fileURLToPath(import.meta.url)), LAUNCH_FILE));
  if (!launch) return {}; // no launch file: re-run `mcp-recall install`
  const cwd = ctx?.directory ?? process.cwd();
  let servers: string[] = [];

  // None of these may throw into OpenCode: whatever goes wrong, OpenCode keeps its own result.
  return {
    config: async (cfg: OpenCodeConfig) => {
      try {
        const mcp = (cfg.mcp ??= {});
        mcp["recall"] ??= { type: "local", command: [launch.server.command, ...launch.server.args], enabled: true };
        servers = Object.keys(mcp);
      } catch { /* OpenCode keeps its config as it was */ }
    },
    event: async ({ event }: { event: OpenCodeEvent | null }) => {
      try {
        if (event?.type !== "session.created") return;
        const id = event.properties?.sessionID ?? event.properties?.info?.id;
        if (typeof id !== "string") return;
        await runHook(launch.cli, "session-start", { session_id: id, cwd, hook_event_name: "SessionStart" });
      } catch { /* recording the session day is best-effort */ }
    },
    "tool.execute.after": async (call: ToolCall, output: unknown) => {
      try {
        const input = toHookInput(call, output, servers, cwd);
        if (!input) return;
        const content = fromHookOutput(await runHook(launch.cli, "post-tool-use", input));
        if (content?.[0]) applySummary(call, output, content[0].text);
      } catch { /* OpenCode keeps its own result */ }
    },
  };
}

export const McpRecall = Object.assign(plugin, {
  internals: { mcpToolName, bashText, toHookInput, applySummary, toolOutputDir, readLaunch, runHook, fromHookOutput },
});
