import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir, tmpdir } from "os";
import { createHash } from "crypto";
import { parse } from "smol-toml";
import { loadConfig } from "../config";

export const MANIFEST_URL =
  "https://raw.githubusercontent.com/sakebomb/mcp-recall-profiles/main/manifest.json";
export const PROFILE_BASE_URL =
  "https://raw.githubusercontent.com/sakebomb/mcp-recall-profiles/main/";
export const COMMUNITY_REPO = "sakebomb/mcp-recall-profiles";

const SIGNER_WORKFLOW_PATH = ".github/workflows/manifest.yml";
const SIGNER_REF = "refs/heads/main";

/**
 * The exact signing identity we accept for the manifest, matched against the
 * certificate's SubjectAlternativeName.
 *
 * Repo scope alone is too weak: it accepts an attestation from *any* workflow in
 * COMMUNITY_REPO, so any workflow there able to obtain an OIDC token could mint a
 * trust root we would honour.
 *
 * `--signer-workflow` is not sufficient either. It compiles to a *prefix-anchored*
 * SAN match with no terminator — verified empirically: a truncated `…/workflows/man`
 * also passes. Since the real SAN is `…/manifest.yml@refs/heads/<ref>`, the prefix
 * stops short of the ref, so an attestation signed from any branch still matches.
 * `--cert-identity` matches the whole SAN exactly, which pins the ref too, and so
 * does not rely on the attest-step `github.ref` guard living in the profiles repo.
 *
 * Deliberately strict: if that workflow ever attests from a tag or a renamed default
 * branch, verification fails loudly rather than silently widening what we trust.
 * Derived from COMMUNITY_REPO so the repo and its accepted signer cannot drift.
 */
export const SIGNER_IDENTITY =
  `https://github.com/${COMMUNITY_REPO}/${SIGNER_WORKFLOW_PATH}@${SIGNER_REF}`;

// ── input validation ──────────────────────────────────────────────────────────

const SAFE_ID_RE = /^[a-z0-9_-]+$/;
const SAFE_FILE_RE = /^profiles\/[a-z0-9_-]+\/[a-z0-9_.-]+\.toml$/;

export function assertSafeId(id: string): void {
  if (!SAFE_ID_RE.test(id)) {
    throw new Error(
      `Invalid profile id "${id}": must match /^[a-z0-9_-]+$/ (no path separators or special characters).`
    );
  }
}

export function assertSafeFile(file: string): void {
  if (!SAFE_FILE_RE.test(file)) {
    throw new Error(
      `Invalid profile file path "${file}": must match profiles/<id>/<name>.toml and contain no path traversal.`
    );
  }
}

/** Strip ANSI escape sequences and non-printable control characters. */
export function sanitize(value: string): string {
  return value.replace(/[\x00-\x1F\x7F]|\x9B|\x1B\[[0-9;]*[a-zA-Z]/g, "");
}

// ── directory helpers ─────────────────────────────────────────────────────────

export function communityDir(): string {
  return (
    process.env.RECALL_COMMUNITY_PROFILES_PATH ??
    join(homedir(), ".local", "share", "mcp-recall", "profiles", "community")
  );
}

export function userDir(): string {
  return (
    process.env.RECALL_USER_PROFILES_PATH ??
    join(homedir(), ".config", "mcp-recall", "profiles")
  );
}

// ── manifest types ────────────────────────────────────────────────────────────

export interface ManifestEntry {
  id: string;
  version: string;
  description: string;
  mcp_pattern: string | string[];
  file: string;
  sha256?: string;
  author?: string;
  short_name?: string;
  mcp_url?: string;
}

export function manifestShortName(e: ManifestEntry): string {
  return e.short_name ?? e.id.replace(/^mcp__/, "");
}

// ── manifest fetch + verify ───────────────────────────────────────────────────

export async function fetchProfileContent(filePath: string): Promise<string> {
  const res = await fetch(`${PROFILE_BASE_URL}${filePath}`);
  if (!res.ok) throw new Error(`profile fetch failed (${filePath}): ${res.status}`);
  return res.text();
}

export function verifyHash(content: string, expected: string | undefined, id: string): void {
  if (!expected) {
    // Older manifest without sha256 — skip verification
    return;
  }
  const actual = createHash("sha256").update(content).digest("hex");
  if (actual !== expected) {
    throw new Error(
      `Profile ${id}: hash mismatch (expected ${expected.slice(0, 8)}…, got ${actual.slice(0, 8)}…)`
    );
  }
}

/** stderr shapes gh uses when it doesn't recognise a flag we pass. */
const UNSUPPORTED_FLAG_RE = /unknown (flag|command|shorthand flag)/i;

/**
 * Verify the manifest file has a valid GitHub Artifact Attestation.
 * Shells out to `gh attestation verify`. Degrades gracefully if gh is absent
 * or too old to support the flags we pin with.
 */
export function verifyManifest(manifestPath: string, mode: "warn" | "error" | "skip"): void {
  if (mode === "skip") return;

  let ghAvailable = false;
  try {
    const probe = Bun.spawnSync(["gh", "--version"], { stderr: "ignore", stdout: "ignore" });
    ghAvailable = probe.exitCode === 0;
  } catch {
    // gh not in PATH
  }

  if (!ghAvailable) {
    process.stderr.write(
      "[recall] manifest signature verification skipped: gh CLI not found in PATH\n"
    );
    return;
  }

  const result = Bun.spawnSync(
    [
      "gh", "attestation", "verify", manifestPath,
      "--repo", COMMUNITY_REPO,
      "--cert-identity", SIGNER_IDENTITY,
    ],
    { stderr: "pipe", stdout: "ignore" }
  );

  if (result.exitCode !== 0) {
    const errText = result.stderr ? new TextDecoder().decode(result.stderr).trim() : "";

    // A gh too old for these flags exits non-zero just like a bad signature does.
    // Reporting that as "verification failed" would read as a tampered manifest, so
    // treat it as the tooling gap it is — same graceful path as gh being absent.
    // Covers both an unknown --cert-identity and, on older still, no `attestation`
    // subcommand at all; the remedy is the same either way.
    if (UNSUPPORTED_FLAG_RE.test(errText)) {
      process.stderr.write(
        "[recall] manifest signature verification skipped: this gh CLI does not support the flags we verify with (upgrade gh)\n"
      );
      return;
    }

    const msg = `[recall] manifest signature verification failed${errText ? `: ${errText}` : ""}\n`;
    if (mode === "error") {
      throw new Error(msg.trim());
    }
    process.stderr.write(msg);
  }
}

export async function fetchManifest(skipVerify = false): Promise<ManifestEntry[]> {
  const res = await fetch(MANIFEST_URL);
  if (!res.ok) throw new Error(`manifest fetch failed: ${res.status} ${res.statusText}`);
  const text = await res.text();

  if (!skipVerify) {
    const tmpPath = join(tmpdir(), `mcp-recall-manifest-${process.pid}.json`);
    try {
      writeFileSync(tmpPath, text, "utf8");
      const config = loadConfig();
      verifyManifest(tmpPath, config.profiles.verify_signature);
    } finally {
      try { unlinkSync(tmpPath); } catch { /* best effort */ }
    }
  }

  const data = JSON.parse(text) as { profiles: ManifestEntry[] };
  return data.profiles;
}

export function saveToCommunityDir(profileId: string, content: string): string {
  const dir = join(communityDir(), profileId);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, "default.toml");
  writeFileSync(filePath, content);
  return filePath;
}

