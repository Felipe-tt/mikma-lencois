import { adminDb } from '@/lib/firebase/admin';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import Link from 'next/link';
import type { Product, InventoryItem, Review } from '@/types';
import { BuyBox } from '@/components/product/BuyBox';
import { JogoDeCamaBuyBox } from '@/components/product/JogoDeCamaBuyBox';
import { ProductGallery } from '@/components/product/ProductGallery';
import { ProductCarousel } from '@/components/product/ProductCarousel';
import { ProductReviews } from '@/components/product/ProductReviews';
import { SizeGuideModal } from '@/components/product/SizeGuideModal';
import { FadeIn } from '@/components/ui/FadeIn';
import { getSettings } from '@/lib/settings';
import type { Metadata } from 'next';
import { serialize } from '@/lib/utils/serialize';
import { TrackViewItem } from '@/components/product/TrackViewItem';
import { JsonLd } from '@/components/seo/JsonLd';
import { toPublicReview, type PublicReview } from '@/lib/reviews';

// ISR: revalida a cada 5 minutos, reduz leituras no Firestore por visita ao produto
export const revalidate = 300;
interface Props { params: Promise<{ slug: string }> }

// cache() do React: deduplica a leitura entre generateMetadata e a página
// na MESMA requisição. Antes era um Map por container com TTL de 5 min,
// que o revalidatePath do painel não limpava: preço alterado continuava
// velho na página (e o checkout já cobrava o novo), e produto reativado
// seguia dando 404.
const getProduct = cache(async (id: string): Promise<Product | null> => {
  const snap = await adminDb.collection('products').doc(id).get();
  if (!snap.exists || !snap.data()?.active) return null;
  return serialize<Product>({ id: snap.id, ...snap.data() });
});
async function getInventory(id: string): Promise<InventoryItem[]> {
  // select() reduz o payload: só campos necessários para exibir disponibilidade
  const snap = await adminDb.collection('inventory')
    .where('productId','==',id)
    .select('variant','quantity','reserved','lowStockThreshold')
    .get();
  return snap.docs.map(d => serialize<InventoryItem>({ sku: d.id, ...d.data() }));
}
async function getRelated(product: Product): Promise<Product[]> {
  try {
    // limit(13) em vez de 12 já que filtramos o próprio produto
    const snap = await adminDb.collection('products')
      .where('active','==',true)
      .where('category','==',product.category)
      .limit(13).get();
    const same = snap.docs
      .map(d => serialize<Product>({ id: d.id, ...d.data() }))
      .filter(p => p.id !== product.id)
      .slice(0, 12);
    if (same.length >= 4) return same;
    // Categoria com poucos produtos: completa com outros da loja pra não
    // sobrar meia linha vazia.
    const more = await adminDb.collection('products').where('active','==',true).limit(12).get();
    const seen = new Set([product.id, ...same.map(p => p.id)]);
    const extra = more.docs
      .map(d => serialize<Product>({ id: d.id, ...d.data() }))
      .filter(p => !seen.has(p.id));
    return [...same, ...extra].slice(0, 8);
  } catch { return []; }
}

async function getReviews(productId: string): Promise<PublicReview[]> {
  try {
    const snap = await adminDb.collection('reviews')
      .where('productId', '==', productId)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();
    return snap.docs.map(d => toPublicReview(serialize<Review>({ id: d.id, ...d.data() })));
  } catch { return []; }
}

// Só pra produtos "Jogos de cama" (já vêm com fronha inclusa): lista as
// Fronhas ativas do catálogo, pro cliente trocar a fronha padrão por
// outra cor/estampa na hora de comprar.
async function getFronhaOptions(product: Product): Promise<Product[]> {
  if (product.category !== 'Jogos de cama') return [];
  try {
    const snap = await adminDb.collection('products')
      .where('active', '==', true)
      .where('category', '==', 'Fronhas')
      .limit(30)
      .get();
    return snap.docs.map(d => serialize<Product>({ id: d.id, ...d.data() }));
  } catch { return []; }
}

