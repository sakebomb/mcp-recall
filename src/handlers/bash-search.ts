/**
 * Search / listing handlers — grep|rg, ls, find|fd. These commands emit a list
 * of items (matches, entries, paths) whose bulk is length, not structure.
 *
 * Safety: the user usually wants the items, so these NEVER drop items silently —
 * they always report the total count and show a generous capped sample with an
 * explicit overflow line, and fall back to the shell handler when the output
 * doesn't match the expected shape. The full output stays retrievable via recall__*.
 */
import type { CompressionResult, Handler } from "./types";
import { extractText } from "./types";
import { shellHandler } from "./shell";
import { extractStdout } from "./bash-shared";

const MAX_SAMPLE = 40;
const clip = (s: string, n = 100): string => (s.length > n ? s.slice(0, n) + "…" : s);

function overflowLine(total: number, shown: number, noun: string): string[] {
  return total > shown ? [`  … (+${total - shown} more ${noun})`] : [];
}

// ---------------------------------------------------------------------------
// grep / ripgrep — inline "file:line:content" form (piped, --no-heading)
// ---------------------------------------------------------------------------

const GREP_LINE_RE = /^(.+?):(\d+):(.*)$/;

export const grepHandler: Handler = (
  toolName: string,
  output: unknown
): CompressionResult => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(extractText(output), "utf8");

  const lines = stdout.split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { summary: "[grep — no matches]", originalSize };
  }

  const matches: { file: string; line: string; text: string }[] = [];
  const files = new Set<string>();
  for (const l of lines) {
    const m = l.match(GREP_LINE_RE);
    if (m) {
      matches.push({ file: m[1]!, line: m[2]!, text: m[3]! });
      files.add(m[1]!);
    }
  }

  // Not predominantly file:line:content (grouped rg, plain grep, binary) — the
  // shell handler's 25-line cap is safer than a wrong parse.
  if (matches.length < Math.ceil(lines.length * 0.5)) {
    return shellHandler(toolName, output);
  }

  const header = `grep — ${matches.length} match${matches.length === 1 ? "" : "es"} in ${files.size} file${files.size === 1 ? "" : "s"}`;
  const shown = matches
    .slice(0, MAX_SAMPLE)
    .map((m) => `  ${m.file}:${m.line}: ${clip(m.text.trim())}`);
  return {
    summary: [header, ...shown, ...overflowLine(matches.length, MAX_SAMPLE, "matches")].join("\n"),
    originalSize,
  };
};

// ---------------------------------------------------------------------------
// ls — long (-l), recursive (-R), and plain forms
// ---------------------------------------------------------------------------

const LS_LONG_RE = /^([-dlbcps])[rwxsStT-]{9}[+@.]?\s+\d+\s/;
const LS_RECURSIVE_HEADER_RE = /^(\.?[^\s:]*):$/;

export const lsHandler: Handler = (
  toolName: string,
  output: unknown
): CompressionResult => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(extractText(output), "utf8");

  const raw = stdout.split("\n");
  const nonEmpty = raw.filter((l) => l.trim().length > 0);
  if (nonEmpty.length === 0) {
    return { summary: "[ls — empty]", originalSize };
  }

  // Recursive: directory-header lines like "./src:" grouping entries. `ls -R`
  // always blank-line-separates directory blocks; a plain listing that merely
  // happens to contain colon-suffixed names has no such separator, so require
  // one to avoid misreading a plain listing as recursive (and hiding files).
  const dirHeaders = nonEmpty.filter((l) => LS_RECURSIVE_HEADER_RE.test(l.trim()));
  const hasBlankSeparator = raw.some((l) => l.trim() === "");
  if (dirHeaders.length >= 2 && hasBlankSeparator) {
    const entries = nonEmpty.length - dirHeaders.length - nonEmpty.filter((l) => /^total\s+\d+$/.test(l.trim())).length;
    const shown = dirHeaders.slice(0, MAX_SAMPLE).map((d) => `  ${d.trim()}`);
    const header = `ls -R — ${dirHeaders.length} directories, ~${entries} entries`;
    return {
      summary: [header, ...shown, ...overflowLine(dirHeaders.length, MAX_SAMPLE, "directories")].join("\n"),
      originalSize,
    };
  }

  // Long format: perm-string lines. Count dirs vs files.
  const longLines = nonEmpty.filter((l) => LS_LONG_RE.test(l));
  if (longLines.length >= Math.ceil(nonEmpty.length * 0.5)) {
    let dirs = 0;
    const names: string[] = [];
    for (const l of longLines) {
      const m = l.match(LS_LONG_RE);
      if (m && m[1] === "d") dirs++;
      const name = l.split(/\s+/).slice(8).join(" ");
      if (name) names.push(name);
    }
    const files = longLines.length - dirs;
    const header = `ls — ${longLines.length} entries (${dirs} dir${dirs === 1 ? "" : "s"}, ${files} file${files === 1 ? "" : "s"})`;
    const shown = names.slice(0, MAX_SAMPLE).map((n) => `  ${clip(n)}`);
    return {
      summary: [header, ...shown, ...overflowLine(names.length, MAX_SAMPLE, "entries")].join("\n"),
      originalSize,
    };
  }

  // Plain listing: names one-per-line or column-wrapped. Flatten to tokens.
  const tokens = nonEmpty.flatMap((l) => l.split(/\s{2,}|\t/)).map((t) => t.trim()).filter(Boolean);
  if (tokens.length < 2) return shellHandler(toolName, output);
  const header = `ls — ${tokens.length} entries`;
  const shown = tokens.slice(0, MAX_SAMPLE).map((n) => `  ${clip(n)}`);
  return {
    summary: [header, ...shown, ...overflowLine(tokens.length, MAX_SAMPLE, "entries")].join("\n"),
    originalSize,
  };
};

// ---------------------------------------------------------------------------
// find / fd — one path per line
// ---------------------------------------------------------------------------

export const findHandler: Handler = (
  toolName: string,
  output: unknown
): CompressionResult => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(extractText(output), "utf8");

  const paths = stdout.split("\n").map((l) => l.trimEnd()).filter((l) => l.length > 0);
  if (paths.length === 0) {
    return { summary: "[find — no results]", originalSize };
  }
  // Guard against non-find output (e.g. find errors / prompts): require most
  // lines to look like paths (no leading whitespace, no ": " diagnostic marker).
  const pathLike = paths.filter((p) => !/^\s/.test(p) && !/^find: /.test(p));
  if (pathLike.length < Math.ceil(paths.length * 0.7)) {
    return shellHandler(toolName, output);
  }

  const header = `find — ${paths.length} path${paths.length === 1 ? "" : "s"}`;
  const shown = paths.slice(0, MAX_SAMPLE).map((p) => `  ${clip(p, 120)}`);
  return {
    summary: [header, ...shown, ...overflowLine(paths.length, MAX_SAMPLE, "paths")].join("\n"),
    originalSize,
  };
};
