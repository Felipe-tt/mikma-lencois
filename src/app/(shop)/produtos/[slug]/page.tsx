import { adminDb } from '@/lib/firebase/admin';
import { notFound } from 'next/navigation';
import { cacheLife, cacheTag } from 'next/cache';
import Link from 'next/link';
import type { Product, InventoryItem, Review } from '@/types';
import { BuyBox } from '@/components/product/BuyBox';
import { JogoDeCamaBuyBox } from '@/components/product/JogoDeCamaBuyBox';
import { ProductGallery } from '@/components/product/ProductGallery';
import { ProductCarousel } from '@/components/product/ProductCarousel';
import { ProductReviews } from '@/components/product/ProductReviews';
import { PackageContents } from '@/components/product/PackageContents';
import { linesForProduct, packageContents, parseTable } from '@/lib/packageContents';
import { getStoreSettings } from '@/lib/settings';
import type { Metadata } from 'next';
import { shareMeta } from '@/lib/seo';
import { serialize } from '@/lib/utils/serialize';
import { TrackViewItem } from '@/components/product/TrackViewItem';
import { JsonLd } from '@/components/seo/JsonLd';
import { toPublicReview, type PublicReview } from '@/lib/reviews';
import { FABRIC_LABEL, DEFAULT_COMPOSITION, SIZE_LABEL } from '@/lib/productOptions';

interface Props { params: Promise<{ slug: string }> }

async function getProduct(id: string): Promise<Product | null> {
  const snap = await adminDb.collection('products').doc(id).get();
  if (!snap.exists || !snap.data()?.active) return null;
  return serialize<Product>({ id: snap.id, ...snap.data() });
}
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

/**
 * Tudo que a página do produto lê do banco, numa entrada de cache só por
 * produto ('use cache', 5 min). generateMetadata e a página usam a mesma
 * entrada. O painel limpa na hora (revalidateTag 'products' ao salvar um
 * produto, 'avaliacoes-<id>' ao moderar uma avaliação).
 */
