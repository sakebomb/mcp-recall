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
#        scripts/packaged-cli-smoke.sh --binary <standalone-binary>   (#361)
# The --binary mode runs on Linux, macOS and Git Bash on Windows (#367), and
# scripts/sandbox-binary.sh runs it in a throwaway container. Bun is the only
# dependency besides the shell, coreutils and perl.
# The single-quoted bun programs below are meant to be literal.
# shellcheck disable=SC2016
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
BINARY=""
if [ "${1:-}" = "--binary" ]; then
  BINARY="$(cd "$(dirname "${2:?usage: $0 --binary <path>}")" && pwd)/$(basename "$2")"
  [ -x "$BINARY" ] || { echo "::error::not an executable: $BINARY"; exit 1; }
else
  CONSUMER="$(cd "${1:?usage: $0 <consumer-project-dir>}" && pwd)"
fi
# Physical path: a binary registers its resolved location, and macOS's temp dir
# sits under a symlink (/var -> /private/var).
WORK="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$WORK"' EXIT

# Isolate from any real config, store, or project on this machine.
export HOME="$WORK/home"
# Windows: Bun's os.homedir() reads USERPROFILE, so HOME alone would leave the
# real profile exposed. Git Bash converts the other POSIX paths in the env itself.
if command -v cygpath >/dev/null 2>&1; then
  export USERPROFILE; USERPROFILE="$(cygpath -w "$HOME")"
fi
export RECALL_CONFIG_PATH="$WORK/no-such-config.toml"
unset RECALL_DEBUG
PROJECT="$WORK/project"
mkdir -p "$HOME" "$PROJECT"

# Portable: BSD sed has no \x1b (and macOS has no timeout(1), so perl's alarm below).
strip_ansi() { perl -pe 's/\e\[[0-9;]*m//g'; }
# The path a program sees: Windows form under Git Bash, unchanged elsewhere.
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

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
  MARKER="$1" EXTRA="${2:-}" bun -e '
    const { MARKER: marker, EXTRA: extra } = process.env;
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
  '
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
  OUT="$dump" FAKE="$FAKE_SECRET" bun -e '
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

# config_js <expr> — a JS expression over the isolated ~/.claude.json (c) and
# ~/.claude/settings.json (s), with BIN, hooks(event) and recallHooks(event) in scope.
config_js() {
  EXPR="$1" bun -e '
    const { homedir } = require("os");
    const read = async (p) => (await Bun.file(p).exists()) ? JSON.parse(await Bun.file(p).text()) : {};
    const c = await read(homedir() + "/.claude.json");
    const s = await read(homedir() + "/.claude/settings.json");
    const BIN = process.env.BIN ?? "";
    const hooks = (ev) => (s.hooks?.[ev] ?? []).flatMap((e) => e.hooks ?? []);
    const marker = { SessionStart: " session-start", PostToolUse: " post-tool-use" };
    const recallHooks = (ev) => hooks(ev).filter((h) => h.command.endsWith(marker[ev]));
    const r = eval(process.env.EXPR);
    console.log(typeof r === "string" ? r : JSON.stringify(r));
  '
}
# config_edit <statements> — mutate c and s as a user would, and write both back.
config_edit() {
  EXPR="$1" bun -e '
    const { homedir } = require("os");
    const cp = homedir() + "/.claude.json", sp = homedir() + "/.claude/settings.json";
    const c = JSON.parse(await Bun.file(cp).text()), s = JSON.parse(await Bun.file(sp).text());
    eval(process.env.EXPR);
    await Bun.write(cp, JSON.stringify(c, null, 2));
    await Bun.write(sp, JSON.stringify(s, null, 2));
  '
}
js_true() { [ "$(config_js "$1")" = "true" ]; }
check() { js_true "$2" || fail "$1"; echo "ok: $1"; } # <description> <expr true when correct>
fresh_home() {
  export HOME="$WORK/$1"
  mkdir -p "$HOME"
  if command -v cygpath >/dev/null 2>&1; then USERPROFILE="$(cygpath -w "$HOME")"; fi
}

