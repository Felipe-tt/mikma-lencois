#!/usr/bin/env bash
# Fallback automático da Cloudflare (rodado pelo cloudflare-fallback.yml).
#
# Normal: confere se mikma.com.br responde pela Cloudflare. Se não responde,
# mas o App Hosting responde direto, liga edge/status.bypass no Firestore
# (o proxy para de exigir o segredo da Cloudflare) e tira o proxy da
# Cloudflare dos registros DNS: o site passa a ser servido direto.
# Em fallback: quando a Cloudflare volta (2 checagens seguidas), religa o
# proxy nos mesmos registros e, 15 min depois (tempo do DNS mudar), desliga
# o bypass.
#
# Uso: cloudflare-fallback.sh [auto|ativar|desativar|certificado]
set -uo pipefail

ACAO=${1:-auto}
# Respondido pela borda da Cloudflare, sem chegar no servidor: checar a cada
# 5 min não custa nada no Cloud Run.
EDGE=https://mikma.com.br/cdn-cgi/trace
# Só usado quando a Cloudflare já falhou, para ver se a origem está de pé.
SITE=https://mikma.com.br/robots.txt
FS="https://firestore.googleapis.com/v1/projects/mikma-lencois/databases/(default)/documents/edge/status"
CF=https://api.cloudflare.com/client/v4
NOW=$(date +%s)

api() { curl -sS -m 20 -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" "$@"; }

zone_url() {
  local zone
  zone=$(api "$CF/zones?name=mikma.com.br" | jq -r '.result[0].id // empty')
  [ -n "$zone" ] && echo "$CF/zones/$zone"
}

# 2xx a 4xx = a borda respondeu (404/403 ainda é a Cloudflare funcionando).
site_ok() {
  local code
  for _ in 1 2 3; do
    code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$@" || true)
    [ "$code" -ge 200 ] 2>/dev/null && [ "$code" -lt 500 ] && return 0
    sleep 20
  done
  return 1
}

origin_ip() {
  api "$1/dns_records?type=A&name=mikma.com.br" | jq -r '.result[0].content // empty'
}

token() {
  if [ -z "${GTOKEN:-}" ]; then
    printf '%s' "$SA_JSON" > /tmp/sa.json
    gcloud auth activate-service-account --key-file=/tmp/sa.json >/dev/null 2>&1
    GTOKEN=$(gcloud auth print-access-token)
  fi
  echo "$GTOKEN"
}

# Estado: bypass, records (ids separados por vírgula), restoredAt, healthy.
write_state() {
  curl -sS -m 20 -X PATCH "$FS" -H "Authorization: Bearer $(token)" -H 'Content-Type: application/json' \
    --data "{\"fields\":{\"bypass\":{\"booleanValue\":$1},\"records\":{\"stringValue\":\"$2\"},\"restoredAt\":{\"integerValue\":\"$3\"},\"healthy\":{\"integerValue\":\"$4\"},\"updatedAt\":{\"integerValue\":\"$NOW\"}}}" \
    | jq -c '{bypass:.fields.bypass.booleanValue, erro:.error.message}'
}

# Liga/desliga o proxy nos registros; falha se a Cloudflare recusar algum.
set_proxied() {
  local b=$1 flag=$2 id r ok=0
  for id in ${3//,/ }; do
    r=$(api -X PATCH "$b/dns_records/$id" --data "{\"proxied\":$flag}")
    echo "$r" | jq -c '{nome:.result.name,proxied:.result.proxied,success,erros:[.errors[]?.message]}'
    [ "$(echo "$r" | jq -r '.success')" = "true" ] || ok=1
  done
  return $ok
}

ativar() {
  local b records
  b=$(zone_url) || true
  if [ -z "$b" ]; then
    echo "::error::A API da Cloudflare também está fora: não dá para tirar o proxy. Se durar, troque os DNS no registro.br para os do Registro.br."
    exit 1
  fi
  records=$(api "$b/dns_records?per_page=100" | jq -r '[.result[] | select(.proxied == true) | .id] | join(",")')
  write_state true "$records" 0 0
  # O proxy guarda o valor do bypass por 30s: espera antes de mudar o DNS.
  sleep 35
  if ! set_proxied "$b" false "$records"; then
    # Sem a troca de DNS o bypass só abriria a origem: desfaz.
    set_proxied "$b" true "$records" >/dev/null
    write_state false "" 0 0
    echo "::error::A Cloudflare recusou a troca de DNS (token precisa de Zone > DNS > Edit): fallback cancelado."
    exit 1
  fi
  echo "::error::Cloudflare fora do ar: fallback ativado, site servido direto pelo App Hosting."
  exit 1
}

restaurar() {
  local b=$1 records=$2 mudou=0
  [ -n "$records" ] && set_proxied "$b" true "$records" && mudou=1
  # Se o DNS não mudou agora e /cdn-cgi/trace responde (o domínio já passa
  # pela Cloudflare), a trava volta já. Se mudou, espera 15 min de DNS.
  if [ "$mudou" = "0" ] && [ "$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$EDGE")" = "200" ]; then
    write_state false "" 0 0
    echo "Cloudflare na frente: trava de origem religada."
  else
    write_state true "$records" "$NOW" 0
    echo "Cloudflare de volta: proxy religado, bypass sai em 15 min."
  fi
}

STATE=$(curl -sS -m 15 "$FS" || echo '{}')
BYPASS=$(echo "$STATE" | jq -r '.fields.bypass.booleanValue // false')
RECORDS=$(echo "$STATE" | jq -r '.fields.records.stringValue // ""')
RESTORED=$(echo "$STATE" | jq -r '.fields.restoredAt.integerValue // "0"')
HEALTHY=$(echo "$STATE" | jq -r '.fields.healthy.integerValue // "0"')

case "$ACAO" in
  certificado)
    # A origem precisa de certificado válido (SSL "Full (strict)") e é ela que
    # atende sozinha no fallback. Avisa (falha o job) se faltar pouco.
    b=$(zone_url) || true
    ip=$([ -n "$b" ] && origin_ip "$b")
    [ -n "$ip" ] || { echo "::error::Não achei o IP da origem na Cloudflare."; exit 1; }
    fim=$(echo | openssl s_client -connect "$ip:443" -servername mikma.com.br 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2)
    dias=$(( ($(date -d "$fim" +%s) - NOW) / 86400 ))
    echo "Certificado da origem ($ip) vence em $dias dias ($fim)."
    [ "$dias" -ge 21 ] || { echo "::error::Certificado da origem vence em $dias dias."; exit 1; }
    exit 0
    ;;
  ativar) ativar ;;
  desativar)
    b=$(zone_url) || { echo "::error::API da Cloudflare indisponível."; exit 1; }
    restaurar "$b" "$RECORDS"
    exit 0
    ;;
