import { test, expect, describe } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { Glob } from "bun";
import { RecallConfigSchema } from "../src/config";
import { printHelp } from "../src/cli";

// Doc-coverage guard (#227). Derives four inventories from source of truth and
// asserts each surface is named in its canonical doc location. This catches
// *silence* — a tool / config key / env var / command that exists in code and is
// documented nowhere — which has recurred four times (#216, #225×3) and been
// invisible to every other CI job.
//
// Design rule (learned the hard way in #225): match against PARSED STRUCTURE, not
// a whole-file substring. A naive `grep -q "$key"` passed for `key`/`enabled`
// because those words appear in prose. Every check below parses the specific
// table rows, TOML `key =` lines, or fenced command block — never "does this
// string appear somewhere in the file." Prose *accuracy* (does the flag do what
// the sentence claims) stays a review concern and is deliberately out of scope.

const readme = readFileSync("README.md", "utf8");

// ── Markdown structure helpers ──────────────────────────────────────────────

/** Body of a README `## <header>` section, up to the next `## ` heading. */
function section(md: string, header: string): string {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => l.trim() === `## ${header}`);
  if (start === -1) throw new Error(`README section "## ${header}" not found`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

/** Contents of the first ```<lang> fenced block in `body`. */
function firstFence(body: string, lang: string): string {
  const m = body.match(new RegExp("```" + lang + "\\n([\\s\\S]*?)```"));
  if (!m) throw new Error(`no \`\`\`${lang} fence found in the given section`);
  return m[1];
}

/**
 * Asserts every source surface is documented. A miss names the exact surface, so
 * a contributor knows precisely what to add. Also fails if the source inventory
 * came back empty — a broken extractor would otherwise pass vacuously, which is
 * the very false-confidence failure this guard exists to prevent.
 */
function assertAllDocumented(surfaces: string[], documented: string[], where: string): void {
  expect(surfaces.length, `source inventory for ${where} is empty — the extractor is broken`).toBeGreaterThan(0);
  for (const s of surfaces) {
    expect(documented, `"${s}" exists in source but is undocumented in ${where}`).toContain(s);
  }
}

// ── recall__* tools ─────────────────────────────────────────────────────────

describe("docs coverage: recall__* tools", () => {
  const serverSrc = readFileSync("src/server.ts", "utf8");
  const registered = [...serverSrc.matchAll(/server\.tool\(\s*"(recall__\w+)"/g)].map((m) => m[1]);

  test("every registered tool appears in the README tool table", () => {
    const rows = [...section(readme, "Tools").matchAll(/^\|\s*`(recall__\w+)/gm)].map((m) => m[1]);
    assertAllDocumented(registered, rows, "the README `## Tools` table");
  });

  test("every registered tool has a heading in docs/tools.md", () => {
    const doc = readFileSync("docs/tools.md", "utf8");
    const headings = [...doc.matchAll(/^##\s+`(recall__\w+)`/gm)].map((m) => m[1]);
    assertAllDocumented(registered, headings, "docs/tools.md section headings");
  });
});

// ── config keys ─────────────────────────────────────────────────────────────

describe("docs coverage: config keys", () => {
  // Leaf keys from the Zod schema itself, not a grep — the true source of truth.
  const leafKeys: string[] = [];
  for (const sectionSchema of Object.values(RecallConfigSchema.shape)) {
    for (const key of Object.keys((sectionSchema as { shape: Record<string, unknown> }).shape)) {
      leafKeys.push(key);
    }
  }

  test("every schema key appears as a key = line in the README config block", () => {
    const toml = firstFence(section(readme, "Configuration"), "toml");
    const documented = [...toml.matchAll(/^\s*([a-z_]+)\s*=/gm)].map((m) => m[1]);
    assertAllDocumented(leafKeys, documented, "the README `## Configuration` TOML block");
  });
});

// ── environment variables ───────────────────────────────────────────────────

describe("docs coverage: environment variables", () => {
  // Env vars intentionally undocumented (internal/test-only). Empty today; adding
  // a name here is the explicit escape hatch, so the omission is a decision on
  // record rather than silence.
  const INTERNAL_ENV_VARS = new Set<string>([]);

  test("every RECALL_* env var read by source is in the README env-var table", () => {
    let source = readFileSync("bin/recall", "utf8");
    for (const file of new Glob("**/*.ts").scanSync("src")) {
      source += readFileSync(join("src", file), "utf8");
    }
    const used = [...new Set([...source.matchAll(/RECALL_[A-Z_]+/g)].map((m) => m[0]))].filter(
      (v) => !INTERNAL_ENV_VARS.has(v),
    );
    const documented = [...section(readme, "Configuration").matchAll(/^\|\s*`(RECALL_[A-Z_]+)`/gm)].map((m) => m[1]);
    assertAllDocumented(used, documented, "the README environment-variable table");
  });
});

// ── top-level CLI commands ──────────────────────────────────────────────────

describe("docs coverage: CLI commands", () => {
  // The `subcommand === "…"` dispatch chain in cli.ts. The internal hook
  // dispatches (session-start, post-tool-use) use a `case` switch, not this
  // form, so they are correctly excluded from the user-facing command set.
  const cliSrc = readFileSync("src/cli.ts", "utf8");
  const commands = [...new Set([...cliSrc.matchAll(/subcommand === "([a-z-]+)"/g)].map((m) => m[1]))];

  test("every command is listed by printHelp()", () => {
    const orig = console.log;
    let out = "";
    console.log = (...args: unknown[]) => {
      out += args.join(" ") + "\n";
    };
    try {
      printHelp();
    } finally {
      console.log = orig;
    }
    // printHelp lists commands as indented "  <name>  …" lines; match those.
    const listed = [...out.matchAll(/^ {2}([a-z-]+)\b/gm)].map((m) => m[1]);
    assertAllDocumented(commands, listed, "printHelp() output");
  });

  test("every command appears in the README CLI reference", () => {
    const fence = firstFence(section(readme, "CLI reference"), "bash");
    const documented = [...new Set([...fence.matchAll(/^mcp-recall\s+([a-z]+)/gm)].map((m) => m[1]))];
    assertAllDocumented(commands, documented, "the README `## CLI reference` block");
  });
});
