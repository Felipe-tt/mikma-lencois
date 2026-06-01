# Mikma Lençóis 🛏

Marketplace de lençóis — Blumenau, SC.

## Stack
- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend:** Firebase (Firestore, Auth, Cloud Functions, Storage, Hosting)
- **Pagamento:** AbacatePay PIX
- **Entrega:** Uber Direct (local ≤10km) + Melhor Envio (nacional)
- **Edge:** Cloudflare (CDN + WAF + DDoS)
- **Auth:** Firebase Auth + Argon2id + Google Sign-In + reCAPTCHA v3

## Setup

```bash
cp .env.local.example .env.local
# preencha as variáveis
npm install
npm run dev
```

## Roadmap
- [x] Fase 1 — Fundação & Infraestrutura
- [ ] Fase 2 — Cadastro Progressivo & Catálogo
- [ ] Fase 3 — Checkout & Pagamento
- [ ] Fase 4 — Entrega & Painel do Vendedor
- [ ] Fase 5 — Polish, LGPD & Go Live
