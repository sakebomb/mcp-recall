/**
 * Bash handler — routes native Bash tool outputs to CLI-aware compressors.
 * Inspects `tool_input.command` to detect git diff/log, terraform plan, etc.
 * Falls back to the shell handler for unrecognised commands.
 */
import type { CompressionResult, Handler } from "./types";
import { extractText } from "./types";
import { shellHandler } from "./shell";
import {
  extractStdout,
  extractStderr,
  extractCommand,
  MAX_TERRAFORM_RESOURCES,
  MAX_BUILD_ERRORS,
} from "./bash-shared";
import { gitDiffHandler, gitLogHandler, gitStatusHandler } from "./bash-git";
import { testRunnerHandler } from "./bash-test";
import { dockerPsHandler } from "./bash-docker";

export { gitDiffHandler, gitLogHandler, gitStatusHandler } from "./bash-git";
export { testRunnerHandler } from "./bash-test";
export { dockerPsHandler } from "./bash-docker";

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