# 6. Moving between an npm install and the binary, in both directions, with the
#    edits a user makes to recall's entries and to everything around them.
switch_checks() {
  NPM=(bun "$REPO/plugins/mcp-recall/dist/cli.js")
  [ -f "${NPM[1]}" ] || fail "switch: no npm bundle at ${NPM[1]}"
  local copy="$WORK/bin/mcp-recall$EXE"
  mkdir -p "$WORK/bin"
  cp "$BINARY" "$copy"
  BIN="$(native "$copy")"
  fresh_home switch-home

  "${NPM[@]}" install >/dev/null
  config_edit '
    c.mcpServers.recall.env = { RECALL_DB_PATH: "/custom/db" };
    s.hooks.PostToolUse[0].hooks[0].timeout = 30;
    s.hooks.PostToolUse.unshift({ matcher: "Bash", hooks: [{ type: "command", command: "other-tool check" }] });
    s.model = "opus";'
  # Without this, a seed that silently failed would let the #365 lines pass as "defect".
  check "npm: the user's env and timeout are in place before the switch" \
    'c.mcpServers.recall.env?.RECALL_DB_PATH === "/custom/db" && recallHooks("PostToolUse")[0].timeout === 30'

  run_bin "$copy" install >/dev/null
  check "npm -> binary: the server runs the binary" 'c.mcpServers.recall.command === BIN'
  check "npm -> binary: one recall hook per event" \
    'recallHooks("SessionStart").length === 1 && recallHooks("PostToolUse").length === 1'
  check "npm -> binary: another tool's hook and unrelated settings survive" \
    'hooks("PostToolUse").some((h) => h.command === "other-tool check") && s.model === "opus"'
  check "npm -> binary: the server keeps its env (#365)" \
    'c.mcpServers.recall.env?.RECALL_DB_PATH === "/custom/db"'
  check "npm -> binary: the hook keeps a raised timeout (#365)" \
    'recallHooks("PostToolUse")[0].timeout === 30'

  "${NPM[@]}" install >/dev/null
  check "binary -> npm: the server runs bun and the bundle" \
    'c.mcpServers.recall.command === "bun" && /server\.js$/.test(c.mcpServers.recall.args[0])'
  check "binary -> npm: one recall hook per event, none naming the binary" \
    'recallHooks("SessionStart").length === 1 && recallHooks("PostToolUse").length === 1
     && ![...hooks("SessionStart"), ...hooks("PostToolUse")].some((h) => h.command.includes(BIN))'

  run_bin "$copy" install >/dev/null
  # Positive control: the line below must be reporting #364, not a broken status.
  npm_status_not_installed && fail "switch: npm status does not report installed while the binary is present"
  mv "$copy" "$copy.gone"
  npm_status_not_installed || fail "switch: npm status still reports installed with the registered binary gone (#364)"
  echo "ok: npm status flags a registered binary that is gone (#364)"
  mv "$copy.gone" "$copy"

  # A name without "recall": the hook detectors key on that substring.
  fresh_home rename-home
  local renamed="$WORK/bin/mr$EXE"
  cp "$BINARY" "$renamed"
  BIN="$(native "$renamed")"
  case "$BIN" in *recall*) fail "rename: $BIN contains 'recall', so this would prove nothing" ;; esac
  run_bin "$renamed" install >/dev/null
  run_bin "$renamed" install >/dev/null
  check "a renamed binary installed twice has one hook per event (#366)" \
    'recallHooks("SessionStart").length === 1 && recallHooks("PostToolUse").length === 1'
  run_bin "$renamed" uninstall >/dev/null
  check "uninstall removes a renamed binary's server" 'c.mcpServers?.recall === undefined'
  check "uninstall removes a renamed binary's hooks (#366)" \
    'recallHooks("SessionStart").length + recallHooks("PostToolUse").length === 0'
}
npm_status_not_installed() { ! "${NPM[@]}" status 2>&1 | strip_ansi | grep -qx "Installation: installed"; }

