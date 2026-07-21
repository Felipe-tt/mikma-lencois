// Guia de tamanhos — 100% determinístico, sem chamada a nenhuma API paga.
//
// A largura de cada tamanho de colchão vem da MESMA tabela que já existe em
// Configurações > Produto > "Guia de tamanhos de cama" (settings.bedSizeRows),
// lendo a coluna "Cama" (ex: Solteiro → 0,88m). Não existe um campo
// duplicado só pra isso — o admin edita em UM lugar só, e tanto a tabela
// visível na página do produto quanto esta calculadora usam o mesmo dado.
//
// Por que só largura (não largura+comprimento)? A tabela "Guia de tamanhos
// de cama" guarda o comprimento do LENÇOL, não do colchão (o lençol é
// maior de propósito, pra sobrar pano e prender o elástico — ex: colchão
// Solteiro tem 188cm de comprimento, mas o lençol Solteiro sai com 220cm).
// Comparar a medida real do colchão do cliente com o comprimento do lençol
// nunca bateria certo. A largura, por outro lado, é a mesma para colchão e
// pra "tamanho de cama" (0,88m é 0,88m nos dois), e sozinha já separa bem
// os 4 tamanhos padrão (88 / 138 / 158 / 193cm — nunca ficam a menos de
// 20cm um do outro), então é a métrica confiável disponível hoje.

export type MattressSizeKey = 'solteiro' | 'casal' | 'queen' | 'king';

export type MattressWidthMap = Record<MattressSizeKey, { widthCm: number; label: string }>;

// Fallback só pra quando a tabela de configurações está vazia/ilegível —
// mesmos valores que já vêm como default de bedSizeRows em store-settings.ts.
const FALLBACK_WIDTHS: MattressWidthMap = {
  solteiro: { widthCm: 88,  label: 'Solteiro' },
  casal:    { widthCm: 138, label: 'Casal' },
  queen:    { widthCm: 158, label: 'Queen' },
  king:     { widthCm: 193, label: 'King' },
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

/** "0,88m" | "0.88m" | "88" | "88cm" → 88 (cm). Retorna null se não conseguir ler. */
function parseMetersOrCm(raw: string): number | null {
  const cleaned = raw.trim().toLowerCase().replace(',', '.');
  const num = parseFloat(cleaned);
  if (!Number.isFinite(num) || num <= 0) return null;
  // Valores digitados como "0,88" ou "0.88m" são metros; "88" ou "88cm" já é cm.
  return /m(?!m)/.test(cleaned) || num < 10 ? num * 100 : num;
}

/**
 * Lê settings.bedSizeRows (a MESMA tabela mostrada na página do produto) e
 * extrai a largura (coluna "Cama") de cada um dos 4 tamanhos que vendemos.
 * Linhas com nome desconhecido (ex: "Solteiro Plus") são ignoradas — só
 * entram solteiro/casal/queen/king, que são os únicos valores válidos de
 * `size` nas variações de produto (ver src/lib/productOptions.ts SIZES).
 */
export function parseMattressWidthsFromBedSizeTable(bedSizeRowsJson: string | undefined | null): MattressWidthMap {
  const map: MattressWidthMap = { ...FALLBACK_WIDTHS };
  try {
    const rows: Record<string, string>[] = JSON.parse(bedSizeRowsJson || '[]');
    for (const row of rows) {
      const nameField = row['Tamanho'] ?? Object.values(row)[0];
      if (!nameField) continue;
      const key = KEY_BY_NAME[normalize(nameField)];
      if (!key) continue; // ex: "Solteiro Plus" não é um dos 4 tamanhos vendidos

      // Aceita a coluna se chamar "Cama" (nome padrão) OU qualquer variação
      // de maiúscula/acento — colunas são editáveis pelo admin.
      const widthField = Object.entries(row).find(([col]) => normalize(col) === 'cama')?.[1];
      const widthCm = widthField ? parseMetersOrCm(widthField) : null;
      if (widthCm) map[key] = { widthCm, label: nameField };
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
 * `widths` vem sempre de parseMattressWidthsFromBedSizeTable (ou seja, das
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
    if (heightCm > 35) {
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
 * "não encontrado". Isso é nomenclatura de mercado, não medida — fica fixo
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
