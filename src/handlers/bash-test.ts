import type { CompressionResult, Handler } from "./types";
import { shellHandler } from "./shell";
import { bashOutputText, extractStdout, extractStderr, MAX_BUILD_ERRORS } from "./bash-shared";

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
  const originalSize = Buffer.byteLength(bashOutputText(output), "utf8");

  // Collect failure blocks — lines that look like test failures/errors, plus the
  // message lines that say why (#308): a name alone does not tell Claude what to fix.
  // Message lines alone never decide the status: a passing run can print
  // `error: …` from the code under test.
  const failureLines: string[] = [];
  let failureNames = 0, passLines = 0, failLines = 0;
  for (const line of combined.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (/^\(pass\)\s/.test(t)) passLines++;
    if (/^\(fail\)\s/.test(t)) failLines++;
    // pytest: FAILED src/test.py::test_name
    // jest/vitest: ✕ / ✗ / × test name  or  ● test name
    // bun: (fail) suite > test name
    const isName = /^(FAILED|FAIL)\s+/.test(t) ||
      /^[✕✗×●]\s/.test(t) ||
      /^\(fail\)\s/.test(t) ||
      /^--- FAIL:/.test(t);
    // bun's `error: …` precedes its (fail) line; pytest's `E   assert …` follows FAILED.
    const isMessage = /^error:\s/.test(t) || /^E\s{2,}\S/.test(line);
    if (isName) failureNames++;
    if (isName || isMessage) failureLines.push(t.slice(0, 120));
  }

  // Try to find a summary line
  let passed = 0, failed = 0, skipped = 0;
  let ranTotal: number | undefined;
  let foundSummary = false;

  for (const line of combined.split("\n")) {
    const t = line.trim();

    // bun: "X pass\nY fail" … "Ran N tests across M files."
    const bunPass = t.match(/^(\d+)\s+pass$/);
    const bunFail = t.match(/^(\d+)\s+fail$/);
    const bunRan = t.match(/^Ran\s+(\d+)\s+tests?\s+across\b/);
    if (bunPass) { passed = parseInt(bunPass[1]!); foundSummary = true; }
    if (bunFail) { failed = parseInt(bunFail[1]!); foundSummary = true; }
    if (bunRan) { ranTotal = parseInt(bunRan[1]!); foundSummary = true; }

    // pytest: "1 failed, 5 passed, 1 skipped, 2 warnings in 1.23s". The order
    // varies (pytest puts failed first), so read each count on its own (#308).
    if (/\b\d+\s+(?:passed|failed)\b.*\bin\s+\d+(?:\.\d+)?s\b/.test(t)) {
      const count = (word: string) => parseInt(t.match(new RegExp(String.raw`(\d+)\s+${word}\b`))?.[1] ?? "0");
      passed = count("passed");
      failed = count("failed");
      skipped = count("skipped");
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

  if (!foundSummary && failureNames === 0) {
    return shellHandler(toolName, output);
  }

  // Without count lines (output cut by `tail`, or grepped), count bun's
  // per-test lines rather than report nothing.
  if (passed === 0) passed = passLines;
  if (failed === 0) failed = failLines;
  // A partial view must not invent a total: prefer the runner's own (#308).
  const total = ranTotal ?? passed + failed + skipped;
  // A failing test's name always means FAIL, even when no count line survived.
  const isFail = failed > 0 || failureNames > 0;
  const status = isFail ? "FAIL" : "pass";
  const parts: string[] = [];
  if (passed > 0) parts.push(`${passed} passed`);
  if (failed > 0) parts.push(`${failed} failed`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  const summaryStr = parts.length > 0 ? parts.join(", ") : "no results";

  const lines = [`test runner — ${status}: ${summaryStr}${total > 0 ? ` (${total} total)` : ""}`];
  if (isFail && failureLines.length > 0) {
    lines.push(`  failures:`);
    lines.push(...failureLines.slice(0, MAX_BUILD_ERRORS).map(l => `    ${l}`));
    if (failureLines.length > MAX_BUILD_ERRORS) {
      lines.push(`    … (+${failureLines.length - MAX_BUILD_ERRORS} more)`);
    }
  }

  return { summary: lines.join("\n"), originalSize };
};
