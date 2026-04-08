import { describe, it, expect, spyOn, beforeEach, afterEach } from "bun:test";
import { log } from "../src/log";

describe("log utility", () => {
  let writes: string[];
  let spy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    writes = [];
    spy = spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    delete process.env.RECALL_DEBUG;
  });

  afterEach(() => {
    spy.mockRestore();
    delete process.env.RECALL_DEBUG;
  });

  it("info writes [mcp-recall] info: format to stderr", () => {
    log.info("server started");
    expect(writes).toEqual(["[mcp-recall] info: server started\n"]);
  });

  it("warn writes [mcp-recall] warn: format to stderr", () => {
    log.warn("VACUUM failed");
    expect(writes).toEqual(["[mcp-recall] warn: VACUUM failed\n"]);
  });

  it("error writes [mcp-recall] error: format to stderr", () => {
    log.error("unexpected crash");
    expect(writes).toEqual(["[mcp-recall] error: unexpected crash\n"]);
  });

  it("debug is suppressed when RECALL_DEBUG is unset", () => {
    log.debug("trace details");
    expect(writes).toHaveLength(0);
  });

  it("debug is suppressed when RECALL_DEBUG is not '1'", () => {
    process.env.RECALL_DEBUG = "true";
    log.debug("trace details");
    expect(writes).toHaveLength(0);
  });

  it("debug writes [mcp-recall] debug: format when RECALL_DEBUG=1", () => {
    process.env.RECALL_DEBUG = "1";
    log.debug("handler selected");
    expect(writes).toEqual(["[mcp-recall] debug: handler selected\n"]);
  });
});
