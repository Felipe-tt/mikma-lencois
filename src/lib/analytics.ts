declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

export const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

export interface AnalyticsProduct {
  id: string;
  name: string;
  priceCents: number;
  category?: string;
}

export interface AnalyticsCartLine {
  sku: string;
  productId: string;
  productName: string;
  unitPriceCents: number;
  quantity: number;
}

export interface AnalyticsOrder {
  orderId: string;
  totalCents: number;
  items: AnalyticsCartLine[];
  shippingCents?: number;
}

function centsToValue(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * GA4 (gtag.js) — só dispara se o script tiver carregado (NEXT_PUBLIC_GA_MEASUREMENT_ID
 * configurado). Sem isso, é um no-op silencioso, nunca quebra a página.
 */
function ga(event: string, params: Record<string, unknown>) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', event, params);
  }
}

/** Meta Pixel (fbq) — mesmo princípio, no-op se não configurado. */
function meta(event: string, params: Record<string, unknown>) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', event, params);
  }
}

export function trackPageView(url: string) {
  if (typeof window !== 'undefined' && window.gtag && GA_ID) {
    window.gtag('config', GA_ID, { page_path: url });
  }
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'PageView');
  }
}

export function trackViewItem(product: AnalyticsProduct) {
  ga('view_item', {
    currency: 'BRL',
    value: centsToValue(product.priceCents),
    items: [{ item_id: product.id, item_name: product.name, item_category: product.category, price: centsToValue(product.priceCents) }],
  });
  meta('ViewContent', {
    content_ids: [product.id],
    content_name: product.name,
    content_type: 'product',
    currency: 'BRL',
    value: centsToValue(product.priceCents),
  });
}

export function trackAddToCart(line: AnalyticsCartLine) {
  const value = centsToValue(line.unitPriceCents * line.quantity);
  ga('add_to_cart', {
    currency: 'BRL',
    value,
    items: [{ item_id: line.productId, item_name: line.productName, price: centsToValue(line.unitPriceCents), quantity: line.quantity }],
  });
  meta('AddToCart', {
    content_ids: [line.productId],
    content_name: line.productName,
    content_type: 'product',
    currency: 'BRL',
    value,
  });
}

export function trackBeginCheckout(items: AnalyticsCartLine[], totalCents: number) {
  ga('begin_checkout', {
    currency: 'BRL',
    value: centsToValue(totalCents),
    items: items.map(i => ({ item_id: i.productId, item_name: i.productName, price: centsToValue(i.unitPriceCents), quantity: i.quantity })),
  });
  meta('InitiateCheckout', {
    content_ids: items.map(i => i.productId),
    contents: items.map(i => ({ id: i.productId, quantity: i.quantity })),
    currency: 'BRL',
    value: centsToValue(totalCents),
    num_items: items.reduce((s, i) => s + i.quantity, 0),
  });
}

const PURCHASE_DEDUPE_KEY = 'mikma_analytics_purchased_orders';

function alreadyTrackedPurchase(orderId: string): boolean {
  try {
    const raw = localStorage.getItem(PURCHASE_DEDUPE_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    return ids.includes(orderId);
  } catch {
    return false;
  }
}

function markPurchaseTracked(orderId: string) {
  try {
    const raw = localStorage.getItem(PURCHASE_DEDUPE_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    ids.push(orderId);
    // guarda só os últimos 50, não precisa crescer pra sempre
    localStorage.setItem(PURCHASE_DEDUPE_KEY, JSON.stringify(ids.slice(-50)));
  } catch { /* localStorage indisponível (modo privado etc), não é crítico */ }
}

/**
 * Dispara o evento de compra pro GA4 e Meta Pixel — no máximo uma vez
 * por pedido, mesmo que a pessoa atualize a página de confirmação ou
 * volte nela depois (o pedido continua "pago" pra sempre, mas a venda
 * já foi contabilizada da primeira vez). Chamar sempre que a tela
 * detectar que um pedido passou a status pago/confirmado.
 */
export function trackPurchase(order: AnalyticsOrder) {
  if (typeof window === 'undefined') return;
  if (alreadyTrackedPurchase(order.orderId)) return;
  markPurchaseTracked(order.orderId);

  const value = centsToValue(order.totalCents);
  ga('purchase', {
    transaction_id: order.orderId,
    currency: 'BRL',
    value,
    shipping: order.shippingCents ? centsToValue(order.shippingCents) : undefined,
    items: order.items.map(i => ({ item_id: i.productId, item_name: i.productName, price: centsToValue(i.unitPriceCents), quantity: i.quantity })),
  });
  meta('Purchase', {
    content_ids: order.items.map(i => i.productId),
    contents: order.items.map(i => ({ id: i.productId, quantity: i.quantity })),
    currency: 'BRL',
    value,
  });
}