esac

if [ "$BYPASS" != "true" ]; then
  if site_ok "$EDGE"; then echo "Cloudflare ok."; exit 0; fi
  echo "mikma.com.br não responde pela Cloudflare. Conferindo a origem..."
  b=$(zone_url) || true
  ip=$([ -n "$b" ] && origin_ip "$b")
  if [ -n "$ip" ] && site_ok --resolve "mikma.com.br:443:$ip" "$SITE"; then
    ativar
  fi
  echo "::error::O site está fora, mas a origem também não respondeu (ou a API da Cloudflare está fora): o fallback não resolveria."
  exit 1
fi

# Em fallback.
if [ "$RESTORED" != "0" ]; then
  if [ $((NOW - RESTORED)) -ge 900 ]; then
    write_state false "" 0 0
    echo "Fallback encerrado: trava de origem ligada de novo."
  else
    echo "Aguardando o DNS voltar para a Cloudflare antes de religar a trava."
  fi
  exit 0
fi

b=$(zone_url) || true
if [ -n "$b" ] && site_ok https://www.cloudflare.com/cdn-cgi/trace; then
  if [ $((HEALTHY + 1)) -ge 2 ]; then
    restaurar "$b" "$RECORDS"
  else
    write_state true "$RECORDS" 0 $((HEALTHY + 1))
    echo "Cloudflare parece de volta (1/2)."
  fi
else
  [ "$HEALTHY" = "0" ] || write_state true "$RECORDS" 0 0
  echo "Cloudflare ainda fora: segue o fallback."
fi
