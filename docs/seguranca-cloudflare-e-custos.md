# Blindagem: Cloudflare (grátis) e custos do Google Cloud

O código já está pronto para a Cloudflare. Nada muda no site até você
configurar o passo 3 abaixo, nessa ordem.

## 1. Cloudflare na frente do site (plano Free)

O que o plano grátis dá: proteção contra DDoS sem limite, firewall (WAF) com
regras gerenciadas básicas, Bot Fight Mode, 5 regras próprias de firewall,
regras de limite de requisições e cache de arquivos estáticos (menos
requisições chegando no Cloud Run, logo menos custo).

1. Crie a conta em cloudflare.com e adicione o domínio `mikma.com.br`.
2. A Cloudflare importa os registros DNS atuais. Confira se os registros
   que o Firebase App Hosting pediu (no console do Firebase → App Hosting →
   Configurações → Domínios) estão lá.
3. No registro.br, troque os servidores DNS do domínio pelos dois que a
   Cloudflare mostrar. Espere ficar "Ativo" na Cloudflare.
4. **SSL/TLS → Visão geral:** modo **Full (strict)**.
5. Deixe os registros do site em **DNS only (nuvem cinza)** até o Firebase
   mostrar o domínio como conectado/certificado emitido. Depois mude para
   **Proxied (nuvem laranja)**.
6. **Segurança → Bots:** ligue o **Bot Fight Mode**.
7. **Segurança → WAF → Regras gerenciadas:** ligue o conjunto gratuito.
8. **Segurança → WAF → Regras de limite de taxa** (rate limiting), uma regra:
   - Se o caminho começa com `/api/`: 60 requisições por 10 segundos por
     IP → Bloquear por 10 segundos.
9. **Segurança → WAF → Regras personalizadas** (sugestões):
   - Bloquear `(http.request.uri.path contains "/wp-") or (http.request.uri.path contains ".php")`.
   - Desafio gerenciado para países de onde você não vende, se quiser
     (`ip.geoip.country ne "BR"` → Managed Challenge). Cuidado: webhooks da
     AbacatePay, Uber e Resend e o GitHub Actions (cron) vêm de fora do
     Brasil. Se criar essa regra, exclua os caminhos `/api/payment/webhook`,
     `/api/shipping/uber-webhook`, `/api/email/` e `/api/cron/`.
10. **Cache → Configuração:** nível de cache **Standard**. Não crie regra de
    "cache everything": as páginas de conta, carrinho e painel são privadas.

## 2. Travar o acesso direto (pular a Cloudflare)

O endereço do App Hosting (`*.hosted.app`) continua aberto e passaria por
fora da Cloudflare. O site só aceita requisições com um segredo que a
Cloudflare injeta:

1. Gere um segredo longo (ex.: `openssl rand -hex 32`).
2. Cloudflare → **Regras → Transform Rules → Modificar cabeçalho da
   requisição** → Nova regra, "Todas as requisições" → **Definir**
   cabeçalho `x-mikma-edge` com o valor do segredo.
3. Só depois do passo 2 estar ativo: no Google Cloud, Secret Manager, crie o
   secret `EDGE_SHARED_SECRET` com o mesmo valor e dê acesso ao backend do
   App Hosting (`firebase apphosting:secrets:grantaccess EDGE_SHARED_SECRET
   --backend <id>`).
4. Adicione no `apphosting.yaml`, na seção de runtime:
   ```yaml
   - variable: EDGE_SHARED_SECRET
     secret: EDGE_SHARED_SECRET
     availability: [RUNTIME]
   ```
5. Com isso, o site passa a usar o IP real do visitante informado pela
   Cloudflare (`cf-connecting-ip`) e responde 403 a quem chegar sem o
   segredo.

Para conferir o IP que o site enxerga existe a rota `/api/painel/ip-check`
(só admin, com o token de login no cabeçalho `Authorization`).

Ordem importa: se o secret entrar no `apphosting.yaml` antes da regra da
Cloudflare existir, o site responde 403 para todo mundo.

## 3. Custos fora do Firebase (Google Cloud)

O maior gasto provável não é tráfego: **cada merge na `main` gera um build
no Cloud Build e uma imagem nova no Artifact Registry**, e as imagens nunca
são apagadas.

1. **Artifact Registry, limpeza automática:**
   `gcloud artifacts repositories list --project mikma-lencois`.
   Em cada repositório do App Hosting (e `gcf-artifacts`, se existir):
   Console → Artifact Registry → repositório → **Políticas de limpeza** →
   manter as 5 versões mais recentes e apagar as com mais de 7 dias. Depois
   apague as imagens antigas uma vez.
2. **Menos builds:** no console do Firebase → App Hosting → backend →
   Configurações, desligue **lançamentos automáticos** e faça o lançamento
   manualmente quando juntar várias mudanças, ou aponte o backend para uma
   branch `producao` atualizada em lote.
3. **Backends e funções sobrando:** `firebase apphosting:backends:list`,
   `gcloud run services list`, `gcloud functions list`. O `firebase.json`
   aponta para `mikma-lencois-test`; se existir também um backend de
   produção ligado à `main`, cada push gera dois builds. Apague o que não
   for usado (e a função SSR antiga da hospedagem clássica, se ainda
   existir).
4. **Secret Manager:** destrua versões antigas/desativadas dos secrets.
5. **Faturamento → Relatórios**, agrupado por SKU, mostra quanto é Cloud
   Build, Artifact Registry e Cloud Run.
6. **Alerta de orçamento:** Faturamento → Orçamentos e alertas → crie um
   orçamento mensal com alerta em 50%, 90% e 100%.

## 4. Pendências que dependem de você

- `ABACATEPAY_WEBHOOK_SECRET`: o secret não existe no Secret Manager e foi
  tirado do `apphosting.yaml`, então o webhook da AbacatePay é recusado. Os
  pagamentos são confirmados pela consulta ativa (página do pedido e cron),
  mas com o webhook a confirmação é instantânea. Crie o secret com o valor
  do painel da AbacatePay, dê acesso ao backend e volte a entrada no
  `apphosting.yaml`.
- Firebase Authentication → Configurações: ative a **proteção contra
  enumeração de e-mail**. Não desative o cadastro pelo cliente: a compra
  sem cadastro usa login anônimo.
