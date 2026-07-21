// Guia de tamanhos — 100% determinístico, sem chamada a nenhuma API paga.
// As medidas de cada tamanho (largura × comprimento, em cm) vêm de
// settings.mattressSizeSpecs (Firestore, editável em
// Configurações > Produto), NÃO são fixas no código — se o admin mudar o
// padrão de um fornecedor, o /guia-de-tamanhos reflete na hora.

export type MattressSizeKey = 'solteiro' | 'casal' | 'queen' | 'king';

export interface MattressSizeSpec {
  key: MattressSizeKey;
  label: string;
  widthCm: number;
  lengthCm: number;
}

export type MattressSizeMap = Record<MattressSizeKey, { width: number; length: number; label: string }>;

// Fallback só pra quando o Firestore está inacessível ou o campo ainda não
// foi salvo (primeira execução) — mesmos valores que já vinham como default
// em store-settings.ts, não duplica uma segunda "fonte da verdade" real.
const FALLBACK_SPECS: MattressSizeSpec[] = [
  { key: 'solteiro', label: 'Solteiro', widthCm: 88,  lengthCm: 188 },
  { key: 'casal',    label: 'Casal',    widthCm: 138, lengthCm: 188 },
  { key: 'queen',    label: 'Queen',    widthCm: 158, lengthCm: 198 },
  { key: 'king',     label: 'King',     widthCm: 193, lengthCm: 203 },
];

/** Faz o parse de settings.mattressSizeSpecs (JSON) num MattressSizeMap pronto pro matcher. */
export function parseMattressSizeSpecs(json: string | undefined | null): MattressSizeMap {
  let specs: MattressSizeSpec[];
  try {
    const parsed = JSON.parse(json || '[]');
    specs = Array.isArray(parsed) && parsed.length > 0 ? parsed : FALLBACK_SPECS;
  } catch {
    specs = FALLBACK_SPECS;
  }

  const map = {} as MattressSizeMap;
  for (const s of FALLBACK_SPECS) {
    const found = specs.find(x => x.key === s.key);
    const src = found ?? s;
    map[s.key] = { width: Number(src.widthCm) || s.widthCm, length: Number(src.lengthCm) || s.lengthCm, label: src.label || s.label };
  }
  return map;
}

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
 *
 * `sizes` vem sempre das configurações da loja (via parseMattressSizeSpecs),
 * nunca de uma constante fixa no componente.
 */
export function matchMattressSize(sizes: MattressSizeMap, widthCm: number, lengthCm: number, heightCm?: number): SizeMatchResult {
  const distances = (Object.keys(sizes) as MattressSizeKey[]).map(key => {
    const std = sizes[key];
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