// Estoque de cada Fronha candidata à troca, pra não deixar escolher uma
// que já está esgotada.
async function getFronhaInventory(fronhaIds: string[]): Promise<InventoryItem[]> {
  if (fronhaIds.length === 0) return [];
  try {
    const snap = await adminDb.collection('inventory')
      .where('productId', 'in', fronhaIds.slice(0, 30))
      .select('variant', 'quantity', 'reserved', 'lowStockThreshold', 'productId')
      .get();
    return snap.docs.map(d => serialize<InventoryItem>({ sku: d.id, ...d.data() }));
  } catch { return []; }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProduct(slug);
  if (!p) return { title: 'Produto não encontrado' };
  return {
    title: p.name,
    description: p.description?.slice(0, 160),
    alternates: { canonical: `/produtos/${p.id}` },
    openGraph: {
      title: p.name,
      description: p.description?.slice(0, 160),
      url: `/produtos/${p.id}`,
      // Sem width/height: a foto não é 1200x630 e dimensão errada faz o
      // WhatsApp/Facebook cortar a prévia.
      images: p.images[0] ? [{ url: p.images[0], alt: p.name }] : [],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      images: p.images[0] ? [p.images[0]] : [],
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const [product, inventory, s] = await Promise.all([getProduct(slug), getInventory(slug), getSettings()]);
  if (!product) notFound();
  const [related, reviews, fronhaOptions] = await Promise.all([getRelated(product), getReviews(product.id), getFronhaOptions(product)]);
  const relatedSameCategory = related.every(p => p.category === product.category);
  const fronhaInventory = await getFronhaInventory(fronhaOptions.map(f => f.id));

  // Extract specs from tags (thread count, fabric composition, etc.)
  // Size guide data from settings
  let sizeGuideColumns: string[] = [];
  let sizeGuideRows: Record<string, string>[] = [];
  try { sizeGuideColumns = JSON.parse(s.sizeGuideColumns || '[]'); } catch { sizeGuideColumns = []; }
  try { sizeGuideRows = JSON.parse(s.sizeGuideRows || '[]'); } catch { sizeGuideRows = []; }
  const sizeGuideNote = s.sizeGuideNote || '';
  const productTrusts = [
    s.productTrust1 || 'Entrega local em Blumenau em até 1h',
    s.productTrust2 || 'Frete para todo o Brasil com rastreio',
    s.productTrust3 || 'Pagamento PIX com confirmação imediata',
  ].filter(Boolean);

  const specTags = product.tags?.filter(t =>
    /\d+\s*fios|percal|misto|microfibra|algodão|poliéster|bamboo|cetim/i.test(t)
  ) ?? [];

  // Dados estruturados (schema.org), pro Google mostrar preço, estoque e
  // estrelas de avaliação direto no resultado de busca (rich snippet) —
  // sem isso o Google só tem o título/descrição normal da página.
  const siteUrl = 'https://mikma.com.br';
  const productUrl = `${siteUrl}/produtos/${product.id}`;
  const totalStock = inventory.reduce((sum, i) => sum + Math.max(0, i.quantity - i.reserved), 0);
  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  const productJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description?.slice(0, 5000),
    image: product.images,
    sku: product.id,
    category: product.category,
    brand: { '@type': 'Brand', name: 'Mikma Lençóis' },
    offers: {
      '@type': 'Offer',
      url: productUrl,
      priceCurrency: 'BRL',
      price: (product.price / 100).toFixed(2),
      availability: totalStock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      // Direito de arrependimento (CDC art. 49): 7 dias corridos, ver
      // /trocas-e-devolucoes. O Merchant Center avisa quando falta.
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'BR',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 7,
        returnMethod: 'https://schema.org/ReturnByMail',
      },
    },
  };
  if (reviews.length > 0) {
    productJsonLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: avgRating.toFixed(1),
      reviewCount: reviews.length,
    };
    // Só as mais recentes — a nota geral já vem do aggregateRating acima,
    // isso aqui é só pra enriquecer ainda mais o rich snippet.
    productJsonLd.review = reviews.slice(0, 5).map(r => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: r.userName },
      reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
      reviewBody: r.comment,
      datePublished: r.createdAt,
    }));
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Início', item: siteUrl },
      { '@type': 'ListItem', position: 2, name: 'Produtos', item: `${siteUrl}/produtos` },
      ...(product.category
        ? [{ '@type': 'ListItem', position: 3, name: product.category, item: `${siteUrl}/produtos?categoria=${encodeURIComponent(product.category)}` }]
        : []),
      { '@type': 'ListItem', position: product.category ? 4 : 3, name: product.name, item: productUrl },
    ],
  };

  return (
    <div>
      <TrackViewItem id={product.id} name={product.name} priceCents={product.price} category={product.category} />
      <JsonLd data={productJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <div className="border-b border-mist bg-warm/40">
        <div className="container-shop py-4">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.06em] text-faint overflow-x-auto whitespace-nowrap scrollbar-none">
            <Link href="/" className="hover:text-clay transition-colors shrink-0">Início</Link>
            <span className="text-mist mx-1">/</span>
            <Link href="/produtos" className="hover:text-clay transition-colors shrink-0">Produtos</Link>
            {product.category && (
              <>
                <span className="text-mist mx-1">/</span>
                <Link href={`/produtos?categoria=${encodeURIComponent(product.category)}`}
                  className="hover:text-clay transition-colors shrink-0 capitalize">
                  {product.category}
                </Link>
              </>
            )}
            <span className="text-mist mx-1">/</span>
            <span className="text-mid truncate max-w-[200px]">{product.name}</span>
          </nav>
        </div>
      </div>

      <div className="container-shop py-8 pb-28 sm:pb-16">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_320px] lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px] gap-8 md:gap-8 lg:gap-12 items-start">

          {/* Ordem: no celular foto → nome/compra → detalhes; no desktop foto
              e detalhes à esquerda, nome + compra fixos à direita. Antes o
              nome ficava embaixo da foto e a coluna de compra começava direto
              pelo preço, sem dizer o que estava à venda. */}
          <div className="min-w-0 md:col-start-1 md:row-start-1">
            <ProductGallery images={product.images} name={product.name} tag={product.tags?.[0]} />
          </div>

          <div className="flex flex-col gap-5 md:col-start-2 md:row-start-1 md:row-span-2 md:sticky md:top-24">
            <div>
              {product.category && (
                <Link
                  href={`/produtos?categoria=${encodeURIComponent(product.category)}`}
                  className="eyebrow text-clay hover:text-ink transition-colors mb-2 inline-block"
                >
                  {product.category}
                </Link>
              )}
              <h1 className="font-display font-normal text-ink leading-[1.1] text-[1.75rem] sm:text-[2rem]">
                {product.name}
              </h1>
            </div>
            {product.category === 'Jogos de cama' && fronhaOptions.length > 0 ? (
              <JogoDeCamaBuyBox
                product={product}
                inventory={inventory}
                pixDiscountThresholdCents={s.pixDiscountThresholdCents ?? 0}
                pixDiscountPct={s.pixDiscountPct ?? 0}
                fronhaOptions={fronhaOptions}
                fronhaInventory={fronhaInventory}
              />
            ) : (
              <BuyBox
                product={product}
                inventory={inventory}
                pixDiscountThresholdCents={s.pixDiscountThresholdCents ?? 0}
                pixDiscountPct={s.pixDiscountPct ?? 0}
              />
            )}
          </div>

          <div className="flex flex-col gap-8 min-w-0 md:col-start-1 md:row-start-2">
            {/* Detalhes: antes eram blocos soltos com larguras diferentes
                (texto 60ch, tabela e selos 520px, sanfona na coluna toda).
                Agora tudo segue a largura da coluna, com título de seção. */}
            <FadeIn className="flex flex-col gap-9 lg:pt-4">
              <div>
                <span className="eyebrow mb-3 block">Sobre o produto</span>
                {product.description && (
                  <p className="text-[15px] text-ink/80 leading-relaxed max-w-[62ch] whitespace-pre-line">
                    {product.description}
                  </p>
                )}
                <div className="mt-5">
                  <SizeGuideModal
                    columns={sizeGuideColumns}
                    rows={sizeGuideRows}
                    note={sizeGuideNote}
                    whatsappUrl={s.whatsappUrl || undefined}
                  />
                </div>
              </div>

              {/* Selos, especificações e a sanfona formam uma pilha só, com
                  uma linha entre cada bloco (sem linha dupla). */}
              <div>
              {productTrusts.length > 0 && (
                <ul className="grid sm:grid-cols-3 rounded-2xl border border-mist bg-warm/30 divide-y sm:divide-y-0 sm:divide-x divide-mist">
                  {productTrusts.map((text, i) => (
                    <li key={i} className="flex items-center gap-3 px-4 py-4 sm:px-5 text-[13px] text-mid leading-snug">
                      <span aria-hidden="true" className="w-9 h-9 rounded-full bg-clay/10 text-clay flex items-center justify-center shrink-0">
                        {i === 0 ? <TruckIcon /> : i === 1 ? <PackageIcon /> : <PixIcon />}
                      </span>
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* ── Especificações ── */}
              {(product.yarnCount || product.composition || product.weightGsm || specTags.length > 0 || (product.certifications?.length ?? 0) > 0) && (
                <div className="pt-8 first:pt-0">
                  <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint mb-3">Especificações do tecido</p>
                  <dl className="grid sm:grid-cols-2 gap-x-10 border-t border-mist">
                    {[
                      ...(product.yarnCount ? [{ k: 'Título do fio', v: `Fio ${product.yarnCount}` }] : []),
                      ...(product.composition ? [{ k: 'Composição', v: product.composition }] : []),
                      ...(product.weightGsm ? [{ k: 'Gramatura', v: `${product.weightGsm} g/m²` }] : []),
                      ...specTags.map(tag => ({ k: 'Tipo', v: tag, cap: true })),
                      ...(product.certifications ?? []).map(cert => ({ k: 'Certificação', v: cert, clay: true })),
                    ].map((row, i) => (
                      <div key={i} className="flex items-baseline justify-between gap-4 py-3 border-b border-mist">
                        <dt className="text-[12px] text-mid">{row.k}</dt>
                        <dd className={`text-[13px] font-semibold text-right ${'clay' in row && row.clay ? 'text-clay' : 'text-ink'} ${'cap' in row && row.cap ? 'capitalize' : ''}`}>{row.v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              <SizeGuide
                columns={(() => { try { return JSON.parse(s.bedSizeColumns || '[]'); } catch { return ['Tamanho','Cama','Comprimento','Largura']; } })()}
                rows={(() => { try { return JSON.parse(s.bedSizeRows || '[]'); } catch { return []; } })()}
              />
              </div>
            </FadeIn>
          </div>

        </div>
      </div>

      <ProductReviews productId={product.id} initialReviews={reviews} />

      {/* ── Produtos relacionados ── */}
      {related.length > 0 && (
        <section className="border-t border-mist section-md">
          <div className="container-shop">
            <div className="flex items-end justify-between mb-10">
              <div>
                <span className="eyebrow mb-3 block">Você também pode gostar</span>
                <h2 className="font-display font-normal text-ink text-3xl">{relatedSameCategory ? `Mais em ${product.category}` : 'Mais da Mikma'}</h2>
              </div>
              <Link
                href={relatedSameCategory ? `/produtos?categoria=${encodeURIComponent(product.category)}` : '/produtos'}
                className={`hidden sm:inline-flex items-center gap-2 text-[13px] font-medium text-mid hover:text-ink transition-colors duration-150 group mb-1.5 ${related.length > 4 ? 'mr-[104px]' : ''}`}
              >
                Ver todos
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="transition-transform duration-200 group-hover:translate-x-0.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </Link>
            </div>
            <ProductCarousel products={related} />
          </div>
        </section>
      )}
    </div>
  );
}

function SizeGuide({ columns, rows }: { columns: string[]; rows: Record<string, string>[] }) {
  if (!columns.length || !rows.length) return null;
  return (
    <details className="group border-b first:border-t [ul+&]:mt-8 [ul+&]:border-t border-mist py-4">
      <summary className="flex items-center justify-between cursor-pointer list-none text-[12px] font-semibold text-mid tracking-[0.08em] uppercase hover:text-ink transition-colors">
        Tamanhos de cama e colchão
        <svg className="w-3.5 h-3.5 transition-transform duration-200 group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </summary>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="border-b border-mist">
              {columns.map(h => (
                <th key={h} className="text-left font-semibold text-[10px] tracking-[0.12em] uppercase text-faint pb-2 pr-4">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-mist/50 last:border-0">
                {columns.map((col, j) => (
                  <td key={col} className={`py-2 pr-4 ${j === 0 ? 'font-medium text-ink' : 'text-mid'}`}>
                    {row[col] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function TruckIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
}
function PackageIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
}
function PixIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 7v10M7 12h10"/></svg>;
}
