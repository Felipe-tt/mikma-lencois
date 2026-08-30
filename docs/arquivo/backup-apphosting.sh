#!/usr/bin/env bash
# Backup local (sem custo) antes de apagar o backend de teste do App Hosting
# e os secrets migrados. Roda isso ANTES de qualquer comando de delete.
#
# Uso:
#   chmod +x backup-apphosting.sh
#   ./backup-apphosting.sh
#
# Gera uma pasta backup-apphosting-<data>/ com:
#   - backend-config.json / .txt  → config do backend (região, env vars, etc.)
#   - secrets/NOME.txt            → valor atual de cada secret migrado
#
# IMPORTANTE: essa pasta vai ter chaves/senhas em texto puro.
# NÃO comita isso no git. Guarda local (ou joga num gerenciador de senha)
# e apaga a pasta depois de confirmar que não precisa mais.

set -euo pipefail

PROJECT_ID="mikma-lencois"
BACKEND_ID="mikma-lencois-test"
LOCATION="us-east4"
OUT_DIR="backup-apphosting-$(date +%Y%m%d-%H%M%S)"

mkdir -p "$OUT_DIR/secrets"
echo "Salvando em: $OUT_DIR"

echo "== Config do backend =="
firebase apphosting:backends:get "$BACKEND_ID" \
  --project "$PROJECT_ID" \
  --location "$LOCATION" \
  > "$OUT_DIR/backend-config.txt" 2>&1 || echo "  (aviso: não consegui pegar via firebase CLI, tenta com gcloud abaixo)"

gcloud run services describe "$BACKEND_ID" \
  --project "$PROJECT_ID" \
  --region "$LOCATION" \
  --format=json \
  > "$OUT_DIR/backend-config.json" 2>&1 || echo "  (aviso: gcloud run describe falhou, ok se o backend usa outro nome de serviço)"

echo "== Baixando valores dos secrets =="
SECRETS=(
  NEXT_PUBLIC_FIREBASE_API_KEY
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  NEXT_PUBLIC_FIREBASE_PROJECT_ID
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  NEXT_PUBLIC_FIREBASE_APP_ID
  NEXT_PUBLIC_FIREBASE_VAPID_KEY
  NEXT_PUBLIC_GOOGLE_CLIENT_ID
  NEXT_PUBLIC_RECAPTCHA_SITE_KEY
  NEXT_PUBLIC_SENTRY_DSN
  SENTRY_ORG
  SENTRY_PROJECT
  SENTRY_AUTH_TOKEN
  FIREBASE_PROJECT_ID
  FIREBASE_CLIENT_EMAIL
  FIREBASE_PRIVATE_KEY
  SENTRY_DSN
  RECAPTCHA_SECRET_KEY
  ABACATEPAY_API_KEY
  ABACATEPAY_PUBLIC_KEY
  MELHOR_ENVIO_TOKEN
  MELHOR_ENVIO_CLIENT_SECRET
  RESEND_API_KEY
  RESEND_WEBHOOK_SECRET
  RESEND_FROM_EMAIL
  EMAIL_CONTATO_ADDRESS
  UPSTASH_REDIS_REST_URL
  UPSTASH_REDIS_REST_TOKEN
  STAFF_SESSION_SECRET
  CRON_SECRET
  UBER_DIRECT_CLIENT_ID
  UBER_DIRECT_CLIENT_SECRET
  UBER_DIRECT_CUSTOMER_ID
  UBER_DIRECT_WEBHOOK_SECRET
  UBER_DIRECT_SANDBOX_CLIENT_ID
  UBER_DIRECT_SANDBOX_CLIENT_SECRET
  UBER_DIRECT_SANDBOX_CUSTOMER_ID
  UBER_DIRECT_SANDBOX_WEBHOOK_SECRET
)

MISSING=()
for name in "${SECRETS[@]}"; do
  if gcloud secrets versions access latest --secret="$name" --project "$PROJECT_ID" \
      > "$OUT_DIR/secrets/$name.txt" 2>/dev/null; then
    echo "  ok: $name"
  else
    echo "  (não existe ou já foi apagado: $name)"
    rm -f "$OUT_DIR/secrets/$name.txt"
    MISSING+=("$name")
  fi
done

echo ""
echo "== Feito =="
echo "Backup salvo em: $OUT_DIR"
if [ ${#MISSING[@]} -gt 0 ]; then
  echo "Secrets não encontrados no Secret Manager (provavelmente nunca migrados): ${MISSING[*]}"
fi
echo ""
echo "Lembrete: essa pasta tem senha/chave em texto puro. Não sobe pro git."
