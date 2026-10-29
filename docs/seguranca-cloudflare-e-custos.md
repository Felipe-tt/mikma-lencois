# Cloudflare, trava de origem e custos

Como a borda e os custos do Google Cloud estão configurados, e onde cada coisa
é aplicada. Quase tudo é feito pelo workflow **Infra · manutenção do Google
Cloud** (`.github/workflows/infra-manutencao.yml`), que é idempotente: pode
rodar de novo a qualquer momento para reaplicar a configuração.

## 1. Cloudflare (plano Free)

Rodando o workflow de infra com a opção **cloudflare** marcada, a zona
`mikma.com.br` fica com:

| Item | Configuração |
|---|---|
| TLS | SSL **Full (strict)**, HTTPS sempre, TLS 1.2 no mínimo, TLS 1.3 e HTTP/3 |
| WAF gerenciado | Conjunto gratuito da Cloudflare (falhas conhecidas, como Log4j), fora webhooks, `/api/cron/` e `/api/email/` |
| Regras próprias | Bloqueio de scanners (`/wp-`, `.php`, `/.env`, `/.git`, `xmlrpc`) |
| Limite por IP | 80 requisições a cada 10 s em `/api/`, fora webhooks e rotinas |
| Senha vazada | Detecção de credenciais vazadas, repassada ao login no header `Exposed-Credential-Check` |
| Cache | HTML da loja em cache na borda; o tempo é decidido pelo site (`src/lib/edgeCache.ts`) |
| Always Online | Mostra a última cópia das páginas se a origem cair |

**Bot Fight Mode fica desligado de propósito.** No plano grátis ele não
aceita exceções e desafiaria os webhooks da AbacatePay, da Uber e da Resend:
pagamentos deixariam de ser confirmados na hora.

Se um dia for criar uma regra por país (ex.: desafio para fora do Brasil),
exclua `/api/payment/webhook`, `/api/shipping/uber-webhook`, `/api/email/` e
`/api/cron/`, que recebem chamadas de servidores no exterior.

## 2. Trava de origem

O endereço do App Hosting e do Cloud Run é público, então o site só aceita
requisições com o segredo que a Cloudflare injeta no header `x-mikma-edge`
(`EDGE_SHARED_SECRET`). Sem ele, a resposta é 403.

O workflow de infra cria o segredo no Secret Manager (ou reaproveita o
existente), dá acesso ao App Hosting e cria a regra de transformação na
Cloudflare. A variável está ligada em `apphosting.yaml`.

Com a trava, o site usa o IP real do visitante informado pela Cloudflare
(`cf-connecting-ip`). Para conferir o IP que o site enxerga há a rota
`/api/painel/ip-check` (só admin). O pentest (`pentest-producao.yml`)
confere que as URLs diretas respondem 403.

## 3. Se a Cloudflare cair

O workflow `cloudflare-fallback.yml` confere a cada 5 minutos
`mikma.com.br/cdn-cgi/trace` (respondido pela Cloudflare, sem chegar no
servidor). Se não responde e o App Hosting responde direto:

1. liga `edge/status.bypass` no Firestore (o proxy deixa de exigir o
   segredo, sem deploy);
2. tira o proxy (nuvem laranja) dos registros DNS pela API da Cloudflare.

O site passa a ser servido direto pelo App Hosting. Quando a Cloudflare
volta (2 checagens seguidas), o proxy é religado e, 15 minutos depois, a
trava. A ativação falha o job de propósito, para o GitHub avisar por e-mail.
Para testar ou forçar: Actions → "Cloudflare · fallback automático" → Run
workflow → `ativar` / `desativar`. Uma vez por dia o mesmo workflow confere
se o certificado da origem vence em menos de 21 dias.

Se a API da Cloudflare também cair, nada é automático: no registro.br, troque
os servidores DNS de volta para os do Registro.br (a troca leva horas).

## 4. Custos do Google Cloud

| Fonte de custo | Como está contida |
|---|---|
| Imagens no Artifact Registry (uma por build) | Política de limpeza aplicada pelo workflow de infra |
| Cloud Run | `minInstances: 0` e `maxInstances: 2` em `apphosting.yaml`; HTML da loja servido do cache da Cloudflare |
| Secret Manager | Variáveis públicas (`NEXT_PUBLIC_*`) ficam como `value:` em `apphosting.yaml`, sem acesso pago ao Secret Manager |
| Rotinas | Worker da Cloudflare (grátis) dispara as rotas `/api/cron/*`, sem Cloud Scheduler |
| Backup | Artifact do GitHub Actions por 14 dias, sem armazenamento pago |

Para acompanhar: **Faturamento → Relatórios**, agrupado por SKU, mostra
quanto é Cloud Build, Artifact Registry e Cloud Run. Mantenha um orçamento
mensal com alertas em 50%, 90% e 100% (**Faturamento → Orçamentos e
alertas**).
