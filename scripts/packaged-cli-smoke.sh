#!/usr/bin/env bash
# Behaviour checks for the PACKAGED CLI, run by the "Packaged CLI" job in
# .github/workflows/ci.yml after the tarball is installed into a clean project.
#
# `--version` proves the binary launches. This proves it still does its job from a
# real npm install, where it runs src/ (or the bundled dist/) through a symlink and
# not the code `bun test` imports (#281):
#
#   - benign hook output is STORED, and the row is in the SQLite file
#   - credential-bearing hook output is SKIPPED, and the credential is nowhere in
#     the database file (including its WAL), not merely absent from stdout
#   - `import` WITHHOLDS a credential-bearing row and still lands the clean one
#
# Every assertion reads the resulting database. The "credential" is a made-up
# string of the right shape, assembled at run time; no real secret is involved.
#
# Usage: scripts/packaged-cli-smoke.sh <consumer-project-dir>
# The single-quoted node/bun programs below are meant to be literal.
# shellcheck disable=SC2016
set -euo pipefail

CONSUMER="$(cd "${1:?usage: $0 <consumer-project-dir>}" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Isolate from any real config, store, or project on this machine.
export HOME="$WORK/home"
export RECALL_CONFIG_PATH="$WORK/no-such-config.toml"
unset RECALL_DEBUG
PROJECT="$WORK/project"
mkdir -p "$HOME" "$PROJECT"

# 36 chars after the prefix matches the "GitHub PAT (classic)" pattern. Built in
# pieces so this file never contains a string a secret scanner would flag.
FAKE_SECRET="ghp_$(printf 'Z%.0s' $(seq 1 36))"

fail() { echo "::error::$*"; exit 1; }

# db_scalar <db> <sql> [param] — one value out of the real database file.
db_scalar() {
  DB="$1" SQL="$2" PARAM="${3:-}" bun -e '
    import { Database } from "bun:sqlite";
    const db = new Database(process.env.DB, { readonly: true });
    const q = db.query(process.env.SQL);
    const row = process.env.PARAM ? q.get(process.env.PARAM) : q.get();
    console.log(row ? Object.values(row)[0] : "");
  '
}

# 40 lines of ordinary multi-line output: long enough that the summary is smaller
# than the original, so the hook stores it rather than passing it through.
payload() { # <marker> [extra line]
  node -e '
    const [marker, extra] = process.argv.slice(1);
    const lines = [];
    for (let i = 0; i < 40; i++) lines.push(`build step ${i}: compiled module-${i} ok (${marker})`);
    if (extra) lines.splice(20, 0, extra);
    const body = lines.join("\n");
    process.stdout.write(JSON.stringify({
      session_id: "pkg-smoke",
      cwd: process.env.PROJECT,
      tool_name: "mcp__fixture__read_log",
      tool_input: { marker },
      tool_response: { content: [{ type: "text", text: body }] },
    }));
  ' "$@"
}

exercise() { # <label> <command...>
  local label="$1"
  shift
  local bin=("$@")
  local db="$WORK/$label.db"
  export RECALL_DB_PATH="$db"
  export PROJECT
  echo "=== $label: ${bin[*]} ==="

  # 1. Benign output is stored.
  local out
  payload "BENIGN-$label" >"$WORK/in.json"
  out="$("${bin[@]}" post-tool-use <"$WORK/in.json" 2>/dev/null)" || fail "$label: hook exited non-zero"
  case "$out" in
    *'"updatedMCPToolOutput":"[recall:'*) ;;
    *) fail "$label: benign output was not intercepted; hook printed: $out" ;;
  esac
  [ "$(db_scalar "$db" "SELECT COUNT(*) FROM stored_outputs WHERE full_content LIKE '%BENIGN-$label%'")" = "1" ] \
    || fail "$label: benign output is not in the database"
  echo "ok: benign output stored"

  # 2. The same shape of output carrying a credential is skipped.
  payload "SECRET-$label" "token = $FAKE_SECRET" >"$WORK/in.json"
  out="$("${bin[@]}" post-tool-use <"$WORK/in.json" 2>/dev/null)" || fail "$label: hook exited non-zero"
  [ "$out" = "{}" ] || fail "$label: credential-bearing output was not skipped; hook printed: $out"
  [ "$(db_scalar "$db" "SELECT COUNT(*) FROM stored_outputs WHERE full_content LIKE '%SECRET-$label%'")" = "0" ] \
    || fail "$label: credential-bearing output reached the database"
  [ "$(db_scalar "$db" "SELECT COUNT(*) FROM stored_outputs")" = "1" ] \
    || fail "$label: expected exactly the benign row after the skip"
  echo "ok: credential-bearing output skipped"

  # 3. import withholds the credential-bearing row and still lands the clean one.
  local dump="$WORK/$label-dump.json"
  OUT="$dump" FAKE="$FAKE_SECRET" node -e '
    const row = (id, body) => ({
      id, project_key: "dump-project", session_id: "dump-session",
      tool_name: "mcp__fixture__read_log", summary: "summary", full_content: body,
      original_size: body.length, summary_size: 7, created_at: 1700000000,
      pinned: 0, access_count: 0, last_accessed: null, input_hash: null,
    });
    require("fs").writeFileSync(process.env.OUT, JSON.stringify([
      row("clean-row", "IMPORT-CLEAN-BODY"),
      row("secret-row", "IMPORT-SECRET-BODY token = " + process.env.FAKE),
    ]));
  '
  local err
  err="$(cd "$PROJECT" && "${bin[@]}" import "$dump" 2>&1 >/dev/null)" || fail "$label: import exited non-zero: $err"
  case "$err" in
    *"Withheld 1 row(s)"*) ;;
    *) fail "$label: import did not report withholding a row; stderr: $err" ;;
  esac
  [ "$(db_scalar "$db" "SELECT COUNT(*) FROM stored_outputs WHERE id = ?" clean-row)" = "1" ] \
    || fail "$label: clean row was not imported"
  [ "$(db_scalar "$db" "SELECT COUNT(*) FROM stored_outputs WHERE id = ?" secret-row)" = "0" ] \
    || fail "$label: credential-bearing row was imported"
  echo "ok: import withheld the credential-bearing row, kept the clean one"

  # 4. The credential is nowhere in the database files.
  for f in "$db" "$db-wal" "$db-shm"; do
    [ -f "$f" ] || continue
    if grep -aqF "$FAKE_SECRET" "$f"; then
      fail "$label: the credential is present in $(basename "$f")"
    fi
  done
  echo "ok: credential absent from the database files"
}

# Through the node_modules/.bin symlink, which runs the packaged src/.
exercise npm-bin "$CONSUMER/node_modules/.bin/mcp-recall"
# The bundled dist/ that ships in the same tarball. The plugin's hooks run this
# bundle, not src/, so it is a separate code path that `bun test` never executes.
exercise bundled-dist bun "$CONSUMER/node_modules/mcp-recall/plugins/mcp-recall/dist/cli.js"

echo "packaged CLI behaviour checks passed"
