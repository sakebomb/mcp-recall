import type { CompressionResult, Handler } from "./types";
import { extractText } from "./types";
import { shellHandler } from "./shell";
import { extractStdout, MAX_LOG_COMMITS } from "./bash-shared";

// ---------------------------------------------------------------------------
// git diff / git show
// ---------------------------------------------------------------------------

interface FileDiff {
  path: string;
  additions: number;
  deletions: number;
  hunks: number;
}

export function parseGitDiff(text: string): FileDiff[] {
  const files: FileDiff[] = [];
  let current: FileDiff | null = null;

  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) {
      if (current) files.push(current);
      const match = line.match(/diff --git a\/.+ b\/(.+)/);
      const path = match ? match[1]! : line.slice(11);
      current = { path, additions: 0, deletions: 0, hunks: 0 };
    } else if (current) {
      if (line.startsWith("@@ ")) {
        current.hunks++;
      } else if (line.startsWith("+") && !line.startsWith("+++")) {
        current.additions++;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        current.deletions++;
      }
    }
  }
  if (current) files.push(current);
  return files;
}

export const gitDiffHandler: Handler = (
  toolName: string,
  output: unknown
): CompressionResult => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(extractText(output), "utf8");

  if (!stdout.trim()) {
    return { summary: "[git diff — no changes]", originalSize };
  }

  const files = parseGitDiff(stdout);

  if (files.length === 0) {
    // Binary diff, submodule change, or unusual output — fall back to shell
    return shellHandler(toolName, output);
  }

  const totalAdded = files.reduce((s, f) => s + f.additions, 0);
  const totalDeleted = files.reduce((s, f) => s + f.deletions, 0);
  const header = `git diff — ${files.length} file${files.length === 1 ? "" : "s"} changed, +${totalAdded} -${totalDeleted}`;

  const fileLines = files.map((f) => {
    const stats = `+${f.additions} -${f.deletions}`;
    const hunks = `(${f.hunks} hunk${f.hunks === 1 ? "" : "s"})`;
    return `  ${f.path.padEnd(48)}  ${stats.padEnd(10)}  ${hunks}`;
  });

  return { summary: [header, ...fileLines].join("\n"), originalSize };
};

// ---------------------------------------------------------------------------
// git log
// ---------------------------------------------------------------------------

export const gitLogHandler: Handler = (
  _toolName: string,
  output: unknown
): CompressionResult => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(extractText(output), "utf8");

  const lines = stdout.trim().split("\n").filter((l) => l.trim());
  if (lines.length === 0) {
    return { summary: "[git log — no commits]", originalSize };
  }

  // Detect --oneline / --format="%h %s" style: every line starts with a short hash
  const isOneline = lines.every((l) => /^[0-9a-f]{6,40}\s/.test(l.trim()));

  if (isOneline) {
    const total = lines.length;
    const shown = lines.slice(0, MAX_LOG_COMMITS);
    const overflow =
      total > MAX_LOG_COMMITS ? `\n… (+${total - MAX_LOG_COMMITS} more commits)` : "";
    const summary =
      `git log — ${total} commit${total === 1 ? "" : "s"}\n` +
      shown.map((l) => `  ${l}`).join("\n") +
      overflow;
    return { summary, originalSize };
  }

  // Full format: extract short hash + subject line from each "commit <hash>" block.
  // Skip known git header lines (Author:, Date:, Merge:, gpgsig continuation lines
  // starting with a space) so GPG-signed commits parse correctly.
  const commits: string[] = [];
  let hash = "";
  let seenBlank = false;

  for (const line of stdout.split("\n")) {
    if (line.startsWith("commit ")) {
      hash = line.slice(7, 14);
      seenBlank = false;
    } else if (hash && !seenBlank && (
      line.startsWith("Author:") ||
      line.startsWith("Date:") ||
      line.startsWith("Merge:") ||
      line.startsWith("gpgsig ") ||
      (line.startsWith(" ") && line.trim() !== "")  // gpgsig continuation lines
    )) {
      // skip git metadata headers before the blank separator
    } else if (hash && line.trim() === "" && !seenBlank) {
      seenBlank = true;
    } else if (hash && seenBlank && line.startsWith("    ") && line.trim()) {
      const subject = line.trim().slice(0, 72);
      commits.push(`  ${hash}  ${subject}`);
      hash = "";
      seenBlank = false;
    }
  }

  const total = commits.length;
  const shown = commits.slice(0, MAX_LOG_COMMITS);
  const overflow =
    total > MAX_LOG_COMMITS ? `\n… (+${total - MAX_LOG_COMMITS} more commits)` : "";
  const header = `git log — ${total} commit${total === 1 ? "" : "s"}`;
  return {
    summary: [header, ...shown].join("\n") + overflow,
    originalSize,
  };
};

