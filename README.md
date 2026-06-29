# Mikma Lençóis — Plataforma E-commerce

E-commerce completo de cama, mesa e banho, desenvolvido em Next.js 15 com App Router e Firebase. Inclui loja pública com ISR, painel administrativo, pagamento PIX integrado, frete nacional automatizado via Melhor Envio, importação de catálogo via WhatsApp e sistema de manutenção com fila de liberação por IP.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 15 (App Router, ISR, Edge Middleware) |
| Linguagem | TypeScript 5 |
| Estilo | Tailwind CSS 3 |
| Backend / Banco | Firebase — Firestore, Auth, Storage |
| Autenticação | Firebase Auth + Google OAuth 2.0 + reCAPTCHA v3 |
| Pagamento | AbacatePay (PIX, webhook HMAC-SHA256) |
| Frete | Melhor Envio v2 (PAC, SEDEX, Jadlog) |
| E-mail | Resend (transacional) + Webhook inbound (caixa de mensagens) |
| Deploy | Firebase Hosting + Cloud Run (`southamerica-east1`) |
| CDN / DNS | Cloudflare |

---

## Funcionalidades

### Loja pública

- Homepage com hero configurável via painel (textos, subtítulo, 4 trust items)
- Grid de produtos com filtro por categoria e ordenação
- Página de produto com galeria de imagens, seletor de variantes (tamanho, cor, tecido), guia de tamanhos e composição do tecido
- Carrinho persistido no Firestore por usuário autenticado
- Checkout com cálculo de frete em tempo real (Melhor Envio) e retirada na loja
- Pagamento via PIX: QR Code + copia-e-cola, expiração em 15 min, confirmação automática via webhook
- Desconto PIX configurável (percentual + valor mínimo de pedido)
- Cupons de desconto (percentual ou valor fixo, com validade e limite de usos)
- Rastreio de pedidos com timeline de eventos
- Área do cliente: histórico de pedidos, dados pessoais, endereço

### Painel administrativo (`/painel`)

- Dashboard com resumo de pedidos e alertas de estoque baixo
- **Pedidos**: listagem com filtros por status, detalhe completo, atualização de status, geração de etiqueta Melhor Envio (PDF), cancelamento com estorno de reserva
- **Produtos**: CRUD completo com upload de imagens, variantes (tamanho/cor/tecido), especificações técnicas (fios, composição, gramatura, certificações)
- **Importação WhatsApp**: importação de catálogo via QR Code / sessão Baileys, com detecção automática de cores em fotos
- **Estoque**: controle por SKU, histórico de movimentações, alerta de estoque baixo
- **Cupons**: CRUD de cupons com validade, uso máximo e valor mínimo de pedido
- **Mensagens**: caixa de e-mails integrada (inbound webhook + resposta via Resend), com threads por cliente
- **Relatórios**: receita e pedidos por período
- **Configurações**: informações da loja, vitrine (hero, CTA, destaques), guia de tamanhos, horário de funcionamento, parâmetros de frete e pagamento
- **Manutenção**: ativar/desativar manutenção do site com fila de liberação por IP (ex: liberar o próprio IP para testar em produção)

### Segurança e infraestrutura

- Middleware Edge com redirecionamento para página de manutenção e fila por IP
- Headers de segurança em todas as respostas: `CSP`, `HSTS`, `X-Frame-Options`, `Permissions-Policy`, entre outros
- Rate limiting por IP e por usuário (em memória, por instância)
- Senhas com hash Argon2 (`@node-rs/argon2`)
- Firestore Rules com controle granular por papel (`buyer`, `seller`, `admin`)
- Preços nunca lidos do cliente — recalculados no servidor a partir do Firestore
- Reserva atômica de estoque no momento da criação do pedido
- ISR nas páginas públicas (revalidação a cada 15 min); `Cache-Control: private, no-store` nas páginas autenticadas

---

## Estrutura do projeto

