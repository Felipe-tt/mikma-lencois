/**
 * Nomes de cores via:
 * 1. color-name-list (31k cores) + nearest-color para hex→nome inglês
 * 2. translate.googleapis.com (sem API key) para inglês→português
 * 3. Busca por nome (português→inglês→database)
 *
 * Zero hardcode. Zero mock.
 */

type ColorEntry = { name: string; hex: string };

let _find: ((hex: string) => { name: string; distance: number }) | null = null;
let _list: ColorEntry[] | null = null;

function getDatabase(): { find: typeof _find; list: ColorEntry[] } {
  if (!_find || !_list) {
    const list = require('color-name-list') as ColorEntry[];
    const nc = require('nearest-color') as {
      from: (m: Record<string, string>) => (h: string) => { name: string; distance: number };
    };
    const map = list.reduce<Record<string, string>>((a, c) => { a[c.name] = c.hex; return a; }, {});
    _list = list;
    _find = nc.from(map);
  }
  return { find: _find!, list: _list! };
}

/** Traduz texto EN→PT-BR via Google Translate (sem API key) */
async function translateToPt(text: string): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt-BR&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error('translate failed');
  const data = await res.json();
  // Resposta: [[["tradução","original",...], ...], ...]
  return (data?.[0] as Array<[string]>)
    ?.map(part => part[0])
    .join('')
    .trim() ?? text;
}

const hexCache = new Map<string, string>();
const nameCache = new Map<string, string>();

/** Hex → nome em português */
export async function hexToColorName(hex: string): Promise<string> {
  const key = hex.toLowerCase();
  if (hexCache.has(key)) return hexCache.get(key)!;
  try {
    const { find } = getDatabase();
    const nearest = find!(hex);
    const ptName = await translateToPt(nearest.name);
    // Capitaliza primeira letra de cada palavra
    const formatted = ptName.replace(/\b\w/g, l => l.toUpperCase());
    hexCache.set(key, formatted);
    return formatted;
  } catch {
    hexCache.set(key, hex);
    return hex;
  }
}

/**
 * Busca cores pelo nome digitado pelo usuário (português ou inglês).
 * Retorna até `limit` resultados com hex e nome em PT.
 */
export async function searchColorsByName(
  query: string,
  limit = 6
): Promise<Array<{ name: string; hex: string }>> {
  if (!query.trim()) return [];
  const { list } = getDatabase();

  // 1. Tenta buscar em inglês direto (cobre nomes próprios como "Tiffany")
  const qLower = query.toLowerCase().trim();

  // 2. Traduz a query PT→EN para busca no banco inglês
  let enQuery = qLower;
  try {
    const translated = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=pt&tl=en&dt=t&q=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (translated.ok) {
      const d = await translated.json();
      enQuery = (d?.[0] as Array<[string]>)?.map(p => p[0]).join('').toLowerCase().trim() ?? qLower;
    }
  } catch { /* usa query original */ }

  // 3. Busca no database por substring (inglês e original)
  const matches = list.filter(c => {
    const n = c.name.toLowerCase();
    return n.includes(enQuery) || n.includes(qLower);
  }).slice(0, limit * 3); // pega mais para traduzir

  if (matches.length === 0) return [];

  // 4. Traduz resultados para PT
  const results = await Promise.all(
    matches.slice(0, limit).map(async c => {
      if (hexCache.has(c.hex)) return { name: hexCache.get(c.hex)!, hex: c.hex };
      try {
        const pt = await translateToPt(c.name);
        const formatted = pt.replace(/\b\w/g, l => l.toUpperCase());
        hexCache.set(c.hex, formatted);
        return { name: formatted, hex: c.hex };
      } catch {
        return { name: c.name, hex: c.hex };
      }
    })
  );

  return results;
}

/**
 * Valida se um nome digitado corresponde a uma cor real no banco.
 * Retorna o hex da cor mais próxima ou null se não encontrar.
 */
export async function resolveColorName(name: string): Promise<{ hex: string; name: string } | null> {
  const results = await searchColorsByName(name, 1);
  return results[0] ?? null;
}
