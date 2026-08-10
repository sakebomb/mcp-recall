import { extractText } from "./types";
import { stripAnsi, stripSshNoise } from "./shell";

export const MAX_LOG_COMMITS = 20;
export const MAX_TERRAFORM_RESOURCES = 10;
export const MAX_DOCKER_CONTAINERS = 20;
export const MAX_BUILD_ERRORS = 20;

/**
 * Extracts the plain stdout string from a native Bash tool response
 * `{exit_code, stdout, stderr}` or falls back to extractText for other shapes.
 */
export function extractStdout(output: unknown): string {
  if (output !== null && typeof output === "object") {
    const obj = output as Record<string, unknown>;
    if (typeof obj.stdout === "string") return stripSshNoise(stripAnsi(obj.stdout));
    if (typeof obj.output === "string") return stripSshNoise(stripAnsi(obj.output));
  }
  const text = extractText(output);
  // Bash tool responses arrive as a JSON string: {exit_code, stdout, stderr}.
  // Extract just the stdout so handlers work on the actual command output.
  try {
    const parsed = JSON.parse(text);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      const p = parsed as Record<string, unknown>;
      if (typeof p.stdout === "string") return stripSshNoise(stripAnsi(p.stdout));
      if (typeof p.output === "string") return stripSshNoise(stripAnsi(p.output));
    }
  } catch { /* not a structured JSON response */ }
  return stripSshNoise(stripAnsi(text));
}

export function extractStderr(output: unknown): string {
  const read = (o: unknown): string | null => {
    if (o !== null && typeof o === "object") {
      const obj = o as Record<string, unknown>;
      if (typeof obj.stderr === "string") return stripAnsi(obj.stderr);
    }
    return null;
  };
  const direct = read(output);
  if (direct !== null) return direct;
  // Bash tool responses arrive as a JSON string: {exit_code, stdout, stderr}.
  // Parse it so stderr-bound output (compiler/build errors) isn't dropped.
  try {
    const parsed = read(JSON.parse(extractText(output)));
    if (parsed !== null) return parsed;
  } catch {
    /* not a structured JSON response */
  }
  return "";
}

export function extractCommand(input: unknown): string | null {
  if (input !== null && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    if (typeof obj.command === "string") return obj.command.trim();
  }
  return null;
}

/**
 * Reads the process exit code from a native Bash tool response, handling both
 * the object shape `{exit_code}` and the JSON-string shape the Bash tool
 * actually delivers. Returns undefined when no code is present.
 */
export function extractExitCode(output: unknown): number | undefined {
  const read = (o: unknown): number | undefined => {
    if (o !== null && typeof o === "object") {
      const obj = o as Record<string, unknown>;
      if (typeof obj.exit_code === "number") return obj.exit_code;
      if (typeof obj.returncode === "number") return obj.returncode;
    }
    return undefined;
  };
  const direct = read(output);
  if (direct !== undefined) return direct;
  try {
    return read(JSON.parse(extractText(output)));
  } catch {
    return undefined;
  }
}
