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
const MAX_DOCKER_CONTAINERS = 20;
const MAX_BUILD_ERRORS = 20;

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
  const text = extractText(output);
  // Bash tool responses arrive as a JSON string: {exit_code, stdout, stderr}.
  // Extract just the stdout so handlers work on the actual command output.
  try {
    const parsed = JSON.parse(text);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      const p = parsed as Record<string, unknown>;
      if (typeof p.stdout === "string") return stripSshNoise(stripAnsi(p.stdout));
      if (typeof p.output === "string") return stripSshNoise(stripAnsi(p.output));
    }
  } catch { /* not a structured JSON response */ }
  return stripSshNoise(stripAnsi(text));
}

function extractStderr(output: unknown): string {
  if (output !== null && typeof output === "object") {
    const obj = output as Record<string, unknown>;
    if (typeof obj.stderr === "string") return stripAnsi(obj.stderr);
  }
  return "";
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

  // Full format: extract short hash + subject line from each "commit <hash>" block.
  // Skip known git header lines (Author:, Date:, Merge:, gpgsig continuation lines
  // starting with a space) so GPG-signed commits parse correctly.
  const commits: string[] = [];
  let hash = "";
  let seenBlank = false;

  for (const line of stdout.split("\n")) {
    if (line.startsWith("commit ")) {
      hash = line.slice(7, 14);
      seenBlank = false;
    } else if (hash && !seenBlank && (
      line.startsWith("Author:") ||
      line.startsWith("Date:") ||
      line.startsWith("Merge:") ||
      line.startsWith("gpgsig ") ||
      (line.startsWith(" ") && line.trim() !== "")  // gpgsig continuation lines
    )) {
      // skip git metadata headers before the blank separator
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
// git status
// ---------------------------------------------------------------------------

export const gitStatusHandler: Handler = (
  toolName: string,
  output: unknown
): CompressionResult => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(extractText(output), "utf8");

  if (!stdout.trim()) {
    return { summary: "[git status — clean working tree]", originalSize };
  }

  const staged: string[] = [];
  const unstaged: string[] = [];
  const untracked: string[] = [];
  const conflicts: string[] = [];

  let section: "staged" | "unstaged" | "untracked" | null = null;

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("Changes to be committed")) { section = "staged"; continue; }
    if (trimmed.startsWith("Changes not staged")) { section = "unstaged"; continue; }
    if (trimmed.startsWith("Untracked files")) { section = "untracked"; continue; }
    if (trimmed.startsWith("both modified") || trimmed.startsWith("both added")) {
      conflicts.push(trimmed);
      continue;
    }
    if (!trimmed || trimmed.startsWith("(") || trimmed.startsWith("no changes")) continue;

    // Skip header lines and hints
    if (trimmed.startsWith("On branch") || trimmed.startsWith("HEAD") ||
        trimmed.startsWith("Your branch") || trimmed.startsWith("nothing")) continue;

    // Porcelain-style (git status --short or similar)
    const porcelain = line.match(/^([MADRCU?!]{1,2})\s+(.+)$/);
    if (porcelain) {
      const [, code, file] = porcelain as [string, string, string];
      if (code.startsWith("?")) untracked.push(file);
      else if (code[0] !== " " && code[0] !== "?") staged.push(`${code[0]} ${file}`);
      if (code[1] && code[1] !== " " && code[1] !== "?") unstaged.push(`${code[1]} ${file}`);
      continue;
    }

    if (section === "staged" && trimmed.match(/^(modified|new file|deleted|renamed):/)) {
      staged.push(trimmed);
    } else if (section === "unstaged" && trimmed.match(/^(modified|deleted):/)) {
      unstaged.push(trimmed);
    } else if (section === "untracked" && trimmed && !trimmed.startsWith("(")) {
      untracked.push(trimmed);
    }
  }

  if (staged.length === 0 && unstaged.length === 0 && untracked.length === 0 && conflicts.length === 0) {
    // Couldn't parse — fall back to shell
    return shellHandler(toolName, output);
  }

  const lines = ["git status"];
  if (conflicts.length > 0) lines.push(`  conflicts (${conflicts.length}): ${conflicts.slice(0, 5).join(", ")}`);
  if (staged.length > 0) lines.push(`  staged (${staged.length}): ${staged.slice(0, 5).map(f => f.replace(/^(modified|new file|deleted|renamed):\s*/, "")).join(", ")}${staged.length > 5 ? ` +${staged.length - 5} more` : ""}`);
  if (unstaged.length > 0) lines.push(`  unstaged (${unstaged.length}): ${unstaged.slice(0, 5).map(f => f.replace(/^(modified|deleted):\s*/, "")).join(", ")}${unstaged.length > 5 ? ` +${unstaged.length - 5} more` : ""}`);
  if (untracked.length > 0) lines.push(`  untracked (${untracked.length}): ${untracked.slice(0, 5).join(", ")}${untracked.length > 5 ? ` +${untracked.length - 5} more` : ""}`);

  return { summary: lines.join("\n"), originalSize };
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
// Package installers: npm install, bun install, pip install, yarn
// ---------------------------------------------------------------------------

export const packageInstallHandler: Handler = (
  toolName: string,
  output: unknown
): CompressionResult => {
  const stdout = extractStdout(output);
  const stderr = extractStderr(output);
  const combined = `${stdout}\n${stderr}`.trim();
  const originalSize = Buffer.byteLength(extractText(output), "utf8");

  const warnings: string[] = [];
  const errors: string[] = [];

  // Collect warnings and errors
  for (const line of combined.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (/^(npm warn|warn |warning )/i.test(t)) warnings.push(t.slice(0, 100));
    else if (/^(npm error|error |err )/i.test(t)) errors.push(t.slice(0, 100));
  }

  // Try to extract package counts from common output patterns
  let countLine: string | null = null;

  // bun: "120 packages installed [1.23s]"
  const bunMatch = combined.match(/(\d+)\s+packages?\s+installed/i);
  if (bunMatch) countLine = `${bunMatch[1]} packages installed`;

  // npm: "added 42 packages"  /  "added 5, removed 2"
  if (!countLine) {
    const npmMatch = combined.match(/added\s+(\d+)[^,\n]*/i);
    if (npmMatch) countLine = npmMatch[0].trim().slice(0, 60);
  }

  // pip: "Successfully installed foo-1.0 bar-2.0"
  if (!countLine) {
    const pipMatch = combined.match(/Successfully installed (.+)/);
    if (pipMatch) {
      const pkgs = pipMatch[1]!.trim().split(/\s+/);
      countLine = `pip: ${pkgs.length} package${pkgs.length === 1 ? "" : "s"} installed`;
    }
  }

  // yarn: "✨ Done in 3.14s."  — not much info, try "success Saved X new dependencies"
  if (!countLine) {
    const yarnMatch = combined.match(/success Saved (\d+) new dependenc/i);
    if (yarnMatch) countLine = `yarn: ${yarnMatch[1]} new dependencies saved`;
  }

  if (!countLine && errors.length === 0) {
    // Can't parse — fall back
    return shellHandler(toolName, output);
  }

  const lines: string[] = [countLine ?? "package install"];
  if (warnings.length > 0) lines.push(`  ${warnings.length} warning${warnings.length === 1 ? "" : "s"}${warnings.length <= 3 ? ": " + warnings.join("; ") : ""}`);
  if (errors.length > 0) lines.push(...errors.slice(0, 5).map(e => `  error: ${e}`));

  return { summary: lines.join("\n"), originalSize };
};

// ---------------------------------------------------------------------------
// Test runners: pytest, jest, bun test, vitest, go test
// Detected by output pattern rather than command name.
// ---------------------------------------------------------------------------

export const testRunnerHandler: Handler = (
  toolName: string,
  output: unknown
): CompressionResult => {
  const stdout = extractStdout(output);
  const stderr = extractStderr(output);
  const combined = `${stdout}\n${stderr}`.trim();
  const originalSize = Buffer.byteLength(extractText(output), "utf8");

  // Collect failure blocks — lines that look like test failures/errors
  const failureLines: string[] = [];
  for (const line of combined.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    // pytest: FAILED src/test.py::test_name
    // jest/vitest: ✕ / ✗ / × test name  or  ● test name
    // bun: (fail) suite > test name
    if (/^(FAILED|FAIL)\s+/.test(t) ||
        /^[✕✗×●]\s/.test(t) ||
        /^\(fail\)\s/.test(t) ||
        /^--- FAIL:/.test(t)) {
      failureLines.push(t.slice(0, 120));
    }
  }

  // Try to find a summary line
  let passed = 0, failed = 0, skipped = 0;
  let foundSummary = false;

  for (const line of combined.split("\n")) {
    const t = line.trim();

    // bun: "X pass\nY fail"
    const bunPass = t.match(/^(\d+)\s+pass$/);
    const bunFail = t.match(/^(\d+)\s+fail$/);
    if (bunPass) { passed = parseInt(bunPass[1]!); foundSummary = true; }
    if (bunFail) { failed = parseInt(bunFail[1]!); foundSummary = true; }

    // pytest: "5 passed, 2 failed, 1 warning in 1.23s"
    const pytestMatch = t.match(/(\d+)\s+passed(?:,\s+(\d+)\s+failed)?(?:,\s+(\d+)\s+(?:skipped|warning))?/);
    if (pytestMatch) {
      passed = parseInt(pytestMatch[1]!);
      if (pytestMatch[2]) failed = parseInt(pytestMatch[2]);
      if (pytestMatch[3]) skipped = parseInt(pytestMatch[3]);
      foundSummary = true;
    }

    // jest/vitest: "Tests: 5 passed, 2 failed, 7 total"
    const jestMatch = t.match(/Tests:\s+(?:(\d+)\s+failed,\s+)?(\d+)\s+passed(?:,\s+(\d+)\s+skipped)?/);
    if (jestMatch) {
      if (jestMatch[1]) failed = parseInt(jestMatch[1]);
      passed = parseInt(jestMatch[2]!);
      if (jestMatch[3]) skipped = parseInt(jestMatch[3]);
      foundSummary = true;
    }

    // go test: "ok  \tpackage\t0.123s" / "FAIL\tpackage\t0.123s"
    const goOk = t.match(/^ok\s+\S+/);
    const goFail = t.match(/^FAIL\s+\S+/);
    if (goOk) { passed++; foundSummary = true; }
    if (goFail) { failed++; foundSummary = true; }
  }

  if (!foundSummary && failureLines.length === 0) {
    return shellHandler(toolName, output);
  }

  const total = passed + failed + skipped;
  const status = failed > 0 ? "FAIL" : "pass";
  const parts: string[] = [];
  if (passed > 0) parts.push(`${passed} passed`);
  if (failed > 0) parts.push(`${failed} failed`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  const summaryStr = parts.length > 0 ? parts.join(", ") : "no results";

  const lines = [`test runner — ${status}: ${summaryStr}${total > 0 ? ` (${total} total)` : ""}`];
  if (failureLines.length > 0) {
    lines.push(`  failures:`);
    lines.push(...failureLines.slice(0, MAX_BUILD_ERRORS).map(l => `    ${l}`));
    if (failureLines.length > MAX_BUILD_ERRORS) {
      lines.push(`    … (+${failureLines.length - MAX_BUILD_ERRORS} more)`);
    }
  }

  return { summary: lines.join("\n"), originalSize };
};

// ---------------------------------------------------------------------------
// docker ps / docker compose ps
// ---------------------------------------------------------------------------

export const dockerPsHandler: Handler = (
  toolName: string,
  output: unknown
): CompressionResult => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(extractText(output), "utf8");

  const lines = stdout.trim().split("\n").filter(l => l.trim());
  if (lines.length === 0) {
    return { summary: "[docker ps — no containers]", originalSize };
  }

  // First line is the header row
  const dataLines = lines[0]?.toUpperCase().includes("CONTAINER") ? lines.slice(1) : lines;

  if (dataLines.length === 0) {
    return { summary: "[docker ps — no containers running]", originalSize };
  }

  interface Container { name: string; status: string; ports: string; }
  const containers: Container[] = [];

  for (const line of dataLines) {
    // docker ps columns: CONTAINER ID | IMAGE | COMMAND | CREATED | STATUS | PORTS | NAMES
    const parts = line.trim().split(/\s{2,}/);
    if (parts.length < 2) continue;

    // NAMES is last column, STATUS is typically 4th (index 3 or 4)
    const name = parts[parts.length - 1] ?? "";
    // Find STATUS column — contains "Up", "Exited", "Restarting", etc.
    const statusPart = parts.find(p => /^(Up|Exited|Restarting|Created|Paused|Dead)/i.test(p)) ?? "";
    // PORTS column — contains "0.0.0.0:" or "->"
    const portsPart = parts.find(p => p.includes("->") || p.includes("0.0.0.0:")) ?? "";

    if (!name) continue;
    const statusShort = statusPart.slice(0, 20);
    const portsShort = portsPart.slice(0, 40);
    containers.push({ name, status: statusShort, ports: portsShort });
  }

  if (containers.length === 0) {
    return shellHandler(toolName, output);
  }

  const shown = containers.slice(0, MAX_DOCKER_CONTAINERS);
  const overflow = containers.length > MAX_DOCKER_CONTAINERS
    ? `\n  … (+${containers.length - MAX_DOCKER_CONTAINERS} more)`
    : "";

  const rows = shown.map(c => {
    const name = c.name.padEnd(30);
    const status = c.status.padEnd(22);
    return `  ${name}  ${status}  ${c.ports}`;
  });

  const header = `docker ps — ${containers.length} container${containers.length === 1 ? "" : "s"}`;
  return {
    summary: [header, ...rows].join("\n") + overflow,
    originalSize,
  };
};

// ---------------------------------------------------------------------------
// make / just build output
// ---------------------------------------------------------------------------

export const buildToolHandler: Handler = (
  toolName: string,
  output: unknown
): CompressionResult => {
  const stdout = extractStdout(output);
  const stderr = extractStderr(output);
  const combined = `${stdout}\n${stderr}`.trim();
  const originalSize = Buffer.byteLength(extractText(output), "utf8");

  const errorLines: string[] = [];
  const targetLines: string[] = [];

  for (const line of combined.split("\n")) {
    const t = line.trim();
    if (!t) continue;

    // make targets: "make[1]: Entering directory" / "make: *** [target] Error 1"
    if (/^make(\[\d+\])?:\s/.test(t)) {
      if (t.includes("Error") || t.includes("***")) errorLines.push(t.slice(0, 120));
      else if (t.includes("Leaving directory") || t.includes("Entering directory")) continue;
      else targetLines.push(t.slice(0, 80));
      continue;
    }

    // just: "error: recipe `target` failed"  or  "===> Running recipe `target`"
    if (/^(error:|justfile|warning:)\s/i.test(t)) {
      errorLines.push(t.slice(0, 120));
      continue;
    }

    // Compiler/linker errors: "src/foo.c:42: error:" or "error[E0001]:"
    if (/^[^\s]+:\d+:\d*:?\s*(error|fatal error):/i.test(t) ||
        /^error\[/.test(t) ||
        /^\s*\^\s*$/.test(t)) {
      errorLines.push(t.slice(0, 120));
    }
  }

  if (errorLines.length === 0 && targetLines.length === 0) {
    return shellHandler(toolName, output);
  }

  // Determine overall result from exit code if available
  const exitCode = (output as Record<string, unknown>)?.exit_code;
  const status = exitCode === 0 ? "✓" : exitCode !== undefined ? "✗" : "";

  const lines: string[] = [`${status ? status + " " : ""}build`];
  if (errorLines.length > 0) {
    lines.push(`  errors (${errorLines.length}):`);
    lines.push(...errorLines.slice(0, MAX_BUILD_ERRORS).map(e => `    ${e}`));
    if (errorLines.length > MAX_BUILD_ERRORS) {
      lines.push(`    … (+${errorLines.length - MAX_BUILD_ERRORS} more)`);
    }
  } else {
    lines.push(`  completed successfully`);
  }

  return { summary: lines.join("\n"), originalSize };
};

// ---------------------------------------------------------------------------
// gh CLI (GitHub CLI)
// ---------------------------------------------------------------------------

export const ghHandler: Handler = (
  toolName: string,
  output: unknown
): CompressionResult => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(extractText(output), "utf8");

  const lines = stdout.trim().split("\n").filter((l) => l.trim());

  // Already compact — not worth specialising.
  if (lines.length <= 5) return shellHandler(toolName, output);

  // List output: gh issue list, gh pr list, gh run list, gh release list.
  // Default format is tab-separated starting with #NUM or bare NUM.
  const listLines = lines.filter((l) => /^#?\d+\t/.test(l));
  if (listLines.length >= Math.ceil(lines.length * 0.5)) {
    const shown = listLines.slice(0, 10);
    const overflow =
      listLines.length > 10 ? `\n  … (+${listLines.length - 10} more)` : "";
    const rows = shown.map((l) => {
      const parts = l.split("\t").slice(0, 3);
      return `  ${parts.join("  ").slice(0, 100)}`;
    });
    return {
      summary:
        `gh — ${listLines.length} item${listLines.length === 1 ? "" : "s"}\n` +
        rows.join("\n") + overflow,
      originalSize,
    };
  }

  // Check/run status output: gh pr checks, gh run view.
  // Tab-separated with "pass" or "fail" as the second field.
  const passCount = lines.filter((l) => /\tpass\b/i.test(l)).length;
  const failCount = lines.filter((l) => /\tfail\b/i.test(l)).length;
  if (passCount + failCount >= Math.ceil(lines.length * 0.4)) {
    const failLines = lines
      .filter((l) => /\tfail\b/i.test(l))
      .slice(0, 5)
      .map((l) => `  fail: ${l.split("\t")[0]!.trim().slice(0, 80)}`);
    return {
      summary: [`gh checks — ${passCount} pass, ${failCount} fail`, ...failLines].join("\n"),
      originalSize,
    };
  }

  // View/metadata output: gh pr view, gh issue view (non-JSON format).
  // Lines like "title:\tPR title" or "state:\tOPEN".
  const kvLines = lines.filter((l) =>
    /^(title|state|author|labels|number|assignees|milestone):\t/i.test(l)
  );
  if (kvLines.length >= 2) {
    const meta = kvLines.slice(0, 5).map((l) => {
      const [key, ...vals] = l.split("\t");
      return `  ${(key ?? "").replace(/:$/, "")}: ${vals.join(" ").trim().slice(0, 100)}`;
    });
    return {
      summary: `gh view\n${meta.join("\n")}`,
      originalSize,
    };
  }

  // Fall through: shellHandler handles JSON detection + 25-line cap.
  return shellHandler(toolName, output);
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
  if (/^git\s+status(\s|$)/.test(command)) return gitStatusHandler;
  if (/^terraform\s+plan(\s|$)/.test(command)) return terraformPlanHandler;
  if (/^(npm|bun|yarn|pnpm)\s+install(\s|$)/.test(command) ||
      /^pip\d*\s+install(\s|$)/.test(command)) return packageInstallHandler;
  if (/^(pytest|python\s+-m\s+pytest)(\s|$)/.test(command) ||
      /^(jest|npx\s+jest|bun\s+test|vitest|npx\s+vitest)(\s|$)/.test(command) ||
      /^go\s+test(\s|$)/.test(command)) return testRunnerHandler;
  if (/^docker(-compose)?\s+(ps|compose\s+ps)(\s|$)/.test(command) ||
      /^docker\s+compose\s+ps(\s|$)/.test(command)) return dockerPsHandler;
  if (/^(make|just)(\s|$)/.test(command)) return buildToolHandler;
  if (/^gh\s+/.test(command)) return ghHandler;

  return shellHandler;
}
