import { parseMeasure } from '@/lib/measures';

// Guia de tamanhos, 100% determinístico, sem chamada a nenhuma API paga.
//
// A largura de cada tamanho vem da MESMA tabela que a página do produto
// mostra ("Esta embalagem contém", Configurações > Produto > "Guia de
// medidas", settings.sizeGuideRows): a largura do LENÇOL. O lençol é box,
// então ele tem a medida do colchão (Solteiro 88 × 188 × 40 cm serve em
// colchão de 88 × 188). Um lugar só para editar.
//
// Só a largura entra na conta: ela sozinha já separa bem os 4 tamanhos
// (88 / 138 / 158 / 193 cm, sempre a mais de 20 cm um do outro).

export type MattressSizeKey = 'solteiro' | 'casal' | 'queen' | 'king';

export type MattressWidthMap = Record<MattressSizeKey, { widthCm: number; label: string; /** Altura máxima do colchão que o elástico do lençol cobre. */ heightCm?: number }>;

// Fallback só pra quando a tabela está vazia ou ilegível: as medidas do
// cartão que vai na embalagem.
const FALLBACK_WIDTHS: MattressWidthMap = {
  solteiro: { widthCm: 88,  label: 'Solteiro', heightCm: 40 },
  casal:    { widthCm: 138, label: 'Casal',    heightCm: 40 },
  queen:    { widthCm: 158, label: 'Queen',    heightCm: 40 },
  king:     { widthCm: 193, label: 'King',     heightCm: 40 },
};

const KEY_BY_NAME: Record<string, MattressSizeKey> = {
  solteiro: 'solteiro',
  casal: 'casal',
  queen: 'queen',
  king: 'king',
};

function normalize(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Lê settings.sizeGuideRows (a mesma tabela da página do produto) e pega a
 * largura do lençol de cada um dos 4 tamanhos vendidos. Linhas com outro
 * nome (ex: "Solteiro Plus") são ignoradas: só entram solteiro/casal/
 * queen/king, os valores válidos de `size` nas variações (productOptions).
 */
export function parseMattressWidthsFromSizeGuide(sizeGuideRowsJson: string | undefined | null): MattressWidthMap {
  const map: MattressWidthMap = { ...FALLBACK_WIDTHS };
  try {
    const rows: Record<string, string>[] = JSON.parse(sizeGuideRowsJson || '[]');
    for (const row of rows) {
      const nameField = row['Tamanho'] ?? Object.values(row)[0];
      if (!nameField) continue;
      const key = KEY_BY_NAME[normalize(nameField)];
      if (!key) continue;
      // Coluna "Lençol" (ou variação de maiúscula/acento: colunas são editáveis).
      const sheet = Object.entries(row).find(([col]) => normalize(col).startsWith('lencol'))?.[1];
      const { l: widthCm, a: heightCm } = parseMeasure(sheet);
      if (widthCm && widthCm > 0) map[key] = { widthCm, label: nameField, heightCm };
    }
  } catch {
    // mantém FALLBACK_WIDTHS
  }
  return map;
}

export type MatchConfidence = 'exata' | 'proxima' | 'incerta';

export interface SizeMatchResult {
  size: MattressSizeKey;
  confidence: MatchConfidence;
  /** Diferença de largura, em cm, até o tamanho escolhido. */
  distanceCm: number;
  /** Segundo colocado, só preenchido quando a decisão foi apertada (ambíguo). */
  runnerUp?: MattressSizeKey;
  heightWarning?: string;
}

/**
 * Encontra o tamanho de cama padrão mais próximo da LARGURA informada.
 * `widths` vem sempre de parseMattressWidthsFromSizeGuide (ou seja, das
 * configurações da loja), nunca de uma constante fixa no componente.
 */
export function matchMattressSize(widths: MattressWidthMap, widthCm: number, _lengthCm?: number, heightCm?: number): SizeMatchResult {
  const distances = (Object.keys(widths) as MattressSizeKey[]).map(key => ({
    key,
    d: Math.abs(widths[key].widthCm - widthCm),
  })).sort((a, b) => a.d - b.d);

  const [best, second] = distances;

  let confidence: MatchConfidence;
  if (best.d <= 4) confidence = 'exata';
  else if (best.d <= 12) confidence = 'proxima';
  else confidence = 'incerta';

  // Ambíguo: segundo colocado quase tão perto quanto o primeiro.
  const isAmbiguous = second.d - best.d <= 6 && confidence !== 'exata';

  let heightWarning: string | undefined;
  if (heightCm !== undefined) {
    const limit = widths[best.key].heightCm;
    if (limit && heightCm > limit) {
      heightWarning = `Seu colchão tem ${heightCm} cm de altura e nosso lençol ${widths[best.key].label} vai até ${limit} cm. Pode ficar justo: se tiver dúvida, manda uma mensagem antes de comprar.`;
    } else if (!limit && heightCm > 35) {
      heightWarning = 'Seu colchão é bem alto (mais de 35cm). Nossos lençóis têm elástico padrão de mercado, pode ficar justo. Se tiver dúvida, manda uma mensagem antes de comprar.';
    } else if (heightCm < 12) {
      heightWarning = 'Colchão fino (menos de 12cm). O elástico pode ficar folgado, mas geralmente segura bem.';
    }
  }

  return {
    size: best.key,
    confidence,
    distanceCm: best.d,
    runnerUp: isAmbiguous ? second.key : undefined,
    heightWarning,
  };
}

/**
 * Tenta reconhecer nomes populares (ex: "viúva", "solteirão") que não são
 * um dos 4 tamanhos vendidos, pra dar uma explicação melhor em vez de só
 * "não encontrado". Isso é nomenclatura de mercado, não medida, fica fixo
 * mesmo (não faz sentido virar configuração editável).
 */
const KNOWN_ALIASES: Record<string, { closest: MattressSizeKey; note: string }> = {
  viuva:      { closest: 'solteiro', note: 'Colchão de viúva (128×188 ou 120×200) fica entre Solteiro e Casal. Nosso Solteiro (88×188) vai ficar largo demais. Meça a largura exata do seu colchão pra eu confirmar.' },
  'meio casal': { closest: 'solteiro', note: 'Meio casal costuma ser 120×188 ou 128×188, mais largo que nosso Solteiro. Confirme a largura exata do colchão antes de comprar.' },
  solteirao:  { closest: 'casal', note: 'Solteirão (96×203) é mais estreito que o Casal e mais comprido que o Solteiro. Vale medir certinho, pode não ter um encaixe perfeito no nosso catálogo.' },
  'super king': { closest: 'king', note: 'Super King (193×203 ou maior). Nosso King deve servir, mas confirme a largura.' },
};

export function lookupAlias(name: string): { closest: MattressSizeKey; note: string } | null {
  const key = name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return KNOWN_ALIASES[key] ?? null;
}
