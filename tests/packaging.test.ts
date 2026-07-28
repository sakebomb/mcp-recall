import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, symlinkSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";

/**
 * Guards the packaged artifact, invoked the way users actually invoke it.
 *
 * #216: `bin/recall` computed its location with `dirname "$0"`, which does not
 * follow symlinks. npm and bun install a `bin` entry as a symlink, so every real
 * entry point — npx, bunx, global install — resolved `src/cli.ts` against
 * `node_modules/.bin/` and failed, while a direct call worked. Two releases
 * shipped that way because nothing here ran the binary through a symlink:
 * `tests/cli.test.ts` imports `getVersion` in-process, which cannot catch it.
 */
const REPO = join(import.meta.dir, "..");
const BIN = join(REPO, "bin", "recall");
const EXPECTED = (JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as { version: string }).version;

let work: string;

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "recall-pack-"));
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

function run(cmd: string[]): { code: number | null; out: string } {
  const p = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" });
  return {
    code: p.exitCode,
    out: (new TextDecoder().decode(p.stdout) + new TextDecoder().decode(p.stderr)).trim(),
  };
}

describe("packaged CLI entrypoint", () => {
  test("runs when invoked directly", () => {
    const { code, out } = run([BIN, "--version"]);
    expect(code).toBe(0);
    expect(out).toContain(EXPECTED);
  });

  // The regression case. Mirrors node_modules/.bin/mcp-recall -> ../mcp-recall/bin/recall:
  // a RELATIVE link, from a sibling directory, which is what npm creates.
  test("runs when invoked through a relative symlink, as npm and bunx do", () => {
    const pkgDir = join(work, "node_modules", "mcp-recall");
    const binDir = join(work, "node_modules", ".bin");
    mkdirSync(pkgDir, { recursive: true });
    mkdirSync(binDir, { recursive: true });
    // Stand in for the installed package: symlink the repo's own tree into place,
    // so the test exercises the shipped bin/ + src/ rather than a copy.
    symlinkSync(join(REPO, "bin"), join(pkgDir, "bin"));
    symlinkSync(join(REPO, "src"), join(pkgDir, "src"));
    symlinkSync(join(REPO, "package.json"), join(pkgDir, "package.json"));
    symlinkSync(join(REPO, "node_modules"), join(pkgDir, "node_modules"));

    const link = join(binDir, "mcp-recall");
    symlinkSync(join("..", "mcp-recall", "bin", "recall"), link);

    const { code, out } = run([link, "--version"]);
    expect(code).toBe(0);
    expect(out).toContain(EXPECTED);
    // The old failure mode resolved src/ against .bin/ — assert we are not back there.
    expect(out).not.toContain("Module not found");
  });

  test("runs through a chain of symlinks", () => {
    const outer = join(work, "outer-link");
    const inner = join(work, "inner-link");
    symlinkSync(BIN, inner);
    symlinkSync(inner, outer);

    const { code, out } = run([outer, "--version"]);
    expect(code).toBe(0);
    expect(out).toContain(EXPECTED);
  });

  test("bin entry named in package.json exists and is executable", () => {
    const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as {
      bin: Record<string, string>;
    };
    for (const target of Object.values(pkg.bin)) {
      const p = join(REPO, target);
      expect(existsSync(p)).toBe(true);
      // A bin that isn't executable fails only once installed.
      expect(run(["test", "-x", p]).code).toBe(0);
    }
  });

  test("package.json files list covers the bin's runtime dependency", () => {
    const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as {
      files: string[];
      bin: Record<string, string>;
    };
    // bin/recall execs src/cli.ts, so both trees must ship or the CLI breaks only
    // for installed users — invisible to a repo-local run.
    const covered = (p: string) => pkg.files.some((f) => p.startsWith(f.replace(/\/$/, "")));
    expect(covered("bin")).toBe(true);
    expect(covered("src")).toBe(true);
    for (const target of Object.values(pkg.bin)) {
      expect(covered(target.replace(/^\.\//, "").split("/")[0]!)).toBe(true);
    }
    void dirname;
  });
});
