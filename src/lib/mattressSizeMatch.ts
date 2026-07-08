// Guia de tamanhos — 100% determinístico, sem chamada a nenhuma API paga.
// Medidas padrão de colchão no Brasil (largura × comprimento, em cm).
// Fonte: padrão de mercado (varia ±2-3cm entre fabricantes, por isso o
// algoritmo usa "vizinho mais próximo" em vez de exigir bater exato).
export const MATTRESS_SIZES = {
  solteiro: { width: 88,  length: 188, label: 'Solteiro' },
  casal:    { width: 138, length: 188, label: 'Casal' },
  queen:    { width: 158, length: 198, label: 'Queen' },
  king:     { width: 193, length: 203, label: 'King' },
} as const;

export type MattressSizeKey = keyof typeof MATTRESS_SIZES;

export type MatchConfidence = 'exata' | 'proxima' | 'incerta';

export interface SizeMatchResult {
  size: MattressSizeKey;
  confidence: MatchConfidence;
  /** Diferença (largura+comprimento) em cm até o tamanho padrão escolhido. */
  distanceCm: number;
  /** Segundo colocado, só preenchido quando a decisão foi apertada (ambíguo). */
  runnerUp?: MattressSizeKey;
  heightWarning?: string;
}

/**
 * Encontra o tamanho de cama padrão mais próximo das medidas informadas.
 * Distância = |Δlargura| + |Δcomprimento| (Manhattan) — simples, previsível,
 * e fácil de explicar pro cliente ("ficou a 4cm do Casal").
 */
export function matchMattressSize(widthCm: number, lengthCm: number, heightCm?: number): SizeMatchResult {
  const distances = (Object.keys(MATTRESS_SIZES) as MattressSizeKey[]).map(key => {
    const std = MATTRESS_SIZES[key];
    const d = Math.abs(std.width - widthCm) + Math.abs(std.length - lengthCm);
    return { key, d };
  }).sort((a, b) => a.d - b.d);

  const [best, second] = distances;

  let confidence: MatchConfidence;
  if (best.d <= 6) confidence = 'exata';
  else if (best.d <= 18) confidence = 'proxima';
  else confidence = 'incerta';

  // Ambíguo: segundo colocado quase tão perto quanto o primeiro.
  const isAmbiguous = second.d - best.d <= 8 && confidence !== 'exata';

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
 * "não encontrado".
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