async function getProductPage(id: string) {
  'use cache';
  cacheLife({ stale: 60, revalidate: 300, expire: 86_400 });
  cacheTag('products', `produto-${id}`, `avaliacoes-${id}`);
  const [product, inventory] = await Promise.all([getProduct(id), getInventory(id)]);
  if (!product) return null;
  const [related, reviews, fronhaOptions] = await Promise.all([getRelated(product), getReviews(product.id), getFronhaOptions(product)]);
  const fronhaInventory = await getFronhaInventory(fronhaOptions.map(f => f.id));
  return { product, inventory, related, reviews, fronhaOptions, fronhaInventory };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = (await getProductPage(slug))?.product;
  if (!p) return { title: 'Produto não encontrado' };
  return {
    title: p.name,
    description: p.description?.slice(0, 160),
    alternates: { canonical: `/produtos/${p.id}` },
    // Foto sem width/height: ela não é 1200x630 e dimensão errada faz o
    // WhatsApp/Facebook cortar a prévia.
    ...shareMeta({
      title: p.name,
      description: p.description?.slice(0, 160),
      path: `/produtos/${p.id}`,
      images: p.images[0] ? [{ url: p.images[0], alt: p.name }] : undefined,
    }),
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const [data, s] = await Promise.all([getProductPage(slug), getStoreSettings()]);
  if (!data) notFound();
  const { product, inventory, related, reviews, fronhaOptions, fronhaInventory } = data;
  const relatedSameCategory = related.every(p => p.category === product.category);

  // Size guide data from settings
  const sizeTable = parseTable(s.sizeGuideColumns, s.sizeGuideRows);
  const packageLines = linesForProduct(packageContents(sizeTable.columns, sizeTable.rows), {
    category: product.category,
    sizes: [...new Set(product.variants.map(v => SIZE_LABEL[v.size] ?? v.size))],
  });
  const sizeGuideNote = s.sizeGuideNote || '';
  // Especificações: o tecido é sempre malha; o resto, quando cadastrado.
  const specRows: { k: string; v: string; clay?: boolean }[] = [
    { k: 'Tecido', v: FABRIC_LABEL },
    // Só título de malha (ex.: 30/1); "200" de cadastro de percal antigo não.
    ...(product.yarnCount && /^\d+\/\d+$/.test(product.yarnCount) ? [{ k: 'Título do fio', v: `Fio ${product.yarnCount}` }] : []),
    ...(product.weightGsm ? [{ k: 'Gramatura', v: `${product.weightGsm} g/m²` }] : []),
    ...(product.certifications ?? []).map(cert => ({ k: 'Certificação', v: cert, clay: true })),
  ];
  const productTrusts = [
    s.productTrust1 || 'Entrega local em Blumenau em até 1h',
    s.productTrust2 || 'Frete para todo o Brasil com rastreio',
    s.productTrust3 || 'Pagamento PIX com confirmação imediata',
  ].filter(Boolean);

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
    // URLs absolutas: imagem relativa ("/hero-mikma.jpg") não vale pro Google.
    image: product.images.map(u => new URL(u, siteUrl).href),
    sku: product.id,
    category: product.category,
    brand: { '@type': 'Brand', name: 'Mikma Lençóis' },
    material: product.composition || DEFAULT_COMPOSITION,
    offers: {
      '@type': 'Offer',
      url: productUrl,
      priceCurrency: 'BRL',
      price: (product.price / 100).toFixed(2),
      priceValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
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
          <nav aria-label="Trilha">
            <ol className="flex items-center gap-1.5 font-medium text-[11.5px] text-faint overflow-x-auto whitespace-nowrap scrollbar-none">
              <li className="shrink-0"><Link href="/" className="hover:text-clay transition-colors">Início</Link></li>
              <li aria-hidden="true" className="text-faint-l mx-1">/</li>
              <li className="shrink-0"><Link href="/produtos" className="hover:text-clay transition-colors">Produtos</Link></li>
              {product.category && (
                <>
                  <li aria-hidden="true" className="text-faint-l mx-1">/</li>
                  <li className="shrink-0">
                    <Link href={`/produtos?categoria=${encodeURIComponent(product.category)}`}
                      className="hover:text-clay transition-colors capitalize">
                      {product.category}
                    </Link>
                  </li>
                </>
              )}
              <li aria-hidden="true" className="text-faint-l mx-1">/</li>
              <li aria-current="page" className="text-mid truncate max-w-[200px]">{product.name}</li>
            </ol>
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
            <ProductGallery images={product.images} name={product.name} tag={product.tags?.[0]} productId={product.id} />
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
              {reviews.length > 0 && (() => {
                const avg = reviews.reduce((n, r) => n + r.rating, 0) / reviews.length;
                return (
                  <a href="#avaliacoes" className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-mid hover:text-ink transition-colors">
                    <span className="text-clay" aria-hidden="true">★</span>
                    <span className="font-medium text-ink tabular-nums">{avg.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                    <span className="underline underline-offset-4 decoration-mist-d">({reviews.length} {reviews.length === 1 ? 'avaliação' : 'avaliações'})</span>
                  </a>
                );
              })()}
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
            {/* Cada bloco sobe ao entrar na tela, guiado pela rolagem (CSS
                .sd-rise). Sem suporte ou com movimento reduzido, fica parado. */}
            <div className="flex flex-col gap-9 lg:pt-4">
              <div className="sd-rise">
                <span className="eyebrow mb-3 block">Sobre o produto</span>
                {product.description && (
                  <p className="text-[15px] text-ink/80 leading-relaxed max-w-[62ch] whitespace-pre-line">
                    {product.description}
                  </p>
                )}
                {packageLines.length > 0 && (
                  <a href="#medidas" className="mt-5 inline-flex items-center gap-2 py-3 -my-3 text-[11px] font-semibold text-clay hover:text-clay-d transition-colors uppercase tracking-[0.1em]">
                    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
                    Medidas e o que vem na embalagem
                  </a>
                )}
              </div>

              {/* Selos, especificações e a sanfona formam uma pilha só, com
                  uma linha entre cada bloco (sem linha dupla). */}
              <div>
              {/* Três colunas só quando a própria coluna da página tem
                  espaço (container query): no tablet ela fica estreita ao
                  lado da compra e o texto quebrava uma palavra por linha. */}
              {productTrusts.length > 0 && (
                <div className="@container">
                <ul className="grid @xl:grid-cols-3 rounded-2xl border border-mist bg-warm/30 divide-y @xl:divide-y-0 @xl:divide-x divide-mist">
                  {productTrusts.map((text, i) => (
                    <li key={i} className="sd-rise flex items-center gap-3 px-4 py-4 @xl:px-5 text-[13px] text-mid leading-snug min-w-0">
                      <span aria-hidden="true" className="w-9 h-9 rounded-full bg-clay/10 text-clay flex items-center justify-center shrink-0">
                        {i === 0 ? <TruckIcon /> : i === 1 ? <PackageIcon /> : <PixIcon />}
                      </span>
                      <span className="min-w-0 break-words">{text}</span>
                    </li>
                  ))}
                </ul>
                </div>
              )}

              {/* ── Especificações ── */}
              {/* Tecido fixo: a loja só vende malha 100% algodão. Composição e
                  "tipo" vindos de cadastros antigos (percal, cetim…) não
                  aparecem mais. */}
                <div className="pt-8 first:pt-0">
                  <span className="eyebrow mb-3 block">Especificações do tecido</span>
                  {/* Duas colunas só com mais de uma linha: com uma, ela ocupava
                      meia largura e a divisória ficava desencontrada. */}
                  <dl className={`grid gap-x-10 border-t border-mist ${specRows.length > 1 ? 'sm:grid-cols-2' : ''}`}>
                    {specRows.map((row, i) => (
                      <div key={i} className="sd-rise flex items-baseline justify-between gap-4 py-3 border-b border-mist">
                        <dt className="text-[12px] text-mid">{row.k}</dt>
                        <dd className={`text-[13px] font-semibold text-right ${row.clay ? 'text-clay' : 'text-ink'}`}>{row.v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

              {/* Mesmo conteúdo do cartão que vai dentro do pacote. */}
              {packageLines.length > 0 && (
                <div id="medidas" className="pt-8 scroll-mt-24">
                  <span className="eyebrow mb-3 block">Esta embalagem contém</span>
                  <PackageContents lines={packageLines} />
                  {(sizeGuideNote || s.whatsappUrl) && (
                    <p className="text-[11.5px] text-faint leading-relaxed mt-3">
                      {sizeGuideNote}
                      {s.whatsappUrl && (
                        <> Dúvidas sobre o tamanho?{' '}
                          <a href={s.whatsappUrl} target="_blank" rel="noopener noreferrer" className="text-clay font-medium hover:text-clay-d transition-colors">Fale conosco no WhatsApp</a>.
                        </>
                      )}
                    </p>
                  )}
                </div>
              )}
              </div>
            </div>
          </div>

        </div>
      </div>

      <ProductReviews productId={product.id} initialReviews={reviews} />

      {/* ── Produtos relacionados ── */}
      {related.length > 0 && (
        <section className="border-t border-mist section-md">
          <div className="container-shop">
            <div className="mb-10">
              <span className="eyebrow mb-3 block">Você também pode gostar</span>
              <h2 className="font-display font-normal text-ink text-3xl">{relatedSameCategory ? `Mais em ${product.category}` : 'Mais da Mikma'}</h2>
            </div>
            <ProductCarousel products={related} />
          </div>
        </section>
      )}
    </div>
  );
}

function TruckIcon() {
  return <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
}
function PackageIcon() {
  return <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
}
function PixIcon() {
  return <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 7v10M7 12h10"/></svg>;
}