if [ -n "$BINARY" ]; then
  case "$BINARY" in *.exe) EXE=.exe ;; *) EXE="" ;; esac
  # Bun is dropped from PATH for the binary only: the db_scalar and payload
  # helpers still use it, but the binary must run without it.
  NO_BUN_PATH="$(printf '%s' "$PATH" | tr ':' '\n' | grep -v -e '\.bun' | paste -sd: -)"
  if PATH="$NO_BUN_PATH" command -v bun >/dev/null 2>&1; then
    fail "bun is still on PATH after removing .bun directories; the binary checks would not prove it runs without Bun"
  fi
  run_bin() { env PATH="$NO_BUN_PATH" "$@"; }
  exercise binary run_bin "$BINARY"

  # 5. install registers the binary itself, status calls it complete, and the
  #    registered hook and server work when launched the way Claude Code launches
  #    them. HOME is already isolated above.
  export BIN
  BIN="$(native "$BINARY")"
  run_bin "$BINARY" install >/dev/null || fail "binary: install exited non-zero"
  check "install registered the binary as the server" \
    'c.mcpServers.recall.command === BIN && c.mcpServers.recall.args.join(" ") === "serve"'
  check "install registered the binary as both hooks" \
    'recallHooks("SessionStart").length === 1 && recallHooks("PostToolUse").length === 1
     && recallHooks("PostToolUse")[0].command.includes(BIN)'
  status="$(run_bin "$BINARY" status 2>&1 | strip_ansi)"
  # Exact line: "not installed" and "partial / stale" must not pass.
  printf '%s\n' "$status" | grep -qx "Installation: installed" || fail "binary: status does not report installed"
  printf '%s\n' "$status" | grep -q "Profiles: [1-9]" || fail "binary: bundled profiles not found"
  echo "ok: status reports the binary installed with its bundled profiles"

  # Claude Code runs a hook command through a shell (Git Bash on Windows), so
  # this is what proves the path's quoting.
  hook="$(config_js 'recallHooks("PostToolUse")[0].command')"
  payload "HOOK-SHELL" >"$WORK/in.json"
  out="$(run_bin bash -c "$hook" <"$WORK/in.json" 2>/dev/null)" || fail "binary: registered hook exited non-zero: $hook"
  case "$out" in
    *'"updatedMCPToolOutput":"[recall:'*) ;;
    *) fail "binary: the registered hook did not intercept; it printed: $out" ;;
  esac
  echo "ok: the registered hook command runs through a shell"

  # The MCP server is launched as command + args, with no shell.
  server=()
  while IFS= read -r word; do server+=("$word"); done \
    < <(config_js '[c.mcpServers.recall.command, ...c.mcpServers.recall.args].join("\n")')
  tools="$(printf '%s\n' \
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
    '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
    '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
    | run_bin perl -e 'alarm shift; exec @ARGV or die "exec: $!"' 10 "${server[@]}" 2>/dev/null \
    | grep -o '"name":"recall__[a-z_]*"' | sort -u | wc -l | tr -d ' ')" || tools=0
  [ "$tools" -gt 0 ] || fail "binary: the registered server listed no recall tools"
  echo "ok: the registered server lists $tools recall tools"

  switch_checks

  echo "standalone binary behaviour checks passed"
  exit 0
fi

# Through the node_modules/.bin symlink, which runs the packaged src/.
exercise npm-bin "$CONSUMER/node_modules/.bin/mcp-recall"
# The bundled dist/ that ships in the same tarball. The plugin's hooks run this
# bundle, not src/, so it is a separate code path that `bun test` never executes.
exercise bundled-dist bun "$CONSUMER/node_modules/mcp-recall/plugins/mcp-recall/dist/cli.js"

echo "packaged CLI behaviour checks passed"
