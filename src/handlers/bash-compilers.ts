/**
 * Compiler & linter diagnostics handler — compresses verbose build / typecheck /
 * lint output (cargo build|check|clippy, go build|vet, tsc, eslint, ruff) down to
 * a headline count plus the individual error/warning diagnostics, errors first.
 *
 * Safety contract (never hide a failure):
 *   - NEVER reports success when the command failed. A non-zero exit code always
 *     renders as ✗, and every parsed error is surfaced (capped, errors before
 *     warnings).
 *   - When it cannot recognise ANY diagnostics or count, it falls back to the
 *     shell handler, so an unparsed failure is shown head/tail — never dropped.
 *   - It never fabricates a "clean" summary for a command that exited non-zero.
 * The full original output remains retrievable via recall__* regardless.
 */
import type { CompressionResult, Handler } from "./types";
import { extractText } from "./types";
import { shellHandler } from "./shell";
import {
  extractStdout,
  extractStderr,
  extractExitCode,
  MAX_BUILD_ERRORS,
} from "./bash-shared";

interface Diagnostic {
  severity: "error" | "warning";
  location: string | null;
  message: string;
  /** True when the line carried an explicit severity word. An unlabeled
   * `file:line: message` (go-style) defaults to "error" but is only trusted as a
   * failure when the run didn't cleanly succeed — see the clean-exit filter. */
  labeled: boolean;
}

const MAX_MESSAGE_LEN = 100;

// tsc: "src/foo.ts(42,10): error TS2345: message"
const TSC_RE = /^(\S+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS\d+:\s+(.+)$/;
// gcc / go / ruff: "path.ext:line[:col]: [severity:] message" — require a file
// extension before :line so ordinary "note:" / "host:port" lines don't match.
const FILE_LOC_RE = /^(\S*\.\w+):(\d+)(?::(\d+))?:\s+(?:(error|warning|note):\s+)?(.+)$/;
// rustc / cargo bare severity: "error[E0308]: message" / "warning: message"
const SEVERITY_RE = /^(error|warning)(?:\[[A-Za-z]?\d+\])?:\s+(.+)$/;
// cargo location line that follows a bare-severity line: "  --> src/main.rs:10:5"
const CARGO_LOC_RE = /^\s*-->\s+(\S+:\d+(?::\d+)?)/;
// eslint stylish file header (a bare path on its own line)
const ESLINT_FILE_RE = /^(\/?\S+\.\w+)$/;
// eslint stylish diagnostic: "  10:5  error  message  rule-name"
const ESLINT_RE = /^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)(?:\s{2,}[\w./-]+)?$/;

// Authoritative summary lines (trusted for the headline count when present).
const CARGO_ERR_SUM_RE = /could not compile .*? due to (\d+) previous error/i;
const CARGO_WARN_SUM_RE = /generated (\d+) warning/i;
const ESLINT_SUM_RE = /[✖✗x]\s+\d+\s+problems?\s+\((\d+)\s+errors?,\s+(\d+)\s+warnings?\)/i;
const RUFF_SUM_RE = /Found (\d+) error/i;
const TSC_SUM_RE = /Found (\d+) errors?\b/i;
// cargo's boilerplate trailer — redundant with CARGO_ERR_SUM_RE's count, and
// must not be parsed as another SEVERITY_RE diagnostic ("error: aborting …").
const CARGO_ABORT_RE = /^error: aborting due to \d+ previous error/i;

const clip = (s: string): string => s.trim().slice(0, MAX_MESSAGE_LEN);

