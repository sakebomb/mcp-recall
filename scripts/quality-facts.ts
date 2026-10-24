/**
 * The fact and false-claim rules of the quality benchmark (scripts/quality.ts).
 *
 * This file must import nothing from src/: a parser shared with the handlers would
 * make a handler bug an extractor bug, and it would score as a pass. The facts are
 * read from the raw output alone, each must be a substring of it (or match a fixed
 * pattern it matches), and they are fixed before any arm runs. MCP JSON must be
 * compact, as an MCP server sends it, so a value's escaped form is in the raw text.
 */
import { ERROR_RE, falseClaim } from "./fidelity";

const MIN_LINE = 8;

/** A fact is kept when the delivered text contains `text`, or matches `pattern` when one is given. */
export interface Fact { text: string; pattern?: RegExp }

const MERGE_RE = /^You have unmerged paths\./m;
const STATUS_LONG_RE = /^\t(?:[a-z ]+:\s+)?(.+)$/;
const STATUS_SHORT_RE = /^[ MADRCU?!]{2} (.+)$/;
const ONELINE_RE = /^([0-9a-f]{7,40}) (.+)$/;

// git quotes a path with spaces or special bytes. Only the quotes are dropped, not the
// escapes, so the fact stays a substring of the raw output.
const unquote = (p: string) => (p.length > 1 && p.startsWith('"') && p.endsWith('"') ? p.slice(1, -1) : p);
const paths = (entry: string): string[] => entry.split(" -> ").map(unquote);

