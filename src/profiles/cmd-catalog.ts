import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { loadProfiles, clearProfileCache, getShortName } from "./loader";
import {
  sanitize,
  assertSafeId,
  assertSafeFile,
  manifestShortName,
  fetchManifest,
  fetchProfileContent,
  verifyHash,
  saveToCommunityDir,
  installedCommunityMap,
  resolveManifestEntry,
} from "./shared";

// ── install ───────────────────────────────────────────────────────────────────

export async function cmdInstall(args: string[]): Promise<void> {
  const skipVerify = args.includes("--skip-verify");
  const nameOrId = args.find((a) => !a.startsWith("-"));
  if (!nameOrId) {
    console.error("Usage: mcp-recall profiles install <name> [--skip-verify]");
    process.exit(1);
  }

  process.stdout.write("Fetching manifest… ");
  const entries = await fetchManifest(skipVerify);
  console.log("done");

  const entry = await resolveManifestEntry(nameOrId, entries);
  assertSafeId(entry.id);
  assertSafeFile(entry.file);
  process.stdout.write(`Installing ${sanitize(entry.id)} v${sanitize(entry.version)}… `);
  const content = await fetchProfileContent(entry.file);
  verifyHash(content, entry.sha256, entry.id);
  const filePath = saveToCommunityDir(entry.id, content);
  clearProfileCache();
  console.log(`done\n✓ ${filePath}`);
}

// ── update ────────────────────────────────────────────────────────────────────

export async function cmdUpdate(args: string[] = []): Promise<void> {
  const skipVerify = args.includes("--skip-verify");
  const installed = installedCommunityMap();
  if (installed.size === 0) {
    console.log("No community profiles installed.");
    return;
  }

  process.stdout.write("Fetching manifest… ");
  const entries = await fetchManifest(skipVerify);
  console.log("done\n");

  let updated = 0;
  for (const [id, currentVersion] of installed) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) {
      console.log(`  ${id}: not in registry (skipped)`);
      continue;
    }
    if (entry.version === currentVersion) {
      console.log(`  ${id}: up to date (${currentVersion})`);
      continue;
    }
    assertSafeId(entry.id);
    assertSafeFile(entry.file);
    const content = await fetchProfileContent(entry.file);
    verifyHash(content, entry.sha256, entry.id);
    saveToCommunityDir(id, content);
    console.log(`  ✓ ${id}: ${currentVersion} → ${entry.version}`);
    updated++;
  }

  clearProfileCache();
  console.log(`\n${updated} profile(s) updated.`);
}

// ── seed ──────────────────────────────────────────────────────────────────────

export async function cmdSeed(args: string[]): Promise<void> {
  const all = args.includes("--all");
  const skipVerify = args.includes("--skip-verify");

  process.stdout.write("Fetching manifest… ");
  const entries = await fetchManifest(skipVerify);
  console.log("done\n");

  const installed = installedCommunityMap();
  let installCount = 0;
  let alreadyCount = 0;

  if (all) {
    for (const entry of entries) {
      if (installed.has(entry.id)) {
        console.log(`    ${entry.id}: already installed`);
        alreadyCount++;
        continue;
      }
      assertSafeId(entry.id);
      assertSafeFile(entry.file);
      const content = await fetchProfileContent(entry.file);
      verifyHash(content, entry.sha256, entry.id);
      saveToCommunityDir(entry.id, content);
      console.log(`  ✓ ${entry.id} installed`);
      installCount++;
    }
    clearProfileCache();
    console.log(`\n${installCount} profile(s) installed (${alreadyCount} already installed, ${entries.length} total available)`);
    return;
  }

  let serverKeys: string[] = [];
  try {
    const raw = JSON.parse(
      readFileSync(join(homedir(), ".claude.json"), "utf8")
    ) as Record<string, unknown>;
    const mcpServers = raw["mcpServers"] as Record<string, unknown> | undefined;
    serverKeys = Object.keys(mcpServers ?? {}).filter((k) => k !== "recall");
  } catch {
    console.log("Could not read ~/.claude.json — no MCPs detected.");
    return;
  }

  if (serverKeys.length === 0) {
    console.log("No MCP servers found in ~/.claude.json (other than recall).");
    return;
  }

  console.log(`Detected MCPs: ${serverKeys.join(", ")}`);

  for (const key of serverKeys) {
    const prefix = `mcp__${key.replace(/-/g, "_")}__`;
    const matches = entries.filter((e) => {
      const patterns = Array.isArray(e.mcp_pattern) ? e.mcp_pattern : [e.mcp_pattern];
      return patterns.some((pat) => {
        const stripped = pat.endsWith("*") ? pat.slice(0, -1) : pat;
        return stripped === prefix || prefix.startsWith(stripped);
      });
    });

    if (matches.length === 0) {
      console.log(`  ${key}: no community profile available`);
      continue;
    }

    for (const entry of matches) {
      if (installed.has(entry.id)) {
        console.log(`  ${entry.id}: already installed`);
        alreadyCount++;
        continue;
      }
      assertSafeId(entry.id);
      assertSafeFile(entry.file);
      const content = await fetchProfileContent(entry.file);
      verifyHash(content, entry.sha256, entry.id);
      saveToCommunityDir(entry.id, content);
      console.log(`  ✓ ${entry.id} installed (matched ${key})`);
      installCount++;
    }
  }

  clearProfileCache();
  console.log(`\n${installCount} profile(s) installed.`);
}

