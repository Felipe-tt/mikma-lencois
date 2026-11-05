import Link from 'next/link';
import type { Metadata } from 'next';
import { shareMeta } from '@/lib/seo';
import { searchCatalog } from '@/lib/productSearch';
import { getStoreSettings } from '@/lib/settings';
import { linesForProduct, packageContents, parseTable, type PackageLine } from '@/lib/packageContents';
import { SIZE_LABEL } from '@/lib/productOptions';
import { ProductCard } from '@/components/product/ProductCard';
import { SortSelect } from '@/components/product/SortSelect';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Product } from '@/types';
import { getCatalog } from '@/lib/catalog';


interface Props { searchParams: Promise<{ categoria?: string; tamanho?: string; q?: string; ordem?: string; pagina?: string }> }

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

function getCategories(all: Product[]): { name: string; count: number }[] {
  const map: Record<string, number> = {};
  for (const p of all) if (p.category) map[p.category] = (map[p.category] ?? 0) + 1;
  return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Medidas em cm de cada peça do produto (tabela da embalagem), para a busca. */
function measuresFor(lines: PackageLine[]) {
  return (p: Product): number[] => linesForProduct(lines, {
    category: p.category,
    sizes: [...new Set((p.variants ?? []).map(v => SIZE_LABEL[v.size] ?? v.size))],
  }).flatMap(l => l.pieces.flatMap(piece => [piece.dims.l, piece.dims.c, piece.dims.a].filter((n): n is number => typeof n === 'number' && n > 0)));
}

// Tamanhos que dá para filtrar, na ordem da cama menor para a maior.
const SIZE_ORDER = ['berco', 'solteiro', 'casal', 'queen', 'king'];
const hasSize = (p: Product, size: string) => (p.variants ?? []).some(v => v.size === size);

function getSizes(all: Product[]): { key: string; label: string; count: number }[] {
  return SIZE_ORDER
    .map(key => ({ key, label: SIZE_LABEL[key] ?? key, count: all.filter(p => hasSize(p, key)).length }))
    .filter(s => s.count > 0);
}

function getProducts(all: Product[], cat?: string, ordem?: string, search?: string, page = 1, lines: PackageLine[] = [], size?: string): { products: Product[]; hasMore: boolean; approximate: boolean; total: number } {
  // Tamanho: tocar em "Casal" mostra só os produtos casal.
  const inCat = all.filter(p => (!cat || p.category === cat) && (!size || hasSize(p, size)));
  // Busca e ordem por preço usam o catálogo inteiro; o resto pagina de 48 em 48.
  const wantsAll = !!search || ordem === 'preco_asc' || ordem === 'preco_desc';
  const max = wantsAll ? inCat.length : PAGE_SIZE * page;
  const hasMore = !wantsAll && inCat.length > max;
  const list = inCat.slice(0, max);
  // Busca: sem acento, plural, erro de digitação e medida ("158x198").
  const found = search ? searchCatalog(list, search, { measuresOf: measuresFor(lines) }) : { products: list, approximate: false };
  const products = found.products;
  const approximate = found.approximate;
  const total = inCat.length;
  if (ordem === 'preco_asc')  return { products: [...products].sort((a, b) => a.price - b.price), hasMore, approximate, total };
  if (ordem === 'preco_desc') return { products: [...products].sort((a, b) => b.price - a.price), hasMore, approximate, total };
  return { products, hasMore, approximate, total };
}

export default async function ProdutosPage({ searchParams }: Props) {
  const { categoria, tamanho: tamanhoParam, q, ordem, pagina } = await searchParams;
  const search = q?.trim() || undefined;

  const page = Math.min(10, Math.max(1, Number(pagina) || 1));
  const [all, settings] = await Promise.all([getCatalog(), search ? getStoreSettings() : null]);
  const lines = settings ? (() => { const t = parseTable(settings.sizeGuideColumns, settings.sizeGuideRows); return packageContents(t.columns, t.rows); })() : [];
  // Tamanhos com produto na categoria escolhida. Trocar para uma categoria
  // sem aquele tamanho (ex.: Fronhas) volta a mostrar tudo, sem lista vazia.
  const sizes = getSizes(categoria ? all.filter(p => p.category === categoria) : all);
  const tamanho = tamanhoParam && sizes.some(sz => sz.key === tamanhoParam) ? tamanhoParam : undefined;
  const { products, hasMore, approximate, total } = getProducts(all, categoria, ordem, search, page, lines, tamanho);
  const categories = getCategories(all);
  // Total real da categoria (a lista pode estar paginada), não só o que veio.
  const catalogTotal = total;
  const shownTotal = search ? products.length : Math.max(products.length, catalogTotal);
  // Links mantêm busca e ordem (antes a lateral do desktop perdia os dois).
  const hrefWith = (changes: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { categoria, tamanho, q: search, ordem, ...changes };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `/produtos?${qs}` : '/produtos';
  };
  const sizeLabel = tamanho ? SIZE_LABEL[tamanho] ?? tamanho : undefined;
  const heading = search ? `“${search}”` : [categoria ?? (sizeLabel ? 'Produtos' : 'Todos os produtos'), sizeLabel].filter(Boolean).join(' ');

  return (
    <div>
      {/* ── Header ── */}
      <div className="border-b border-mist">
        <div className="container-shop py-6 sm:py-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="font-semibold text-[10px] tracking-[0.24em] uppercase text-faint mb-2">
                {search ? 'Resultado da busca' : categoria ? `Catálogo / ${categoria}` : 'Catálogo'}
              </p>
              <h1 className="font-display font-normal text-ink text-3xl sm:text-4xl leading-tight">
                {heading}
              </h1>
              <p className="text-[12px] text-faint mt-2 font-semibold">
                {shownTotal} {search ? (shownTotal === 1 ? 'resultado' : 'resultados') : (shownTotal === 1 ? 'produto' : 'produtos')}
              </p>
            </div>
            <div className="flex items-center gap-2 pb-1 shrink-0">
              {/* Ordenar; os filtros ficam à vista acima da lista */}
              <div className="hidden sm:block">
                <SortSelect current={ordem} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container-shop py-6 sm:py-8 pb-20">
        <div className="flex gap-12 items-start">

          {/* Sidebar desktop */}
          {categories.length > 0 && (
            <aside className="hidden lg:flex flex-col gap-7 w-44 shrink-0 sticky top-24">
              <div>
                <p className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-faint mb-4">Categorias</p>
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
            <div className="flex items-center justify-end gap-3 mb-4 sm:hidden">
              <SortSelect current={ordem} />
            </div>

            {/* Filtros à vista (antes a categoria ficava escondida no
                "Filtrar"): categoria no celular e tablet (no computador fica
                na lateral) e tamanho em todos. */}
            {categories.length > 1 && (
              <ChipRow label="Categoria" className="lg:hidden" items={[
                { label: 'Todos', href: hrefWith({ categoria: undefined, pagina: undefined }), on: !categoria },
                ...categories.map(c => ({ label: c.name, href: hrefWith({ categoria: c.name, pagina: undefined }), on: categoria === c.name })),
              ]} />
            )}
            {sizes.length > 1 && (
              <ChipRow label="Tamanho" items={[
                { label: 'Todos', href: hrefWith({ tamanho: undefined, pagina: undefined }), on: !tamanho },
                ...sizes.map(sz => ({ label: sz.label, href: hrefWith({ tamanho: sz.key, pagina: undefined }), on: tamanho === sz.key })),
              ]} />
            )}
            {approximate && products.length > 0 && (
              <p role="status" className="mb-6 rounded-2xl border border-mist bg-warm/50 px-4 py-3 text-[13px] text-mid leading-relaxed">
                Nada com todas as palavras de <strong className="font-semibold text-ink">“{search}”</strong>. Estes são os mais parecidos.
              </p>
            )}
            {products.length === 0 ? (
              <EmptyState
                icon={search
                  ? <svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
                  : <svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>}
                title={search ? `Nada encontrado para “${search}”` : 'Nenhum produto encontrado'}
                description={search
                  ? 'Confira a grafia ou tente uma palavra mais geral, como “lençol”, “casal” ou “fronha”.'
                  : categoria ? `Não há produtos em “${categoria}”. Tente outra categoria.` : 'Ainda não há produtos cadastrados.'}
                actions={search || categoria ? [
                  { label: 'Ver todos os produtos', href: '/produtos' },
                  ...(search ? [{ label: 'Guia de tamanhos', href: '/guia-de-tamanhos', variant: 'outline' as const }] : []),
                ] : []}
              />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-x-3 gap-y-6 sm:gap-x-5 sm:gap-y-9">
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

function ChipRow({ label, items, className = '' }: { label: string; items: { label: string; href: string; on: boolean }[]; className?: string }) {
  return (
    <nav aria-label={label} className={`mb-4 last-of-type:mb-6 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-none ${className}`}>
      <ul className="flex items-center gap-2 w-max">
        <li className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-faint mr-1 w-[5.5rem] shrink-0">{label}</li>
        {items.map(it => (
          <li key={it.label}>
            <Link href={it.href} scroll={false} aria-current={it.on ? 'page' : undefined}
              className={`inline-flex items-center h-10 px-4 rounded-full border text-[13px] whitespace-nowrap transition-colors duration-150 ${it.on ? 'bg-ink text-paper border-ink font-semibold' : 'border-mist-d text-ink hover:border-ink'}`}>
              {it.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
