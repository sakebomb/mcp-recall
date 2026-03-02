import { createHash } from "crypto";
import { loadConfig } from "../config";
import { getProjectKey } from "../project-key";
import { isDenied } from "../denylist";
import { containsSecret, findSecrets } from "../secrets";
import { getHandler, extractText } from "../handlers/index";
import { getDb, defaultDbPath, storeOutput, checkDedup, evictIfNeeded } from "../db/index";

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function handlePostToolUse(raw: string): HookOutput {
  const input = JSON.parse(raw) as PostToolUseInput;
  const { tool_name, tool_input, tool_response, cwd, session_id } = input;
  const config = loadConfig();

  // 1. Denylist check
  if (isDenied(tool_name, config)) {
    return {};
  }

  // 2. Extract text and check for secrets
  const fullContent = extractText(tool_response);
  if (containsSecret(fullContent)) {
    const names = findSecrets(fullContent);
    process.stderr.write(`[recall] skipped ${tool_name}: detected ${names.join(", ")}\n`);
    return {};
  }

  // 3. Setup DB (needed for dedup check before compression)
  const projectKey = getProjectKey(cwd);
  const db = getDb(defaultDbPath(projectKey));

  // 4. Dedup check — skip when tool_input is absent
  const input_hash =
    tool_input !== undefined
      ? createHash("sha256")
          .update(tool_name + JSON.stringify(tool_input))
          .digest("hex")
      : null;

  if (input_hash) {
    const cached = checkDedup(db, projectKey, input_hash);
    if (cached) {
      const cachedDate = new Date(cached.created_at * 1000).toISOString().slice(0, 10);
      const header = `[recall:${cached.id} · cached · ${cachedDate}]`;
      return {
        updatedMCPToolOutput: `${header}\n${cached.summary}`,
        suppressOutput: true,
      };
    }
  }

  // 5. Compress
  const handler = getHandler(tool_name, tool_response);
  const { summary, originalSize } = handler(tool_name, tool_response);
  const summarySize = Buffer.byteLength(summary, "utf8");

  // 6. Only store when compression is meaningful
  if (summarySize >= originalSize) {
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
  });

  // 8. Evict if store exceeds size limit
  evictIfNeeded(db, projectKey, config.store.max_size_mb);

  // 9. Return compressed output to Claude
  const reduction = ((1 - summarySize / originalSize) * 100).toFixed(0);
  const header = `[recall:${stored.id} · ${formatBytes(originalSize)}→${formatBytes(summarySize)} (${reduction}% reduction)]`;
  return {
    updatedMCPToolOutput: `${header}\n${summary}`,
    suppressOutput: true,
  };
}
