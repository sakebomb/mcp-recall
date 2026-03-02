import { loadConfig } from "../config";
import { getProjectKey } from "../project-key";
import { isDenied } from "../denylist";
import { containsSecret, findSecrets } from "../secrets";
import { getHandler, extractText } from "../handlers/index";
import { getDb, defaultDbPath, storeOutput } from "../db/index";

interface PostToolUseInput {
  session_id: string;
  cwd: string;
  tool_name: string;
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
  const { tool_name, tool_response, cwd, session_id } = input;
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

  // 3. Compress
  const handler = getHandler(tool_name, tool_response);
  const { summary, originalSize } = handler(tool_name, tool_response);
  const summarySize = Buffer.byteLength(summary, "utf8");

  // 4. Only store when compression is meaningful
  if (summarySize >= originalSize) {
    return {};
  }

  // 5. Store
  const projectKey = getProjectKey(cwd);
  const db = getDb(defaultDbPath(projectKey));
  const stored = storeOutput(db, {
    project_key: projectKey,
    session_id,
    tool_name,
    summary,
    full_content: fullContent,
    original_size: originalSize,
  });

  // 6. Return compressed output to Claude
  const reduction = ((1 - summarySize / originalSize) * 100).toFixed(0);
  const header = `[recall:${stored.id} · ${formatBytes(originalSize)}→${formatBytes(summarySize)} (${reduction}% reduction)]`;
  return {
    updatedMCPToolOutput: `${header}\n${summary}`,
    suppressOutput: true,
  };
}
