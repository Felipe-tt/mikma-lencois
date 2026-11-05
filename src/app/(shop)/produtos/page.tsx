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
  const [all, settings] = await Promise.all([getCatalog(), getStoreSettings()]);
  const lines = (() => { const t = parseTable(settings.sizeGuideColumns, settings.sizeGuideRows); return packageContents(t.columns, t.rows); })();
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

  // Categorias na ordem de quem compra: jogo, lençol, fronha, depois o resto.
  const CAT_ORDER = ['Jogos de cama', 'Lençóis', 'Fronhas'];
  const orderedCats = [...categories].sort((a, b) => {
    const ia = CAT_ORDER.indexOf(a.name), ib = CAT_ORDER.indexOf(b.name);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.name.localeCompare(b.name);
  });
  const allCount = categories.reduce((n, c) => n + c.count, 0);
  const hasFilter = !!(categoria || tamanho);
  // "Todos" do tamanho conta a categoria inteira, não o que o filtro deixou.
  const catCount = categoria ? categories.find(c => c.name === categoria)?.count ?? total : allCount;

  return (
    <div>
      {/* ── Título ── */}
      <div className="container-shop pt-6 sm:pt-9 pb-4 sm:pb-5">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="font-semibold text-[10px] tracking-[0.24em] uppercase text-faint mb-2">
              {search ? 'Resultado da busca' : 'Catálogo'}
            </p>
            <h1 className="font-display font-normal text-ink text-[1.9rem] sm:text-4xl leading-tight">
              {heading}
            </h1>
            <p className="text-[12px] text-faint mt-1.5 font-semibold tabular-nums">
              {shownTotal} {search ? (shownTotal === 1 ? 'resultado' : 'resultados') : (shownTotal === 1 ? 'produto' : 'produtos')}
              {hasFilter && (
                <Link href={hrefWith({ categoria: undefined, tamanho: undefined, pagina: undefined })} scroll={false}
                  className="ml-2.5 font-medium text-clay hover:text-clay-d underline-offset-4 hover:underline">
                  Limpar filtros
                </Link>
              )}
            </p>
          </div>
          <div className="shrink-0 pb-0.5">
            <SortSelect current={ordem} />
          </div>
        </div>
      </div>

      {/* ── Categorias: abas fixas logo abaixo do cabeçalho do site ── */}
      {orderedCats.length > 1 && (
        <div className="sticky top-[60px] z-30 bg-paper/92 backdrop-blur-md border-y border-mist">
          <nav aria-label="Categoria" className="container-shop overflow-x-auto scrollbar-none">
            <ul className="flex items-stretch gap-6 sm:gap-8 w-max h-12">
              {[{ name: 'Tudo', key: undefined as string | undefined, count: allCount }, ...orderedCats.map(c => ({ ...c, key: c.name }))].map(c => {
                const on = categoria === c.key;
                return (
                  <li key={c.name} className="flex">
                    <Link href={hrefWith({ categoria: c.key, pagina: undefined })} scroll={false}
                      aria-current={on ? 'page' : undefined}
                      className={`relative flex items-center gap-1.5 text-[13.5px] whitespace-nowrap transition-colors duration-200 ${on ? 'text-ink font-semibold' : 'text-mid hover:text-ink'}`}>
                      {c.name}
                      {!search && <span className={`text-[10.5px] tabular-nums ${on ? 'text-clay' : 'text-faint'}`}>{c.count}</span>}
                      <span aria-hidden="true"
                        className={`absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-ink origin-center transition-transform duration-300 ease-out ${on ? 'scale-x-100' : 'scale-x-0'}`} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      )}

      <div className="container-shop pt-5 sm:pt-7 pb-20">
        <div>

          {/* ── Tamanho: a cama desenhada na proporção de cada um ── */}
          {sizes.length > 1 && (
            <nav aria-label="Tamanho" className="mb-6 sm:mb-8 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-none">
              <ul className="flex gap-2.5 w-max">
                {[{ key: undefined as string | undefined, label: 'Todos', w: 0 }, ...sizes.map(sz => ({ key: sz.key as string | undefined, label: sz.label, w: sizeDims(sz.key, lines)[0] }))].map(sz => {
                  const on = tamanho === sz.key;
                  const dims = sz.key ? sizeDims(sz.key, lines) : null;
                  return (
                    <li key={sz.label}>
                      <Link href={hrefWith({ tamanho: sz.key, pagina: undefined })} scroll={false}
                        aria-current={on ? 'page' : undefined}
                        className={`group flex flex-col items-center justify-end gap-1.5 w-[5.6rem] h-[5.4rem] rounded-2xl border px-2 pb-2.5 pt-3 transition-[border-color,background-color,box-shadow] duration-200 ${on ? 'border-ink bg-warm shadow-[0_6px_18px_-10px_rgba(40,24,12,0.45)]' : 'border-mist bg-paper hover:border-mist-d hover:bg-warm/50'}`}>
                        <span className="h-7 flex items-end">
                          {sz.key ? <BedGlyph widthCm={sz.w} pillows={sz.key === 'solteiro' || sz.key === 'berco' ? 1 : 2} on={on} /> : <AllBedsGlyph on={on} />}
                        </span>
                        <span className={`text-[12.5px] leading-none ${on ? 'font-semibold text-ink' : 'text-ink'}`}>{sz.label}</span>
                        <span className="text-[10px] leading-none text-faint tabular-nums">{dims ? `${dims[0]} x ${dims[1]}` : `${catCount} ${catCount === 1 ? 'item' : 'itens'}`}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}

          {/* Grid */}
          <div className="min-w-0">
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

// Medida do lençol (largura x comprimento) de cada tamanho, da tabela da
// embalagem nas Configurações; sem ela, a medida padrão do cartão.
const DEFAULT_DIMS: Record<string, [number, number]> = { berco: [70, 130], solteiro: [88, 188], casal: [138, 188], queen: [158, 198], king: [193, 198] };
function sizeDims(key: string, lines: PackageLine[]): [number, number] {
  const label = (SIZE_LABEL[key] ?? key).toLowerCase();
  const line = lines.find(l => l.size.toLowerCase() === label);
  const sheet = line?.pieces.find(p => p.kind === 'lencol');
  if (sheet?.dims.l && sheet.dims.c) return [sheet.dims.l, sheet.dims.c];
  return DEFAULT_DIMS[key] ?? [138, 188];
}

/** Colchão visto de cima, largura proporcional à medida (King é a maior). */
function BedGlyph({ widthCm, pillows, on }: { widthCm: number; pillows: 1 | 2; on: boolean }) {
  // Berço ~14 px, King ~42 px: a diferença entre os tamanhos aparece.
  const w = Math.round(14 + (Math.min(Math.max(widthCm, 70), 200) - 70) / 130 * 28);
  const h = 26;
  const pw = pillows === 1 ? w - 8 : (w - 10) / 2;
  return (
    <svg aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={`transition-colors duration-200 ${on ? 'text-clay' : 'text-mid group-hover:text-ink'}`}>
      <rect x="0.75" y="0.75" width={w - 1.5} height={h - 1.5} rx="3" fill="currentColor" fillOpacity={on ? 0.12 : 0.06} stroke="currentColor" strokeWidth="1.5" />
      {Array.from({ length: pillows }).map((_, i) => (
        <rect key={i} x={4 + i * (pw + 2)} y="3.5" width={pw} height="5" rx="1.6" fill="currentColor" fillOpacity="0.55" />
      ))}
      <path d={`M3 12.5H${w - 3}`} stroke="currentColor" strokeWidth="1" strokeOpacity="0.45" />
    </svg>
  );
}

/** "Todos": três camas de tamanhos diferentes, lado a lado. */
function AllBedsGlyph({ on }: { on: boolean }) {
  return (
    <svg aria-hidden="true" width="34" height="26" viewBox="0 0 34 26" className={`transition-colors duration-200 ${on ? 'text-clay' : 'text-mid group-hover:text-ink'}`}>
      <rect x="0.75" y="10.75" width="8" height="14.5" rx="2" fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeWidth="1.3" />
      <rect x="11" y="6.75" width="10" height="18.5" rx="2" fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeWidth="1.3" />
      <rect x="23.25" y="0.75" width="10" height="24.5" rx="2" fill="currentColor" fillOpacity={on ? 0.14 : 0.06} stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
