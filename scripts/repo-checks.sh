#!/usr/bin/env bash
set -euo pipefail

BASE="${1:?}"
HEAD="${2:?}"

FAIL=0

while IFS= read -r sha; do
  [ -z "$sha" ] && continue

  author_email="$(git log -1 --pretty=%ae "$sha")"
  case "$author_email" in
    *dependabot*) continue ;;
  esac

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
done < <(git rev-list --no-merges "$BASE".."$HEAD")

# Setas Unicode (→ ← ↗...) quebram a exibição em alguns aparelhos: texto
# novo do site usa palavras ou, no máximo, "->". Comentários não contam.
# Três pontos: só o que a branch acrescentou desde que saiu da base (uma
# branch atrás do main não "acrescenta" o que o main já tirou).
if git diff -U0 "$BASE"..."$HEAD" -- 'src/*.ts' 'src/*.tsx' ':!*.test.ts' ':!*.test.tsx' \
  | python3 -c '
import re, sys
bad = []
for line in sys.stdin:
    if not line.startswith("+") or line.startswith("+++"):
        continue
    code = line[1:].strip()
    if code.startswith(("//", "*", "/*", "{/*")):
        continue
    if re.search("[\u2190-\u21ff\u27f5-\u27ff\u2794-\u27bf]", code):
        bad.append(code)
for b in bad:
    print("seta no texto: " + b[:120])
sys.exit(1 if bad else 0)
'; then :; else
  FAIL=1
fi

if [ "$FAIL" -ne 0 ]; then
  exit 1
fi

exit 0
