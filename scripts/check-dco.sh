#!/usr/bin/env bash
# Developer Certificate of Origin check, run by .github/workflows/dco.yml on every PR.
#
#   scripts/check-dco.sh <base> <head>
#
# Every non-merge commit in base..head must carry a trailer line
# `Signed-off-by: <author name> <<author email>>` naming its own author, so the
# sign-off certifies the person who wrote the change, not whoever pushed it.
# Bot accounts (Dependabot and the like, whose names end in "[bot]") are exempt:
# they cannot certify anything. Exits 1 and names each unsigned commit.
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <base> <head>" >&2
  exit 2
fi

fail=0
while IFS=$'\t' read -r sha name email subject; do
  case "$name" in *"[bot]") continue ;; esac
  if ! git show -s --format=%B "$sha" | grep -qxF "Signed-off-by: $name <$email>"; then
    echo "missing sign-off: ${sha:0:12} $subject (needs 'Signed-off-by: $name <$email>')" >&2
    fail=1
  fi
done < <(git log --no-merges --format='%H%x09%an%x09%ae%x09%s' "$1..$2")

if [ "$fail" -ne 0 ]; then
  echo "Sign off with 'git commit --amend -s --no-edit' (last commit) or 'git rebase --signoff main' (all), then force-push. See CONTRIBUTING.md." >&2
  exit 1
fi
echo "every commit in $1..$2 is signed off"
