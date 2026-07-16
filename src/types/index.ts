// ─── Users ───────────────────────────────────────────────────────────────────
export type UserRole = 'buyer' | 'seller' | 'admin'

export interface Address {
  cep: string
  street: string
  number: string
  complement?: string
  neighborhood: string
  city: string
  state: string
}

export interface User {
  uid: string
  name: string
  email: string
  role: UserRole
  googleUid?: string
  address?: Address
  cpf?: string // criptografado, opcional
  lgpdConsent: { date: string; version: string }
  createdAt: string
  updatedAt?: string
}

// ─── Products ────────────────────────────────────────────────────────────────
export interface ProductVariant {
  id: string
  size: 'solteiro' | 'casal' | 'queen' | 'king'
  color: string
  colorName?: string
  fabric: string
}

export interface Product {
  id: string
  name: string
  description: string
  price: number // centavos
  weightKg: number          // peso por unidade (obrigatório para frete)
  images: string[]
  category: string
  tags: string[]
  variants: ProductVariant[]
  active: boolean
  createdAt: string
  // Fabric specs (optional, shown in product detail)
  yarnCount?: string         // fiação do tecido, ex: "30/1" — mostrado como "Fio 30/1"
  composition?: string       // e.g. "100% Algodão"
  weightGsm?: number         // e.g. 180 g/m²
  certifications?: string[]  // e.g. ["OEKO-TEX", "Fair Trade"]
}

// ─── Reviews ─────────────────────────────────────────────────────────────────
export interface Review {
  id: string
  productId: string
  orderId: string
  userId: string
  userName: string
  rating: 1 | 2 | 3 | 4 | 5
  comment: string
  createdAt: string
}

// ─── Wishlist ────────────────────────────────────────────────────────────────
export interface Wishlist {
  productIds: string[]
  updatedAt: string
}

// ─── Inventory ───────────────────────────────────────────────────────────────
export interface MovementLog {
  type: 'in' | 'out'
  quantity: number
  reason: string
  date: string
  by?: string // e-mail de quem registrou a movimentação
  saleId?: string // agrupa itens vendidos juntos na mesma venda presencial
}

export interface InventoryItem {
  sku: string
  productId: string
  variant: ProductVariant
  quantity: number
  reserved: number
  lowStockThreshold: number
  history: MovementLog[]
  updatedAt: string
}

// ─── Orders ──────────────────────────────────────────────────────────────────
export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'preparing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'

export interface OrderItem {
  productId: string
  productName: string
  sku: string
  variant: ProductVariant
  quantity: number
  unitPrice: number // centavos
  image?: string
}

export interface OrderTimelineEvent {
  status: OrderStatus | 'created' | 'payment_initiated' | 'payment_confirmed' | 'payment_expired' | 'payment_failed'
  at: string // ISO string
  note?: string
}

export interface Order {
  id: string
  userId: string
  items: OrderItem[]
  status: OrderStatus
  payment: {
    method: 'pix'
    txId: string
    pixQrCode?: string
    pixCopyPaste?: string
    paidAt?: string
  } | {
    method: 'card'
    installments: number
    paidAt?: string
  }
  delivery: {
    carrier: 'melhor_envio' | 'correios_pac' | 'correios_sedex' | 'jadlog_package' | 'jadlog_expresso' | 'pickup' | 'uber_direct' | 'manual' | null
    trackingCode?: string
    trackingUrl?: string        // URL real da entrega (Uber Direct: link de rastreio em tempo real)
    melhorEnvioOrderId?: string
    uberDirectDeliveryId?: string
    uberSandbox?: boolean
    uberQuoteId?: string          // quoteId da cotação — passado no despacho para garantir o preço
    labelUrl?: string
    priceCents?: number          // valor efetivamente cobrado do cliente (pode ser 0 com frete grátis)
    realPriceCents?: number      // custo real de despacho — SEMPRE preenchido, mesmo com frete grátis. Nunca exposto ao cliente.
    dispatchedAt?: string
    deliveredAt?: string
    estimatedDelivery?: string
    estimatedDays?: number
    // Uber Direct — atualizados pelo webhook
    courierName?: string        // Nome do entregador
    courierPhone?: string       // Telefone mascarado do entregador
    courierPhoto?: string       // Foto do entregador (img_href)
    courierVehicle?: string     // vehicle_type (car, bicycle, scooter…)
    dropoffEta?: string         // ETA de entrega (ISO)
    pickupEta?: string          // ETA de coleta na loja (ISO)
    courierLat?: number         // Posição ao vivo do entregador (atualizada a cada courier_update)
    courierLng?: number
    courierLocationAt?: string  // ISO — quando essa posição foi recebida
    routePoints?: { lat: number; lng: number }[]  // rota loja→cliente (calculada 1x quando o motoboy é atribuído)
  }
  address: Address
  totalCents: number
  discountCents?: number
  couponCode?: string
  createdAt: string
  updatedAt?: string
  timeline?: OrderTimelineEvent[]
}

// ─── Trocas e devoluções ─────────────────────────────────────────────────────
export type ReturnType = 'troca' | 'devolucao'
export type ReturnStatus = 'solicitada' | 'aprovada' | 'recusada' | 'concluida'

export interface ReturnItem {
  sku: string
  productId: string
  productName: string
  variant: ProductVariant
  quantity: number
}

export interface ReturnRequest {
  id: string
  orderId: string
  userId: string
  customerName?: string
  type: ReturnType
  reason: string
  items: ReturnItem[]
  status: ReturnStatus
  restocked: boolean       // true assim que a devolução ao estoque já foi feita
  refundCents?: number     // valor devolvido, se for devolução com reembolso
  note?: string            // observação interna do vendedor
  createdAt: string
  updatedAt?: string
  createdBy?: string       // email de quem registrou no painel
}

// ─── Cart ────────────────────────────────────────────────────────────────────
export interface CartItem {
  productId: string
  productName: string
  sku: string
  variant: ProductVariant
  quantity: number
  unitPrice: number
  image: string
}

export interface Cart {
  userId: string
  items: CartItem[]
  reservedUntil?: string // ISO — expira em 15min
  updatedAt: string
}

// ─── Coupons ─────────────────────────────────────────────────────────────────
export type CouponType = 'percent' | 'fixed'

export interface Coupon {
  code: string
  type: CouponType
  value: number
  minOrderCents?: number
  expiresAt: string
  maxUses?: number
  usedCount: number
  active: boolean
}

// ─── Delivery ────────────────────────────────────────────────────────────────
export type DeliveryCarrier = 'uber_direct' | 'melhor_envio' | 'disk_tenha'

export interface DeliveryQuote {
  carrier: DeliveryCarrier
  label: string
  priceCents: number
  estimatedDays: number
  available: boolean
}

// ─── Mensagens (caixa de e-mail no painel) ──────────────────────────────────
export interface EmailAttachment {
  filename: string
  contentType: string
  url: string       // URL permanente no Firebase Storage
  isImage: boolean
}

export interface EmailMessage {
  id: string
  direction: 'inbound' | 'outbound'
  from: string
  to: string
  subject: string
  text: string
  html?: string
  attachments?: EmailAttachment[]
  createdAt: string
  /** UID do seller/admin que enviou (só presente em direction: outbound) */
  sentBy?: string
}

export interface Conversation {
  id: string
  /** E-mail do cliente — usado para agrupar a thread */
  customerEmail: string
  customerName?: string
  lastMessagePreview: string
  lastMessageAt: string
  /** true se a última mensagem inbound ainda não foi lida no painel */
  unread: boolean
  messageCount: number
}

