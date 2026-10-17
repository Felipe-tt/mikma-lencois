import { adminDb } from '@/lib/firebase/admin';
import Link from 'next/link';
import type { Metadata } from 'next';
import { shareMeta } from '@/lib/seo';
import { searchProducts } from '@/lib/productSearch';
import { ProductCard } from '@/components/product/ProductCard';
import { MobileFilterSheet } from '@/components/product/MobileFilterSheet';
import { SortSelect } from '@/components/product/SortSelect';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Product } from '@/types';
import { serialize } from '@/lib/utils/serialize';

// ISR: revalida a cada 5 minutos, reduz invocações de Cloud Functions e leituras Firestore
export const revalidate = 600;

interface Props { searchParams: Promise<{ categoria?: string; q?: string; ordem?: string; pagina?: string }> }

const PAGE_SIZE = 48;

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { categoria, q } = await searchParams;
  const title = categoria
    ? `${categoria} | Produtos`
    : q
      ? `Busca por "${q}"`
      : 'Todos os produtos';
  const description = categoria
    ? `Confira nossa linha de ${categoria.toLowerCase()}: lençóis e fronhas com qualidade e conforto.`
    : 'Explore nosso catálogo completo de lençóis e fronhas.';
  return {
    title,
    description,
    // Ordenação e filtros geram a mesma lista em várias URLs: o Google
    // indexa só a da categoria (ou a geral). Busca não é indexada.
    alternates: { canonical: categoria ? `/produtos?categoria=${encodeURIComponent(categoria)}` : '/produtos' },
    ...(q ? { robots: { index: false, follow: true } } : {}),
    ...shareMeta({ title, description, path: categoria ? `/produtos?categoria=${encodeURIComponent(categoria)}` : '/produtos' }),
  };
}

// Cache em memória para categorias: evita query full-scan a cada request dentro do mesmo container
let _categoriesCache: { data: { name: string; count: number }[]; at: number } | null = null;
const CATEGORIES_TTL = 5 * 60 * 1000; // 5 min

async function getCategories(): Promise<{ name: string; count: number }[]> {
  if (_categoriesCache && Date.now() - _categoriesCache.at < CATEGORIES_TTL) {
    return _categoriesCache.data;
  }
  const snap = await adminDb.collection('products').where('active','==',true).select('category').get();
  const map: Record<string, number> = {};
  snap.docs.forEach(d => { const c = d.data().category as string; if (c) map[c] = (map[c] ?? 0) + 1; });
  const data = Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  _categoriesCache = { data, at: Date.now() };
  return data;
}

async function getProducts(cat?: string, ordem?: string, search?: string, page = 1): Promise<{ products: Product[]; hasMore: boolean }> {
  let q = adminDb.collection('products').where('active','==',true);
  if (cat) q = q.where('category','==',cat) as typeof q;
  // Busca e ordem por preço precisam do catálogo inteiro (até 300): antes
  // "Menor preço" ordenava só os 48 mais novos. Sem isso, pagina de 48 em 48.
  const wantsAll = !!search || ordem === 'preco_asc' || ordem === 'preco_desc';
  const max = wantsAll ? 300 : PAGE_SIZE * page;
  const snap = await q.orderBy('createdAt','desc').limit(max + 1).get();
  const hasMore = !wantsAll && snap.size > max;
  const docs = snap.docs.slice(0, max);
  const all = docs.map(d => serialize<Product>({ id: d.id, ...d.data() }));
  // Antes o termo aparecia no título mas não filtrava nada: toda busca
  // devolvia o catálogo inteiro.
  const products = search ? searchProducts(all, search) : all;
  if (ordem === 'preco_asc')  return { products: [...products].sort((a, b) => a.price - b.price), hasMore };
  if (ordem === 'preco_desc') return { products: [...products].sort((a, b) => b.price - a.price), hasMore };
  return { products, hasMore };
}

