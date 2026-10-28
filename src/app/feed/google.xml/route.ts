import { connection } from 'next/server';
import { getAgentCatalog, brl, SITE_URL } from '@/lib/agentCatalog';
import { escapeXml } from '@/lib/html';

// Merchant Center aceita até 150 caracteres no título e 5000 na descrição.
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Feed de produtos do Google Merchant Center (RSS 2.0 com o namespace g:),
 * uma entrada por variação. Alimenta as listagens gratuitas do Google
 * Shopping e os assistentes do Google. Cadastro: Merchant Center >
 * Produtos > Fontes de dados > adicionar por URL.
 */
export async function GET() {
  await connection(); // na hora, não no build (o build não lê o banco)
  const products = await getAgentCatalog();
  const items = products.flatMap(p => {
    const variants = p.variants.length > 0 ? p.variants : [{ sku: p.id, size: '', color: '', inStock: false }];
    return variants.map(v => {
      const title = clip([p.name, v.size, v.color].filter(Boolean).join(' - '), 150);
      const extra = p.images.slice(1, 11).map(u => `<g:additional_image_link>${escapeXml(u)}</g:additional_image_link>`).join('');
      return `<item>
<g:id>${escapeXml(v.sku)}</g:id>
<g:item_group_id>${escapeXml(p.id)}</g:item_group_id>
<g:title>${escapeXml(title)}</g:title>
<g:description>${escapeXml(clip(p.description || p.name, 5000))}</g:description>
<g:link>${escapeXml(p.url)}</g:link>
${p.images[0] ? `<g:image_link>${escapeXml(p.images[0])}</g:image_link>` : ''}${extra}
<g:availability>${v.inStock ? 'in_stock' : 'out_of_stock'}</g:availability>
<g:price>${brl(p.priceCents)} BRL</g:price>
<g:condition>new</g:condition>
<g:brand>Mikma Lençóis</g:brand>
<g:identifier_exists>no</g:identifier_exists>
<g:google_product_category>Home &amp; Garden &gt; Linens &amp; Bedding &gt; Bedding</g:google_product_category>
<g:product_type>${escapeXml(p.category)}</g:product_type>
<g:material>${escapeXml(p.composition)}</g:material>
${v.size ? `<g:size>${escapeXml(v.size)}</g:size>` : ''}${v.color ? `<g:color>${escapeXml(v.color)}</g:color>` : ''}
</item>`;
    });
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>Mikma Lençóis</title>
<link>${SITE_URL}</link>
<description>Lençóis, fronhas e jogos de cama de malha 100% algodão</description>
${items.join('\n')}
</channel>
</rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=600' } });
}
