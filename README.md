# Mikma Lençóis

E-commerce de cama, mesa e banho com entrega local e nacional. Construído com Next.js 15 + Firebase, com painel administrativo completo, integração de frete inteligente e pagamento via PIX.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS |
| Backend | Firebase — Firestore, Auth, Storage, Functions |
| Pagamento | AbacatePay (PIX com webhook HMAC) |
| Entrega local | Uber Direct |
| Entrega nacional | Melhor Envio (PAC / SEDEX) |
| CDN / DNS | Cloudflare |

## Rodando localmente

```bash
npm install
cp .env.example .env.local
# preencha as variáveis em .env.local
npm run dev
```

Acesse `http://localhost:3000`.

## Variáveis de ambiente

Todas as variáveis necessárias estão documentadas em `.env.example`.

## Deploy

Push na `main` dispara o pipeline automaticamente via GitHub Actions.

Secrets necessários no repositório:

| Secret | O que é |
|--------|---------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | API key pública do Firebase |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Auth domain do Firebase |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Project ID do Firebase |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Storage bucket do Firebase |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Sender ID do Firebase |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | App ID do Firebase |
| `FIREBASE_PROJECT_ID` | Project ID (server-side) |
| `FIREBASE_CLIENT_EMAIL` | Email da service account |
| `FIREBASE_PRIVATE_KEY` | Chave privada da service account |
| `FIREBASE_TOKEN` | Token do `firebase login:ci` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Client ID do OAuth 2.0 (Google Console) |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Site key reCAPTCHA v3 |
| `RECAPTCHA_SECRET_KEY` | Secret key reCAPTCHA v3 |
| `ABACATEPAY_API_KEY` | API key AbacatePay |
| `ABACATEPAY_PUBLIC_KEY` | Public key de validação do webhook |
| `UBER_DIRECT_API_KEY` | API key Uber Direct |
| `UBER_DIRECT_CUSTOMER_ID` | Customer ID Uber Direct |
| `MELHOR_ENVIO_TOKEN` | Token Melhor Envio |

## Firestore

```bash
npx firebase deploy --only firestore
```

## Estrutura

```
src/
├── app/
│   ├── (auth)/          # login e cadastro
│   ├── (shop)/          # loja pública
│   ├── api/             # routes server-side (auth, checkout, delivery, orders, payment, products, user)
│   ├── painel/          # painel do vendedor
│   ├── sitemap.ts
│   └── robots.ts
├── components/
│   ├── layout/          # header e footer
│   ├── product/         # cards, filtros, variações
│   ├── checkout/        # modal PIX
│   └── painel/          # sidebar, guard de acesso
└── lib/
    ├── firebase/        # client e admin SDK
    ├── hooks/
    ├── services/
    └── utils/
```
