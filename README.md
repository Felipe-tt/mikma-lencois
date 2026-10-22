<div align="center">
  <img src="public/logo-clay.png" alt="Mikma Lençóis" width="180" />

  # Mikma Lençóis

  Loja própria de lençóis, fronhas e jogos de lençol em malha 100% algodão, direto da fábrica em Blumenau (SC).

  [![CI](https://github.com/Felipe-tt/mikma-lencois/actions/workflows/ci-checks.yml/badge.svg)](https://github.com/Felipe-tt/mikma-lencois/actions/workflows/ci-checks.yml)
  [![Deploy](https://github.com/Felipe-tt/mikma-lencois/actions/workflows/deploy.yml/badge.svg)](https://github.com/Felipe-tt/mikma-lencois/actions/workflows/deploy.yml)
  ![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
  ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
  ![Firebase](https://img.shields.io/badge/Firebase-Firestore%20%7C%20Auth%20%7C%20Storage-orange?logo=firebase)

  [mikma.com.br](https://mikma.com.br)
</div>

---

## Sobre

E-commerce completo e independente (sem Shopify ou Nuvemshop), em produção em [mikma.com.br](https://mikma.com.br). Inclui a loja, o checkout com PIX e cartão, o cálculo de frete, a entrega local em até 1 hora e um painel para quem vende, pensado para ser usado no celular por quem não é da área de tecnologia.

Princípios do projeto:

- **O servidor decide.** Preço, estoque, frete e cupom são recalculados no servidor em toda compra. O navegador nunca é a fonte da verdade.
- **Custo baixo.** As páginas da loja vêm de cache (ISR), as tarefas agendadas rodam no GitHub Actions e o rate limit cai para memória se o Redis faltar.
- **Feito para o celular,** tanto na loja quanto no painel.

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router, ISR, View Transitions), React 19, TypeScript |
| Estilo | Tailwind CSS 4, fontes DM Serif Display e Inter (`next/font`) |
| Dados e login | Firebase (Firestore, Auth, Storage), com Firebase Admin no servidor |
| Hospedagem | Firebase App Hosting (Cloud Run, `southamerica-east1`) atrás da Cloudflare |
| Pagamento | AbacatePay: PIX e cartão no próprio site (`abacatepay.js`) |
| Frete | Cotação de PAC, SEDEX e Jadlog (Melhor Envio, Correios, Jadlog) e entrega local pela Uber Direct |
| Rastreio | Linketrack (Correios) e Uber Direct ao vivo, com mapa MapLibre |
| E-mail | Resend (transacional e caixa de entrada), Svix para verificar webhooks |
| Proteção | reCAPTCHA v3, rate limit no Upstash Redis, senha com `@node-rs/argon2` e checagem em Have I Been Pwned |
| Validação | Zod nas APIs, `sanitize-html` no conteúdo rico do painel |
| Fotos | PhotoSwipe (visualizador do produto) e `next/image` |
| Importação | PapaParse (catálogo por CSV) |
| Observabilidade | Sentry, opcional |
| Testes | Vitest e `@firebase/rules-unit-testing` (regras do Firestore no emulador) |

## Funcionalidades

**Loja**
- Catálogo com filtros por categoria, variações de tamanho e cor, e guia de tamanhos que calcula a medida do colchão.
- Carrinho e checkout em 3 passos, com frete cotado na hora e compra sem criar conta.
- Pagamento por PIX (QR Code e copia e cola, confirmação automática) ou cartão em até 3x sem sair do site.
- Cupons, favoritos, avaliações com nota no Google (JSON-LD), "Avise-me quando chegar" e acompanhamento do pedido com mapa da entrega.
- E-mails em cada etapa do pedido, tema claro e escuro, e consentimento de cookies (LGPD).

**Painel** (`/painel`)
- Pedidos, com marcar como pago, despacho, código de rastreio, estorno e etiqueta.
- Produtos, com cadastro guiado em passos, fotos pela câmera, nome da cor escrito à mão com verificação de cores parecidas, e importação por CSV com rascunhos.
- Estoque, com venda no balcão, histórico e alerta de estoque baixo.
- Trocas, avaliações, mensagens (e-mails respondidos pelo painel), cupons, relatórios e equipe (seller e admin).
- Modo manutenção com fila de visitantes e liberação por IP, e a equipe logada passa direto.

**Segurança**
- CSP, HSTS e demais headers. A origem só aceita tráfego que passou pela Cloudflare (`EDGE_SHARED_SECRET`).
- Rate limit nas rotas sensíveis, login com desafio e verificação de e-mail.
- Regras do Firestore e do Storage por papel (`buyer`, `seller`, `admin`), testadas no emulador. Ninguém consegue se promover a admin.
- Webhooks com assinatura verificada em tempo constante.

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
| `npm run build` / `npm start` | Build de produção e servidor |
| `npm run lint` | ESLint |
| `npm test` | Testes unitários (Vitest) |
| `npm run test:rules` | Testes das regras do Firestore (sobe o emulador sozinho) |
| `bash scripts/repo-checks.sh origin/main HEAD` | Mesma checagem de commits que o CI faz |

## Deploy

Não há deploy manual: **todo push na `main` publica o site.**

1. **Firebase App Hosting:** vê o commit novo, faz o build e publica a loja em cerca de 10 minutos.
2. **GitHub Actions (`deploy.yml`):** roda testes, lint, testes das regras e o build. Na `main`, também publica as regras do Firestore e do Storage, os índices e o CORS do bucket.

Os PRs passam pelos mesmos testes e pelo `CI Checks`, que valida as mensagens de commit:
- assunto com até 72 caracteres;
- mensagem com até 500 caracteres;
- sem travessão.

As chaves de produção ficam no Secret Manager do Google Cloud e são ligadas em `apphosting.yaml`.

## Tarefas automáticas (GitHub Actions)

| Workflow | Quando | O que faz |
|---|---|---|
| `Cron · Expirar pedidos sem pagamento` | a cada 15 min | Avisa o cliente com 24h e cancela com 48h os pedidos sem pagamento, devolvendo o estoque |
| `Cron · Verificar estoque baixo` | a cada 6h | Avisa a equipe sobre produtos acabando |
| `Cron · Avisar estoque de volta` | de hora em hora | Manda o "Avise-me quando chegar" quando o produto volta |
| `Cloudflare · fallback automático` | a cada 5 min | Se a Cloudflare cair, serve o site direto e volta sozinho depois |
| `Storage · limpar fotos sem uso` | manual | Lista (e, se marcado, apaga) fotos que nenhum produto ou pedido usa |
| `Infra · manutenção do Google Cloud` | manual | Limpeza de imagens antigas e checagens de infraestrutura |
| `Definir role de usuário` | manual | Cria o primeiro admin (o painel não deixa ninguém se promover) |

O agendamento do GitHub pode atrasar em horários de pico, por isso as tarefas mais sensíveis também são disparadas de fora (cron-job.org).

## Webhooks

| Serviço | Endpoint | Verificação |
|---|---|---|
| AbacatePay (PIX e cartão) | `/api/payment/webhook` | HMAC-SHA256 (`ABACATEPAY_WEBHOOK_SECRET`) |
| Uber Direct (entrega local) | `/api/shipping/uber-webhook` | HMAC (`webhookSecret` em `UBER_DIRECT_CREDS`) |
| Resend (e-mails recebidos) | `/api/email/inbound` | Assinatura Svix (`RESEND_WEBHOOK_SECRET`) |

## Estrutura

```
src/
├─ app/
│  ├─ (shop)/       # loja: home, produtos, carrinho, checkout, conta, pedidos
│  ├─ (auth)/       # entrar, cadastro, redefinir senha
│  ├─ painel/       # painel da equipe
│  ├─ manutencao/   # página de manutenção
│  └─ api/          # rotas de API (pagamento, frete, pedidos, painel, cron...)
├─ components/      # loja, painel, cadastro de produto, layout, ui
├─ lib/             # regras de negócio, integrações, e-mails, segurança
├─ types/
└─ proxy.ts         # manutenção, trava da Cloudflare e headers de segurança
firestore.rules     # regras do banco (+ firestore.rules.test.ts)
storage.rules       # regras das fotos
scripts/            # checagem de commits, fallback da Cloudflare, limpezas
docs/               # Cloudflare e custos, BIMI, histórico da migração
```

## Licença

Repositório privado. Todos os direitos reservados.
