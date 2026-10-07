import { createHash } from "crypto";
import { readFileSync, statSync } from "fs";
import { basename, dirname, isAbsolute } from "path";
import { loadConfig } from "../config";
import { getProjectKey } from "../project-key";
import { isDenied } from "../denylist";
import { findSecrets } from "../secrets";
import { getHandler, extractText } from "../handlers/index";
import { genericHandler } from "../handlers/generic";
import { extractHints } from "../hints";
import { getDb, defaultDbPath, storeOutput, checkDedup, checkOutputDedup, hashContent, evictIfNeeded } from "../db/index";
import { shouldRetainFullBody } from "../retention";
import { commandFingerprint, normalizeCommand } from "../handlers/bash";
import { bashOutputText } from "../handlers/bash-shared";
import { formatBytes } from "../format";
import { log } from "../log";

interface PostToolUseInput {
  session_id: string;
  cwd: string;
  tool_name: string;
  tool_input?: unknown;
  tool_response: unknown;
  [key: string]: unknown;
}

export interface HookOutput {
  hookSpecificOutput?: { hookEventName: "PostToolUse"; updatedToolOutput: string | Record<string, unknown> };
  /** Legacy field from before Claude Code documented updatedToolOutput; current versions ignore it (#298). */
  updatedMCPToolOutput?: string;
  suppressOutput?: boolean;
}

/** The Bash tool's response object, which may arrive serialized as a JSON string. */
function asBashResponse(toolResponse: unknown): Record<string, unknown> | null {
  let value = toolResponse;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return typeof (value as { stdout?: unknown }).stdout === "string" ? (value as Record<string, unknown>) : null;
}

/** Upper bound on a persisted Bash output read back from disk; a larger one stays cut. */
const MAX_PERSISTED_BYTES = 20 * 1024 * 1024;

/**
 * Claude Code cuts Bash stdout at about 50 KB before this hook sees it, with no
 * marker in it, and saves the whole output (stdout, then stderr) to
 * persistedOutputPath. Summarising the cut misstates every total (#316), so
 * read the file back when it is plainly the one Claude Code wrote: absolute,
 * in a tool-results directory, and exactly persistedOutputSize bytes. Anything
 * else leaves the received response as it is.
 */
function withPersistedOutput(toolResponse: unknown): unknown {
  const bash = asBashResponse(toolResponse);
  const path = bash?.persistedOutputPath;
  const size = bash?.persistedOutputSize;
  if (!bash || typeof path !== "string" || typeof size !== "number") return toolResponse;
  if (!isAbsolute(path) || basename(dirname(path)) !== "tool-results" || size > MAX_PERSISTED_BYTES) {
    return toolResponse;
  }
  try {
    if (statSync(path).size !== size) return toolResponse;
    return { ...bash, stdout: readFileSync(path, "utf8"), stderr: "" };
  } catch (err) {
    log.debug(`persisted output unreadable · ${path} · ${String(err)}`);
    return toolResponse;
  }
}

/**
 * Replaces the tool's output with `text` via hookSpecificOutput.updatedToolOutput;
 * the top-level field alone was silently ignored (#298). For a built-in tool the
 * replacement must match that tool's output shape, or Claude Code logs a mismatch
 * and delivers the original output. A plain string never matches Bash's object,
 * so Bash summaries were dropped: return the response with stdout replaced. The
 * summary already carries stderr, so it is cleared rather than shown twice.
 */
function replaceOutput(text: string, toolResponse?: unknown): HookOutput {
  const bash = asBashResponse(toolResponse);
  return {
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      updatedToolOutput: bash ? { ...bash, stdout: text, stderr: "" } : text,
    },
    updatedMCPToolOutput: text,
    suppressOutput: true,
  };
}

