# Mikma Lençóis

E-commerce de cama, mesa e banho construído em Next.js 15 (App Router) e Firebase. Loja pública com ISR, painel administrativo, pagamento via PIX, frete automatizado com Melhor Envio e importação de catálogo por CSV.

## Stack

- **Framework**: Next.js 15, TypeScript, Tailwind CSS
- **Backend**: Firebase (Firestore, Auth, Storage)
- **Pagamento**: AbacatePay (PIX)
- **Frete**: Melhor Envio v2
- **E-mail**: Resend
- **Deploy**: Firebase Hosting + Cloud Run (`southamerica-east1`)

## Funcionalidades

**Loja**
- Catálogo com variantes (tamanho, cor, tecido) e filtros
- Carrinho e checkout com cálculo de frete em tempo real
- Pagamento via PIX com confirmação automática por webhook
- Cupons de desconto, rastreio de pedidos e área do cliente

**Painel (`/painel`)**
- Pedidos, produtos, estoque e cupons (CRUD completo)
- Importação de catálogo via CSV (fica como rascunho até publicar)
- Mensagens, relatórios e configurações da loja
- Modo de manutenção com fila de liberação por IP

**Segurança**
- Headers de segurança (CSP, HSTS, entre outros) e rate limiting
- Preços e estoque sempre validados no servidor, nunca no cliente
- Firestore Rules com controle por papel (`buyer`, `seller`, `admin`)

## Rodando localmente

```bash
git clone https://github.com/Felipe-tt/mikma-lencois.git
cd mikma-lencois
npm install
cp .env.example .env.local
npm run dev
```

Requer um projeto Firebase (Firestore, Auth e Storage) e contas em AbacatePay, Melhor Envio e Resend. Preencha as chaves correspondentes no `.env.local`.

Deploy das regras do Firestore:

```bash
npx firebase deploy --only firestore
```

## Deploy

```bash
npm run build
npx firebase deploy
```

Push na branch `main` dispara o deploy automaticamente via CI.

## Webhooks

| Serviço | Endpoint | Autenticação |
|---------|----------|---------------|
| AbacatePay (PIX) | `/api/payment/webhook` | HMAC-SHA256 |
| Melhor Envio (rastreio) | `/api/shipping/webhook` | HMAC-SHA256 |
| E-mail inbound | `/api/email/inbound` | Secret no header |

Guia completo do Melhor Envio em [`MELHOR_ENVIO_SETUP.md`](./MELHOR_ENVIO_SETUP.md).

## Licença

Repositório privado. Todos os direitos reservados.
