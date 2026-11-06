import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, symlinkSync, readFileSync, existsSync, cpSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Guards the packaged artifact, invoked the way users actually invoke it.
 *
 * #216: `bin/recall` located `src/cli.ts` with `dirname "$0"`, which does not
 * follow symlinks. npm and bun install a `bin` entry as a symlink, so every real
 * entry point — npx, bunx, global install — resolved against `node_modules/.bin/`
 * and failed, while a direct call worked. Two releases shipped that way because
 * nothing here ran the binary through a symlink: `tests/cli.test.ts` imports
 * `getVersion` in-process, which cannot catch it.
 *
 * Deliberately does NOT `npm install` a real tarball: that would fetch runtime
 * dependencies and make the suite network-dependent, which #203 just removed.
 * The layout below is assembled by hand to match what npm produces.
 */
const REPO = join(import.meta.dir, "..");
const BIN = join(REPO, "bin", "recall");
const PLUGIN_BIN = join(REPO, "plugins", "mcp-recall", "bin", "recall");
const PKG = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as {
  version: string;
  files: string[];
  bin: Record<string, string>;
};

let work: string;
let installedLink: string;

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "recall-pack-"));

  // Mirror an installed tree: node_modules/mcp-recall/{bin,src} with the bin entry
  // symlinked from a sibling .bin/ by a RELATIVE path, which is what npm creates.
  const pkgDir = join(work, "node_modules", "mcp-recall");
  const binDir = join(work, "node_modules", ".bin");
  mkdirSync(pkgDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });

  // COPIED, not symlinked. If `bin/` were itself a link, `cd -P` would resolve
  // straight back into the real repo and the test would not exercise the installed
  // layout at all. Copying also keeps cleanup from ever reaching the working tree.
  cpSync(join(REPO, "bin"), join(pkgDir, "bin"), { recursive: true });
  cpSync(join(REPO, "src"), join(pkgDir, "src"), { recursive: true });
  cpSync(join(REPO, "package.json"), join(pkgDir, "package.json"));
  cpSync(join(REPO, "plugins", "mcp-recall", "dist"), join(pkgDir, "plugins", "mcp-recall", "dist"), {
    recursive: true,
  });
  // Only node_modules is linked, since deps must resolve and copying them is
  // wasteful. It is the sole link under `work`, and `fs.rm` unlinks rather than
  // traverses — see the afterAll note.
  symlinkSync(join(REPO, "node_modules"), join(pkgDir, "node_modules"));

  installedLink = join(binDir, "mcp-recall");
  symlinkSync(join("..", "mcp-recall", "bin", "recall"), installedLink);
});

afterAll(() => {
  // Safe against the node_modules link above only because fs.rm unlinks symlinks
  // instead of following them. Do not swap this for a shell `rm -rf` helper that
  // dereferences — it would delete the repo's own node_modules.
  rmSync(work, { recursive: true, force: true });
});

function run(cmd: string[], cwd?: string): { code: number | null; out: string } {
  const p = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe", ...(cwd ? { cwd } : {}) });
  return {
    code: p.exitCode,
    out: (new TextDecoder().decode(p.stdout) + new TextDecoder().decode(p.stderr)).trim(),
  };
}

