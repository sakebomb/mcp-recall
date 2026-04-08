import { describe, it, expect, afterEach, spyOn } from "bun:test";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { log, setDebugEnabled } from "../src/log";
import { resetConfig, loadConfig } from "../src/config";

const TEST_CONFIG_PATH = join(tmpdir(), `mcp-recall-debug-test-${process.pid}.toml`);

function captureStderr(fn: () => void): string {
  const spy = spyOn(process.stderr, "write");
  fn();
  const output = spy.mock.calls.map(([c]) => String(c)).join("");
  spy.mockRestore();
  return output;
}

describe("log.debug", () => {
  afterEach(() => {
    delete process.env.RECALL_DEBUG;
    delete process.env.RECALL_CONFIG_PATH;
    resetConfig();
  });

  it("writes nothing when RECALL_DEBUG is unset and config.debug.enabled is false", () => {
    process.env.RECALL_CONFIG_PATH = TEST_CONFIG_PATH;
    writeFileSync(TEST_CONFIG_PATH, "[debug]\nenabled = false\n");
    loadConfig();
    const output = captureStderr(() => log.debug("should not appear"));
    expect(output).toBe("");
    try { unlinkSync(TEST_CONFIG_PATH); } catch {}
  });

  it("writes nothing when no config exists and RECALL_DEBUG is unset", () => {
    process.env.RECALL_CONFIG_PATH = TEST_CONFIG_PATH;
    // no config file written — ENOENT triggers defaults (debug.enabled = false)
    loadConfig();
    const output = captureStderr(() => log.debug("should not appear"));
    expect(output).toBe("");
  });

  it("writes to stderr when RECALL_DEBUG=1", () => {
    process.env.RECALL_DEBUG = "1";
    const output = captureStderr(() => log.debug("test message"));
    expect(output).toBe("[mcp-recall] debug: test message\n");
  });

  it("does not write when RECALL_DEBUG is a non-'1' truthy string", () => {
    process.env.RECALL_CONFIG_PATH = TEST_CONFIG_PATH;
    writeFileSync(TEST_CONFIG_PATH, "[debug]\nenabled = false\n");
    loadConfig();
    process.env.RECALL_DEBUG = "true";
    const output = captureStderr(() => log.debug("truthy check"));
    expect(output).toBe("");
    try { unlinkSync(TEST_CONFIG_PATH); } catch {}
  });

  it("writes to stderr when config.debug.enabled is true", () => {
    process.env.RECALL_CONFIG_PATH = TEST_CONFIG_PATH;
    writeFileSync(TEST_CONFIG_PATH, "[debug]\nenabled = true\n");
    loadConfig();
    const output = captureStderr(() => log.debug("config-based debug"));
    expect(output).toBe("[mcp-recall] debug: config-based debug\n");
    try { unlinkSync(TEST_CONFIG_PATH); } catch {}
  });

  it("output uses [mcp-recall] debug: prefix", () => {
    process.env.RECALL_DEBUG = "1";
    const output = captureStderr(() => log.debug("prefix check"));
    expect(output).toMatch(/^\[mcp-recall\] debug:/);
  });

  it("setDebugEnabled enables debug output without env var", () => {
    setDebugEnabled(true);
    const output = captureStderr(() => log.debug("setter test"));
    expect(output).toBe("[mcp-recall] debug: setter test\n");
  });

  it("resetConfig resets debug state to false", () => {
    setDebugEnabled(true);
    resetConfig();
    const output = captureStderr(() => log.debug("after reset"));
    expect(output).toBe("");
  });
});