export function handlePostToolUse(raw: string): HookOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    log.error("post-tool-use received invalid JSON — skipping");
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    log.error("post-tool-use received unexpected input shape — skipping");
    return {};
  }
  const input = parsed as PostToolUseInput;
  const { tool_name, tool_input, tool_response, cwd, session_id } = input;
  const config = loadConfig();
  // The whole output, not the cut Claude Code hands over above ~50 KB (#316).
  const response = tool_name === "Bash" ? withPersistedOutput(tool_response) : tool_response;

  // 1. Denylist check
  if (isDenied(tool_name, config)) {
    log.debug(`SKIP denylist · ${tool_name}`);
    return {};
  }

  // 2. Extract text and check for secrets. For Bash that is stdout + stderr:
  //    the envelope's field names and escaped newlines are not output, so they
  //    must not reach the store, the hints or FTS (#306).
  const fullContent = tool_name === "Bash" ? bashOutputText(response) : extractText(response);
  log.debug(`intercepted ${tool_name} · ${formatBytes(Buffer.byteLength(fullContent, "utf8"))}`);
  const secretNames = findSecrets(fullContent);
  if (secretNames.length > 0) {
    log.warn(`skipped ${tool_name}: detected ${secretNames.join(", ")}`);
    return {};
  }

  // 3. Setup DB (needed for dedup check before compression)
  const projectKey = getProjectKey(cwd);
  const db = getDb(defaultDbPath(projectKey));

  // 4. Dedup check. input_hash catches an identical call (skipped when
  //    tool_input is absent); output_hash catches identical *content* from any
  //    call, so re-runs and different calls yielding the same output store once.
  const input_hash =
    tool_input !== undefined
      ? createHash("sha256")
          .update(tool_name + JSON.stringify(tool_input))
          .digest("hex")
      : null;
  const output_hash = hashContent(fullContent);

  const cachedResponse = (cached: { id: string; created_at: number; summary: string }): HookOutput => {
    const cachedDate = new Date(cached.created_at * 1000).toISOString().slice(0, 10);
    const text = `[recall:${cached.id} · cached · ${cachedDate}]\n${cached.summary}`;
    // A row stored before #319 may only have beaten the original without its
    // header; replaying it must not deliver more than the output itself.
    if (Buffer.byteLength(text, "utf8") >= Buffer.byteLength(fullContent, "utf8")) {
      log.debug(`SKIP cached-not-smaller · ${tool_name} · id=${cached.id}`);
      return {};
    }
    log.debug(`CACHE HIT · ${tool_name} · id=${cached.id} · cached ${cachedDate}`);
    return replaceOutput(text, tool_response);
  };

  const byInput = input_hash ? checkDedup(db, projectKey, input_hash) : null;
  if (byInput) return cachedResponse(byInput);
  // A content match may have been stored by a *different* tool; the cached
  // response then carries that tool's id/summary. Attribution follows the first
  // storer — acceptable since the full content is byte-identical.
  const byOutput = checkOutputDedup(db, projectKey, output_hash);
  if (byOutput) return cachedResponse(byOutput);

  // 5. Compress
  const handler = getHandler(tool_name, response, tool_input);
  log.debug(`handler: ${handler.name} · ${tool_name}`);
  let { summary, originalSize } = handler(tool_name, response);
  // An empty summary always passes the size check below, yet delivers nothing:
  // the handler did not recognize this shape. Fall back rather than store it (#296).
  if (summary.trim() === "" && originalSize > 0) {
    log.debug(`empty summary from ${handler.name} · ${tool_name} · falling back to genericHandler`);
    ({ summary, originalSize } = genericHandler(tool_name, response));
  }
  const summarySize = Buffer.byteLength(summary, "utf8");

  // 6. Only store when what Claude receives, header included, is smaller than
  //    the original: sizing the summary alone delivered small outputs larger
  //    while reporting a reduction (#319).
  const hints = extractHints(fullContent);
  const deliveredSize = deliveredBytes(summary, originalSize, hints);
  if (deliveredSize >= originalSize) {
    log.debug(`SKIP no-compression · ${tool_name} · ${formatBytes(deliveredSize)} ≥ ${formatBytes(originalSize)}`);
    return {};
  }

  // 7. Store. Retention policy decides whether to keep the verbatim body or
  //    store the row summary-only (store.retention). The command drives the
  //    balanced-tier classification for Bash; output_hash (computed above from
  //    the real content) is passed through so dedup works even when the body is
  //    dropped.
  const command =
    tool_input !== null && typeof tool_input === "object" &&
    typeof (tool_input as { command?: unknown }).command === "string"
      ? (tool_input as { command: string }).command
      : undefined;
  const full_retained = shouldRetainFullBody(config.store.retention, tool_name, command) ? 1 : 0;
  if (!full_retained) log.debug(`summary-only · ${tool_name} · retention=${config.store.retention}`);

  // Privacy-safe command family fingerprint for per-command savings attribution
  // (#251). Bash only; a "" fingerprint (no bare verb) is stored as NULL/unknown.
  const command_fp =
    tool_name === "Bash" && command
      ? commandFingerprint(normalizeCommand(command)) || null
      : null;

  const stored = storeOutput(db, {
    project_key: projectKey,
    session_id,
    tool_name,
    summary,
    full_content: fullContent,
    original_size: originalSize,
    input_hash: input_hash ?? undefined,
    output_hash, // reuse the hash computed above for the dedup check
    full_retained,
    command_fp,
  });

  // 8. Evict if store exceeds size limit
  evictIfNeeded(db, projectKey, config.store.max_size_mb, config.store.eviction_half_life_days);

  // 9. Return compressed output to Claude
  log.debug(`STORED · ${tool_name} · id=${stored.id} · ${formatBytes(originalSize)}→${formatBytes(summarySize)} (${reductionPercent(summarySize, originalSize)}% reduction)`);
  return replaceOutput(`${recallHeader(stored.id, originalSize, summarySize, hints)}\n${summary}`, tool_response);
}

function reductionPercent(summarySize: number, originalSize: number): string {
  return ((1 - summarySize / originalSize) * 100).toFixed(0);
}

/**
 * The line above every delivered summary. Retrieval hints are a few salient
 * terms from the full content so Claude's first recall__search lands. The
 * content already passed the upstream secret scan (step 2), which matches known
 * credential formats — hints are not a separate secret filter and are visible
 * to Claude, same as the summary.
 */
export function recallHeader(id: string, originalSize: number, summarySize: number, hints: string[]): string {
  const hintStr = hints.length ? ` · search: ${hints.map((h) => `"${h}"`).join(", ")}` : "";
  return `[recall:${id} · ${formatBytes(originalSize)}→${formatBytes(summarySize)} (${reductionPercent(summarySize, originalSize)}% reduction)${hintStr}]`;
}

/** Same length as every stored id (`recall_` + 16 hex), so the header can be sized before storing. */
const ID_PLACEHOLDER = `recall_${"0".repeat(16)}`;

/** Bytes Claude receives for a summary: its header, a newline, then the summary (#319). */
export function deliveredBytes(summary: string, originalSize: number, hints: string[]): number {
  const summarySize = Buffer.byteLength(summary, "utf8");
  return Buffer.byteLength(recallHeader(ID_PLACEHOLDER, originalSize, summarySize, hints), "utf8") + 1 + summarySize;
}
