import { adminDb } from '@/lib/firebase/admin';
import Link from 'next/link';
import { ProductCard } from '@/components/product/ProductCard';
import { CategoryFilter } from '@/components/product/CategoryFilter';
import { MobileFilterSheet } from '@/components/product/MobileFilterSheet';
import type { Product } from '@/types';
import { serialize } from '@/lib/utils/serialize';

export const dynamic = 'force-dynamic';

interface Props { searchParams: Promise<{ categoria?: string; q?: string; ordem?: string }> }

async function getCategories(): Promise<{ name: string; count: number }[]> {
  const snap = await adminDb.collection('products').where('active','==',true).select('category').get();
  const map: Record<string, number> = {};
  snap.docs.forEach(d => { const c = d.data().category as string; if (c) map[c] = (map[c] ?? 0) + 1; });
  return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
}

async function getProducts(cat?: string, ordem?: string): Promise<Product[]> {
  let q = adminDb.collection('products').where('active','==',true);
  if (cat) q = q.where('category','==',cat) as typeof q;
  const snap = await q.orderBy('createdAt','desc').limit(48).get();
  const products = snap.docs.map(d => serialize<Product>({ id: d.id, ...d.data() }));
  if (ordem === 'preco_asc')  return [...products].sort((a, b) => a.price - b.price);
  if (ordem === 'preco_desc') return [...products].sort((a, b) => b.price - a.price);
  return products;
}

export default async function ProdutosPage({ searchParams }: Props) {
  const { categoria, q, ordem } = await searchParams;
  const [products, categories] = await Promise.all([getProducts(categoria, ordem), getCategories()]);
  const catNames = categories.map(c => c.name);

  const heading = q ? `"${q}"` : (categoria ?? 'Todos os produtos');

  return (
    <div>
      {/* ── Page header — sem fundo separado ── */}
      <div className="border-b border-mist">
        <div className="container-shop py-10 md:py-12">
          <span className="eyebrow mb-3 block">Catálogo</span>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="font-display font-normal text-ink text-4xl sm:text-5xl leading-tight">
                {heading}
              </h1>
              <p className="text-[13px] text-faint mt-2">
                {products.length} produto{products.length !== 1 ? 's' : ''}
              </p>
            </div>
            {/* Sort + mobile filter */}
            <div className="flex items-center gap-2 pb-1 shrink-0">
              <div className="hidden sm:block">
                <SortSelect current={ordem} />
              </div>
              <div className="lg:hidden">
                <MobileFilterSheet categories={catNames} active={categoria} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container-shop py-8 sm:py-12 pb-20">
        <div className="flex gap-12 items-start">

          {/* Sidebar */}
          {categories.length > 0 && (
            <aside className="hidden lg:flex flex-col gap-6 w-44 shrink-0 sticky top-24">
              <div>
                <p className="text-[9px] font-bold tracking-[0.24em] uppercase text-faint mb-4">Categorias</p>
                <div className="flex flex-col gap-0.5">
                  <Link
                    href="/produtos"
                    className={`flex items-center justify-between px-3 py-2 text-[13px] transition-colors duration-150 ${
                      !categoria ? 'text-ink font-medium bg-warm' : 'text-mid hover:text-ink hover:bg-warm/50'
                    }`}
                  >
                    <span>Todos</span>
                    <span className="text-[11px] text-faint">{categories.reduce((s, c) => s + c.count, 0)}</span>
                  </Link>
                  {categories.map(cat => (
                    <Link
                      key={cat.name}
                      href={`/produtos?categoria=${encodeURIComponent(cat.name)}`}
                      className={`flex items-center justify-between px-3 py-2 text-[13px] transition-colors duration-150 ${
                        categoria === cat.name ? 'text-ink font-medium bg-warm' : 'text-mid hover:text-ink hover:bg-warm/50'
                      }`}
                    >
                      <span>{cat.name}</span>
                      <span className="text-[11px] text-faint">{cat.count}</span>
                    </Link>
                  ))}
                </div>
              </div>
              {/* Sort — sidebar */}
              <div>
                <p className="text-[9px] font-bold tracking-[0.24em] uppercase text-faint mb-4">Ordenar</p>
                <SortSelect current={ordem} />
              </div>
            </aside>
          )}

          {/* Grid */}
          <div className="flex-1 min-w-0">
            {products.length === 0 ? (
              <div className="py-24 text-center border border-mist">
                <p className="font-display text-2xl text-faint font-normal mb-4">Nenhum produto encontrado.</p>
                <Link href="/produtos" className="text-[13px] text-mid hover:text-clay transition-colors font-medium">
                  Limpar filtros →
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-px bg-mist border border-mist">
                {products.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 4} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SortSelect({ current }: { current?: string }) {
  const options = [
    { value: '', label: 'Mais recentes' },
    { value: 'preco_asc', label: 'Menor preço' },
    { value: 'preco_desc', label: 'Maior preço' },
  ];
  // Server component: use form GET for sort
  return (
    <form method="get">
      <select
        name="ordem"
        defaultValue={current ?? ''}
        onChange={(e) => {
          const form = e.target.form;
          if (form) form.submit();
        }}
        className="text-[12px] text-mid border border-mist bg-paper px-3 py-2 cursor-pointer hover:border-ink/20 transition-colors focus:outline-none"
        style={{borderRadius:'2px'}}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </form>
  );
}
