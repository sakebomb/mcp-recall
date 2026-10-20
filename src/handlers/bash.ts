/**
 * Bash handler — routes native Bash tool outputs to CLI-aware compressors.
 * Inspects `tool_input.command` to detect git diff/log, terraform plan, etc.
 * Falls back to the shell handler for unrecognised commands.
 */
import type { CompressionResult, Handler } from "./types";
import { shellHandler } from "./shell";
import {
  bashOutputText,
  extractStdout,
  extractStderr,
  extractCommand,
  extractExitCode,
  MAX_TERRAFORM_RESOURCES,
  MAX_BUILD_ERRORS,
} from "./bash-shared";
import { gitDiffHandler, gitLogHandler, gitStatusHandler, gitRefsHandler } from "./bash-git";
import { testRunnerHandler, summarizeTestRun } from "./bash-test";
import { dockerPsHandler } from "./bash-docker";
import { compilerDiagnosticsHandler } from "./bash-compilers";
import { grepHandler, lsHandler, findHandler } from "./bash-search";
import { summarizeLineWindow } from "./generic";
import { clipLine } from "./clip";

export { gitDiffHandler, gitLogHandler, gitStatusHandler, gitRefsHandler } from "./bash-git";
export { testRunnerHandler } from "./bash-test";
export { dockerPsHandler } from "./bash-docker";
export { compilerDiagnosticsHandler } from "./bash-compilers";
export { grepHandler, lsHandler, findHandler } from "./bash-search";

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
  const originalSize = Buffer.byteLength(bashOutputText(output), "utf8");

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
  const originalSize = Buffer.byteLength(bashOutputText(output), "utf8");

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
  const originalSize = Buffer.byteLength(bashOutputText(output), "utf8");

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

  // A recipe that runs tests (`just test`, `make check`) is summarised as a test
  // run, since the recipe error alone names no failing test (#325). Errors the
  // test summary does not already show stay below it: a later step can fail
  // after the tests pass.
  const tests = summarizeTestRun(output);
  if (tests) {
    const extra = errorLines.filter(e => !tests.summary.includes(e));
    if (extra.length === 0) return tests;
    const lines = [tests.summary, `  build errors (${extra.length}):`];
    lines.push(...extra.slice(0, MAX_BUILD_ERRORS).map(e => `    ${e}`));
    if (extra.length > MAX_BUILD_ERRORS) lines.push(`    … (+${extra.length - MAX_BUILD_ERRORS} more)`);
    return { summary: lines.join("\n"), originalSize };
  }

  if (errorLines.length === 0 && targetLines.length === 0) {
    return shellHandler(toolName, output);
  }

  // Determine overall result from exit code if available. Use extractExitCode so
  // the JSON-string Bash payload is parsed (a bare property read is undefined).
  const exitCode = extractExitCode(output);
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
  const originalSize = Buffer.byteLength(bashOutputText(output), "utf8");

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

// A leading `cd <dir>` prefix, up to and including the separator that ends it.
// Three separator shapes are equivalent in practice and all must be unwrapped:
// `&&`, `;`, and a bare newline — multi-line Bash calls written as `cd <dir>`,
// newline, then the real command are routine, and treating that shape as the
// command `cd` sent every wrapped command to the generic fallback (#260).
// The directory may be double-quoted, single-quoted, or contain backslash-escaped
// whitespace; an unquoted run stops at whitespace or a shell operator so the
// pattern can never swallow the separator it is looking for. A bare `cd <dir>`
// with no following command does not match and is left intact.
//
// The unquoted branch's two alternatives are kept MUTUALLY EXCLUSIVE — an escape
// pair (`\\[\s\S]`) versus a plain char that is explicitly not a backslash
// (`[^\s\\&;|<>]`). Letting a lone backslash be consumed either way makes the group
// ambiguous (the `(a|aa)+` shape), so the engine must explore many partitions to
// *disprove* a match — which is what a bare `cd <dir>` (no separator) asks of it.
// Measured with the ambiguous class on `cd /repo\a\a\a…`: ~193ms at 24 escapes
// rising to ~780ms, then flat from 40 to 400 escapes (V8 caps backtracking, so the
// cost is bounded — a slow path, not a hang). The disjoint form is ~0.02ms. Since
// this runs on every intercepted Bash call and disjointness costs nothing, keep the
// alternatives non-overlapping.
const CD_PREFIX = /^cd\s+(?:"[^"]*"|'[^']*'|(?:\\[\s\S]|[^\s\\&;|<>])+)[ \t]*(?:&&|;|\r?\n)\s*(.+)$/s;

