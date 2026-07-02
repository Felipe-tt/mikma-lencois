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
  threadCount?: number       // e.g. 400
  composition?: string       // e.g. "100% Algodão"
  weightGsm?: number         // e.g. 180 g/m²
  certifications?: string[]  // e.g. ["OEKO-TEX", "Fair Trade"]
}

// ─── Inventory ───────────────────────────────────────────────────────────────
export interface MovementLog {
  type: 'in' | 'out'
  quantity: number
  reason: string
  date: string
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
    trackingUrl?: string
    melhorEnvioOrderId?: string
    uberDirectDeliveryId?: string
    labelUrl?: string
    dispatchedAt?: string
    deliveredAt?: string
    estimatedDelivery?: string
    estimatedDays?: number
  }
  address: Address
  totalCents: number
  discountCents?: number
  couponCode?: string
  createdAt: string
  updatedAt?: string
  timeline?: OrderTimelineEvent[]
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

