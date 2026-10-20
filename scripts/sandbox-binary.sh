#!/usr/bin/env bash
# Runs the standalone-binary checks (packaged-cli-smoke.sh --binary, #367) in a
# throwaway container, so nothing touches this machine's ~/.claude or store: the
# repo is mounted read-only, the container has no network, and it is deleted
# when the run ends.
#
# Usage: scripts/sandbox-binary.sh   (or: bun run sandbox:binary)
#
# Builds the linux-x64 binary first, so it never tests a stale one. Linux x64
# only: the other release targets need emulation or their own OS, and CI runs
# them on GitHub-hosted runners.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="ubuntu:24.04" # no Bun or Node: the binary must not need them

[ "$(uname -s)-$(uname -m)" = "Linux-x86_64" ] \
  || { echo "sandbox-binary: Linux x64 hosts only; CI covers the other targets" >&2; exit 1; }
command -v docker >/dev/null || { echo "sandbox-binary: docker not found" >&2; exit 1; }

# The smoke script's helpers need Bun. This machine's is mounted under a .bun
# path, which the script drops from PATH whenever it runs the binary.
BUN="$(readlink -f "$(command -v bun)")"

(cd "$ROOT" && bun run build:binary --target bun-linux-x64)

docker run --rm --network none \
  -v "$ROOT:/repo:ro" \
  -v "$BUN:/opt/.bun/bin/bun:ro" \
  -e PATH=/opt/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  -w /repo "$IMAGE" \
  bash scripts/packaged-cli-smoke.sh --binary dist/bin/mcp-recall-linux-x64
