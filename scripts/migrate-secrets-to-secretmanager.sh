#!/usr/bin/env bash
# Cria (ou atualiza) cada secret no Secret Manager do Google Cloud a partir
# das env vars recebidas do workflow (que por sua vez vêm dos GitHub Actions
# secrets), e garante que os backends do App Hosting tenham permissão de
# leitura. Idempotente: pode rodar de novo sem problema — se o secret já
# existir, só adiciona uma versão nova; se o backend já tiver acesso, o
# grantaccess simplesmente não faz nada.
#
# Só toca em secrets que estejam de fato quebrados/faltando hoje
# (ABACATEPAY_WEBHOOK_SECRET, motivo original deste script) + os que já
# estavam mapeados no workflow desde antes. NÃO inclui UBER_DIRECT_CREDS /
# UBER_DIRECT_SANDBOX_CREDS / UPSTASH_REDIS_CREDS de propósito: esses são
# secrets JSON consolidados que já funcionam em produção (o Robo Courier da
# Uber, PR #124, foi o último deploy que completou com sucesso) — não há
# necessidade de tocar neles, e o formato JSON exato (chaves internas)
# tornaria fácil recriar errado sem querer.
set -euo pipefail

: "${PROJECT_ID:?defina PROJECT_ID}"

# location "-" no grantaccess = "todas as regiões desse backend", mas o
# comando ainda exige --backend explícito. Dois backends conhecidos no
# projeto (visto no console: erro apareceu em "prod"; firebase.json local
# aponta pro "test") — tenta os dois, ignora silenciosamente o que não
# existir.
BACKENDS=(mikma-lencois-prod mikma-lencois-test)
LOCATION=us-east4

declare -A SECRETS=(
  [SENTRY_AUTH_TOKEN]="${SENTRY_AUTH_TOKEN:-}"
  [FIREBASE_CLIENT_EMAIL]="${FIREBASE_CLIENT_EMAIL:-}"
  [FIREBASE_PRIVATE_KEY]="${FIREBASE_PRIVATE_KEY:-}"
  [RECAPTCHA_SECRET_KEY]="${RECAPTCHA_SECRET_KEY:-}"
  [ABACATEPAY_API_KEY]="${ABACATEPAY_API_KEY:-}"
  [ABACATEPAY_WEBHOOK_SECRET]="${ABACATEPAY_WEBHOOK_SECRET:-}"
  [MELHOR_ENVIO_TOKEN]="${MELHOR_ENVIO_TOKEN:-}"
  [RESEND_API_KEY]="${RESEND_API_KEY:-}"
  [RESEND_WEBHOOK_SECRET]="${RESEND_WEBHOOK_SECRET:-}"
  [STAFF_SESSION_SECRET]="${STAFF_SESSION_SECRET:-}"
  [CRON_SECRET]="${CRON_SECRET:-}"
)

any_failed=0

for name in "${!SECRETS[@]}"; do
  value="${SECRETS[$name]}"
  if [ -z "$value" ]; then
    echo "· $name — pulado (GitHub secret vazio ou não configurado)"
    continue
  fi

  echo "=== $name ==="
  if printf '%s' "$value" | npx --yes firebase-tools@latest apphosting:secrets:set "$name" \
      --project "$PROJECT_ID" --data-file - --force; then
    echo "  ✓ secret criado/atualizado no Secret Manager"
  else
    echo "  ✗ falha ao criar/atualizar $name"
    any_failed=1
    continue
  fi

  for backend in "${BACKENDS[@]}"; do
    if npx --yes firebase-tools@latest apphosting:secrets:grantaccess "$name" \
        --project "$PROJECT_ID" --backend "$backend" --location "$LOCATION" 2>/dev/null; then
      echo "  ✓ acesso concedido ao backend $backend"
    else
      echo "  · backend $backend não encontrado ou já tinha acesso, ignorando"
    fi
  done
done

if [ "$any_failed" -eq 1 ]; then
  echo ""
  echo "Um ou mais secrets falharam ao migrar, veja os ✗ acima."
  exit 1
fi

echo ""
echo "Concluído. Um novo deploy (push na main, ou redeploy manual no console) já deve resolver os secrets normalmente."