function statusFacts(lines: string[]): Fact[] {
  const out: Fact[] = [];
  for (const line of lines) {
    const branch = line.match(/^On branch (\S+)/)?.[1] ?? line.match(/^HEAD detached (?:at|from) (\S+)/)?.[1] ?? line.match(/^## ([^.\s]+)/)?.[1];
    if (branch) { out.push({ text: branch }); continue; }
    const entry = line.match(STATUS_LONG_RE)?.[1] ?? line.match(STATUS_SHORT_RE)?.[1];
    if (entry) out.push(...paths(entry).map((text) => ({ text })));
  }
  if (lines.some((l) => MERGE_RE.test(l))) out.push({ text: "unmerged", pattern: /unmerged|conflict/i });
  return out;
}

function diffFacts(lines: string[]): Fact[] {
  const out: Fact[] = [];
  // Headers (---/+++) come before a file's first hunk; inside one, "--- x" is a removed "-- x".
  let inHunk = false;
  for (const line of lines) {
    const file = line.match(/^diff --git a\/(\S+) b\//)?.[1];
    if (file) { out.push({ text: file }); inHunk = false; continue; }
    if (line.startsWith("@@")) { inHunk = true; continue; }
    if (!inHunk || !/^[+-]/.test(line)) continue;
    const changed = line.slice(1).trim();
    if (changed.length >= MIN_LINE) out.push({ text: changed });
  }
  return out;
}

function logFacts(lines: string[]): Fact[] {
  const out: Fact[] = [];
  let awaitingSubject = false;
  for (const line of lines) {
    const full = line.match(/^commit ([0-9a-f]{40})/)?.[1];
    if (full) { out.push({ text: full.slice(0, 7) }); awaitingSubject = true; continue; }
    if (awaitingSubject && /^ {4}\S/.test(line)) { out.push({ text: line.trim() }); awaitingSubject = false; continue; }
    const one = awaitingSubject ? null : line.match(ONELINE_RE);
    if (one) out.push({ text: one[1].slice(0, 7) }, { text: one[2] });
  }
  return out;
}

/** A line rule: the facts a matching line holds. */
type LineRule = [RegExp, (m: RegExpMatchArray) => string[]];

const byLine = (rules: LineRule[]) => (lines: string[]): Fact[] =>
  lines.flatMap((line) => rules.flatMap(([re, take]) => {
    const m = line.match(re);
    return m ? take(m) : [];
  })).map((text) => ({ text }));

// The final counts, inside a "=== … ===" banner or bare as `pytest -q` prints them.
const PYTEST_SUMMARY_RE = /^(?:=+ )?(\d+ \w+(?:, \d+ \w+)*) in [\d.]+s(?: =+)?$/;
const pytestFacts = byLine([
  [/^(?:FAILED|ERROR) (\S+)/, (m) => [m[1]]],
  [PYTEST_SUMMARY_RE, (m) => m[1].split(", ")],
]);

function cargoTestFacts(lines: string[]): Fact[] {
  const out: Fact[] = [];
  lines.forEach((line, i) => {
    const failed = line.match(/^test (\S+) \.\.\. FAILED$/)?.[1];
    // A panic names its location, and its message is the next line.
    const panic = line.match(/^thread '[^']+' \(\d+\) panicked at (\S+):$/)?.[1];
    const result = line.match(/^test result: \w+\. (.+)$/)?.[1];
    if (failed) out.push({ text: failed });
    else if (panic) out.push({ text: panic }, ...(lines[i + 1]?.trim() ? [{ text: lines[i + 1].trim() }] : []));
    else if (result) out.push(...result.split("; ").filter((c) => /^\d+ (passed|failed)$/.test(c)).map((text) => ({ text })));
  });
  return out;
}

const formatFacts = byLine([
  [/^would reformat (.+)$/, (m) => [m[1]]],
  [/(\d+ files? would be reformatted)/, (m) => [m[1]]],
]);

const LOCATION = String.raw`(\S+:\d+:\d+)`;
const lintFacts = byLine([
  [/^[A-Z]+\d+ .+$/, (m) => [m[0]]],
  [new RegExp(String.raw`^\s*--> ${LOCATION}$`), (m) => [m[1]]],
  [new RegExp(String.raw`^${LOCATION}: [A-Z]+\d+ `), (m) => [m[1]]],
]);

const crashFacts = byLine([[/^\s*(File "[^"]+", line \d+, in \S+)$/, (m) => [m[1]]]]);

const GREP_LINE_RE = /^([^:\s][^:]*:\d+):/;
const grepFacts = byLine([[GREP_LINE_RE, (m) => [m[1]]]]);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A string value as compact JSON writes it, so it is a substring of the raw
 * output; a summary that prints it unescaped keeps it too.
 */
function jsonString(s: string): Fact {
  const text = JSON.stringify(s).slice(1, -1);
  return text === s ? { text } : { text, pattern: new RegExp(`${escapeRe(text)}|${escapeRe(s)}`) };
}

/** A string value's facts: the value, or each line of a multi-line one, when long enough to name something. */
const stringFacts = (s: string): Fact[] =>
  s.split("\n").map((l) => l.trim()).filter((l) => l.length >= MIN_LINE).map(jsonString);

/** Every string value in a JSON document, depth first; keys, numbers and booleans are structure, not facts. */
function jsonFacts(value: unknown): Fact[] {
  if (typeof value === "string") return stringFacts(value);
  if (Array.isArray(value)) return value.flatMap(jsonFacts);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(jsonFacts);
  return [];
}

type Json = Record<string, any>;

/**
 * What an agent reads a GitHub API item for: its number, title, link, body,
 * labels, commit and message, and a changed file's name and changed lines.
 * Ids, API links and user records are left out; there are dozens per item.
 */
function githubItemFacts(item: Json): Fact[] {
  const out: Fact[] = [];
  if (typeof item.number === "number") out.push({ text: `"number":${item.number}`, pattern: new RegExp(`"number":${item.number}\\b|#${item.number}\\b`) });
  for (const key of ["title", "html_url", "body"]) if (typeof item[key] === "string") out.push(...stringFacts(item[key]));
  if (Array.isArray(item.labels)) out.push(...item.labels.filter((l: Json) => typeof l?.name === "string").map((l: Json) => jsonString(l.name)));
  if (typeof item.sha === "string") out.push({ text: item.sha.slice(0, 7) });
  if (typeof item.commit?.message === "string") out.push(...stringFacts(item.commit.message));
  if (typeof item.filename === "string") out.push(jsonString(item.filename));
  if (typeof item.patch === "string") out.push(...diffFacts(item.patch.split("\n")).map((f) => jsonString(f.text)));
  return out;
}

/** The facts of a JSON family, or [] when the output is not JSON (its error lines still count). */
const JSON_FACTS: Record<string, (value: unknown) => Fact[]> = {
  "mcp-json": jsonFacts,
  "mcp-github": (v) => (Array.isArray(v) ? v : [v]).filter((i) => i !== null && typeof i === "object").flatMap(githubItemFacts),
};

const FAMILY_FACTS: Record<string, (lines: string[]) => Fact[]> = {
  "git-status": statusFacts, "git-diff": diffFacts, "git-log": logFacts,
  pytest: pytestFacts, "cargo-test": cargoTestFacts, format: formatFacts, lint: lintFacts, crash: crashFacts, grep: grepFacts,
  // A `python script.py` run from the public sample: what it can lose is its traceback.
  python: crashFacts,
};

// An exception line, as Python prints it bare and pytest prints it after "E".
const EXCEPTION_RE = /^(?:E\s+)?([A-Z][A-Za-z]*(?:Error|Exception)(?::\s.*)?)$/;

/**
 * The facts in `raw` for `family`, then every exception line and error line,
 * once each. An error line that holds one of the family's facts is already
 * covered by it, so it is not counted twice.
 */
export function facts(family: string, raw: string): Fact[] {
  const json = JSON_FACTS[family];
  if (json) {
    // Compact JSON is one line, so the line rules below would take the whole document as one error line.
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { parsed = undefined; }
    if (parsed !== undefined) return dedupe(json(parsed));
  }
  const lines = raw.split("\n");
  const own = FAMILY_FACTS[family]?.(lines) ?? [];
  const exceptions = lines.map((l) => l.trim().match(EXCEPTION_RE)?.[1]).filter((t): t is string => !!t).map((text) => ({ text }));
  const errors = lines.map((l) => l.trim())
    .filter((l) => l.length >= MIN_LINE && ERROR_RE.test(l) && !own.some((f) => l.includes(f.text)))
    .map((text) => ({ text }));
  return dedupe([...own, ...exceptions, ...errors]);
}

function dedupe(fs: Fact[]): Fact[] {
  const seen = new Set<string>();
  return fs.filter((f) => !seen.has(f.text) && (seen.add(f.text), true));
}

/** The share of `fs` that `delivered` still carries; a case with no facts is fully kept. */
export function keptShare(fs: Fact[], delivered: string): number {
  if (fs.length === 0) return 1;
  return fs.filter((f) => (f.pattern ? f.pattern.test(delivered) : delivered.includes(f.text))).length / fs.length;
}

const CLEAN_RE = /\b(nothing to commit|working tree clean|clean)\b/gi;

const COUNT_CLAIM_RE = /\b(\d+) match(?:es|ing lines?)?\b/g;

/** A count of matches in `delivered` that differs from the matching lines of an output made only of them. */
function wrongCount(raw: string, delivered: string): boolean {
  const lines = raw.split("\n").filter((l) => l.trim());
  if (lines.length === 0 || !lines.every((l) => GREP_LINE_RE.test(l))) return false;
  return [...delivered.matchAll(COUNT_CLAIM_RE)].some(([claim, n]) => Number(n) !== lines.length && !raw.includes(claim));
}

/**
 * A summary claiming something the output contradicts and does not claim itself:
 * a clean or error-free result, or a match count other than the lines shown.
 */
export function contradicts(raw: string, delivered: string): boolean {
  if (falseClaim(raw, delivered) || wrongCount(raw, delivered)) return true;
  if (!MERGE_RE.test(raw)) return false;
  return [...delivered.matchAll(CLEAN_RE)].some(([claim]) => !raw.toLowerCase().includes(claim.toLowerCase()));
}
