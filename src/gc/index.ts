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
 * Default is a dry run — nothing is deleted without `--force`. Deletion is
 * conservative: only DBs whose project was *definitively* removed (the recorded
 * path is gone but its parent still exists) or pathless DBs untouched past the
 * stale window are candidates. A path missing because its whole volume is
 * unmounted, a non-mcp-recall `.db`, or a corrupt DB is never a candidate.
 */

import { Database } from "bun:sqlite";
import { readdirSync, existsSync, statSync, rmSync } from "fs";
import { join, basename, dirname, resolve } from "path";
import { dataDir, defaultDbPath } from "../db/schema";
import { getMeta } from "../db/queries";
import { getProjectKey } from "../project-key";
import { formatBytes, formatRelativeTime } from "../format";
import { log } from "../log";

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
  | "orphaned" // recorded path gone but its parent exists — project deleted, safe to remove
  | "unverifiable" // recorded path AND its parent gone — likely an unmounted volume; never deleted
  | "legacy-fresh" // no recorded path, recently modified — kept
  | "legacy-stale" // no recorded path, untouched past the stale window — candidate
  | "unreadable"; // not an mcp-recall DB, or could not be read — reported, never deleted

/**
 * Per-status policy. As a `Record<DbStatus, …>` this is exhaustive: adding a new
 * `DbStatus` variant without a policy is a compile error — so no status can be
 * silently treated as deletable or vacuumable. This is the single source of truth
 * for both decisions.
 */
const STATUS_POLICY: Record<DbStatus, { deletable: boolean; vacuumable: boolean }> = {
  current: { deletable: false, vacuumable: false },
  active: { deletable: false, vacuumable: true },
  orphaned: { deletable: true, vacuumable: false },
  unverifiable: { deletable: false, vacuumable: false },
  "legacy-fresh": { deletable: false, vacuumable: true },
  "legacy-stale": { deletable: true, vacuumable: false },
  unreadable: { deletable: false, vacuumable: false },
};

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
  return STATUS_POLICY[status].deletable;
}

/**
 * Databases `--vacuum` should rewrite: the ones being kept. Excludes deletion
 * candidates (pointless to rewrite a DB slated for removal — and in a dry run
 * would otherwise VACUUM the entire store), the live-locked current DB, and
 * anything unverifiable/unreadable.
 */
export function vacuumTargets(entries: DbEntry[]): DbEntry[] {
  return entries.filter((e) => STATUS_POLICY[e.status].vacuumable);
}

const sumBytes = (entries: DbEntry[]): number => entries.reduce((sum, e) => sum + e.sizeBytes, 0);

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
 * The one-line session-start reminder to run `gc`, or "" when the store is under
 * the threshold or reminders are disabled (`reminderMb <= 0`). Pure — the caller
 * supplies the footprint (from the cheap `storeFootprint`).
 */
export function gcReminderText(footprint: StoreFootprint, reminderMb: number): string {
  if (reminderMb <= 0) return "";
  if (footprint.totalBytes < reminderMb * 1024 * 1024) return "";
  return (
    `💡 recall store is ${formatBytes(footprint.totalBytes)} across ${footprint.dbCount} ` +
    `project databases — run \`mcp-recall gc\` to review and reclaim disk space.`
  );
}

/** Reads a DB's classification inputs. `null` recordedPath = no meta / legacy. */
interface DbProbe {
  readable: boolean; // opened AND is an mcp-recall DB we could read
  projectPath: string | null;
  items: number;
}

/**
 * Opens a DB read-only and reads what classification needs. A file that is not an
 * mcp-recall database (no `stored_outputs` table) or that errors on read (corrupt)
 * is reported `readable: false` so it is never treated as a deletion candidate.
 */