export const compilerDiagnosticsHandler: Handler = (
  toolName: string,
  output: unknown
): CompressionResult => {
  const stdout = extractStdout(output);
  const stderr = extractStderr(output);
  const combined = `${stdout}\n${stderr}`;
  const originalSize = Buffer.byteLength(extractText(output), "utf8");
  const exitCode = extractExitCode(output);

  const diagnostics: Diagnostic[] = [];
  let summaryErrors: number | null = null;
  let summaryWarnings: number | null = null;
  let eslintFile: string | null = null;

  for (const raw of combined.split("\n")) {
    const t = raw.trimEnd();
    if (!t.trim()) continue;

    let m: RegExpMatchArray | null;

    // --- authoritative summary counts ---
    if ((m = t.match(CARGO_ERR_SUM_RE))) { summaryErrors = (summaryErrors ?? 0) + parseInt(m[1]!, 10); continue; }
    if ((m = t.match(CARGO_WARN_SUM_RE))) { summaryWarnings = parseInt(m[1]!, 10); continue; }
    if ((m = t.match(ESLINT_SUM_RE))) { summaryErrors = parseInt(m[1]!, 10); summaryWarnings = parseInt(m[2]!, 10); continue; }
    if ((m = t.match(RUFF_SUM_RE))) { summaryErrors = parseInt(m[1]!, 10); continue; }
    if ((m = t.match(TSC_SUM_RE))) { summaryErrors = parseInt(m[1]!, 10); continue; }
    if (CARGO_ABORT_RE.test(t)) continue; // redundant trailer, not a diagnostic

    // --- tsc paren form (check before FILE_LOC so TS codes are dropped) ---
    if ((m = t.match(TSC_RE))) {
      diagnostics.push({ severity: m[4] as Diagnostic["severity"], location: `${m[1]}:${m[2]}`, message: clip(m[5]!), labeled: true });
      continue;
    }
    // --- gcc / go / ruff file:line:col form ---
    if ((m = t.match(FILE_LOC_RE))) {
      const sev = m[4] as "error" | "warning" | "note" | undefined;
      if (sev === "note") continue;
      diagnostics.push({ severity: sev ?? "error", location: `${m[1]}:${m[2]}`, message: clip(m[5]!), labeled: sev !== undefined });
      continue;
    }
    // --- rustc / cargo bare severity ---
    if ((m = t.match(SEVERITY_RE))) {
      diagnostics.push({ severity: m[1] as Diagnostic["severity"], location: null, message: clip(m[2]!), labeled: true });
      continue;
    }
    // --- cargo "  --> loc" attaches to the previous locationless diagnostic ---
    if ((m = t.match(CARGO_LOC_RE))) {
      const last = diagnostics[diagnostics.length - 1];
      if (last && last.location === null) last.location = m[1]!;
      continue;
    }
    // --- eslint file header ---
    if (ESLINT_FILE_RE.test(t)) { eslintFile = t.trim(); continue; }
    // --- eslint indented diagnostic ---
    if ((m = t.match(ESLINT_RE))) {
      const loc = eslintFile ? `${eslintFile}:${m[1]}` : `${m[1]}:${m[2]}`;
      diagnostics.push({ severity: m[3] as Diagnostic["severity"], location: loc, message: clip(m[4]!), labeled: true });
      continue;
    }
  }

  // Nothing recognisable — don't risk a wrong summary; show the raw output via
  // the shell handler so an unparsed failure is never hidden. (A non-zero exit
  // that DOES parse still renders ✗ below, so success is never fabricated.)
  if (diagnostics.length === 0 && summaryErrors === null && summaryWarnings === null) {
    return shellHandler(toolName, output);
  }

  // On a KNOWN-clean exit, drop unlabeled "error" diagnostics: a go-style
  // `file:line: message` only appears on a real failure, so on a passing run an
  // incidental `host:port: message` line must not fabricate an error.
  const cleanExit = exitCode === 0;
  const visible = cleanExit ? diagnostics.filter((d) => d.labeled) : diagnostics;

  const diagErrors = visible.filter((d) => d.severity === "error").length;
  const diagWarnings = visible.filter((d) => d.severity === "warning").length;
  const errorCount = summaryErrors ?? diagErrors;
  const warnCount = summaryWarnings ?? diagWarnings;

  // Pass/fail is authoritative from the exit code when we have it (never hide a
  // failure, never fabricate one on success); fall back to the parsed error
  // count only when the exit code is unknown.
  const failed = exitCode !== undefined ? exitCode !== 0 : errorCount > 0;
  const status = failed ? "✗" : "✓";
  const parts: string[] = [];
  if (errorCount > 0) parts.push(`${errorCount} error${errorCount === 1 ? "" : "s"}`);
  if (warnCount > 0) parts.push(`${warnCount} warning${warnCount === 1 ? "" : "s"}`);
  const headline = `${status} ${parts.length ? parts.join(", ") : failed ? "failed" : "clean"}`;

  // Errors first, then warnings; cap the total shown.
  const ordered = [
    ...visible.filter((d) => d.severity === "error"),
    ...visible.filter((d) => d.severity === "warning"),
  ];
  const shown = ordered.slice(0, MAX_BUILD_ERRORS).map((d) => {
    const label = d.severity === "warning" ? "warn" : "error";
    return `  ${label}: ${d.location ? d.location + " — " : ""}${d.message}`;
  });
  const overflow =
    ordered.length > MAX_BUILD_ERRORS
      ? [`  … (+${ordered.length - MAX_BUILD_ERRORS} more)`]
      : [];

  return { summary: [headline, ...shown, ...overflow].join("\n"), originalSize };
};
