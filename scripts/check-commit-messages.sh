#!/usr/bin/env bash
# Valida as mensagens de commit de um intervalo (base..head).
#
# Regras:
#   - Sem o caractere — (em dash, U+2014) em nenhuma linha.
#   - Primeira linha (subject) com no máximo 72 caracteres.
#   - Mensagem inteira (subject + corpo) com no máximo 500 caracteres.
#
# Uso: scripts/check-commit-messages.sh <base-sha> <head-sha>
set -euo pipefail

BASE="${1:?uso: check-commit-messages.sh <base-sha> <head-sha>}"
HEAD="${2:?uso: check-commit-messages.sh <base-sha> <head-sha>}"

FAIL=0

while IFS= read -r sha; do
  [ -z "$sha" ] && continue
  msg="$(git log -1 --pretty=%B "$sha")"
  subject="$(printf '%s' "$msg" | head -n1)"
  subject_len=${#subject}
  total_len=${#msg}

  if printf '%s' "$msg" | python3 -c "import sys; sys.exit(0 if '—' in sys.stdin.read() else 1)"; then
    echo "❌ commit $sha usa '—' (em dash) na mensagem — troque por vírgula, ponto ou hífen simples."
    FAIL=1
  fi

  if [ "$subject_len" -gt 72 ]; then
    echo "❌ commit $sha: primeira linha da mensagem tem $subject_len caracteres (máximo 72). Resuma."
    FAIL=1
  fi

  if [ "$total_len" -gt 500 ]; then
    echo "❌ commit $sha: mensagem inteira tem $total_len caracteres (máximo 500). Resuma."
    FAIL=1
  fi
done < <(git rev-list "$BASE".."$HEAD")

if [ "$FAIL" -ne 0 ]; then
  echo ""
  echo "Uma ou mais mensagens de commit violam o padrão do repositório (mensagens curtas, sem '—')."
  exit 1
fi

echo "✅ Mensagens de commit dentro do padrão."
