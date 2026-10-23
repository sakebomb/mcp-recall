/**
 * Used by scripts/fidelity.ts: the Bash results recorded in Claude Code
 * transcripts, and mcp-recall's PostToolUse hook run against a throwaway store,
 * so a replay never touches the real one.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";

export function* transcriptFiles(dir: string): Generator<string> {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* transcriptFiles(p);
    else if (n.endsWith(".jsonl")) yield p;
  }
}

export interface Recorded {
  command: string;
  stdout: string;
  stderr: string;
  /**
   * The text Claude was shown: the tool_result content. It differs from stdout when
   * Claude Code saved a large output to a file and showed a preview.
   */
  shown: string;
  /** What Claude wrote and ran in its next turn: text, thinking and tool inputs, in order. */
  followup: string;
}

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  return Array.isArray(content) ? content.map((c: any) => (typeof c?.text === "string" ? c.text : "")).join("\n") : "";
}

/** Every string inside a tool call's input, so a path Claude passed on is found unescaped. */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (v && typeof v === "object") for (const x of Object.values(v)) strings(x, out);
  return out;
}

function blockText(b: any): string {
  if (b?.type === "text" && typeof b.text === "string") return b.text;
  if (b?.type === "thinking" && typeof b.thinking === "string") return b.thinking;
  if (b?.type === "tool_use") return strings(b.input).join("\n");
  return "";
}

/**
 * Every Bash result in the transcripts, once each, minus those the hook had already
 * compressed. A result's follow-up is what Claude wrote after seeing it: assistant
 * content from a later message, up to the next user line after that content or the
 * next prompt. Parallel results arrive one per line and share one follow-up.
 *
 * Claude Code writes each block of a message as its own line, and can write a
 * result before the rest of the message that issued the call. Blocks of the
 * issuing message are therefore never a follow-up: they were written before the
 * result was seen.
 */
export function recordedBash(dir: string): { calls: Recorded[]; compressed: number } {
  const calls: Recorded[] = [];
  const seen = new Set<string>();
  let compressed = 0;
  for (const file of transcriptFiles(dir)) {
    const uses = new Map<string, { command: string; message: unknown }>();
    let collecting: Recorded[] = [];
    let issuers = new Set<unknown>();
    let replied = false;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      let d: any;
      try { d = JSON.parse(line); } catch { continue; }
      const blocks: any[] = Array.isArray(d?.message?.content) ? d.message.content : [];
      const id = d?.message?.id;
      if (d?.message?.role === "assistant" && collecting.length > 0 && !(id !== undefined && issuers.has(id))) {
        replied = true;
        const text = blocks.map(blockText).filter(Boolean).join("\n");
        if (text) for (const c of collecting) c.followup += `${c.followup ? "\n" : ""}${text}`;
      } else if (d?.message?.role === "user" && (replied || !blocks.some((b) => b?.type === "tool_result"))) {
        collecting = [];
        issuers = new Set();
        replied = false;
      }
      for (const b of blocks) {
        if (b.type === "tool_use" && b.name === "Bash" && typeof b.input?.command === "string") uses.set(b.id, { command: b.input.command, message: id });
        // A subagent transcript and its parent can both hold one call.
        if (b.type !== "tool_result" || !uses.has(b.tool_use_id) || seen.has(b.tool_use_id)) continue;
        seen.add(b.tool_use_id);
        const r = d.toolUseResult;
        if (typeof r?.stdout !== "string") continue;
        if (/^\[recall:recall_[0-9a-f]+/.test(r.stdout)) { compressed++; continue; }
        const persisted = typeof r.persistedOutputPath === "string" && existsSync(r.persistedOutputPath);
        const use = uses.get(b.tool_use_id)!;
        const stdout = persisted ? readFileSync(r.persistedOutputPath, "utf8") : r.stdout;
        const stderr = persisted ? "" : String(r.stderr ?? "");
        const call: Recorded = { command: use.command, stdout, stderr, shown: resultText(b.content) || (stderr ? `${stdout}\n${stderr}` : stdout), followup: "" };
        calls.push(call);
        collecting.push(call);
        if (use.message !== undefined) issuers.add(use.message);
      }
    }
  }
  return { calls, compressed };
}

export interface Delivery { delivered: string; stored: boolean; body: boolean }

/**
 * mcp-recall's PostToolUse hook, writing to a throwaway store and config under
 * `scratch`. `root` is the checkout whose src/ runs, so another revision can be
 * replayed from a worktree.
 */
export async function loadHook(scratch: string, session: string, root = join(import.meta.dir, "..")) {
  // Set before the hook module loads, which reads them once.
  const dbPath = join(scratch, "store.db");
  process.env.RECALL_DB_PATH = dbPath;
  process.env.RECALL_CONFIG_PATH = join(scratch, "config.toml");
  writeFileSync(process.env.RECALL_CONFIG_PATH, "[store]\nmax_size_mb = 100000\n");
  const { handlePostToolUse } = await import(join(root, "src/hooks/post-tool-use"));
  const { getDb } = await import(join(root, "src/db/index"));
  return {
    /** What Claude receives for `command`'s output, and whether a row with its body was stored. */
    deliver(command: string, stdout: string, stderr: string): Delivery {
      const r: any = handlePostToolUse(JSON.stringify({ session_id: session, cwd: scratch, hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command }, tool_response: { stdout, stderr, interrupted: false, isImage: false } }));
      const replaced = r?.hookSpecificOutput?.updatedToolOutput;
      const delivered = replaced && typeof replaced === "object" ? String(replaced.stdout ?? "") : stderr ? `${stdout}\n${stderr}` : stdout;
      const id = delivered.match(/^\[recall:(recall_[0-9a-f]+)/)?.[1];
      const row = id ? (getDb(dbPath).query("SELECT full_retained FROM stored_outputs WHERE id = ?").get(id) as { full_retained: number } | null) : null;
      return { delivered, stored: replaced !== undefined, body: row?.full_retained === 1 };
    },
  };
}
