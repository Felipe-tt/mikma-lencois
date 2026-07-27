#!/usr/bin/env bash
# Cria/atualiza no Cloud Secret Manager um secret para cada variavel de
# ambiente listada abaixo, lendo o VALOR de uma variavel de ambiente de
# mesmo nome (pensado para rodar dentro de um workflow do GitHub Actions
# que ja tenha essas secrets disponiveis no ambiente do job).
#
# Uso: PROJECT_ID=mikma-lencois scripts/migrate-secrets-to-secretmanager.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?defina PROJECT_ID}"

SECRET_NAMES=(
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
  ORS_API_KEY
  UBER_DIRECT_CLIENT_ID
  UBER_DIRECT_CLIENT_SECRET
  UBER_DIRECT_CUSTOMER_ID
  UBER_DIRECT_WEBHOOK_SECRET
  UBER_DIRECT_SANDBOX_CLIENT_ID
  UBER_DIRECT_SANDBOX_CLIENT_SECRET
  UBER_DIRECT_SANDBOX_CUSTOMER_ID
  UBER_DIRECT_SANDBOX_WEBHOOK_SECRET
)

FAILED=0

for name in "${SECRET_NAMES[@]}"; do
  value="${!name:-}"
  if [ -z "$value" ]; then
    echo "aviso: $name vazio ou nao definido, pulando"
    continue
  fi

  if gcloud secrets describe "$name" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "$name ja existe, adicionando nova versao"
  else
    echo "criando $name"
    if ! gcloud secrets create "$name" --project="$PROJECT_ID" --replication-policy=automatic; then
      echo "ERRO ao criar $name"
      FAILED=$((FAILED+1))
      continue
    fi
  fi

  if ! printf '%s' "$value" | gcloud secrets versions add "$name" --project="$PROJECT_ID" --data-file=-; then
    echo "ERRO ao adicionar versao de $name"
    FAILED=$((FAILED+1))
  fi
done

if [ "$FAILED" -gt 0 ]; then
  echo "concluido com $FAILED falha(s) de ${#SECRET_NAMES[@]} secrets"
  exit 1
fi

echo "concluido: ${#SECRET_NAMES[@]} secrets processados"