describe("packaged CLI entrypoint", () => {
  test("runs when invoked directly", () => {
    const { code, out } = run([BIN, "--version"]);
    expect(code).toBe(0);
    expect(out).toContain(PKG.version);
  });

  // The regression case for #216.
  test("runs when invoked through a relative symlink, as npm and bunx do", () => {
    const { code, out } = run([installedLink, "--version"]);
    expect(code).toBe(0);
    expect(out).toContain(PKG.version);
    // The old failure resolved src/ against .bin/ — assert we are not back there.
    expect(out).not.toContain("Module not found");
  });

  // --version alone would not have caught a break in path resolution *inside* the
  // CLI. `install` is the journey #216 actually blocked: it is how hooks and the
  // MCP server get registered, and it resolves plugins/mcp-recall/dist/ itself.
  test("install --dry-run works through the installed symlink", () => {
    const { code, out } = run([installedLink, "install", "--dry-run"], work);
    expect(code).toBe(0);
    expect(out).not.toContain("Module not found");
    expect(out).not.toContain("no such file");
  });

  test("runs through a chain of symlinks", () => {
    const inner = join(work, "inner-link");
    const outer = join(work, "outer-link");
    symlinkSync(BIN, inner);
    symlinkSync(inner, outer);

    const { code, out } = run([outer, "--version"]);
    expect(code).toBe(0);
    expect(out).toContain(PKG.version);
  });

  // Same latent defect lived here; kept covered so the two wrappers can't diverge.
  test("the plugin wrapper also survives a symlink", () => {
    const link = join(work, "plugin-link");
    symlinkSync(PLUGIN_BIN, link);

    const { code, out } = run([link, "--version"]);
    expect(code).toBe(0);
    expect(out).toContain(PKG.version);
    expect(out).not.toContain("Module not found");
  });

  test("bin entries named in package.json exist and are executable", () => {
    for (const target of Object.values(PKG.bin)) {
      const p = join(REPO, target);
      expect(existsSync(p)).toBe(true);
      // A bin that isn't executable fails only once installed.
      expect(run(["test", "-x", p]).code).toBe(0);
    }
  });

  test("package.json files list covers the bin and its runtime dependency", () => {
    // Exact match or a true path-segment prefix. `p.startsWith(f)` alone would let
    // files: ["b"] satisfy "bin".
    const covered = (p: string) =>
      PKG.files.some((raw) => {
        const f = raw.replace(/\/$/, "");
        return f === p || p.startsWith(`${f}/`);
      });

    // bin/recall execs src/cli.ts, so both trees must ship or the CLI breaks only
    // for installed users — invisible to a repo-local run.
    expect(covered("bin")).toBe(true);
    expect(covered("src")).toBe(true);
    expect(covered("src/cli.ts")).toBe(true);
    for (const target of Object.values(PKG.bin)) {
      expect(covered(target.replace(/^\.\//, ""))).toBe(true);
    }
    // Guard the helper itself against the reversed-prefix bug.
    expect(covered("b")).toBe(false);
  });

  test("every manifest names the licence in LICENSE, and LICENSE and NOTICE ship", () => {
    const manifests = ["package.json", ".claude-plugin/plugin.json", "plugins/mcp-recall/.claude-plugin/plugin.json"];
    for (const m of manifests) {
      expect(JSON.parse(readFileSync(join(REPO, m), "utf8")).license).toBe("Apache-2.0");
    }
    expect(readFileSync(join(REPO, "LICENSE"), "utf8")).toContain("Apache License\n                           Version 2.0, January 2004");
    expect(PKG.files).toContain("LICENSE");
    expect(PKG.files).toContain("NOTICE");
    expect(existsSync(join(REPO, "NOTICE"))).toBe(true);
  });
});

/**
 * #445: the marketplace plugin runs `bun dist/server.js` (plugins/mcp-recall/.mcp.json).
 * That bundle crashed on load in 1.19.0 and 1.20.0 while src/ started fine, and no
 * test started it. Start the checked-in bundle as the plugin does and talk MCP to it.
 */
describe("the plugin's bundled MCP server (#445)", () => {
  const SERVER_JS = join(REPO, "plugins", "mcp-recall", "dist", "server.js");

  async function exchange(lines: object[], expectIds: number[]): Promise<Map<number, Record<string, unknown>>> {
    const dir = mkdtempSync(join(tmpdir(), "recall-server-"));
    const proc = Bun.spawn([process.execPath, SERVER_JS], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, RECALL_DB_PATH: join(dir, "store.db"), RECALL_CONFIG_PATH: join(dir, "none.toml") },
    });
    for (const l of lines) proc.stdin.write(JSON.stringify(l) + "\n");
    proc.stdin.flush();
    const replies = new Map<number, Record<string, unknown>>();
    const decoder = new TextDecoder();
    let buffered = "";
    const reader = proc.stdout.getReader();
    const deadline = Date.now() + 10_000;
    try {
      while (expectIds.some((id) => !replies.has(id)) && Date.now() < deadline) {
        const chunk = await Promise.race([
          reader.read(),
          Bun.sleep(deadline - Date.now()).then(() => ({ done: true, value: undefined })),
        ]);
        if (chunk.done || !chunk.value) break;
        buffered += decoder.decode(chunk.value);
        let nl: number;
        while ((nl = buffered.indexOf("\n")) >= 0) {
          const msg = JSON.parse(buffered.slice(0, nl)) as Record<string, unknown>;
          buffered = buffered.slice(nl + 1);
          if (typeof msg["id"] === "number") replies.set(msg["id"], msg);
        }
      }
    } finally {
      proc.kill();
      rmSync(dir, { recursive: true, force: true });
    }
    if (expectIds.some((id) => !replies.has(id))) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`server answered ${[...replies.keys()].join(",") || "nothing"}; stderr: ${stderr.slice(0, 400)}`);
    }
    return replies;
  }

  test("starts, initializes, and lists all eleven recall tools", async () => {
    const replies = await exchange(
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } } },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "tools/list" },
      ],
      [1, 2]
    );
    const init = replies.get(1)!["result"] as { serverInfo: { name: string } };
    expect(init.serverInfo.name).toBe("recall");
    const tools = (replies.get(2)!["result"] as { tools: { name: string }[] }).tools.map((t) => t.name);
    expect(tools).toHaveLength(11);
    expect(tools).toContain("recall__retrieve");
  }, 15_000);
});
