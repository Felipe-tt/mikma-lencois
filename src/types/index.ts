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
  fabric: string
}

export interface Product {
  id: string
  name: string
  description: string
  price: number // centavos
  images: string[]
  category: string
  tags: string[]
  variants: ProductVariant[]
  active: boolean
  createdAt: string
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
  }
  delivery: {
    carrier: 'uber_direct' | 'melhor_envio' | 'disk_tenha' | null
    trackingCode?: string
    dispatchedAt?: string
    estimatedDelivery?: string
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