export default async function ProdutosPage({ searchParams }: Props) {
  const { categoria, q, ordem, pagina } = await searchParams;
  const search = q?.trim() || undefined;
  const page = Math.min(10, Math.max(1, Number(pagina) || 1));
  const [{ products, hasMore }, categories] = await Promise.all([getProducts(categoria, ordem, search, page), getCategories()]);
  // Total real da categoria (a lista pode estar paginada), não só o que veio.
  const catalogTotal = categoria
    ? categories.find(c => c.name === categoria)?.count ?? products.length
    : categories.reduce((n, c) => n + c.count, 0);
  const shownTotal = search ? products.length : Math.max(products.length, catalogTotal);
  // Links mantêm busca e ordem (antes a lateral do desktop perdia os dois).
  const hrefWith = (changes: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { categoria, q: search, ordem, ...changes };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `/produtos?${qs}` : '/produtos';
  };
  const catNames = categories.map(c => c.name);
  const heading = search ? `“${search}”` : (categoria ?? 'Todos os produtos');

  return (
    <div>
      {/* ── Header ── */}
      <div className="border-b border-mist">
        <div className="container-shop py-8 sm:py-12">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] tracking-[0.24em] uppercase text-faint mb-3">
                {search ? 'Resultado da busca' : categoria ? `Catálogo / ${categoria}` : 'Catálogo'}
              </p>
              <h1 className="font-display font-normal text-ink text-4xl sm:text-5xl leading-tight">
                {heading}
              </h1>
              <p className="text-[12px] text-faint mt-2 font-mono">
                {shownTotal} {search ? (shownTotal === 1 ? 'resultado' : 'resultados') : (shownTotal === 1 ? 'produto' : 'produtos')}
              </p>
            </div>
            <div className="flex items-center gap-2 pb-1 shrink-0">
              {/* Mesma ordem do celular: Filtrar antes de Ordenar */}
              <div className="hidden sm:block lg:hidden">
                <MobileFilterSheet categories={catNames} active={categoria} />
              </div>
              <div className="hidden sm:block">
                <SortSelect current={ordem} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container-shop py-8 sm:py-12 pb-20">
        <div className="flex gap-12 items-start">

          {/* Sidebar desktop */}
          {categories.length > 0 && (
            <aside className="hidden lg:flex flex-col gap-7 w-44 shrink-0 sticky top-24">
              <div>
                <p className="text-[9px] font-bold tracking-[0.24em] uppercase text-faint mb-4">Categorias</p>
                <div className="flex flex-col">
                  <Link href={hrefWith({ categoria: undefined })}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-[13px] transition-colors duration-150 ${
                      !categoria ? 'text-ink font-medium bg-warm' : 'text-mid hover:text-ink hover:bg-warm/60'
                    }`}>
                    <span>Todos</span>
                    {!search && <span className="text-[11px] text-faint">{categories.reduce((s,c)=>s+c.count,0)}</span>}
                  </Link>
                  {categories.map(cat => (
                    <Link key={cat.name} href={hrefWith({ categoria: cat.name })}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 text-[13px] transition-colors duration-150 ${
                        categoria === cat.name ? 'text-ink font-medium bg-warm' : 'text-mid hover:text-ink hover:bg-warm/60'
                      }`}>
                      <span>{cat.name}</span>
                      {/* Na busca a contagem do catálogo não bate com o resultado */}
                      {!search && <span className="text-[11px] text-faint">{cat.count}</span>}
                    </Link>
                  ))}
                </div>
              </div>
            </aside>
          )}

          {/* Grid */}
          <div className="flex-1 min-w-0">
            {/* Mobile sort */}
            {/* Celular: filtro e ordenação na mesma linha (o total já aparece
                no título, não repete aqui). */}
            <div className="flex items-center justify-between gap-3 mb-4 sm:hidden">
              <MobileFilterSheet categories={catNames} active={categoria} />
              <SortSelect current={ordem} />
            </div>

            {products.length === 0 ? (
              <EmptyState
                icon={search
                  ? <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
                  : <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>}
                title={search ? `Nada encontrado para “${search}”` : 'Nenhum produto encontrado'}
                description={search
                  ? 'Confira a grafia ou tente uma palavra mais geral, como "lençol", "casal" ou "percal".'
                  : categoria ? `Não há produtos em "${categoria}". Tente outra categoria.` : 'Ainda não há produtos cadastrados.'}
                actions={search || categoria ? [
                  { label: 'Ver todos os produtos', href: '/produtos' },
                  ...(search ? [{ label: 'Guia de tamanhos', href: '/guia-de-tamanhos', variant: 'outline' as const }] : []),
                ] : []}
              />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-x-3 gap-y-9 sm:gap-x-5 sm:gap-y-12">
                {/* Prioridade alta só nas 2 primeiras (primeira linha no mobile);
                    mais que isso dilui o ganho e disputa banda com o LCP. */}
                {products.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 2} />)}
              </div>
            )}
            {hasMore && (
              <div className="mt-14 flex flex-col items-center gap-3">
                <p className="text-[12.5px] text-faint tabular-nums">Mostrando {products.length} de {shownTotal}</p>
                <Link href={hrefWith({ pagina: String(page + 1) })} scroll={false} className="btn-outline">
                  Ver mais produtos
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
