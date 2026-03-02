/**
 * Bash handler — routes native Bash tool outputs to CLI-aware compressors.
 * Inspects `tool_input.command` to detect git diff/log, terraform plan, etc.
 * Falls back to the shell handler for unrecognised commands.
 */
import type { CompressionResult, Handler } from "./types";
import { extractText } from "./types";
import { shellHandler, stripAnsi, stripSshNoise } from "./shell";

const MAX_LOG_COMMITS = 20;
const MAX_TERRAFORM_RESOURCES = 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the plain stdout string from a native Bash tool response
 * `{exit_code, stdout, stderr}` or falls back to extractText for other shapes.
 */
function extractStdout(output: unknown): string {
  if (output !== null && typeof output === "object") {
    const obj = output as Record<string, unknown>;
    if (typeof obj.stdout === "string") return stripSshNoise(stripAnsi(obj.stdout));
    if (typeof obj.output === "string") return stripSshNoise(stripAnsi(obj.output));
  }
  return stripSshNoise(stripAnsi(extractText(output)));
}

function extractCommand(input: unknown): string | null {
  if (input !== null && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    if (typeof obj.command === "string") return obj.command.trim();
  }
  return null;
}

// ---------------------------------------------------------------------------
// git diff / git show
// ---------------------------------------------------------------------------

interface FileDiff {
  path: string;
  additions: number;
  deletions: number;
  hunks: number;
}

function parseGitDiff(text: string): FileDiff[] {
  const files: FileDiff[] = [];
  let current: FileDiff | null = null;

  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) {
      if (current) files.push(current);
      const match = line.match(/diff --git a\/.+ b\/(.+)/);
      const path = match ? match[1]! : line.slice(11);
      current = { path, additions: 0, deletions: 0, hunks: 0 };
    } else if (current) {
      if (line.startsWith("@@ ")) {
        current.hunks++;
      } else if (line.startsWith("+") && !line.startsWith("+++")) {
        current.additions++;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        current.deletions++;
      }
    }
  }
  if (current) files.push(current);
  return files;
}

export const gitDiffHandler: Handler = (
  toolName: string,
  output: unknown
): CompressionResult => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(extractText(output), "utf8");

  if (!stdout.trim()) {
    return { summary: "[git diff — no changes]", originalSize };
  }

  const files = parseGitDiff(stdout);

  if (files.length === 0) {
    // Binary diff, submodule change, or unusual output — fall back to shell
    return shellHandler(toolName, output);
  }

  const totalAdded = files.reduce((s, f) => s + f.additions, 0);
  const totalDeleted = files.reduce((s, f) => s + f.deletions, 0);
  const header = `git diff — ${files.length} file${files.length === 1 ? "" : "s"} changed, +${totalAdded} -${totalDeleted}`;

  const fileLines = files.map((f) => {
    const stats = `+${f.additions} -${f.deletions}`;
    const hunks = `(${f.hunks} hunk${f.hunks === 1 ? "" : "s"})`;
    return `  ${f.path.padEnd(48)}  ${stats.padEnd(10)}  ${hunks}`;
  });

  return { summary: [header, ...fileLines].join("\n"), originalSize };
};

// ---------------------------------------------------------------------------
// git log
// ---------------------------------------------------------------------------

export const gitLogHandler: Handler = (
  _toolName: string,
  output: unknown
): CompressionResult => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(extractText(output), "utf8");

  const lines = stdout.trim().split("\n").filter((l) => l.trim());
  if (lines.length === 0) {
    return { summary: "[git log — no commits]", originalSize };
  }

  // Detect --oneline / --format="%h %s" style: every line starts with a short hash
  const isOneline = lines.every((l) => /^[0-9a-f]{6,40}\s/.test(l.trim()));

  if (isOneline) {
    const total = lines.length;
    const shown = lines.slice(0, MAX_LOG_COMMITS);
    const overflow =
      total > MAX_LOG_COMMITS ? `\n… (+${total - MAX_LOG_COMMITS} more commits)` : "";
    const summary =
      `git log — ${total} commit${total === 1 ? "" : "s"}\n` +
      shown.map((l) => `  ${l}`).join("\n") +
      overflow;
    return { summary, originalSize };
  }

  // Full format: extract short hash + subject line from each "commit <hash>" block
  const commits: string[] = [];
  let hash = "";
  let seenBlank = false;

  for (const line of stdout.split("\n")) {
    if (line.startsWith("commit ")) {
      hash = line.slice(7, 14);
      seenBlank = false;
    } else if (hash && line.trim() === "" && !seenBlank) {
      seenBlank = true;
    } else if (hash && seenBlank && line.startsWith("    ") && line.trim()) {
      const subject = line.trim().slice(0, 72);
      commits.push(`  ${hash}  ${subject}`);
      hash = "";
      seenBlank = false;
    }
  }

  const total = commits.length;
  const shown = commits.slice(0, MAX_LOG_COMMITS);
  const overflow =
    total > MAX_LOG_COMMITS ? `\n… (+${total - MAX_LOG_COMMITS} more commits)` : "";
  const header = `git log — ${total} commit${total === 1 ? "" : "s"}`;
  return {
    summary: [header, ...shown].join("\n") + overflow,
    originalSize,
  };
};

// ---------------------------------------------------------------------------
// terraform plan
// ---------------------------------------------------------------------------

const TERRAFORM_RESOURCE_RE =
  /^\s+#\s+(.+?)\s+will\s+be\s+(created|destroyed|updated in-place|replaced)/;
const TERRAFORM_PLAN_SUMMARY_RE = /^Plan:\s+.+$/m;
const TERRAFORM_SYMBOL: Record<string, string> = {
  created: "+",
  destroyed: "-",
  "updated in-place": "~",
  replaced: "-/+",
};

export const terraformPlanHandler: Handler = (
  toolName: string,
  output: unknown
): CompressionResult => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(extractText(output), "utf8");

  const summaryMatch = stdout.match(TERRAFORM_PLAN_SUMMARY_RE);
  const summaryLine = summaryMatch ? summaryMatch[0] : null;

  const resources: string[] = [];
  for (const line of stdout.split("\n")) {
    const match = line.match(TERRAFORM_RESOURCE_RE);
    if (match) {
      const [, resource, action] = match as [string, string, string];
      const symbol = TERRAFORM_SYMBOL[action] ?? "?";
      resources.push(`  ${symbol} ${resource}`);
    }
  }

  if (!summaryLine && resources.length === 0) {
    // Not a recognisable plan output — fall back to shell
    return shellHandler(toolName, output);
  }

  const lines = ["terraform plan"];
  if (summaryLine) lines.push(`  ${summaryLine}`);
  lines.push(...resources.slice(0, MAX_TERRAFORM_RESOURCES));
  if (resources.length > MAX_TERRAFORM_RESOURCES) {
    lines.push(`  … (+${resources.length - MAX_TERRAFORM_RESOURCES} more resources)`);
  }

  return { summary: lines.join("\n"), originalSize };
};

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Returns the appropriate handler for a native Bash tool call based on the
 * command string in `tool_input`. Falls back to the shell handler when no
 * CLI-specific handler matches.
 */
export function getBashHandler(input: unknown): Handler {
  const command = extractCommand(input);
  if (!command) return shellHandler;

  if (/^git\s+(diff|show)(\s|$)/.test(command)) return gitDiffHandler;
  if (/^git\s+log(\s|$)/.test(command)) return gitLogHandler;
  if (/^terraform\s+plan(\s|$)/.test(command)) return terraformPlanHandler;

  return shellHandler;
}
