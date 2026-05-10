import type { CompressionResult, Handler } from "./types";
import { extractText } from "./types";
import { shellHandler } from "./shell";
import { extractStdout, MAX_DOCKER_CONTAINERS } from "./bash-shared";

// ---------------------------------------------------------------------------
// docker ps / docker compose ps
// ---------------------------------------------------------------------------

export const dockerPsHandler: Handler = (
  toolName: string,
  output: unknown
): CompressionResult => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(extractText(output), "utf8");

  const lines = stdout.trim().split("\n").filter(l => l.trim());
  if (lines.length === 0) {
    return { summary: "[docker ps — no containers]", originalSize };
  }

  // First line is the header row
  const dataLines = lines[0]?.toUpperCase().includes("CONTAINER") ? lines.slice(1) : lines;

  if (dataLines.length === 0) {
    return { summary: "[docker ps — no containers running]", originalSize };
  }

  interface Container { name: string; status: string; ports: string; }
  const containers: Container[] = [];

  for (const line of dataLines) {
    // docker ps columns: CONTAINER ID | IMAGE | COMMAND | CREATED | STATUS | PORTS | NAMES
    const parts = line.trim().split(/\s{2,}/);
    if (parts.length < 2) continue;

    // NAMES is last column, STATUS is typically 4th (index 3 or 4)
    const name = parts[parts.length - 1] ?? "";
    // Find STATUS column — contains "Up", "Exited", "Restarting", etc.
    const statusPart = parts.find(p => /^(Up|Exited|Restarting|Created|Paused|Dead)/i.test(p)) ?? "";
    // PORTS column — contains "0.0.0.0:" or "->"
    const portsPart = parts.find(p => p.includes("->") || p.includes("0.0.0.0:")) ?? "";

    if (!name) continue;
    const statusShort = statusPart.slice(0, 20);
    const portsShort = portsPart.slice(0, 40);
    containers.push({ name, status: statusShort, ports: portsShort });
  }

  if (containers.length === 0) {
    return shellHandler(toolName, output);
  }

  const shown = containers.slice(0, MAX_DOCKER_CONTAINERS);
  const overflow = containers.length > MAX_DOCKER_CONTAINERS
    ? `\n  … (+${containers.length - MAX_DOCKER_CONTAINERS} more)`
    : "";

  const rows = shown.map(c => {
    const name = c.name.padEnd(30);
    const status = c.status.padEnd(22);
    return `  ${name}  ${status}  ${c.ports}`;
  });

  const header = `docker ps — ${containers.length} container${containers.length === 1 ? "" : "s"}`;
  return {
    summary: [header, ...rows].join("\n") + overflow,
    originalSize,
  };
};