```
mikma-lencois/
├── src/
│   ├── app/
│   │   ├── (auth)/               # Login, cadastro, redefinição de senha, confirmação de e-mail
│   │   ├── (shop)/               # Loja pública: home, produtos, carrinho, checkout, conta, pedidos, sobre
│   │   ├── api/
│   │   │   ├── auth/             # login, register, google-verify, send-verification, verify-code, reset-password
│   │   │   ├── checkout/         # pix-discount, validate-coupon
│   │   │   ├── cron/             # expire-orders (cancela pedidos pendentes expirados)
│   │   │   ├── delivery/         # geração de etiqueta Melhor Envio + despacho
│   │   │   ├── email/            # inbound webhook (caixa de mensagens) + send
│   │   │   ├── maintenance/      # toggle de manutenção
│   │   │   ├── orders/           # CRUD de pedidos, delete-cancelled
│   │   │   ├── painel/           # whatsapp-catalog (importação via Baileys)
│   │   │   ├── payment/          # create-pix, create-checkout, webhook AbacatePay
│   │   │   ├── products/         # CRUD de produtos, image-proxy
│   │   │   ├── settings/         # settings públicas da loja
│   │   │   ├── shipping/         # cotação de frete (quote) + webhook Melhor Envio (tracking)
│   │   │   ├── tracking/         # rastreio por código
│   │   │   └── user/             # export de dados (LGPD), delete de conta
│   │   ├── manutencao/           # Página de manutenção (layout dedicado, sem middleware)
│   │   └── painel/               # Painel admin: dashboard, pedidos, produtos, estoque, cupons, mensagens, relatórios, configurações, manutenção
│   ├── components/
│   │   ├── checkout/             # PIXModal
│   │   ├── layout/               # Header, Footer
│   │   ├── painel/               # PainelSidebar, PainelGuard, BusinessHoursEditor, PreviewModal
│   │   ├── product/              # ProductCard, ProductGallery, VariantSelector, SizeGuideModal, CategoryFilter
│   │   ├── seller/               # ProductForm, ColorPicker, PhotoCaptureModal, PhotoColorPicker
│   │   ├── storefront/           # BusinessHoursCard
│   │   ├── tracking/             # TrackingTimeline
│   │   └── ui/                   # EmptyState, FadeIn, Icon, NavLink, PageLoader, Skeleton, TopProgress…
│   ├── lib/
│   │   ├── firebase/             # client.ts (SDK cliente) · admin.ts (Admin SDK)
│   │   ├── auth/                 # AuthContext
│   │   ├── hooks/                # useCartCount, useCartTotal
│   │   ├── services/             # auth.ts
│   │   ├── utils/                # cn.ts, format.ts, serialize.ts
│   │   ├── whatsapp/             # catalogClient.ts · firestoreAuthState.ts (Baileys)
│   │   ├── melhorenvio.ts        # Melhor Envio v2: cotação → carrinho → checkout → etiqueta → rastreio
│   │   ├── email.ts              # Resend: send + reply
│   │   ├── email-templates.ts    # Templates HTML de e-mail transacional
│   │   ├── business-hours.ts     # Horário de funcionamento
│   │   ├── rateLimit.ts          # Rate limiter em memória (por instância)
│   │   ├── security.ts           # Helpers de segurança (IP, 429)
│   │   ├── settings.ts           # getSettings() (Firestore → cache)
│   │   └── store-settings.ts     # Tipo StoreSettings + defaults
│   ├── middleware.ts             # Edge Middleware: manutenção + headers de segurança + cache
│   └── types/
│       └── index.ts              # Tipos globais: User, Product, Order, Cart, Coupon, Inventory…
├── firestore.rules               # Regras de segurança do Firestore
├── firestore.indexes.json        # Índices compostos do Firestore
├── storage.rules                 # Regras de segurança do Firebase Storage
├── firebase.json                 # Config de deploy (Hosting + Cloud Run, região SA-East-1)
├── next.config.mjs               # Config Next.js (imagens, headers de cache)
├── tailwind.config.ts            # Design tokens (cores, fontes, animações)
└── scripts/
    ├── maintenance.js            # Script de manutenção via CLI
    └── whatsapp-catalog/         # Dados de catálogo importados via WhatsApp
```