// A `VAR=value` assignment. The value alternatives are disjoint (a quoted span,
// or a run with no whitespace or quote), for the same backtracking reason as
// CD_PREFIX: an unterminated quote must fail fast, not explore partitions.
const ASSIGN = String.raw`[A-Za-z_]\w*=(?:"[^"]*"|'[^']*'|[^\s"']*)`;
// What must follow a stripped wrapper: the start of a command word. A flag, an
// operator or end-of-string means the wrapper is not wrapping anything we can
// parse (`env | grep`, `sudo -u www …`, `timeout 30`), so it is left in place.
const NEXT = String.raw`(?=[A-Za-z_./~])`;

// Leading wrappers that run another command unchanged (#302). Each is stripped
// only in a shape whose argument span is unambiguous.
const WRAPPER_PREFIXES = [
  new RegExp(String.raw`^timeout\s+(?:(?:-[sk]\s+\S+|--[a-z-]+(?:=\S+)?|-v)\s+)*\d+(?:\.\d+)?[smhd]?\s+${NEXT}`),
  new RegExp(String.raw`^time(?:\s+-p)?\s+${NEXT}`),
  new RegExp(String.raw`^nice(?:\s+(?:-n\s*-?\d+|--adjustment=-?\d+|-\d+))?\s+${NEXT}`),
  new RegExp(String.raw`^env(?:\s+-i)?(?:\s+${ASSIGN})*\s+${NEXT}`),
  new RegExp(String.raw`^(?:${ASSIGN}\s+)+${NEXT}`),
  new RegExp(String.raw`^(?:sudo|doas)\s+${NEXT}`),
];

/**
 * The command a quoted or bare argument runs, as a shell would pass it on: one
 * single-quoted span, one double-quoted span (`\"`, `\\`, `` \` ``, `\$`
 * unescaped), or the bare words as they are. A quoted span may be followed by a
 * local pipeline or separator (`'cmd' | head`), which runs on this side but
 * reads the same output, so it is kept. Anything else after the quote (`'a'\''b'`,
 * `'a' b`) is ambiguous: null.
 */
