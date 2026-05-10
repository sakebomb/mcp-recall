import type { CompressionResult, Handler } from "./types";
import { extractText } from "./types";
import { shellHandler } from "./shell";
import { extractStdout, extractStderr, MAX_BUILD_ERRORS } from "./bash-shared";

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
