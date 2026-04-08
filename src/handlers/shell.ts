/**
 * Shell handler — strips ANSI escape codes and SSH banner noise, then caps
 * stdout at 50 lines / stderr at 20 lines. Handles structured
 * `{stdout, stderr, returncode}` JSON as well as plain string output.
 * Routes bash, shell, terminal, run_command, ssh_exec, exec_command,
 * remote_exec, and container_exec tool name patterns.
 */
import type { CompressionResult, Handler } from "./types";
import { extractText } from "./types";
import { jsonHandler } from "./json";

const HEAD_STDOUT = 25;
const HEAD_STDERR = 20;

// Covers colors, cursor movement, erase sequences, and other common escapes.
// eslint-disable-next-line no-control-regex
const ANSI_RE = /[\x1b\x9b][\[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

// Matches SSH warning/notice lines emitted by OpenSSH (e.g. post-quantum
// key-exchange advisories that appear before the actual command output).
const SSH_NOISE_RE = /^\*\* .+/;

/**
 * Removes SSH banner noise lines (lines starting with `** `) and collapses
 * any resulting consecutive blank lines into one. Applied after stripAnsi.
 */
export function stripSshNoise(text: string): string {
  const lines = text.split("\n");
  const filtered = lines.filter((line) => !SSH_NOISE_RE.test(line));

  // Collapse runs of blank lines to a single blank line.
  const result: string[] = [];
  let prevBlank = false;
  for (const line of filtered) {
    const blank = line.trim() === "";
    if (blank && prevBlank) continue;
    result.push(line);
    prevBlank = blank;
  }

  // Trim leading blank lines.
  while (result.length > 0 && result[0]!.trim() === "") result.shift();

  return result.join("\n");
}

function trimTrailingEmpty(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && lines[end - 1]!.trim() === "") end--;
  return lines.slice(0, end);
}

function formatLines(
  text: string,
  max: number
): { header: string; body: string } {
  const lines = trimTrailingEmpty(text.split("\n"));
  const total = lines.length;
  const truncated = total > max;
  const head = lines.slice(0, max).join("\n");
  const overflow = truncated ? `\n… (+${total - max} more lines)` : "";
  return {
    header: `${total} line${total === 1 ? "" : "s"}`,
    body: `${head}${overflow}`,
  };
}

interface ShellOutput {
  stdout?: string;
  stderr?: string;
  output?: string;   // alternate field name used by some servers
  returncode?: number;
  exit_code?: number;
}

function parseStructured(raw: string): ShellOutput | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      ("stdout" in parsed || "stderr" in parsed || "output" in parsed)
    ) {
      return parsed as ShellOutput;
    }
  } catch {
    // not JSON
  }
  return null;
}

export const shellHandler: Handler = (
  _toolName: string,
  output: unknown
): CompressionResult => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");

  const structured = parseStructured(raw);

  if (structured) {
    const stdout = stripSshNoise(stripAnsi(structured.stdout ?? structured.output ?? ""));
    const stderr = stripSshNoise(stripAnsi(structured.stderr ?? ""));
    const exitCode = structured.returncode ?? structured.exit_code;

    // If stdout is JSON, delegate to the JSON handler for deeper compression.
    const trimmedStdout = stdout.trim();
    if (trimmedStdout.startsWith("{") || trimmedStdout.startsWith("[")) {
      try {
        JSON.parse(trimmedStdout);
        const { summary } = jsonHandler(_toolName, trimmedStdout);
        return { summary, originalSize };
      } catch { /* not valid JSON — fall through */ }
    }

    const exitStr = exitCode !== undefined ? `exit:${exitCode} · ` : "";
    const stdoutFmt = formatLines(stdout, HEAD_STDOUT);
    const hasStderr = stderr.trim().length > 0;
    const stderrFmt = hasStderr ? formatLines(stderr, HEAD_STDERR) : null;

    const stderrDesc = stderrFmt ? ` · ${stderrFmt.header} stderr` : "";
    const header = `[bash · ${exitStr}${stdoutFmt.header} stdout${stderrDesc}]`;

    const parts: string[] = [header];
    if (stdout.trim()) parts.push(stdoutFmt.body);
    if (stderrFmt) {
      parts.push("stderr:");
      parts.push(stderrFmt.body);
    }

    return { summary: parts.join("\n"), originalSize };
  }

  // Plain string — treat as stdout
  const text = stripSshNoise(stripAnsi(raw));

  // If the output is JSON, delegate to the JSON handler.
  const trimmedText = text.trim();
  if (trimmedText.startsWith("{") || trimmedText.startsWith("[")) {
    try {
      JSON.parse(trimmedText);
      const { summary } = jsonHandler(_toolName, trimmedText);
      return { summary, originalSize };
    } catch { /* not valid JSON — fall through */ }
  }

  const fmt = formatLines(text, HEAD_STDOUT);
  return {
    summary: `[bash · ${fmt.header}]\n${fmt.body}`,
    originalSize,
  };
};
