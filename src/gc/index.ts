/**
 * `mcp-recall gc` — reclaim disk from the per-project database store.
 *
 * Two independent problems this addresses:
 *   1. Orphaned DBs: when a project is deleted, its DB is never reopened, so the
 *      session-start prune never runs against it and it lingers forever. `gc`
 *      classifies each DB by whether its recorded `project_path` still exists.
 *   2. Free-page bloat: incremental_vacuum only reclaims on databases created with
 *      auto_vacuum=INCREMENTAL. `gc --vacuum` runs a full VACUUM on survivors,
 *      which reclaims free pages AND upgrades legacy auto_vacuum=NONE DBs.
 *
 * Default is a dry run — nothing is deleted without `--force`.
 */

import { Database } from "bun:sqlite";
import { readdirSync, existsSync, statSync, rmSync } from "fs";
import { join, basename } from "path";
import { dataDir, defaultDbPath } from "../db/schema";
import { getMeta } from "../db/queries";
import { getProjectKey } from "../project-key";
import { formatBytes, formatRelativeTime } from "../format";

const DEFAULT_STALE_DAYS = 90;

export interface GcOptions {
  /** When false, actually delete candidates. Default true (report only). */
  dryRun?: boolean;
  /** Legacy (no recorded path) DBs untouched for longer than this are candidates. */
  staleDays?: number;
  /** Run a full VACUUM on surviving DBs to reclaim free pages. */
  vacuum?: boolean;
}

export type DbStatus =
  | "current" // the active project's DB — never touched
  | "active" // recorded path still exists on disk
  | "orphaned" // recorded path is gone — safe to remove
  | "legacy-fresh" // no recorded path, recently modified — kept
  | "legacy-stale" // no recorded path, untouched past the stale window — candidate
  | "unreadable"; // could not be opened — reported, never deleted

export interface DbEntry {
  file: string; // absolute path to the .db file
  status: DbStatus;
  projectPath: string | null; // recorded project_path, if any
  sizeBytes: number; // .db + -wal + -shm
  mtimeMs: number;
  items: number; // stored_outputs row count (0 if unavailable)
}

/** True for statuses that `gc --force` will delete. */
export function isDeletionCandidate(status: DbStatus): boolean {
  return status === "orphaned" || status === "legacy-stale";
}

/**
 * Databases `--vacuum` should rewrite: the ones being kept. Excludes deletion
 * candidates (pointless to rewrite a DB slated for removal — and in a dry run
 * would otherwise VACUUM the entire store), the live-locked current DB, and
 * anything unreadable.
 */
export function vacuumTargets(entries: DbEntry[]): DbEntry[] {
  return entries.filter(
    (e) => !isDeletionCandidate(e.status) && e.status !== "current" && e.status !== "unreadable"
  );
}

function fileSizeSafe(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

/** Total on-disk footprint of a DB, including its WAL and shared-memory sidecars. */
function dbFootprint(file: string): number {
  return fileSizeSafe(file) + fileSizeSafe(`${file}-wal`) + fileSizeSafe(`${file}-shm`);
}

export interface StoreFootprint {
  totalBytes: number;
  dbCount: number;
}

/**
 * Cheap total size + count of the DB store — `stat` only, no database opens, so it
 * is safe to call on every session start. Used to decide whether to nudge the user
 * to run `gc`. Orphan classification (which requires opening each DB) is deferred to
 * the `gc` command itself.
 */
export function storeFootprint(dir: string = dataDir()): StoreFootprint {
  if (!existsSync(dir)) return { totalBytes: 0, dbCount: 0 };
  let totalBytes = 0;
  let dbCount = 0;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".db")) continue;
    dbCount++;
    totalBytes += dbFootprint(join(dir, name));
  }
  return { totalBytes, dbCount };
}

/**
 * Inspects every `*.db` in `dir` and classifies it. Pure aside from reads:
 * no file is modified or deleted. `currentFile` is the active project's DB path
 * (always classified "current"); `nowMs` is injectable for deterministic tests.
 */
export function scanDatabases(
  dir: string,
  currentFile: string,
  staleDays: number,
  nowMs: number = Date.now()
): DbEntry[] {
  if (!existsSync(dir)) return [];

  const staleCutoffMs = nowMs - staleDays * 86400 * 1000;
  const entries: DbEntry[] = [];

  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".db")) continue;
    const file = join(dir, name);

    let mtimeMs = 0;
    try {
      mtimeMs = statSync(file).mtimeMs;
    } catch {
      continue; // vanished between readdir and stat
    }
    const sizeBytes = dbFootprint(file);

    if (file === currentFile) {
      entries.push({ file, status: "current", projectPath: null, sizeBytes, mtimeMs, items: 0 });
      continue;
    }

    let projectPath: string | null = null;
    let items = 0;
    let readable = true;
    let db: Database | null = null;
    try {
      db = new Database(file, { readonly: true });
      try {
        projectPath = getMeta(db, "project_path");
      } catch {
        projectPath = null; // legacy DB without a `meta` table
      }
      try {
        items = (db.prepare(`SELECT COUNT(*) AS n FROM stored_outputs`).get() as { n: number }).n;
      } catch {
        items = 0;
      }
    } catch {
      readable = false;
    } finally {
      db?.close();
    }

    let status: DbStatus;
    if (!readable) {
      status = "unreadable";
    } else if (projectPath !== null) {
      status = existsSync(projectPath) ? "active" : "orphaned";
    } else {
      status = mtimeMs < staleCutoffMs ? "legacy-stale" : "legacy-fresh";
    }

    entries.push({ file, status, projectPath, sizeBytes, mtimeMs, items });
  }

  // Largest first — the biggest reclaimable wins surface at the top.
  return entries.sort((a, b) => b.sizeBytes - a.sizeBytes);
}

