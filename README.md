# Mikma Lençóis — Marketplace

Marketplace de lençóis entrega local e nacional.

## Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend**: Firebase (Firestore, Auth, Storage, Hosting)
- **Pagamento**: AbacatePay (PIX)
- **Entrega local**: Uber Direct (≤10 km) / Disk & Tenha
- **Entrega nacional**: Melhor Envio (PAC/SEDEX)
- **Edge**: Cloudflare (DNS, CDN, WAF)
- **Email**: Resend
- **Busca**: Algolia
- **Rate limiting**: Upstash Redis

## Setup local

```bash
# 1. Instalar dependências
npm install

# 2. Copiar variáveis de ambiente
cp .env.example .env.local
# Preencher todas as variáveis em .env.local

# 3. Rodar em desenvolvimento
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

## Variáveis de ambiente

Veja `.env.example` para a lista completa e descrição de cada variável.

## Deploy

O deploy é automático via GitHub Actions ao fazer push na branch `main`.  
Configure os seguintes **Secrets** no repositório GitHub:

| Secret | Descrição |
|--------|-----------|
| `NEXT_PUBLIC_FIREBASE_*` | Config pública do Firebase |
| `FIREBASE_PROJECT_ID` | ID do projeto Firebase |
| `FIREBASE_CLIENT_EMAIL` | Email da service account |
| `FIREBASE_PRIVATE_KEY` | Chave privada da service account |
| `FIREBASE_SERVICE_ACCOUNT` | JSON completo da service account (para deploy Hosting) |
| `FIREBASE_TOKEN` | Token gerado com `firebase login:ci` |
| `ABACATEPAY_API_KEY` | Chave da API AbacatePay |
| `ABACATEPAY_WEBHOOK_SECRET` | Secret do webhook PIX |
| `RESEND_API_KEY` | Chave do Resend |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Site key reCAPTCHA v3 |
| `RECAPTCHA_SECRET_KEY` | Secret key reCAPTCHA v3 |
| `NEXT_PUBLIC_ALGOLIA_APP_ID` | App ID Algolia |
| `NEXT_PUBLIC_ALGOLIA_SEARCH_KEY` | Search-only API key Algolia |
| `ALGOLIA_ADMIN_KEY` | Admin API key Algolia |
| `UPSTASH_REDIS_REST_URL` | URL do Upstash Redis |
| `UPSTASH_REDIS_REST_TOKEN` | Token do Upstash Redis |
| `UBER_DIRECT_CLIENT_ID` | Client ID Uber Direct |
| `UBER_DIRECT_CLIENT_SECRET` | Client Secret Uber Direct |
| `UBER_DIRECT_CUSTOMER_ID` | Customer ID Uber Direct |
| `MELHOR_ENVIO_TOKEN` | Token Melhor Envio |

## Firestore

```bash
# Deploy rules e indexes
npx firebase deploy --only firestore
```

## Estrutura do projeto

```
src/
├── app/
│   ├── (auth)/          # Login e cadastro
│   ├── (shop)/          # Loja pública
│   ├── (seller)/        # Painel do vendedor (rota alternativa)
│   ├── api/             # API Routes (server-side)
│   ├── painel/          # Painel do vendedor
│   ├── sitemap.ts       # Sitemap dinâmico
│   └── robots.ts        # robots.txt
├── components/
│   ├── layout/          # Header e Footer
│   ├── product/         # Cards, filtros, seletor de variações
│   ├── checkout/        # Modal PIX
│   ├── painel/          # Sidebar e guard do painel
│   └── seller/          # Formulário de produto
├── lib/
│   ├── auth/            # AuthContext
│   ├── firebase/        # Client e Admin SDK
│   ├── hooks/           # useCartCount
│   └── utils/           # formatCurrency, formatDate
└── types/               # Tipos TypeScript
```
