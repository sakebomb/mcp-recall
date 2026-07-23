import { createHash } from "crypto";
import { loadConfig } from "../config";
import { getProjectKey } from "../project-key";
import { isDenied } from "../denylist";
import { findSecrets } from "../secrets";
import { getHandler, extractText } from "../handlers/index";
import { extractHints } from "../hints";
import { getDb, defaultDbPath, storeOutput, checkDedup, checkOutputDedup, hashContent, evictIfNeeded } from "../db/index";
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
  updatedMCPToolOutput?: string;
  suppressOutput?: boolean;
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

  // 1. Denylist check
  if (isDenied(tool_name, config)) {
    log.debug(`SKIP denylist · ${tool_name}`);
    return {};
  }

  // 2. Extract text and check for secrets
  const fullContent = extractText(tool_response);
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
    log.debug(`CACHE HIT · ${tool_name} · id=${cached.id} · cached ${cachedDate}`);
    return {
      updatedMCPToolOutput: `[recall:${cached.id} · cached · ${cachedDate}]\n${cached.summary}`,
      suppressOutput: true,
    };
  };

  const byInput = input_hash ? checkDedup(db, projectKey, input_hash) : null;
  if (byInput) return cachedResponse(byInput);
  // A content match may have been stored by a *different* tool; the cached
  // response then carries that tool's id/summary. Attribution follows the first
  // storer — acceptable since the full content is byte-identical.
  const byOutput = checkOutputDedup(db, projectKey, output_hash);
  if (byOutput) return cachedResponse(byOutput);

  // 5. Compress
  const handler = getHandler(tool_name, tool_response, tool_input);
  log.debug(`handler: ${handler.name} · ${tool_name}`);
  const { summary, originalSize } = handler(tool_name, tool_response);
  const summarySize = Buffer.byteLength(summary, "utf8");

  // 6. Only store when compression is meaningful
  if (summarySize >= originalSize) {
    log.debug(`SKIP no-compression · ${tool_name} · ${formatBytes(summarySize)} ≥ ${formatBytes(originalSize)}`);
    return {};
  }

  // 7. Store
  const stored = storeOutput(db, {
    project_key: projectKey,
    session_id,
    tool_name,
    summary,
    full_content: fullContent,
    original_size: originalSize,
    input_hash: input_hash ?? undefined,
    output_hash, // reuse the hash computed above for the dedup check
  });

  // 8. Evict if store exceeds size limit
  evictIfNeeded(db, projectKey, config.store.max_size_mb, config.store.eviction_half_life_days);

  // 9. Return compressed output to Claude
  const reduction = ((1 - summarySize / originalSize) * 100).toFixed(0);
  log.debug(`STORED · ${tool_name} · id=${stored.id} · ${formatBytes(originalSize)}→${formatBytes(summarySize)} (${reduction}% reduction)`);
  // Retrieval hints: a few salient terms from the full content so Claude's
  // first recall__search lands. The content already passed the upstream secret
  // scan (step 2), which matches known credential formats — hints are not a
  // separate secret filter and are visible to Claude, same as the summary.
  const hints = extractHints(fullContent);
  const hintStr = hints.length ? ` · search: ${hints.map((h) => `"${h}"`).join(", ")}` : "";
  const header = `[recall:${stored.id} · ${formatBytes(originalSize)}→${formatBytes(summarySize)} (${reduction}% reduction)${hintStr}]`;
  return {
    updatedMCPToolOutput: `${header}\n${summary}`,
    suppressOutput: true,
  };
}