// ── info ──────────────────────────────────────────────────────────────────────

export async function cmdInfo(args: string[]): Promise<void> {
  const nameOrId = args[0];
  if (!nameOrId) {
    console.error("Usage: mcp-recall profiles info <name>");
    process.exit(1);
  }

  const allProfiles = loadProfiles();
  const local =
    allProfiles.find((p) => p.spec.profile.id === nameOrId) ??
    allProfiles.find((p) => getShortName(p.spec) === nameOrId);

  let manifestEntry: Awaited<ReturnType<typeof fetchManifest>>[number] | undefined;
  try {
    process.stdout.write("Fetching manifest… ");
    const entries = await fetchManifest();
    console.log("done");
    const lookupId = local?.spec.profile.id ?? nameOrId;
    manifestEntry =
      entries.find((e) => e.id === lookupId) ??
      entries.find((e) => manifestShortName(e) === nameOrId);
  } catch {
    console.log("(offline — showing local data only)");
  }

  if (!local && !manifestEntry) {
    console.error(`Profile "${nameOrId}" not found (not installed and not in community catalog).`);
    process.exit(1);
  }

  const id = local?.spec.profile.id ?? manifestEntry!.id;
  const shortName = local ? getShortName(local.spec) : manifestShortName(manifestEntry!);
  const version = local?.spec.profile.version ?? manifestEntry!.version;
  const description = sanitize(local?.spec.profile.description ?? manifestEntry!.description ?? "—");
  const author = sanitize(String(local?.spec.profile.author ?? manifestEntry?.author ?? "—"));
  const mcpUrl = sanitize(String(local?.spec.profile.mcp_url ?? manifestEntry?.mcp_url ?? "—"));
  const patterns = local?.patterns ?? (
    Array.isArray(manifestEntry!.mcp_pattern)
      ? manifestEntry!.mcp_pattern
      : [manifestEntry!.mcp_pattern]
  );
  const tier = local ? local.tier : "community (not installed)";

  console.log(`\n${shortName} (${id} v${version})`);
  console.log(`  Description: ${description}`);
  console.log(`  Pattern:     ${patterns.join(", ")}`);
  console.log(`  Author:      ${author}`);
  console.log(`  MCP:         ${mcpUrl}`);
  if (local) console.log(`  Strategy:    ${local.spec.strategy.type}`);
  console.log(`  Tier:        ${tier}`);
  console.log(`  Installed:   ${local?.filePath ?? "not installed"}`);
  console.log();
}

// ── available ─────────────────────────────────────────────────────────────────

export async function cmdAvailable(args: string[]): Promise<void> {
  const verbose = args.includes("--verbose");

  process.stdout.write("Fetching manifest… ");
  const entries = await fetchManifest();
  console.log("done\n");

  const installed = installedCommunityMap();

  const COL = { name: 20, desc: 46 };
  const statusLabel = "Status";
  const header =
    "Name".padEnd(COL.name) +
    "  " +
    "Description".padEnd(COL.desc) +
    "  " +
    statusLabel +
    (verbose ? "  MCP URL" : "");

  console.log(header);
  console.log("─".repeat(Math.min(header.length + (verbose ? 50 : 0), 120)));

  let installedCount = 0;
  for (const e of entries) {
    const name = sanitize(manifestShortName(e)).slice(0, COL.name - 1).padEnd(COL.name);
    const desc = sanitize(e.description).slice(0, COL.desc - 1).padEnd(COL.desc);
    const isInstalled = installed.has(e.id);
    if (isInstalled) installedCount++;
    const status = isInstalled ? "installed" : "         ";
    const urlPart = verbose ? `  ${sanitize(e.mcp_url ?? "—")}` : "";
    console.log(`${name}  ${desc}  ${status}${urlPart}`);
  }

  console.log(`\n${entries.length} available, ${installedCount} installed\n`);
}
