<div align="center">
  <img src="public/logo-clay.png" alt="Mikma Lençóis" width="180" />

  # Mikma Lençóis

  E-commerce de cama, mesa e banho — Next.js 16 + Firebase, com pagamento em PIX, frete automatizado e painel administrativo completo.

  [![CI](https://github.com/Felipe-tt/mikma-lencois/actions/workflows/ci-checks.yml/badge.svg)](https://github.com/Felipe-tt/mikma-lencois/actions/workflows/ci-checks.yml)
  ![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
  ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
  ![Firebase](https://img.shields.io/badge/Firebase-Firestore%20%7C%20Auth%20%7C%20Storage-orange?logo=firebase)
</div>

---

## Sobre

Loja online real, em produção, com catálogo por variantes (tamanho, cor, tecido), checkout com frete calculado em tempo real, pagamento via PIX e um painel administrativo próprio para gerenciar pedidos, estoque, cupons e conteúdo — sem depender de plataformas como Shopify ou Nuvemshop.

O projeto nasceu para resolver um problema concreto: dar a uma loja de cama, mesa e banho uma operação self-service, com preço e estoque sempre validados no servidor, importação de catálogo em massa por CSV e integração direta com transportadoras.

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Estilo | Tailwind CSS 4 |
| Dados | Firebase (Firestore, Auth, Storage) |
| Pagamento | AbacatePay (PIX) |
| Frete | Melhor Envio v2 · Uber Direct |
| E-mail | Resend |
| Observabilidade | Sentry |
| Testes | Vitest |
| Deploy | Firebase App Hosting (Cloud Run, `southamerica-east1`) |

## Funcionalidades

**Loja**
- Catálogo com variantes (tamanho, cor, tecido) e filtros
- Carrinho e checkout com cálculo de frete em tempo real
- Pagamento via PIX com confirmação automática por webhook
- Cupons de desconto, rastreio de pedidos e área do cliente

**Painel administrativo** (`/painel`)
- CRUD completo de pedidos, produtos, estoque e cupons
- Importação de catálogo via CSV, com fila de rascunho até publicar
- Central de mensagens, relatórios de vendas e configurações da loja
- Modo de manutenção com liberação de acesso por IP

**Segurança**
- Headers de segurança (CSP, HSTS) e rate limiting nas rotas sensíveis
- Preço e estoque sempre validados no servidor — nunca confiando no cliente
- Firestore Rules com controle de acesso por papel (`buyer`, `seller`, `admin`)

## Rodando localmente

Pré-requisitos: Node 24 e um projeto Firebase (Firestore, Auth, Storage) configurado.

```bash
git clone https://github.com/Felipe-tt/mikma-lencois.git
cd mikma-lencois
npm install
cp .env.example .env.local
npm run dev
```

Preencha o `.env.local` com as chaves do Firebase e das integrações que for usar (AbacatePay, Melhor Envio, Resend, reCAPTCHA, Uber Direct). Cada bloco do `.env.example` explica onde gerar a chave correspondente.

Publicar as regras do Firestore:

```bash
npx firebase deploy --only firestore
```

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Ambiente de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run start` | Serve o build de produção |
| `npm run lint` | ESLint |
| `npm test` | Testes (Vitest) |

## Deploy

```bash
npm run build
npx firebase deploy
```

Push na branch `main` dispara o deploy automaticamente via GitHub Actions. Um `CI Checks` roda em toda PR, validando mensagens de commit antes do merge.

## Webhooks

| Serviço | Endpoint | Autenticação |
|---|---|---|
| AbacatePay (PIX) | `/api/payment/webhook` | HMAC-SHA256 |
| Melhor Envio (rastreio) | `/api/shipping/webhook` | HMAC-SHA256 |
| E-mail inbound (Resend) | `/api/email/inbound` | Secret no header |

Guia completo de configuração do frete em [`MELHOR_ENVIO_SETUP.md`](./MELHOR_ENVIO_SETUP.md).

## Estrutura

```
src/
├─ app/
│  ├─ (shop)/        # loja pública — produtos, carrinho, checkout, conta
│  ├─ (auth)/         # cadastro, login, redefinição de senha
│  ├─ painel/          # painel administrativo
│  └─ api/             # rotas de API (pedidos, pagamento, frete, e-mail...)
├─ components/
├─ lib/
└─ types/
```

## Licença

Repositório privado. Todos os direitos reservados.
