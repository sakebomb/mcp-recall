import { lstatSync, readFileSync, realpathSync } from "fs";
import { homedir } from "os";
import { basename, dirname, isAbsolute, join, normalize, relative, sep } from "path";
import { log } from "../log";

/**
 * grok (xAI's coding agent) runs Claude Code's hooks, but hands PostToolUse a
 * result shape of its own (#459). Its shell tool is `run_terminal_command`; an
 * MCP tool is `<server>__<tool>`, without the `mcp__` prefix. Like pi, it cuts a
 * large result to about 20 KB before the hook sees it and saves the whole one
 * under its sessions directory.
 *
 * {@link fromGrok} turns such an input into the Claude Code shape the hook
 * already handles, so the denylist, the secret scan and every handler see the
 * same names and text they would under Claude Code. Its result is:
 * - `undefined` for an input that is not grok's: handle it as it is;
 * - `null` for grok's when `denied` refuses the converted name, which is checked
 *   before any saved file is read, or when the whole output cannot be had:
 *   deliver it unchanged, since storing the cut would misstate it, and the cut
 *   keeps grok's pointer to the full file;
 * - otherwise the converted input. grok takes a plain string as the replacement
 *   for any tool, so the reply must not mimic the Bash object.
 */

/** Upper bound on a saved output read back from disk; a larger one stays cut. */
const MAX_SAVED_BYTES = 20 * 1024 * 1024;

interface GrokMcpResult {
  type: "MCP";
  server_name: string;
  tool_name: string;
  output: { OkayOutput: string };
}

interface GrokShellResult {
  type: "Bash";
  output: unknown;
  truncated?: unknown;
  output_file?: unknown;
  total_bytes?: unknown;
  exit_code?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isGrokMcp(value: unknown): value is GrokMcpResult {
  if (!isRecord(value) || value["type"] !== "MCP") return false;
  const output = value["output"];
  return typeof value["server_name"] === "string" && typeof value["tool_name"] === "string" && isRecord(output);
}

function isGrokShell(value: unknown): value is GrokShellResult {
  return isRecord(value) && value["type"] === "Bash" && "output" in value && "output_for_prompt" in value;
}

/** grok's data directory: `$GROK_HOME`, else `~/.grok`. */
export function grokHome(): string {
  return process.env["GROK_HOME"] || join(homedir(), ".grok");
}

/** The call a result belongs to: grok names its saved file and folder after them. */
interface GrokCall {
  sessionId: string;
  toolUseId: string;
}

function callOf(input: Record<string, unknown>): GrokCall | null {
  const sessionId = input["session_id"] ?? input["sessionId"];
  const toolUseId = input["tool_use_id"] ?? input["toolUseId"];
  const safe = (v: unknown): v is string => typeof v === "string" && /^[\w-]+$/.test(v);
  return safe(sessionId) && safe(toolUseId) ? { sessionId, toolUseId } : null;
}

/**
 * Reads the file grok saved for this call, when it is plainly that file:
 * `<sessions>/<cwd>/<session id>/<kind>/<tool use id>.<ext>` under grok's
 * data directory, reached without a symlink, a regular file, and at most
 * {@link MAX_SAVED_BYTES}. Null otherwise. Requiring this call's ids means a
 * tool cannot name another call's file in its own output: an MCP server never
 * learns grok's tool use id.
 */
function readSaved(path: string, call: GrokCall, kind: "mcp" | "terminal", ext: "json" | "log"): Buffer | null {
  if (!isAbsolute(path) || normalize(path) !== path) return null;
  const sessions = join(grokHome(), "sessions") + sep;
  if (!path.startsWith(sessions) || basename(path) !== `${call.toolUseId}.${ext}`) return null;
  const folder = dirname(path);
  if (basename(folder) !== kind || basename(dirname(folder)) !== call.sessionId) return null;
  try {
    // No symlink below the sessions root; the root itself may sit behind one.
    const root = realpathSync(sessions);
    if (realpathSync(folder) !== join(root, relative(sessions, folder))) return null;
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > MAX_SAVED_BYTES) return null;
    return readFileSync(path);
  } catch (err) {
    log.debug(`grok saved output unreadable · ${path} · ${String(err)}`);
    return null;
  }
}

/** The marker grok appends to an MCP result it cut; group 1 is the saved file. */
const MCP_CUT_RE = /\n*\[MCP output truncated: [^\]\n]*?Full output written to: (\/[^\n]+?\.json)\.[^\n]*\]\s*$/;

/**
 * The whole text of an MCP result. A cut one is read back from the file its
 * marker names, which must begin with the text grok kept. Null when it cannot be.
 */
function mcpText(text: string, call: GrokCall | null): string | null {
  const match = text.match(MCP_CUT_RE);
  if (!match) return text;
  if (!call) return null;
  const saved = readSaved(match[1]!, call, "mcp", "json");
  if (!saved) return null;
  const kept = Buffer.from(text.slice(0, match.index), "utf8");
  // grok cuts at a byte count, so the last kept character may be a split one.
  const head = kept.subarray(0, Math.max(0, kept.length - 3));
  return saved.subarray(0, head.length).equals(head) ? saved.toString("utf8") : null;
}

/** grok sends shell output as an array of bytes; a string is taken as it is. */
function shellBytes(output: unknown): Buffer | null {
  if (typeof output === "string") return Buffer.from(output, "utf8");
  if (Array.isArray(output) && output.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) {
    return Buffer.from(output as number[]);
  }
  return null;
}

/**
 * The whole output of a shell call. A cut one is read back from output_file,
 * which must be exactly total_bytes long. Null when it cannot be.
 */
function shellText(result: GrokShellResult, call: GrokCall | null): string | null {
  if (result.truncated !== true) return shellBytes(result.output)?.toString("utf8") ?? null;
  const { output_file: path, total_bytes: total } = result;
  if (typeof path !== "string" || typeof total !== "number" || !call) return null;
  const saved = readSaved(path, call, "terminal", "log");
  return saved && saved.length === total ? saved.toString("utf8") : null;
}

/** Converts grok's PostToolUse input; see the module comment for the result. */
export function fromGrok(
  input: Record<string, unknown>,
  denied: (toolName: string) => boolean,
): Record<string, unknown> | null | undefined {
  const response = input["tool_response"];
  if (isGrokMcp(response)) {
    const name = `mcp__${response.server_name}__${response.tool_name}`;
    if (denied(name)) return null;
    const ok = response.output["OkayOutput"];
    // An error result, or a shape this version does not know, is delivered as it is.
    if (typeof ok !== "string") return null;
    const text = mcpText(ok, callOf(input));
    if (text === null) {
      log.debug(`SKIP grok-cut-unverified · ${name}`);
      return null;
    }
    return { ...input, tool_name: name, tool_response: [{ type: "text", text }] };
  }
  if (isGrokShell(response)) {
    if (denied("Bash")) return null;
    const stdout = shellText(response, callOf(input));
    if (stdout === null) {
      log.debug("SKIP grok-cut-unverified · Bash");
      return null;
    }
    const exit = typeof response.exit_code === "number" ? response.exit_code : null;
    return {
      ...input,
      tool_name: "Bash",
      tool_response: { stdout, stderr: "", interrupted: false, ...(exit === null ? {} : { exit_code: exit }) },
    };
  }
  return undefined;
}