const STATUS_LABEL: Record<DbStatus, string> = {
  current: "current",
  active: "active",
  orphaned: "ORPHANED",
  "legacy-fresh": "legacy",
  "legacy-stale": "LEGACY-STALE",
  unreadable: "unreadable",
};

function reportLine(e: DbEntry, nowMs: number): string {
  const flag = isDeletionCandidate(e.status) ? "✗" : " ";
  const age = formatRelativeTime(nowMs - e.mtimeMs);
  const where = e.projectPath ?? "(no recorded path)";
  return (
    `  ${flag} ${STATUS_LABEL[e.status].padEnd(13)} ${formatBytes(e.sizeBytes).padStart(9)}` +
    `  ${String(e.items).padStart(6)} items  ${age.padEnd(14)}  ${basename(e.file)}\n` +
    `      ${where}`
  );
}

/** Full VACUUM: reclaims free pages and upgrades legacy DBs to incremental auto-vacuum. */
function vacuumFile(file: string): { before: number; after: number } | null {
  const before = dbFootprint(file);
  let db: Database | null = null;
  try {
    db = new Database(file);
    db.run("PRAGMA busy_timeout=5000");
    db.run("PRAGMA auto_vacuum=INCREMENTAL");
    db.run("VACUUM");
  } catch {
    return null; // locked or corrupt — skip, never fatal
  } finally {
    db?.close();
  }
  return { before, after: dbFootprint(file) };
}

function deleteDbFiles(file: string): void {
  for (const f of [file, `${file}-wal`, `${file}-shm`]) {
    rmSync(f, { force: true });
  }
}

/** Entry point for the `gc` CLI subcommand. Prints a report and, unless dry-run, reclaims. */
export function gcCommand(opts: GcOptions = {}): void {
  const dryRun = opts.dryRun ?? true;
  const staleDays = opts.staleDays ?? DEFAULT_STALE_DAYS;
  const nowMs = Date.now();
  const dir = dataDir();
  const currentFile = defaultDbPath(getProjectKey(process.cwd()));

  const entries = scanDatabases(dir, currentFile, staleDays, nowMs);
  if (entries.length === 0) {
    console.log(`No databases found in ${dir}`);
    return;
  }

  const candidates = entries.filter((e) => isDeletionCandidate(e.status));
  const reclaimable = candidates.reduce((sum, e) => sum + e.sizeBytes, 0);
  const totalBytes = entries.reduce((sum, e) => sum + e.sizeBytes, 0);

  console.log(`Project databases in ${dir}:\n`);
  for (const e of entries) console.log(reportLine(e, nowMs));
  console.log(
    `\n${entries.length} databases · ${formatBytes(totalBytes)} total · ` +
      `${candidates.length} reclaimable (${formatBytes(reclaimable)})`
  );
  console.log(
    `  Orphaned = project path deleted · LEGACY-STALE = no recorded path, ` +
      `untouched > ${staleDays}d (raise/lower with --stale-days N)`
  );

  if (dryRun) {
    if (candidates.length > 0) {
      console.log(`\nDry run — pass --force to delete the ${candidates.length} marked database(s).`);
    }
  } else {
    let freed = 0;
    for (const e of candidates) {
      deleteDbFiles(e.file);
      freed += e.sizeBytes;
    }
    console.log(`\nDeleted ${candidates.length} database(s), freed ${formatBytes(freed)}.`);
  }

  if (opts.vacuum) {
    // Vacuum the databases we are KEEPING only. Deletion candidates are excluded
    // regardless of dry-run — rewriting a DB that is slated for removal is pure
    // waste (and, in a dry run, would otherwise VACUUM the entire store). The
    // current (live-locked) and unreadable DBs are also skipped.
    const survivors = vacuumTargets(entries);
    const totalToVacuum = survivors.reduce((sum, e) => sum + e.sizeBytes, 0);
    console.log(
      `\nVacuuming ${survivors.length} database(s) to keep (${formatBytes(totalToVacuum)}) — ` +
        `rewrites each file, may take a while…`
    );
    let reclaimed = 0;
    let vacuumed = 0;
    let skipped = 0;
    for (let i = 0; i < survivors.length; i++) {
      const e = survivors[i]!;
      process.stdout.write(
        `  [${i + 1}/${survivors.length}] ${basename(e.file)} (${formatBytes(e.sizeBytes)})… `
      );
      const result = vacuumFile(e.file);
      if (result) {
        const freed = Math.max(0, result.before - result.after);
        reclaimed += freed;
        vacuumed++;
        console.log(`reclaimed ${formatBytes(freed)}`);
      } else {
        skipped++;
        console.log(`skipped — locked by another session or unreadable`);
      }
    }
    const skipNote = skipped > 0 ? ` (${skipped} skipped)` : "";
    console.log(
      `Vacuumed ${vacuumed} database(s), reclaimed ${formatBytes(reclaimed)} of free pages.${skipNote}`
    );
  }
}
