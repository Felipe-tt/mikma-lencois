<div align="center">
  <img src="public/logo-clay.png" alt="Mikma Lençóis" width="180" />

  # Mikma Lençóis

  Loja própria de lençóis, fronhas e jogos de lençol em malha 100% algodão, direto da fábrica em Blumenau (SC).

  [![Deploy](https://github.com/Felipe-tt/mikma-lencois/actions/workflows/deploy.yml/badge.svg)](https://github.com/Felipe-tt/mikma-lencois/actions/workflows/deploy.yml)
  [![CI Checks](https://github.com/Felipe-tt/mikma-lencois/actions/workflows/ci-checks.yml/badge.svg)](https://github.com/Felipe-tt/mikma-lencois/actions/workflows/ci-checks.yml)
  [![CodeQL](https://github.com/Felipe-tt/mikma-lencois/actions/workflows/codeql.yml/badge.svg)](https://github.com/Felipe-tt/mikma-lencois/actions/workflows/codeql.yml)
  [![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Felipe-tt/mikma-lencois/badge)](https://scorecard.dev/viewer/?uri=github.com/Felipe-tt/mikma-lencois)
  <br />
  ![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
  ![React](https://img.shields.io/badge/React-19-149eca?logo=react)
  ![TypeScript](https://img.shields.io/badge/TypeScript-7-3178c6?logo=typescript)
  ![Firebase](https://img.shields.io/badge/Firebase-Firestore%20%7C%20Auth%20%7C%20Storage-orange?logo=firebase)
  ![Cloudflare](https://img.shields.io/badge/Cloudflare-WAF%20%7C%20CDN%20%7C%20Workers-f38020?logo=cloudflare)

  **[mikma.com.br](https://mikma.com.br)**
</div>

---

## Sumário

- [Sobre](#sobre)
- [Arquitetura](#arquitetura)
- [Stack](#stack)
- [Funcionalidades](#funcionalidades)
- [Segurança](#segurança)
- [Qualidade e testes](#qualidade-e-testes)
- [Rodando localmente](#rodando-localmente)
- [Scripts](#scripts)
- [Deploy](#deploy)
- [Rotinas automáticas](#rotinas-automáticas)
- [Webhooks](#webhooks)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Reportar uma vulnerabilidade](#reportar-uma-vulnerabilidade)
- [Licença](#licença)

## Sobre

E-commerce completo e independente (sem Shopify ou Nuvemshop), em produção em [mikma.com.br](https://mikma.com.br). Reúne a loja, o checkout com PIX e cartão, o cálculo de frete, a entrega local em até 1 hora, a emissão de nota fiscal e um painel de gestão pensado para ser usado no celular por quem não é da área de tecnologia.

Princípios do projeto:

- **O servidor decide.** Preço, estoque, frete e cupom são recalculados no servidor em toda compra. O navegador nunca é a fonte da verdade.
- **Seguro por padrão.** Toda rota nega acesso até provar o contrário, e cada camada (borda, servidor, banco) se defende sozinha.
- **Custo próximo de zero.** As páginas da loja são pré-renderizadas e servidas do cache da Cloudflare, as rotinas rodam num Worker gratuito e o servidor escala até zero quando não há visitas.
- **Feito para o celular,** tanto na loja quanto no painel.

## Arquitetura

```
Visitante ──► Cloudflare ──────────────► Firebase App Hosting ──► Firestore / Auth / Storage
              • WAF e limite por IP       (Cloud Run, us-east4)
              • cache do HTML da loja     • Next.js 16 (prerender parcial)
              • Turnstile                 • só aceita tráfego da Cloudflare
              • Worker de rotinas ───────► /api/cron/*  (a cada 5 min)

Integrações: AbacatePay (PIX e cartão) · Melhor Envio, Correios, Jadlog e Uber Direct (frete)
             · SEFAZ (NF-e) · Resend (e-mail) · Sentry (erros e relatórios de CSP)
```

- **Renderização:** as páginas da vitrine usam Partial Prerendering (`cacheComponents`). A casca estática sai do cache da Cloudflare, e só o que é dinâmico (estoque, sessão) é renderizado sob demanda.
- **Trava de origem:** o Cloud Run recusa qualquer requisição sem o segredo que a Cloudflare injeta (`x-mikma-edge`), então não dá para contornar o WAF acessando o servidor direto.
- **Resiliência:** se a Cloudflare cair, um workflow aponta o DNS direto para a origem e volta sozinho depois. Um deploy que derrube o site é revertido automaticamente.

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router, Partial Prerendering, React Compiler, View Transitions), React 19 |
| Linguagem | TypeScript (checagem com o compilador nativo do TypeScript 7) |
| Estilo | Tailwind CSS 4, fontes DM Serif Display e Inter (`next/font`) |
| Dados e login | Firebase: Firestore, Auth (senha, Google, anônimo, TOTP), Storage, App Check e Cloud Messaging |
| Passkeys | WebAuthn com `@simplewebauthn` (login sem senha para clientes e equipe) |
| Hospedagem | Firebase App Hosting (Cloud Run, `us-east4`) atrás da Cloudflare |
| Borda | Cloudflare: WAF gerenciado, regras próprias, limite por IP, cache de HTML, Turnstile e Workers |
| Pagamento | AbacatePay: PIX e cartão no próprio site (`abacatepay.js`) |
| Frete e entrega | Melhor Envio, Correios e Jadlog (PAC, SEDEX, expresso), entrega local pela Uber Direct |
| Rastreio | Linketrack (Correios) e Uber Direct ao vivo, com mapa MapLibre |
| Nota fiscal | NF-e direto na SEFAZ (`nfewizard-io`), com certificado A1 enviado pelo painel |
| E-mail | Resend (envio e caixa de entrada), Svix para verificar webhooks |
| Validação | Zod nas APIs, `sanitize-html` no conteúdo rico do painel |
| Limite de requisições | Upstash Redis, com recuo para memória se o Redis falhar |
| Observabilidade | Sentry (erros, desempenho e violações de CSP) |
| Testes | Vitest, fast-check, `@firebase/rules-unit-testing` e Playwright |

## Funcionalidades

### Loja

- Catálogo com filtros por categoria, variações de tamanho e cor, e guia de tamanhos que calcula a medida a partir do colchão.
- Carrinho com barra de progresso até o frete grátis, e checkout em 3 passos com frete cotado na hora.
- Compra sem criar conta (convidado) e login com senha, Google ou passkey.
- Pagamento por PIX (QR Code e copia e cola, com confirmação automática) ou cartão em até 3x sem sair do site.
- Cupons, desconto no PIX, favoritos, avaliações com estrelas no Google (JSON-LD) e "Avise-me quando chegar".
- Acompanhamento do pedido com mapa da entrega ao vivo e e-mail em cada etapa.
- Tema claro e escuro, transições entre páginas e consentimento de cookies (LGPD).
- Feed do Google Merchant, `llms.txt` e catálogo em JSON para buscadores e assistentes de IA.

### Painel (`/painel`)

- **Pedidos:** marcar como pago, despacho, código de rastreio, estorno, etiqueta e sinais de golpe por pedido.
- **Nota fiscal:** emissão de NF-e na SEFAZ, com fila automática a cada 10 minutos.
- **Produtos:** cadastro guiado com fotos pela câmera, verificação de cores parecidas, guia de medidas e importação por CSV com rascunhos.
- **Estoque:** venda no balcão, histórico, auditoria e alerta de estoque baixo.
- **Atendimento:** trocas, avaliações e mensagens (e-mails respondidos pelo painel).
- **Gestão:** cupons, relatórios, configurações da loja, equipe (vendedor e admin) e notificações push de novos pedidos.
- **Manutenção:** modo manutenção com fila de visitantes e liberação por IP; a equipe logada continua acessando.
- **Acesso da equipe:** exige segunda etapa (passkey ou app autenticador) em todas as telas e APIs do painel.

## Segurança

| Camada | Proteções |
|---|---|
| Borda (Cloudflare) | WAF gerenciado e regras contra scanners, limite por IP nas APIs, bloqueio de credenciais vazadas, TLS 1.2+ com HSTS preload |
| Origem | Aceita só tráfego da Cloudflare (segredo de borda); URLs diretas do Cloud Run respondem 403 |
| Navegador | CSP com Trusted Types e relatório de violações no Sentry, `X-Frame-Options`, `Permissions-Policy`, COOP |
| Autenticação | Senhas checadas no Have I Been Pwned e na detecção de vazamento da Cloudflare, Turnstile nos formulários públicos, passkeys, 2FA obrigatório para a equipe, App Check |
| Autorização | Papel lido do token em toda rota; teste automático garante que nenhuma rota da equipe dispense a segunda etapa |
| Dados | Regras do Firestore e do Storage por papel (`buyer`, `seller`, `admin`), testadas no emulador; ninguém consegue se promover |
| Integrações | Webhooks com assinatura verificada em tempo constante; preço e estoque nunca vêm do navegador |
| Domínio e e-mail | DNSSEC, CAA, SPF, DKIM, DMARC com relatórios e MTA-STS |
| Cadeia de dependências | Actions e imagens Docker fixadas por hash, Dependabot, CodeQL, secret scanning e OpenSSF Scorecard |

## Qualidade e testes

Tudo roda no CI a cada pull request, e o merge só acontece com tudo verde.

| Verificação | O que garante |
|---|---|
| `npm run typecheck` e `npm run lint` | Tipos (TypeScript 7) e ESLint |
| `npm test` | Testes unitários das regras de negócio, APIs e utilitários (Vitest) |
| Fuzzing | Testes de propriedade com fast-check: escape de HTML, JSON-LD e permissões da equipe contra milhares de entradas aleatórias |
| `npm run test:rules` | Regras do Firestore e do Storage no emulador |
| `npm run e2e` | Compra completa com PIX, passkey e navegação num build de produção, com a CSP valendo, contra os emuladores e uma AbacatePay simulada |
| Orçamento de desempenho | No E2E, celular simulado (CPU 4x mais lenta, 4G fraco): limites de JavaScript, LCP e CLS por página |
| CodeQL | Análise estática do código e dos workflows |
| OWASP ZAP | Varredura dinâmica semanal da loja em produção |
| Pentest em produção | Workflow manual com curl, nmap, testssl.sh, WhatWeb, Nikto e Nuclei |

## Rodando localmente

Pré-requisitos: Node 24 e Java 21 (para os emuladores do Firebase).

```bash
git clone https://github.com/Felipe-tt/mikma-lencois.git
cd mikma-lencois
npm install
cp .env.example .env.local
```

### Com os emuladores do Firebase (sem conta real)

É o caminho mais simples para mexer no código. Em `.env.local`, preencha:

```bash
NEXT_PUBLIC_FIREBASE_EMULATORS=1
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-mikma
NEXT_PUBLIC_FIREBASE_API_KEY=fake-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=localhost
FIREBASE_PROJECT_ID=demo-mikma
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
```

O Firebase Admin exige uma chave mesmo com os emuladores. Gere uma descartável, que só vale no seu computador:

```bash
node -e "const k=require('crypto').generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});console.log('FIREBASE_CLIENT_EMAIL=local@demo-mikma.iam.gserviceaccount.com\nFIREBASE_PRIVATE_KEY=\"'+k.trim().replace(/\n/g,'\\\\n')+'\"')" >> .env.local
```

Depois, em dois terminais:

```bash
npx firebase emulators:start --only auth,firestore --project demo-mikma
npm run dev
```

A loja abre em `http://localhost:3000`, ainda sem produtos. Para usar o painel, crie uma conta pelo site e dê a ela o papel de admin:

```bash
set -a; source .env.local; set +a
TARGET_EMAIL=voce@exemplo.com TARGET_ROLE=admin node scripts/set-role.mjs
```

Saia e entre de novo para o papel valer. O painel fica em `/painel`, e a interface dos emuladores, com os dados, em `http://localhost:4000`.

### Com um projeto Firebase de verdade

Preencha o `.env.local` com as chaves do projeto e das integrações que for usar. Cada bloco do `.env.example` diz onde gerar a chave. Sem as chaves de uma integração, a loja continua funcionando e só aquela parte fica desligada: o PIX não gera cobrança, o frete não cota aquela transportadora, os e-mails não saem.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Ambiente de desenvolvimento |
| `npm run build` / `npm start` | Checagem de tipos, build de produção e servidor |
| `npm run typecheck` | Checagem de tipos com o TypeScript 7 |
| `npm run lint` | ESLint |
| `npm test` / `npm run test:watch` | Testes unitários e de propriedade (Vitest) |
| `npm run test:rules` | Regras do Firestore e do Storage (sobe o emulador sozinho) |
| `npm run e2e` | Testes ponta a ponta (sobe emuladores, compila e roda o Playwright) |
| `bash scripts/repo-checks.sh origin/main HEAD` | Mesma checagem de commits que o CI faz |

`npm run e2e` aceita `E2E_SKIP_BUILD=1` para reaproveitar o build, `E2E_ARGS=<arquivo>` para rodar um teste só e `E2E_KEEP=1` para manter a loja de teste no ar.

## Deploy

Não há deploy manual: **todo merge na `main` publica o site.**

1. **Firebase App Hosting** detecta o commit, faz o build e publica a loja.
2. **GitHub Actions (`deploy.yml`)** roda tipos, lint, testes unitários, regras, E2E e build. Na `main`, também publica as regras do Firestore e do Storage, os índices e o CORS do bucket.
3. **Saúde do site** confere a loja a cada 10 minutos e, se um deploy novo a derrubar, volta para a última versão boa sozinho.

Os pull requests passam pelos mesmos testes e pelo `CI Checks`, que valida as mensagens de commit (assunto com até 72 caracteres, mensagem com até 500 e sem travessão). As chaves de produção ficam no Secret Manager do Google Cloud e são ligadas em `apphosting.yaml`.

## Rotinas automáticas

As rotinas sensíveis ao horário são disparadas por um **Worker da Cloudflare** a cada 5 minutos (`workers/cron`), porque o agendamento do GitHub Actions atrasa ou pula execuções. Os workflows equivalentes continuam como reserva e para disparo manual.

| Rotina | Frequência | O que faz |
|---|---|---|
| Expirar pedidos | 15 min | Avisa o cliente com 24 h e cancela com 48 h os pedidos sem pagamento, devolvendo o estoque |
| Notas fiscais | 10 min | Emite na SEFAZ as NF-e pendentes |
| Estoque de volta | 1 h | Envia o "Avise-me quando chegar" quando o produto volta |
| Estoque baixo | 6 h | Avisa a equipe sobre produtos acabando |
| Saúde do site | 10 min | Confere a loja e faz rollback automático se o deploy quebrou |
| Fallback da Cloudflare | 5 min | Se a Cloudflare cair, serve o site direto e volta sozinho depois |
| Backup do Firestore | diário | Cópia do banco comprimida e criptografada, conferida antes de ser guardada por 14 dias |
| OWASP ZAP | semanal | Varredura dinâmica de segurança |
| OpenSSF Scorecard | semanal e a cada merge | Nota de segurança do projeto, com os achados no resumo do run |

Workflows manuais: pentest em produção, infraestrutura do Google Cloud e da Cloudflare, domínio (DNSSEC, CAA, e-mail e HSTS), Turnstile, limpeza de fotos sem uso e definição do primeiro admin.

## Webhooks

| Serviço | Endpoint | Verificação |
|---|---|---|
| AbacatePay (PIX e cartão) | `/api/payment/webhook` | HMAC-SHA256 (`ABACATEPAY_WEBHOOK_SECRET`) |
| Uber Direct (entrega local) | `/api/shipping/uber-webhook` | HMAC (`webhookSecret` em `UBER_DIRECT_CREDS`) |
| Resend (e-mails recebidos) | `/api/email/inbound` | Assinatura Svix (`RESEND_WEBHOOK_SECRET`) |

## Estrutura do repositório

```
src/
├─ app/
│  ├─ (shop)/        # loja: home, produtos, carrinho, checkout, conta, pedidos
│  ├─ (auth)/        # entrar, cadastro, redefinir senha
│  ├─ painel/        # painel da equipe
│  ├─ manutencao/    # página de manutenção
│  └─ api/           # APIs: pagamento, frete, pedidos, painel, cron, webhooks
├─ components/       # loja, painel, cadastro de produto, layout, ui
├─ lib/              # regras de negócio, integrações, e-mails, segurança
├─ types/
└─ proxy.ts          # trava de origem, manutenção, cache e headers de segurança
e2e/                 # testes ponta a ponta (Playwright) e simuladores
workers/             # Workers da Cloudflare: rotinas e MTA-STS
firestore.rules      # regras do banco (+ firestore.rules.test.ts)
storage.rules        # regras das fotos (+ storage.rules.test.ts)
scripts/             # checagem de commits, papéis, fallback e limpezas
docs/                # Cloudflare e custos, BIMI, histórico
.github/workflows/   # CI, deploy, rotinas, segurança e infraestrutura
```

## Reportar uma vulnerabilidade

Não abra issue pública. Siga a [política de segurança](SECURITY.md): o contato é **contato@mikma.com.br** (também em [`/.well-known/security.txt`](https://mikma.com.br/.well-known/security.txt)), com resposta em até 5 dias úteis.

## Licença

Software proprietário. O código é público apenas para transparência; todos os direitos são reservados à Mikma Lençóis. Veja [LICENSE](LICENSE).
