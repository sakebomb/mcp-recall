import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/**
 * scripts/check-dco.sh, run against a throwaway repository. The DCO workflow is the
 * only thing that enforces sign-off, so each case asserts the exit code and which
 * commit the script names, not just that it ran.
 */
const SCRIPT = join(import.meta.dir, "..", "scripts", "check-dco.sh");
const ALICE = { name: "Alice Example", email: "alice@example.com" };
const BOT = { name: "dependabot[bot]", email: "49699333+dependabot[bot]@users.noreply.github.com" };

let repo: string;
let n = 0;

function git(args: string[], author = ALICE) {
  const r = Bun.spawnSync(["git", ...args], {
    cwd: repo,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: author.name, GIT_AUTHOR_EMAIL: author.email,
      GIT_COMMITTER_NAME: author.name, GIT_COMMITTER_EMAIL: author.email,
      GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
    },
  });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
  return r.stdout.toString().trim();
}

function commit(message: string, author = ALICE) {
  writeFileSync(join(repo, `f${n++}`), "x");
  git(["add", "."], author);
  git(["commit", "-q", "-m", message], author);
  return git(["rev-parse", "HEAD"]);
}

function check(base: string) {
  const r = Bun.spawnSync(["bash", SCRIPT, base, "HEAD"], { cwd: repo });
  return { code: r.exitCode, err: r.stderr.toString() };
}

describe("check-dco.sh", () => {
  let base: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "dco-"));
    git(["init", "-q", "-b", "main"]);
    base = commit("base, unsigned and outside the range");
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  test("passes when every commit is signed off by its author", () => {
    commit(`one\n\nSigned-off-by: ${ALICE.name} <${ALICE.email}>`);
    commit(`two\n\nbody\n\nSigned-off-by: ${ALICE.name} <${ALICE.email}>`);
    expect(check(base).code).toBe(0);
  });

  test("fails and names the commit with no sign-off", () => {
    commit(`signed\n\nSigned-off-by: ${ALICE.name} <${ALICE.email}>`);
    commit("unsigned change");
    const r = check(base);
    expect(r.code).toBe(1);
    expect(r.err.match(/missing sign-off/g)).toHaveLength(1);
    expect(r.err).toContain("unsigned change");
  });

  test("fails when the sign-off names someone other than the author", () => {
    commit("borrowed\n\nSigned-off-by: Bob Other <bob@example.com>");
    const r = check(base);
    expect(r.code).toBe(1);
    expect(r.err).toContain("borrowed");
  });

  test("fails when the sign-off appears only inside a line, not as a trailer line", () => {
    commit(`mentions it\n\nsee Signed-off-by: ${ALICE.name} <${ALICE.email}> in the docs`);
    expect(check(base).code).toBe(1);
  });

  test("exempts bot commits", () => {
    commit("Bump zod", BOT);
    expect(check(base).code).toBe(0);
  });

  test("does not exempt a person who only names themselves a bot", () => {
    commit("sneaky", { name: "alice[bot]", email: ALICE.email });
    const r = check(base);
    expect(r.code).toBe(1);
    expect(r.err).toContain("sneaky");
  });

  test("ignores merge commits but still checks the commits they bring in", () => {
    git(["checkout", "-q", "-b", "side"]);
    commit("side change, unsigned");
    git(["checkout", "-q", "main"]);
    commit(`main change\n\nSigned-off-by: ${ALICE.name} <${ALICE.email}>`);
    git(["merge", "-q", "--no-ff", "-m", "merge side", "side"]);
    const r = check(base);
    expect(r.code).toBe(1);
    expect(r.err).toContain("side change, unsigned");
    expect(r.err).not.toContain("merge side");
  });

  test("rejects a call without both revisions", () => {
    const r = Bun.spawnSync(["bash", SCRIPT, base], { cwd: repo });
    expect(r.exitCode).toBe(2);
  });
});