function probeDb(file: string): DbProbe {
  let db: Database | null = null;
  try {
    db = new Database(file, { readonly: true });
    const isRecallDb = db
      .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='stored_outputs'`)
      .get();
    if (!isRecallDb) return { readable: false, projectPath: null, items: 0 };

    let projectPath: string | null = null;
    try {
      projectPath = getMeta(db, "project_path");
    } catch {
      projectPath = null; // legacy DB without a `meta` table — legitimate
    }
    // Outside the meta catch: a throw here means real corruption, not just a
    // missing table, so it propagates to the outer catch → unreadable.
    const items = (db.prepare(`SELECT COUNT(*) AS n FROM stored_outputs`).get() as { n: number }).n;
    return { readable: true, projectPath, items };
  } catch {
    return { readable: false, projectPath: null, items: 0 };
  } finally {
    db?.close();
  }
}

/** Classifies one DB. Split out for exhaustive, testable status logic. */
function classify(
  probe: DbProbe,
  mtimeMs: number,
  staleCutoffMs: number
): DbStatus {
  if (!probe.readable) return "unreadable";
  if (probe.projectPath !== null) {
    if (existsSync(probe.projectPath)) return "active";
    // Path gone: only call it orphaned if the PARENT still exists (the project
    // dir was really deleted). If the parent is also gone, the volume is likely
    // just unmounted — never delete on that basis.
    return existsSync(dirname(probe.projectPath)) ? "orphaned" : "unverifiable";
  }
  return mtimeMs < staleCutoffMs ? "legacy-stale" : "legacy-fresh";
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
  // Resolve both sides so a non-normalized RECALL_DB_PATH (e.g. a "/./" segment)
  // still matches the scanned, join-normalized path — protecting the live DB.
  const currentResolved = resolve(currentFile);
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

    if (resolve(file) === currentResolved) {
      entries.push({ file, status: "current", projectPath: null, sizeBytes, mtimeMs, items: 0 });
      continue;
    }

    const probe = probeDb(file);
    const status = classify(probe, mtimeMs, staleCutoffMs);
    entries.push({ file, status, projectPath: probe.projectPath, sizeBytes, mtimeMs, items: probe.items });
  }

  // Largest first — the biggest reclaimable wins surface at the top.
  return entries.sort((a, b) => b.sizeBytes - a.sizeBytes);
}

const STATUS_LABEL: Record<DbStatus, string> = {
  current: "current",
  active: "active",
  orphaned: "ORPHANED",
  unverifiable: "unverifiable",
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

export type VacuumResult = { before: number; after: number } | { error: string };

/** Full VACUUM: reclaims free pages and upgrades legacy DBs to incremental auto-vacuum. */
export function vacuumFile(file: string): VacuumResult {
  const before = dbFootprint(file);
  let db: Database | null = null;
  try {
    db = new Database(file);
    db.run("PRAGMA busy_timeout=5000");
    db.run("PRAGMA auto_vacuum=INCREMENTAL");
    db.run("VACUUM");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // VACUUM is atomic — a failure leaves the DB intact. Log the real cause; the
    // caller derives a user-facing reason from it.
    log.warn(`vacuum failed for ${basename(file)} — ${message}`);
    return { error: message };
  } finally {
    db?.close();
  }
  return { before, after: dbFootprint(file) };
}

/** Best-effort human-readable cause for a skipped vacuum, from the raw error. */
function vacuumSkipReason(error: string): string {
  if (/lock|busy/i.test(error)) return "locked by another session";
  if (/disk|full|space/i.test(error)) return "disk full";
  return "unreadable or errored (see RECALL_DEBUG logs)";
}

function deleteDbFiles(file: string): void {
  for (const f of [file, `${file}-wal`, `${file}-shm`]) {
    rmSync(f, { force: true });
  }
}

/** Deletes each candidate's `.db` + WAL/SHM sidecars. Returns bytes freed. */
export function executeDeletions(candidates: DbEntry[]): number {
  for (const e of candidates) deleteDbFiles(e.file);
  return sumBytes(candidates);
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

  console.log(`Project databases in ${dir}:\n`);
  for (const e of entries) console.log(reportLine(e, nowMs));
  console.log(
    `\n${entries.length} databases · ${formatBytes(sumBytes(entries))} total · ` +
      `${candidates.length} reclaimable (${formatBytes(sumBytes(candidates))})`
  );
  console.log(
    `  ORPHANED = project path deleted · LEGACY-STALE = no recorded path, untouched > ${staleDays}d ` +
      `(--stale-days N) · unverifiable/unreadable are never deleted`
  );

  if (dryRun) {
    if (candidates.length > 0) {
      console.log(`\nDry run — pass --force to delete the ${candidates.length} marked database(s).`);
    }
  } else {
    const freed = executeDeletions(candidates);
    console.log(`\nDeleted ${candidates.length} database(s), freed ${formatBytes(freed)}.`);
  }

  if (opts.vacuum) {
    // Vacuum the databases we are KEEPING only (see vacuumTargets). Acts regardless
    // of dry-run: --vacuum is an explicit reclaim action, orthogonal to --force,
    // and VACUUM is non-destructive to data.
    const survivors = vacuumTargets(entries);
    console.log(
      `\nVacuuming ${survivors.length} database(s) to keep (${formatBytes(sumBytes(survivors))}) — ` +
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
      if ("after" in result) {
        const freed = Math.max(0, result.before - result.after);
        reclaimed += freed;
        vacuumed++;
        console.log(`reclaimed ${formatBytes(freed)}`);
      } else {
        skipped++;
        console.log(`skipped — ${vacuumSkipReason(result.error)}`);
      }
    }
    const skipNote = skipped > 0 ? ` (${skipped} skipped)` : "";
    console.log(
      `Vacuumed ${vacuumed} database(s), reclaimed ${formatBytes(reclaimed)} of free pages.${skipNote}`
    );
  }
}
