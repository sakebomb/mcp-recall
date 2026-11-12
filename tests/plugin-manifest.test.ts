import { describe, it, expect } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

// The plugin marketplace install (docs/install.md, Option B) needs a marketplace
// manifest at the repo root, and the docs must use commands that match it (#465).

const ROOT = path.resolve(import.meta.dir, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

interface MarketplaceEntry { name: string; source: string }
const marketplace = JSON.parse(read(".claude-plugin/marketplace.json")) as {
  name: string;
  owner: { name: string };
  plugins: MarketplaceEntry[];
};

/** Every fenced or inline `claude plugin …` command in the user-facing docs. */
function documentedCommands(prefix: string): string[] {
  const docs = ["README.md", ...["install.md", "troubleshooting.md"].map((f) => `docs/${f}`)];
  return docs.flatMap((d) => read(d).split("\n"))
    .map((line) => line.replace(/`/g, "").trim())
    .filter((line) => line.startsWith(prefix))
    .map((line) => line.replace(/\s+#.*$/, ""));
}

describe("plugin marketplace manifest (#465)", () => {
  it("names the marketplace and its owner", () => {
    expect(marketplace.name).toBe("mcp-recall");
    expect(marketplace.owner.name).toBeTruthy();
    expect(marketplace.plugins.length).toBeGreaterThan(0);
  });

  it("points each plugin at a directory whose plugin.json has the same name", () => {
    for (const entry of marketplace.plugins) {
      const manifest = path.join(ROOT, entry.source, ".claude-plugin", "plugin.json");
      expect(existsSync(manifest)).toBe(true);
      expect(JSON.parse(readFileSync(manifest, "utf8")).name).toBe(entry.name);
    }
  });

  it("documents `marketplace add` with the single source Claude Code accepts", () => {
    const adds = documentedCommands("claude plugin marketplace add ");
    expect(adds.length).toBeGreaterThan(0);
    for (const cmd of adds) expect(cmd.split(/\s+/)).toEqual(["claude", "plugin", "marketplace", "add", "sakebomb/mcp-recall"]);
  });

  it("documents installs as <plugin>@<marketplace> names the manifest defines", () => {
    const installs = documentedCommands("claude plugin install ");
    expect(installs.length).toBeGreaterThan(0);
    const ids = marketplace.plugins.map((p) => `${p.name}@${marketplace.name}`);
    for (const cmd of installs) expect(ids).toContain(cmd.split(/\s+/)[3]);
  });
});

// Claude Code runs a hook command through a shell, so an unquoted ${CLAUDE_PLUGIN_ROOT}
// splits on a plugin path with a space and the hook never runs (#468).
describe.skipIf(process.platform === "win32")("plugin hook commands (#468)", () => {
  const hookCommands = (file: string): string[] => {
    const { hooks } = JSON.parse(read(file)) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    };
    return Object.values(hooks).flat().flatMap((group) => group.hooks.map((h) => h.command));
  };

  for (const file of ["hooks/hooks.json", "plugins/mcp-recall/hooks/hooks.json"]) {
    it(`${file} reaches bin/recall from a plugin root with a space`, () => {
      const base = mkdtempSync(path.join(tmpdir(), "recall hooks "));
      try {
        const root = path.join(base, "plugin root");
        mkdirSync(path.join(root, "bin"), { recursive: true });
        const recall = path.join(root, "bin", "recall");
        writeFileSync(recall, '#!/bin/sh\nprintf "%s\\n" "$@"\n');
        chmodSync(recall, 0o755);

        const commands = hookCommands(file);
        expect(commands.length).toBe(2);
        for (const command of commands) {
          const subcommand = command.split(/\s+/).at(-1);
          // Claude Code may expand the placeholder itself or leave it to the shell; both must work.
          for (const script of [command, command.replaceAll("${CLAUDE_PLUGIN_ROOT}", root)]) {
            const run = Bun.spawnSync(["sh", "-c", script], {
              env: { PATH: process.env.PATH ?? "", CLAUDE_PLUGIN_ROOT: root },
            });
            expect(run.stdout.toString()).toBe(`${subcommand}\n`);
          }
        }
      } finally {
        rmSync(base, { recursive: true, force: true });
      }
    });
  }
});
