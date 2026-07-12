export const dynamic = 'force-dynamic';
export const maxDuration = 90; // vários prints + IA de visão pode demorar

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth, safeJson, tooManyRequests } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';

const MAX_IMAGES = 15;
// Cada imagem já vem comprimida pelo navegador antes de chegar aqui (ver
// compressImage no front) — isso é só uma trava de segurança de verdade.
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const RequestSchema = z.object({
  images: z
    .array(
      z.object({
        // "data:image/jpeg;base64,...."
        dataUrl: z.string().refine(
          (s) => /^data:image\/(jpeg|png|webp);base64,/.test(s) && s.length < MAX_IMAGE_BYTES * 1.4,
          'Imagem inválida ou grande demais'
        ),
      })
    )
    .min(1)
    .max(MAX_IMAGES),
});

const ExtractedProductSchema = z.object({
  name: z.string(),
  description: z.string().optional().default(''),
  priceBRL: z.number().nullable().optional().default(null),
  // Em qual print (1-based, mesma ordem que foi enviado) esse produto
  // aparece com mais destaque — usamos pra já sugerir a foto do produto.
  imageIndex: z.number().int().positive().nullable().optional().default(null),
});

const ExtractedResponseSchema = z.object({
  products: z.array(ExtractedProductSchema).max(200),
});

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { roles: ['seller', 'admin'] });
  if (!auth.ok) return auth.response;

  const key = `whatsapp-catalog:extract:${auth.decoded.uid}`;
  // IA de visão custa dinheiro de verdade — limite generoso pro uso normal
  // (importar o catálogo todo pode levar 2-3 lotes) mas real.
  if (!rateLimit(key, 15, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(key));
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[extract-screenshots] ANTHROPIC_API_KEY não configurada');
    return NextResponse.json(
      { error: 'Leitura automática de prints não está configurada no servidor ainda.' },
      { status: 501 }
    );
  }

  const body = await safeJson(req, MAX_IMAGES * MAX_IMAGE_BYTES * 1.4 + 8192);
  if (!body.ok) return body.response;

  const parsed = RequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const imageBlocks = parsed.data.images.flatMap(({ dataUrl }, i) => {
    const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!match) return [];
    const [, mediaType, base64] = match;
    return [
      { type: 'text' as const, text: `Print ${i + 1}:` },
      {
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp', data: base64 },
      },
    ];
  });

  if (imageBlocks.length === 0) {
    return NextResponse.json({ error: 'Nenhuma imagem válida enviada' }, { status: 400 });
  }

  const prompt = `Estes são prints de tela do catálogo de produtos de uma loja no WhatsApp Business (jogos de cama/lençóis). Cada print pode mostrar um produto só (tela de detalhe) ou vários produtos numa grade/lista.

Identifique TODOS os produtos visíveis, mesmo repetidos entre prints diferentes (nesse caso, liste uma vez só, usando o print onde a foto aparece maior/mais nítida). Para cada produto, extraia:
- name: nome do produto exatamente como escrito
- description: descrição/texto do produto, se tiver visível (senão, string vazia)
- priceBRL: preço em reais como número (ex: 129.90), sem "R$". Se não conseguir ler o preço com certeza, use null — não invente.
- imageIndex: o número do print (1, 2, 3...) onde a foto desse produto aparece maior/melhor. Se o produto não tiver foto visível em nenhum print, use null.

Responda APENAS com um JSON válido neste formato exato, sem nenhum texto antes ou depois, sem markdown:
{"products": [{"name": "...", "description": "...", "priceBRL": 129.9, "imageIndex": 1}]}`;

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: prompt }, ...imageBlocks],
          },
        ],
      }),
      signal: AbortSignal.timeout(80_000),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => '');
      console.error('[extract-screenshots] erro da API da IA', aiRes.status, errText.slice(0, 500));
      return NextResponse.json({ error: 'A leitura automática falhou. Tenta de novo em alguns segundos.' }, { status: 502 });
    }

    const aiData = await aiRes.json();
    const rawText: string = (aiData?.content ?? [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('');

    // Às vezes o modelo embrulha em ```json apesar de instruído a não fazer —
    // tira as cercas se vierem, sem confiar que o texto puro já é JSON válido.
    const cleaned = rawText.replace(/^```json\s*|^```\s*|```\s*$/gm, '').trim();

    let json: unknown;
    try {
      json = JSON.parse(cleaned);
    } catch {
      console.error('[extract-screenshots] resposta não era JSON', rawText.slice(0, 500));
      return NextResponse.json({ error: 'Não consegui entender os prints dessa vez. Tenta prints mais nítidos, um de cada vez se possível.' }, { status: 502 });
    }

    const result = ExtractedResponseSchema.safeParse(json);
    if (!result.success) {
      console.error('[extract-screenshots] JSON fora do formato esperado', result.error.flatten());
      return NextResponse.json({ error: 'A IA retornou um formato inesperado. Tenta de novo.' }, { status: 502 });
    }

    return NextResponse.json({ products: result.data.products });
  } catch (err) {
    console.error('[extract-screenshots] falha inesperada', err);
    return NextResponse.json({ error: 'Não deu pra processar os prints agora. Tenta de novo.' }, { status: 500 });
  }
}
