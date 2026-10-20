import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { extractProfiles, type EmbeddedProfile } from "../src/binary";
import { entrySource } from "../scripts/build-binary";

let tmp: string;
let profiles: EmbeddedProfile[];

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "mcp-recall-binary-test-"));
  // Stand-ins for files embedded in the binary.
  mkdirSync(join(tmp, "embedded"));
  writeFileSync(join(tmp, "embedded", "a.toml"), "id = 'a'\n");
  writeFileSync(join(tmp, "embedded", "b.toml"), "id = 'b'\n");
  profiles = [["mcp__a/default.toml", join(tmp, "embedded", "a.toml")], ["mcp__b/logs.toml", join(tmp, "embedded", "b.toml")]];
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("extractProfiles", () => {
  it("copies every profile under <base>/<version>, keeping their paths", () => {
    const dir = extractProfiles(profiles, "1.17.0", join(tmp, "base"));
    expect(dir).toBe(join(tmp, "base", "1.17.0"));
    expect(readFileSync(join(dir, "mcp__a", "default.toml"), "utf8")).toBe("id = 'a'\n");
    expect(readFileSync(join(dir, "mcp__b", "logs.toml"), "utf8")).toBe("id = 'b'\n");
    expect(readdirSync(join(tmp, "base"))).toEqual(["1.17.0"]); // no temp dir left behind
  });

  it("does not rewrite a complete copy", () => {
    const dir = extractProfiles(profiles, "1.17.0", join(tmp, "base"));
    const before = statSync(join(dir, "mcp__a", "default.toml")).mtimeMs;
    writeFileSync(join(tmp, "embedded", "a.toml"), "changed\n");
    extractProfiles(profiles, "1.17.0", join(tmp, "base"));
    expect(readFileSync(join(dir, "mcp__a", "default.toml"), "utf8")).toBe("id = 'a'\n");
    expect(statSync(join(dir, "mcp__a", "default.toml")).mtimeMs).toBe(before);
  });

  it("replaces a copy a crashed run left incomplete", () => {
    const dir = join(tmp, "base", "1.17.0");
    mkdirSync(join(dir, "mcp__a"), { recursive: true });
    writeFileSync(join(dir, "mcp__a", "default.toml"), "half"); // no .complete marker
    extractProfiles(profiles, "1.17.0", join(tmp, "base"));
    expect(readFileSync(join(dir, "mcp__a", "default.toml"), "utf8")).toBe("id = 'a'\n");
    expect(existsSync(join(dir, "mcp__b", "logs.toml"))).toBe(true);
  });

  it("extracts a new version beside the old one", () => {
    extractProfiles(profiles, "1.17.0", join(tmp, "base"));
    extractProfiles(profiles, "1.18.0", join(tmp, "base"));
    expect(readdirSync(join(tmp, "base")).sort()).toEqual(["1.17.0", "1.18.0"]);
  });
});

describe("entrySource", () => {
  it("embeds every bundled profile and hands them to runBinary", () => {
    const repo = join(import.meta.dir, "..");
    const src = entrySource(repo);
    const onDisk = new Bun.Glob("**/*.toml").scanSync(join(repo, "profiles"));
    const count = [...onDisk].length;
    expect(count).toBeGreaterThan(0);
    expect(src.match(/with \{ type: "file" \}/g)).toHaveLength(count);
    expect(src).toContain('"mcp__context7/default.toml"');
    expect(src).toContain("await runBinary([");
  });
});
