#!/usr/bin/env bash
# Cria cada secret que ESTIVER FALTANDO no Secret Manager do Google Cloud, a
# partir das env vars recebidas do workflow (GitHub Actions secrets), e
# garante que os backends do App Hosting tenham permissão de leitura.
#
# CRÍTICO, aprendido do jeito difícil: este script NUNCA sobrescreve o valor
# de um secret que já existe. Só cria os que estão genuinamente faltando
# (o motivo original de existir: ABACATEPAY_WEBHOOK_SECRET). Uma versão
# anterior deste script recriava TODOS os secrets listados sempre que
# rodava, mesmo os que já funcionavam — e como o App Hosting resolve
# `latest` a cada instância nova (não só em deploys, em qualquer
# autoscale/restart), uma versão nova de FIREBASE_PRIVATE_KEY com qualquer
# corrupção de encoding (esperado ao passar uma chave PEM multi-linha por
# GitHub Actions -> env var -> stdin) derrubou o site inteiro em produção,
# porque toda instância nova falhava ao inicializar o Firebase Admin.
#
# Se um dia for preciso ATUALIZAR o valor de um secret que já existe (ex:
# rotacionar uma chave vazada), isso deve ser uma ação deliberada e isolada
# — nunca misturada num script que roda "só pra garantir".
#
# Não inclui UBER_DIRECT_CREDS / UBER_DIRECT_SANDBOX_CREDS /
# UPSTASH_REDIS_CREDS de propósito: são secrets JSON consolidados que já
# funcionam, sem necessidade de tocar neles.
set -euo pipefail

: "${PROJECT_ID:?defina PROJECT_ID}"

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

  # Já existe no Secret Manager? Então não mexe no valor, ponto final —
  # só garante que os backends têm acesso (idempotente e seguro, nunca
  # altera o conteúdo do secret).
  if npx --yes firebase-tools@latest apphosting:secrets:access "$name" --project "$PROJECT_ID" >/dev/null 2>&1; then
    echo "· $name — já existe, não sobrescrevendo o valor (só confirmando acesso do backend)"
    for backend in "${BACKENDS[@]}"; do
      npx --yes firebase-tools@latest apphosting:secrets:grantaccess "$name" \
        --project "$PROJECT_ID" --backend "$backend" --location "$LOCATION" >/dev/null 2>&1 || true
    done
    continue
  fi

  if [ -z "$value" ]; then
    echo "· $name — não existe no Secret Manager E o GitHub secret está vazio, não dá pra criar. Pulando."
    continue
  fi

  echo "=== $name (não existe ainda, criando pela primeira vez) ==="
  if printf '%s' "$value" | npx --yes firebase-tools@latest apphosting:secrets:set "$name" \
      --project "$PROJECT_ID" --data-file - --force; then
    echo "  ✓ secret criado no Secret Manager"
  else
    echo "  ✗ falha ao criar $name"
    any_failed=1
    continue
  fi

  for backend in "${BACKENDS[@]}"; do
    if npx --yes firebase-tools@latest apphosting:secrets:grantaccess "$name" \
        --project "$PROJECT_ID" --backend "$backend" --location "$LOCATION" 2>/dev/null; then
      echo "  ✓ acesso concedido ao backend $backend"
    else
      echo "  · backend $backend não encontrado, ignorando"
    fi
  done
done

if [ "$any_failed" -eq 1 ]; then
  echo ""
  echo "Um ou mais secrets falharam ao criar, veja os ✗ acima."
  exit 1
fi

echo ""
echo "Concluído. Secrets que já existiam não foram alterados. Um novo deploy deve resolver os que faltavam."
