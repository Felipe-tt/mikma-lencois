#!/usr/bin/env bash
set -euo pipefail

BASE="${1:?}"
HEAD="${2:?}"

FAIL=0

while IFS= read -r sha; do
  [ -z "$sha" ] && continue
  msg="$(git log -1 --pretty=%B "$sha")"
  subject="$(printf '%s' "$msg" | head -n1)"
  subject_len=${#subject}
  total_len=${#msg}

  if printf '%s' "$msg" | python3 -c "import sys; sys.exit(0 if chr(0x2014) in sys.stdin.read() else 1)"; then
    echo "check failed on $sha"
    FAIL=1
  fi

  if [ "$subject_len" -gt 72 ]; then
    echo "check failed on $sha"
    FAIL=1
  fi

  if [ "$total_len" -gt 500 ]; then
    echo "check failed on $sha"
    FAIL=1
  fi
done < <(git rev-list "$BASE".."$HEAD")

if [ "$FAIL" -ne 0 ]; then
  exit 1
fi

exit 0