// ---------------------------------------------------------------------------
// git status
// ---------------------------------------------------------------------------

export const gitStatusHandler: Handler = (
  toolName: string,
  output: unknown
): CompressionResult => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(extractText(output), "utf8");

  if (!stdout.trim()) {
    return { summary: "[git status — clean working tree]", originalSize };
  }

  const staged: string[] = [];
  const unstaged: string[] = [];
  const untracked: string[] = [];
  const conflicts: string[] = [];

  let section: "staged" | "unstaged" | "untracked" | null = null;

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("Changes to be committed")) { section = "staged"; continue; }
    if (trimmed.startsWith("Changes not staged")) { section = "unstaged"; continue; }
    if (trimmed.startsWith("Untracked files")) { section = "untracked"; continue; }
    if (trimmed.startsWith("both modified") || trimmed.startsWith("both added")) {
      conflicts.push(trimmed);
      continue;
    }
    if (!trimmed || trimmed.startsWith("(") || trimmed.startsWith("no changes")) continue;

    // Skip header lines and hints
    if (trimmed.startsWith("On branch") || trimmed.startsWith("HEAD") ||
        trimmed.startsWith("Your branch") || trimmed.startsWith("nothing")) continue;

    // Porcelain-style (git status --short or similar)
    const porcelain = line.match(/^([MADRCU?!]{1,2})\s+(.+)$/);
    if (porcelain) {
      const [, code, file] = porcelain as [string, string, string];
      if (code.startsWith("?")) untracked.push(file);
      else if (code[0] !== " " && code[0] !== "?") staged.push(`${code[0]} ${file}`);
      if (code[1] && code[1] !== " " && code[1] !== "?") unstaged.push(`${code[1]} ${file}`);
      continue;
    }

    if (section === "staged" && trimmed.match(/^(modified|new file|deleted|renamed):/)) {
      staged.push(trimmed);
    } else if (section === "unstaged" && trimmed.match(/^(modified|deleted):/)) {
      unstaged.push(trimmed);
    } else if (section === "untracked" && trimmed && !trimmed.startsWith("(")) {
      untracked.push(trimmed);
    }
  }

  if (staged.length === 0 && unstaged.length === 0 && untracked.length === 0 && conflicts.length === 0) {
    // Couldn't parse — fall back to shell
    return shellHandler(toolName, output);
  }

  const lines = ["git status"];
  if (conflicts.length > 0) lines.push(`  conflicts (${conflicts.length}): ${conflicts.slice(0, 5).join(", ")}`);
  if (staged.length > 0) lines.push(`  staged (${staged.length}): ${staged.slice(0, 5).map(f => f.replace(/^(modified|new file|deleted|renamed):\s*/, "")).join(", ")}${staged.length > 5 ? ` +${staged.length - 5} more` : ""}`);
  if (unstaged.length > 0) lines.push(`  unstaged (${unstaged.length}): ${unstaged.slice(0, 5).map(f => f.replace(/^(modified|deleted):\s*/, "")).join(", ")}${unstaged.length > 5 ? ` +${unstaged.length - 5} more` : ""}`);
  if (untracked.length > 0) lines.push(`  untracked (${untracked.length}): ${untracked.slice(0, 5).join(", ")}${untracked.length > 5 ? ` +${untracked.length - 5} more` : ""}`);

  return { summary: lines.join("\n"), originalSize };
};