// ── installed community profile index ────────────────────────────────────────

export function installedCommunityMap(): Map<string, string> {
  const map = new Map<string, string>(); // id → version
  let entries: string[];
  try {
    entries = readdirSync(communityDir());
  } catch {
    return map;
  }
  for (const entry of entries) {
    const toml = join(communityDir(), entry, "default.toml");
    try {
      const p = parse(readFileSync(toml, "utf8")) as Record<string, unknown>;
      const version = (p["profile"] as Record<string, unknown>)["version"] as string;
      map.set(entry, version ?? "0.0.0");
    } catch {
      /* skip */
    }
  }
  return map;
}

// ── interactive resolution ────────────────────────────────────────────────────

/** Prompts the user to pick a number in [min, max] when running in a TTY. Re-prompts up to 3 times on invalid input. */
async function promptNumber(msg: string, min: number, max: number): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt++) {
    process.stdout.write(msg);
    const line = await new Promise<string>((resolve) => {
      process.stdin.setEncoding("utf8");
      process.stdin.once("data", (d) => resolve(String(d).trim()));
    });
    const n = parseInt(line);
    if (!isNaN(n) && n >= min && n <= max) return n;
    console.error(`Invalid choice. Enter a number between ${min} and ${max}.`);
  }
  console.error("Too many invalid attempts.");
  process.exit(1);
}

/**
 * Resolves a user-supplied name-or-id to a ManifestEntry.
 * Precedence: exact id → exact short_name → TTY picker / non-TTY error on ambiguity.
 */
export async function resolveManifestEntry(
  nameOrId: string,
  entries: ManifestEntry[]
): Promise<ManifestEntry> {
  const exact = entries.find((e) => e.id === nameOrId);
  if (exact) return exact;

  const matches = entries.filter((e) => manifestShortName(e) === nameOrId);

  if (matches.length === 1) return matches[0]!;

  if (matches.length === 0) {
    console.error(`Profile "${nameOrId}" not found.`);
    console.log(`Run: mcp-recall profiles available`);
    process.exit(1);
  }

  // Multiple matches — interactive picker when TTY, hard error otherwise
  if (!process.stdin.isTTY) {
    const ids = matches.map((e) => e.id).join(", ");
    console.error(
      `Error: "${nameOrId}" is ambiguous. Matches: ${ids}. Use the full id to disambiguate.`
    );
    process.exit(1);
  }

  console.log(`\nMultiple profiles match "${nameOrId}":`);
  matches.forEach((e, i) => {
    const pattern = Array.isArray(e.mcp_pattern) ? e.mcp_pattern[0] : e.mcp_pattern;
    const name = sanitize(manifestShortName(e)).padEnd(22);
    const pat = (pattern ?? "").padEnd(32);
    console.log(`  ${i + 1}. ${name} ${pat} ${sanitize(e.description).slice(0, 40)}`);
  });
  const choice = await promptNumber(`Pick one (1-${matches.length}): `, 1, matches.length);
  return matches[choice - 1]!;
}
