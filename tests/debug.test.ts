import { describe, it, expect, afterEach, spyOn } from "bun:test";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { dbg } from "../src/debug";
import { resetConfig } from "../src/config";

const TEST_CONFIG_PATH = join(tmpdir(), `mcp-recall-debug-test-${process.pid}.toml`);

function captureStderr(fn: () => void): string {
  const spy = spyOn(process.stderr, "write");
  fn();
  const output = spy.mock.calls.map(([c]) => String(c)).join("");
  spy.mockRestore();
  return output;
}

describe("dbg", () => {
  afterEach(() => {
    delete process.env.RECALL_DEBUG;
    delete process.env.RECALL_CONFIG_PATH;
    resetConfig();
    try { unlinkSync(TEST_CONFIG_PATH); } catch {}
  });

  it("writes nothing when RECALL_DEBUG is unset and config.debug.enabled is false", () => {
    process.env.RECALL_CONFIG_PATH = TEST_CONFIG_PATH;
    writeFileSync(TEST_CONFIG_PATH, "[debug]\nenabled = false\n");
    resetConfig();
    const output = captureStderr(() => dbg("should not appear"));
    expect(output).toBe("");
  });

  it("writes nothing when no config exists and RECALL_DEBUG is unset", () => {
    process.env.RECALL_CONFIG_PATH = TEST_CONFIG_PATH;
    // no config file written — ENOENT triggers defaults (debug.enabled = false)
    const output = captureStderr(() => dbg("should not appear"));
    expect(output).toBe("");
  });

  it("writes to stderr when RECALL_DEBUG=1", () => {
    process.env.RECALL_DEBUG = "1";
    const output = captureStderr(() => dbg("test message"));
    expect(output).toBe("[mcp-recall] debug: test message\n");
  });

  it("does not write when RECALL_DEBUG is a non-'1' truthy string", () => {
    process.env.RECALL_CONFIG_PATH = TEST_CONFIG_PATH;
    writeFileSync(TEST_CONFIG_PATH, "[debug]\nenabled = false\n");
    resetConfig();
    process.env.RECALL_DEBUG = "true";
    const output = captureStderr(() => dbg("truthy check"));
    expect(output).toBe("");
  });

  it("writes to stderr when config.debug.enabled is true", () => {
    process.env.RECALL_CONFIG_PATH = TEST_CONFIG_PATH;
    writeFileSync(TEST_CONFIG_PATH, "[debug]\nenabled = true\n");
    resetConfig();
    const output = captureStderr(() => dbg("config-based debug"));
    expect(output).toBe("[mcp-recall] debug: config-based debug\n");
  });

  it("output uses [mcp-recall] debug: prefix", () => {
    process.env.RECALL_DEBUG = "1";
    const output = captureStderr(() => dbg("prefix check"));
    expect(output).toMatch(/^\[mcp-recall\] debug:/);
  });
});