function quotedCommand(arg: string): string | null {
  const s = arg.trim();
  let body: string;
  let rest: string;
  if (s.startsWith("'")) {
    const end = s.indexOf("'", 1);
    if (end === -1) return null;
    body = s.slice(1, end);
    rest = s.slice(end + 1);
  } else if (s.startsWith('"')) {
    const m = s.match(/^"((?:[^"\\]|\\[\s\S])*)"/);
    if (!m) return null;
    body = m[1]!.replace(/\\(["\\`$])/g, "$1");
    rest = s.slice(m[0].length);
  } else {
    return s;
  }
  if (rest.trim() === "") return body.trim();
  return /^\s*[|;&<>]/.test(rest) ? `${body.trim()} ${rest.trim()}` : null;
}

/**
 * Splits `-xyz` option clusters off the front of `args`. `withValue` lists the
 * single-letter options that take a value (attached, `-p22`, or as the next
 * word), `flags` those that take none, `long` the long options (`--name` or
 * `--name=value`; true when they take a value). Returns what follows the
 * options, or null on any option outside those lists or a quoted value.
 */
function skipOptions(
  args: string,
  withValue: string,
  flags: string,
  long: Record<string, boolean> = {}
): string | null {
  let rest = args;
  for (let i = 0; i < 16; i++) {
    const opt = rest.match(/^(-[^\s'"]*)(?:\s+|$)/);
    if (!opt) return rest;
    rest = rest.slice(opt[0].length);
    const word = opt[1]!;
    if (word === "--") return rest;
    let needsValue = false;
    if (word.startsWith("--")) {
      const [name, inline] = word.slice(2).split("=", 2);
      if (!(name! in long)) return null;
      needsValue = long[name!]! && inline === undefined;
    } else {
      for (let j = 1; j < word.length; j++) {
        const ch = word[j]!;
        if (withValue.includes(ch)) {
          needsValue = j === word.length - 1; // otherwise the value is attached
          break;
        }
        if (!flags.includes(ch)) return null;
      }
    }
    if (needsValue) {
      const value = rest.match(/^[^\s'"]+(?:\s+|$)/);
      if (!value) return null;
      rest = rest.slice(value[0].length);
    }
  }
  return null;
}

// ssh(1) single-letter options. -N (no remote command) is in neither list, so
// a tunnel is never unwrapped.
const SSH_WITH_VALUE = "BbcDEeFIiJLlmOoPpQRSWw";
const SSH_FLAGS = "46AaCfGgKkMnqsTtVvXxYy";
const DOCKER_EXEC_WITH_VALUE = "euw";
const DOCKER_EXEC_FLAGS = "dit";
const DOCKER_EXEC_LONG: Record<string, boolean> = {
  detach: false, interactive: false, tty: false, privileged: false,
  env: true, "env-file": true, user: true, workdir: true, "detach-keys": true,
};
// A host, container or `user@host`: no leading dash, quote or operator.
const TARGET = /^[A-Za-z0-9_][\w.@:-]*\s+/;

/**
 * Commands that run another command elsewhere (#339): `ssh host cmd`,
 * `pct exec <id> -- cmd`, `docker exec ctr cmd`, and `bash -c 'cmd'`. Each
 * returns the command run, or null when the shape is not unambiguous. `label`
 * names the remote ones in the fingerprint; `bash -c` runs locally and has none.
 */
const REMOTE_WRAPPERS: Array<{ label: string | null; unwrap: (c: string) => string | null }> = [
  {
    label: "ssh",
    unwrap: (c) => {
      const args = c.match(/^ssh\s+/) ? skipOptions(c.replace(/^ssh\s+/, ""), SSH_WITH_VALUE, SSH_FLAGS) : null;
      const host = args?.match(TARGET);
      return host ? quotedCommand(args!.slice(host[0].length)) : null;
    },
  },
  {
    label: "pct exec",
    unwrap: (c) => {
      const m = c.match(/^pct\s+exec\s+\d+\s+(?:--\s+)?/);
      return m ? quotedCommand(c.slice(m[0].length)) : null;
    },
  },
  {
    label: "docker exec",
    unwrap: (c) => {
      const args = c.match(/^docker\s+exec\s+/)
        ? skipOptions(c.replace(/^docker\s+exec\s+/, ""), DOCKER_EXEC_WITH_VALUE, DOCKER_EXEC_FLAGS, DOCKER_EXEC_LONG)
        : null;
      const ctr = args?.match(TARGET);
      return ctr ? quotedCommand(args!.slice(ctr[0].length)) : null;
    },
  },
  {
    label: null,
    unwrap: (c) => {
      const m = c.match(/^(?:ba)?sh\s+-[elx]*c[elx]*\s+(?=['"])/);
      return m ? quotedCommand(c.slice(m[0].length)) : null;
    },
  },
];

/** {@link normalizeCommand}, plus the remote wrappers it stepped through, outermost first. */
function unwrapCommand(command: string): { command: string; remote: string[] } {
  let c = command.trim();
  const remote: string[] = [];
  // Bounded: chained prefixes are rare, and a bound keeps a pathological input
  // from looping. Stops as soon as no prefix matches.
  for (let i = 0; i < 8; i++) {
    const cd = c.match(CD_PREFIX);
    if (cd) {
      c = cd[1]!.trim();
      continue;
    }
    const wrapper = WRAPPER_PREFIXES.map((re) => c.match(re)).find((m) => m !== null);
    if (wrapper) {
      c = c.slice(wrapper[0].length);
      continue;
    }
    const inner = REMOTE_WRAPPERS
      .map(({ label, unwrap }) => ({ label, inner: unwrap(c) }))
      .find((r) => r.inner !== null && r.inner !== "");
    if (!inner) break;
    if (inner.label) remote.push(inner.label);
    c = inner.inner!;
  }
  c = c.replace(/^git\s+(?:(?:--no-pager|--paginate|-P)\s+|-[cC]\s+\S+\s+)+/, "git ");
  return { command: c, remote };
}

/**
 * Normalises a Bash command so routing sees the real subcommand: unwraps leading
 * `cd <dir>` prefixes (see {@link CD_PREFIX} for the separator and quoting shapes
 * accepted) and strips git global options (`--no-pager`, `-C <path>`, `-c <k=v>`,
 * `--paginate`, `-P`) that would otherwise push `git diff` output to the generic
 * shell fallback.
 *
 * Also strips leading wrappers that run the real command unchanged (`timeout 30`,
 * `time`, `nice -n 10`, `env A=1`, `A=1`, `sudo`; see {@link WRAPPER_PREFIXES}),
 * so routing, the fingerprint and retention all see the wrapped command (#302).
 *
 * And unwraps commands run elsewhere (`ssh host 'git status'`, `pct exec 108 --
 * journalctl`, `docker exec ctr ps`, `bash -c '…'`; see {@link REMOTE_WRAPPERS}),
 * so they reach the handler for the command they run (#339).
 *
 * Chained prefixes are unwrapped across mixed separators and wrappers (`cd /a &&
 * timeout 60 git diff`, `ssh h 'cd /x && git diff'`) under a bounded loop.
 */
export function normalizeCommand(command: string): string {
  return unwrapCommand(command).command;
}

/**
 * The fingerprint the hook stores for a raw Bash command: {@link commandFingerprint}
 * of the normalised command, prefixed by any remote wrappers it ran through
 * (`ssh git status`, `pct exec journalctl`), so local and remote stay apart in
 * analytics (#339). Wrapper labels are constants: no host, id or container name.
 */
export function bashFingerprint(command: string): string {
  const { command: inner, remote } = unwrapCommand(command);
  return [...remote, commandFingerprint(inner)].filter((s) => s !== "").join(" ");
}

// Dispatcher commands whose first token names a tool family, not the operation —
// the meaningful fingerprint is "verb subcommand" (e.g. "git diff", "cargo build").
const SUBCOMMAND_TOOLS = new Set([
  "git", "cargo", "go", "npm", "pnpm", "yarn", "bun", "docker", "kubectl",
]);

// Wrapper commands that prefix a real command; skipped so the fingerprint names
// the wrapped operation ("sudo apt-get …" → "apt-get"), not the wrapper.
const WRAPPER_TOOLS = new Set(["sudo", "doas", "time", "nice"]);

// A bare command token: letters then letters/digits/`-`/`_`, terminated by
// whitespace, a shell operator (`; & | < > ( )`), or end-of-string. The lookahead
// (zero-width) is what lets a glued operator like `ls;pwd` still yield "ls" while
// never absorbing an argument or secret into the token itself.
const BARE_TOKEN = /^([a-zA-Z][\w-]*)(?=[\s;&|<>()]|$)/;

/**
 * Derives a privacy-safe command "family" fingerprint from a NORMALIZED command
 * (see {@link normalizeCommand}) for per-command savings attribution (#251).
 *
 * Returns the leading bare token, plus the second bare token when the first is a
 * known subcommand dispatcher (`git diff`). A "bare token" is a run of letters/
 * digits/`-`/`_` terminated by whitespace, a shell operator, or end-of-string —
 * so extraction stops at the first flag, path, quote, `=`, pipe, or redirection
 * and an argument or secret (a URL with credentials, an auth header value) can
 * NEVER enter the fingerprint. Leading `VAR=value` env assignments and leading
 * wrapper commands (`sudo`/`doas`/`time`/`nice`, when directly followed by a bare
 * verb) are skipped first, and discarded, so a secret in a value can't leak and
 * `sudo git diff` fingerprints as `git diff`. A *flagged* wrapper (`sudo -u www …`)
 * is left intact — its argument span isn't safely parseable — so it keeps the
 * wrapper name. Returns "" when no bare leading token exists (subshell,
 * `./script`, …); callers store that as unknown.
 */
export function commandFingerprint(command: string): string {
  // Strip leading env-var assignments; discarded, never stored.
  let c = command.trim().replace(/^(?:[A-Za-z_]\w*=\S*\s+)+/, "");
  // Skip leading wrapper commands when directly followed by another bare verb.
  // Bounded loop (chained wrappers are rare); bails on a flagged wrapper.
  for (let i = 0; i < 4; i++) {
    const w = c.match(/^([a-zA-Z][\w-]*)\s+(?=[a-zA-Z])/);
    if (!w || !WRAPPER_TOOLS.has(w[1]!)) break;
    c = c.slice(w[0].length);
  }
  const first = c.match(BARE_TOKEN);
  if (!first) return "";
  const verb = first[1]!;
  if (!SUBCOMMAND_TOOLS.has(verb)) return verb;
  const second = c.slice(verb.length).trimStart().match(BARE_TOKEN);
  return second ? `${verb} ${second[1]!}` : verb;
}

/** Output up to this size from a content read is delivered whole (#327, #332). */
export const READ_PASSTHROUGH_MAX_BYTES = 8 * 1024;

/**
 * `command` split at every `|`, `||`, `;`, `&&`, `&` and newline outside quotes,
 * escapes and `( … )`, so a quoted remote command (`ssh h 'cat f | head'`) stays
 * one segment until it is unwrapped.
 */
function splitTopLevel(command: string): string[] {
  const parts: string[] = [];
  let quote: string | null = null;
  let depth = 0;
  let start = 0;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
    if (quote === "'") {
      if (ch === "'") quote = null;
    } else if (ch === "\\") {
      i++;
    } else if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
    } else if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0 && (ch === "|" || ch === ";" || ch === "&" || ch === "\n")) {
      parts.push(command.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(command.slice(start));
  return parts.filter((p) => p.trim() !== "");
}

/**
 * The quote-aware commands in `command`, each without its `cd`/wrapper prefixes.
 * A segment that unwraps to a command line of its own (`ssh h 'cat f | head'`)
 * is split again, a bounded number of times.
 */
function unwrappedSegments(command: string, depth = 0): string[] {
  return splitTopLevel(command).flatMap((part) => {
    const c = normalizeCommand(part);
    return depth < 3 && splitTopLevel(c).length > 1 ? unwrappedSegments(c, depth + 1) : [c];
  });
}

/**
 * The commands in `command`, each without its `cd`/wrapper prefixes: the
 * {@link unwrappedSegments}, plus a split that ignores quoting. The second finds
 * a read no unwrap reaches (`for h in a b; do ssh $h '… | head'`, a multi-range
 * `sed -n '1,5p;9,12p'`). Missing a read summarizes lines Claude asked for; a
 * false one (`echo "x | head"`) delivers at most READ_PASSTHROUGH_MAX_BYTES.
 */
function commandSegments(command: string): string[] {
  const unquoted = command.split(/\||;|&&|\n/).map((part) => normalizeCommand(part));
  return [...unwrappedSegments(command), ...unquoted];
}

// A sed line address: a number, a shell expansion the shell turns into one
// (`$n`, `${n}`, `$((n+40))`), or a bare `$` for the last line. A command
// substitution `$(…)` is not matched: commandSegments splits on its pipes.
const SED_LINE = String.raw`(?:\d+|\$(?:\w+|\{\w+\}|\(\([^()]*\)\))|\$)`;
/** `sed -n` printing one line or a line range (`N,M`, `N,$`, `N,+M`). */
const SED_LINE_RANGE = new RegExp(
  String.raw`^sed\s+(?:-\S+\s+)*-n\s+['"]?${SED_LINE}(?:,\s*\+?${SED_LINE})?p['"]?(\s|$)`
);

/**
 * True when any command in `command` limits its own output: `head`/`tail`, a
 * `sed -n` line range, or grep context and match limits (`-A/-B/-C N`, `-m N`).
 * That output is what Claude asked for, so a summary would drop requested lines
 * (#327).
 */
export function isBoundedRead(command: string): boolean {
  return commandSegments(command).some((s) => {
    if (/^(head|tail)(\s|$)/.test(s)) return true;
    if (SED_LINE_RANGE.test(s)) return true;
    return /^(grep|egrep|fgrep|rg|ag|git\s+grep)\s/.test(s) &&
      /\s(-[a-zA-Z]*[ABCm]\s*\d+|--(?:after-|before-)?context[=\s]\d+|--max-count[=\s]\d+)/.test(s);
  });
}

/**
 * True when `command` reads content for Claude: a bounded read, `cat`,
 * `git diff`/`git show`, or a patch from `git log -p`/`git stash show -p`. Their summaries keep stats or a head and tail, which
 * drops what Claude asked for, so the hook delivers small ones whole and
 * `balanced` retention keeps the body of large ones (#332).
 */
export function isContentRead(command: string): boolean {
  return isBoundedRead(command) ||
    commandSegments(command).some((s) => /^(cat|git\s+(diff|show))(\s|$)/.test(s) ||
      /^git\s+(log|stash\s+show)(\s.*)?\s(-p|--patch|-u)(\s|$)/.test(s));
}

/**
 * True when `command` runs more than one command in sequence: a `;`, `&&`, `||`
 * or newline outside quotes, escapes and `( … )`/`$( … )`, with a command after
 * it. A pipe is not a separator: it yields one output stream.
 */
export function isCompoundCommand(command: string): boolean {
  let quote: string | null = null;
  let depth = 0;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
    if (quote === "'") {
      if (ch === "'") quote = null;
      continue;
    }
    if (ch === "\\") {
      i++;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      const pair = command.slice(i, i + 2);
      const width = pair === "&&" || pair === "||" ? 2 : ch === ";" || ch === "\n" ? 1 : 0;
      if (width > 0 && command.slice(i + width).trim() !== "") return true;
    }
  }
  return false;
}

// Compound-command windows: wide enough that a typical multi-command diagnostic
// (a few short sections) passes through whole, since every section is a
// separate answer and any one may be the one needed.
const COMPOUND_HEAD_LINES = 30;
const COMPOUND_TAIL_LINES = 15;

/**
 * Several commands produce several outputs, so no single command's handler
 * fits (#308): an `ls` handler on `ls …; git diff | wc -c` dropped the second
 * result. Short output is returned whole bar its over-wide lines (#349), so
 * the hook usually passes it through unstored; long output keeps head, tail
 * and the error lines between.
 */
export const compoundHandler: Handler = (
  _toolName: string,
  output: unknown
): CompressionResult => {
  const text = bashOutputText(output);
  const originalSize = Buffer.byteLength(text, "utf8");
  const lines = text.split("\n");
  if (lines.length <= COMPOUND_HEAD_LINES + COMPOUND_TAIL_LINES) {
    return { summary: lines.map((l) => clipLine(l)).join("\n"), originalSize };
  }
  const window = summarizeLineWindow(lines, COMPOUND_HEAD_LINES, COMPOUND_TAIL_LINES);
  return { summary: `[bash · compound command · ${lines.length} lines]\n${window}`, originalSize };
};

/**
 * Returns the appropriate handler for a native Bash tool call based on the
 * command string in `tool_input`. Falls back to the shell handler when no
 * CLI-specific handler matches.
 */
export function getBashHandler(input: unknown): Handler {
  const rawCommand = extractCommand(input);
  if (!rawCommand) return shellHandler;
  const command = normalizeCommand(rawCommand);

  if (isCompoundCommand(command)) return compoundHandler;

  if (/^git\s+grep(\s|$)/.test(command)) return grepHandler;
  if (/^git\s+(diff|show)(\s|$)/.test(command)) return gitDiffHandler;
  if (/^git\s+log(\s|$)/.test(command)) return gitLogHandler;
  if (/^git\s+status(\s|$)/.test(command)) return gitStatusHandler;
  if (/^git\s+branch(\s|$)/.test(command)) return gitRefsHandler;
  if (/^git\s+stash\s+list(\s|$)/.test(command)) return gitRefsHandler;
  if (/^git\s+remote(\s|$)/.test(command)) return gitRefsHandler;
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
  // Compiler / linter diagnostics (build, typecheck, lint). Safe to route
  // broadly: the handler falls back to shell when it finds no diagnostics.
  if (/^cargo\s+(build|check|clippy)(\s|$)/.test(command)) return compilerDiagnosticsHandler;
  if (/^go\s+(build|vet)(\s|$)/.test(command)) return compilerDiagnosticsHandler;
  if (/^(npx\s+)?tsc(\s|$)/.test(command)) return compilerDiagnosticsHandler;
  if (/^(npx\s+)?eslint(\s|$)/.test(command)) return compilerDiagnosticsHandler;
  if (/^ruff(\s|$)/.test(command)) return compilerDiagnosticsHandler;
  if (/^(npm|pnpm|yarn|bun)\s+run\s+(typecheck|lint|build|check)(\s|$)/.test(command))
    return compilerDiagnosticsHandler;
  // Search / listing — bulk is length, not structure. Handlers report the count
  // + a capped sample and fall back to shell on an unexpected shape.
  if (/^(grep|egrep|fgrep|rg|ag)(\s|$)/.test(command)) return grepHandler;
  if (/^ls(\s|$)/.test(command)) return lsHandler;
  if (/^(find|fd)(\s|$)/.test(command)) return findHandler;

  return shellHandler;
}

/**
 * Handlers that read stderr themselves. Test runners, compilers and make report
 * there (`bun test` prints its results on stderr), so empty stdout is normal.
 */
const READS_STDERR = new Set<Handler>([
  shellHandler, compoundHandler, testRunnerHandler, buildToolHandler,
  compilerDiagnosticsHandler, packageInstallHandler,
]);

/**
 * A command with empty stdout and a non-empty stderr failed, though inside a
 * pipeline it still exits 0. A handler that summarises stdout would report that
 * as "no matches" or "no changes", so the shell handler, which keeps stderr, is
 * used instead (#326). New handlers get this by default.
 */
export function keepStderrError(handler: Handler, output: unknown): Handler {
  if (READS_STDERR.has(handler)) return handler;
  return !extractStdout(output).trim() && extractStderr(output).trim() ? shellHandler : handler;
}
