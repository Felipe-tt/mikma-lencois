import { cacheLife, cacheTag } from 'next/cache';
import { adminDb } from '@/lib/firebase/admin';
import { getCatalog } from '@/lib/catalog';
import { SIZE_LABEL, FABRIC_LABEL, DEFAULT_COMPOSITION } from '@/lib/productOptions';

export const SITE_URL = 'https://mikma.com.br';

export interface CatalogVariant {
  sku: string;
  size: string;
  color: string;
  inStock: boolean;
}

export interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  url: string;
  images: string[];
  priceCents: number;
  material: string;
  composition: string;
  yarnCount?: string;
  weightGsm?: number;
  variants: CatalogVariant[];
}

/**
 * Catálogo legível por máquina (Google Merchant, assistentes de IA): o que
 * a loja mostra, com disponibilidade por variação. Nunca expõe a quantidade
 * em estoque, só se há ou não. Mesmo cache e tag do catálogo da loja.
 */
export async function getAgentCatalog(): Promise<CatalogEntry[]> {
  'use cache';
  cacheLife({ stale: 300, revalidate: 600, expire: 86_400 });
  cacheTag('products');
  const [products, invSnap] = await Promise.all([
    getCatalog(),
    adminDb.collection('inventory').select('quantity', 'reserved').get(),
  ]);
  const available = new Map(invSnap.docs.map(d => [d.id, ((d.get('quantity') as number) ?? 0) - ((d.get('reserved') as number) ?? 0)]));
  return products.map(p => ({
    id: p.id,
    name: p.name,
    description: (p.description ?? '').trim(),
    category: p.category,
    url: `${SITE_URL}/produtos/${p.id}`,
    images: (p.images ?? []).map(u => new URL(u, SITE_URL).href),
    priceCents: p.price,
    material: FABRIC_LABEL,
    composition: p.composition || DEFAULT_COMPOSITION,
    ...(p.yarnCount && /^\d+\/\d+$/.test(p.yarnCount) ? { yarnCount: p.yarnCount } : {}),
    ...(p.weightGsm ? { weightGsm: p.weightGsm } : {}),
    variants: (p.variants ?? []).map(v => {
      const sku = `${p.id}_${v.id}`;
      return {
        sku,
        size: SIZE_LABEL[v.size] ?? v.size,
        color: v.colorName || v.color,
        inStock: (available.get(sku) ?? 0) > 0,
      };
    }),
  }));
}

export function brl(cents: number): string {
  return (cents / 100).toFixed(2);
}