---

## Coleções Firestore

| Coleção | Descrição |
|---------|-----------|
| `users` | Perfis de usuário (comprador / vendedor / admin) |
| `products` | Catálogo de produtos com variantes |
| `inventory` | Estoque por SKU com reserva atômica |
| `carts` | Carrinho persistido por usuário |
| `orders` | Pedidos com timeline de eventos e dados de entrega |
| `coupons` | Cupons de desconto com controle de uso |
| `settings/store` | Configurações da loja (único documento) |
| `conversations` | Threads de e-mail do cliente |
| `conversations/{id}/messages` | Mensagens da thread |
| `maintenance/status` | Flag de manutenção ativa |
| `maintenance_queue` | Fila de IPs durante manutenção |
| `whatsappAuth` | Credenciais de sessão Baileys (Admin SDK only) |
| `whatsappCatalogStatus` | Status da conexão e QR Code atual |

---

## Rodando localmente

### Pré-requisitos

- Node.js 20+
- Projeto no Firebase com Firestore, Auth e Storage habilitados
- Conta no [AbacatePay](https://abacatepay.com) (PIX)
- Token no [Melhor Envio](https://melhorenvio.com.br) (frete)
- Conta no [Resend](https://resend.com) (e-mail)

### Instalação

```bash
git clone https://github.com/Felipe-tt/mikma-lencois.git
cd mikma-lencois
npm install
cp .env.example .env.local   # preencha as variáveis (ver seção abaixo)
npm run dev
```

Acesse `http://localhost:3000`. O painel fica em `http://localhost:3000/painel`.

### Deploy das regras do Firestore

```bash
npx firebase deploy --only firestore
```

---

## Variáveis de ambiente

Crie `.env.local` na raiz com as variáveis abaixo. Em produção, configure-as como secrets no repositório ou no painel do Firebase / Cloud Run.

### Firebase (cliente — prefixo `NEXT_PUBLIC_`)

| Variável | Descrição |
|----------|-----------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | API key pública do projeto Firebase |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Auth domain (`<projeto>.firebaseapp.com`) |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Storage bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Messaging Sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | App ID |

### Firebase Admin (servidor)

| Variável | Descrição |
|----------|-----------|
| `FIREBASE_PROJECT_ID` | Project ID (Admin SDK) |
| `FIREBASE_CLIENT_EMAIL` | E-mail da Service Account |
| `FIREBASE_PRIVATE_KEY` | Chave privada da Service Account (com `\n` literais) |
| `FIREBASE_TOKEN` | Token do `firebase login:ci` (usado no deploy via CI) |

### Autenticação

| Variável | Descrição |
|----------|-----------|
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Client ID do OAuth 2.0 (Google Cloud Console) |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Site key do reCAPTCHA v3 |
| `RECAPTCHA_SECRET_KEY` | Secret key do reCAPTCHA v3 |

### Pagamento

| Variável | Descrição |
|----------|-----------|
| `ABACATEPAY_API_KEY` | API key da AbacatePay |
| `ABACATEPAY_PUBLIC_KEY` | Public key para validação HMAC do webhook |

### Frete — Melhor Envio

| Variável | Descrição |
|----------|-----------|
| `MELHOR_ENVIO_TOKEN` | Token OAuth da conta Melhor Envio |
| `MELHOR_ENVIO_SANDBOX` | `true` para ambiente de testes, `false` para produção |

> Escopos necessários no token: `cart-read`, `cart-write`, `shipping-calculate`, `shipping-checkout`, `shipping-generate`, `shipping-print`, `shipping-tracking`, `shipping-cancel`, `notifications-read`.
>
> Veja o guia completo em [`MELHOR_ENVIO_SETUP.md`](./MELHOR_ENVIO_SETUP.md).

### E-mail

| Variável | Descrição |
|----------|-----------|
| `RESEND_API_KEY` | API key do Resend |
| `RESEND_FROM_EMAIL` | Endereço remetente configurado no Resend (ex: `noreply@mikma.com.br`) |
| `EMAIL_INBOUND_SECRET` | Secret para validar o webhook de e-mail inbound |

---

## Deploy

O deploy é feito via Firebase Hosting com Cloud Run como backend, na região `southamerica-east1`.

```bash
# Build e deploy completo
npm run build
npx firebase deploy
```

Em produção via CI (GitHub Actions), o push na branch `main` dispara o pipeline automaticamente.

**Configuração do Cloud Run** (definida em `firebase.json`):

| Parâmetro | Valor |
|-----------|-------|
| Região | `southamerica-east1` |
| Memória | 256 MiB |
| CPUs | 1 |
| Concorrência | 40 req/instância |
| Mínimo de instâncias | 0 (cold start) |
| Máximo de instâncias | 2 |
| Timeout | 120 s |

---

## Webhooks

### AbacatePay (confirmação de pagamento PIX)

- **Endpoint**: `POST /api/payment/webhook`
- **Método de autenticação**: HMAC-SHA256 com `ABACATEPAY_PUBLIC_KEY`
- No painel da AbacatePay, configure a URL: `https://<dominio>/api/payment/webhook`

### Melhor Envio (rastreio automático)

- **Endpoint**: `POST /api/shipping/webhook`
- **Método de autenticação**: HMAC-SHA256 com `MELHOR_ENVIO_TOKEN`
- No painel do Melhor Envio → **Gerenciar → Webhooks**, configure: `https://<dominio>/api/shipping/webhook`
- Marque todos os eventos `order.*`

### E-mail inbound

- **Endpoint**: `POST /api/email/inbound`
- Configure o serviço de e-mail inbound (ex: Resend Inbound) para fazer POST nessa URL com o `EMAIL_INBOUND_SECRET` no header

---

## Papéis de usuário

| Papel | Permissões |
|-------|-----------|
| `buyer` | Acessa loja, carrinho, checkout, pedidos próprios, perfil |
| `seller` | Tudo de `buyer` + painel (produtos, pedidos, estoque, cupons, mensagens, configurações, manutenção) |
| `admin` | Tudo de `seller` + deletar usuários, alterar papéis, deletar qualquer pedido |

Os papéis são definidos como Custom Claims no Firebase Auth. Para promover um usuário via Admin SDK:

```javascript
await adminAuth.setCustomUserClaims(uid, { role: 'seller' });
```

---

## Fluxo de pagamento PIX

```
1. Cliente finaliza checkout → POST /api/payment/create-pix
   ├── Preços recalculados no servidor (Firestore)
   ├── Estoque verificado e reservado atomicamente
   ├── Cupom validado server-side
   └── Pedido criado com status: pending_payment

2. AbacatePay gera QR Code → retornado ao cliente (15 min de expiração)

3. Cliente paga o PIX

4. AbacatePay envia webhook → POST /api/payment/webhook
   ├── HMAC validado
   ├── Pedido atualizado para status: paid
   ├── Reserva de estoque confirmada (reserved → quantity)
   └── E-mail de confirmação enviado ao cliente

5. Seller acessa o painel → prepara e despacha via Melhor Envio
   └── POST /api/delivery → etiqueta gerada, status: shipped
```

---

## Fluxo de frete (Melhor Envio)

```
1. Checkout: POST /api/shipping/quote
   └── Melhor Envio calcula PAC, SEDEX e Jadlog (se ativo)

2. Seller despacha: POST /api/delivery
   ├── Adiciona ao carrinho ME (meAddToCart)
   ├── Compra etiqueta (meCheckout — debita saldo ME)
   ├── Gera etiqueta PDF (meGenerate)
   └── Obtém URL do PDF (mePrint)

3. Melhor Envio envia webhooks conforme a entrega evolui
   └── POST /api/shipping/webhook → timeline do pedido atualiza automaticamente
```

---

## Licença

Repositório privado. Todos os direitos reservados.
