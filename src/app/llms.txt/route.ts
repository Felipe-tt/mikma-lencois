import { connection } from 'next/server';
import { getAgentCatalog, brl, SITE_URL } from '@/lib/agentCatalog';

const money = (cents: number) => `R$ ${brl(cents).replace('.', ',')}`;

/**
 * /llms.txt (https://llmstxt.org): resumo da loja em Markdown para
 * assistentes de IA, com o catálogo atual e onde estão as regras.
 */
export async function GET() {
  await connection(); // na hora, não no build (o build não lê o banco)
  const products = await getAgentCatalog();
  const byCategory = new Map<string, typeof products>();
  for (const p of products) byCategory.set(p.category, [...(byCategory.get(p.category) ?? []), p]);

  const sections = [...byCategory].map(([category, list]) => [
    `## ${category}`,
    '',
    ...list.map(p => {
      const sizes = [...new Set(p.variants.filter(v => v.inStock).map(v => v.size))];
      const stock = sizes.length > 0 ? `tamanhos disponíveis: ${sizes.join(', ')}` : 'esgotado no momento';
      return `- [${p.name}](${p.url}): ${money(p.priceCents)}, ${stock}`;
    }),
  ].join('\n'));

  const body = `# Mikma Lençóis

> Loja de Blumenau (SC) de lençóis, fronhas e jogos de cama, todos de malha 100% algodão. Vende pelo site para todo o Brasil, com entrega local rápida em Blumenau.

- Pagamento: PIX (com desconto a partir de um valor mínimo) ou cartão de crédito parcelado, direto no site.
- Entrega: motoboy em Blumenau e frete com rastreio para todo o Brasil; o valor aparece no carrinho pelo CEP.
- Trocas: 7 dias para arrependimento; detalhes em [Trocas e devoluções](${SITE_URL}/trocas-e-devolucoes).
- Medidas: confira a altura do colchão no [Guia de tamanhos](${SITE_URL}/guia-de-tamanhos) antes de escolher.
- Catálogo completo em JSON: [catalogo.json](${SITE_URL}/catalogo.json)

${sections.join('\n\n')}

## Opcional

- [Sobre a Mikma](${SITE_URL}/sobre)
- [Política de privacidade](${SITE_URL}/privacidade)
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=600' } });
}
