// Paleta de cores em português, curada para produtos têxteis (lençóis, fronhas,
// edredons). Resolução 100% local, sem chamadas de rede, sem dependência de
// tradução automática instável. ~80 cores cobrem o universo real de tons
// vendidos numa loja de cama, muito mais úteis que as ~30 mil entradas
// genéricas do color-name-list (a maioria delas nomes de tinta industrial
// sem nenhum sentido pra esse catálogo).

export interface NamedColor {
  name: string;
  hex: string;
}

export const TEXTILE_COLORS: NamedColor[] = [
  // Neutros, o grosso do catálogo de cama
  { name: 'Branco',          hex: '#FFFFFF' },
  { name: 'Branco Gelo',     hex: '#F8F8F6' },
  { name: 'Off-White',       hex: '#F2EDE4' },
  { name: 'Marfim',          hex: '#FFFFF0' },
  { name: 'Creme',           hex: '#F5EBDD' },
  { name: 'Bege',            hex: '#E8DCC8' },
  { name: 'Bege Escuro',     hex: '#C9B79C' },
  { name: 'Areia',           hex: '#E0D2B5' },
  { name: 'Cinza Claro',     hex: '#D6D6D6' },
  { name: 'Cinza',           hex: '#9E9E9E' },
  { name: 'Cinza Chumbo',    hex: '#5C5C5C' },
  { name: 'Grafite',         hex: '#3A3A3A' },
  { name: 'Preto',           hex: '#1A1A1A' },

  // Marrons / terrosos
  { name: 'Caramelo',        hex: '#C68642' },
  { name: 'Terracota',       hex: '#C4714A' },
  { name: 'Marrom',          hex: '#6B4423' },
  { name: 'Marrom Café',     hex: '#4B3621' },
  { name: 'Tabaco',          hex: '#8B6F47' },
  { name: 'Camel',           hex: '#C19A6B' },
  { name: 'Chocolate',       hex: '#3D2817' },

  // Azuis
  { name: 'Azul Claro',      hex: '#A8C8E0' },
  { name: 'Azul Serenity',   hex: '#9BB8D3' },
  { name: 'Azul',            hex: '#3B6FA0' },
  { name: 'Azul Royal',      hex: '#1E4D8C' },
  { name: 'Azul Marinho',    hex: '#1B2A4A' },
  { name: 'Azul Petróleo',   hex: '#1F4E4E' },
  { name: 'Turquesa',        hex: '#2DA8A0' },
  { name: 'Azul Bebê',       hex: '#C3E0F0' },

  // Verdes
  { name: 'Verde Claro',     hex: '#B7D9B1' },
  { name: 'Verde Sálvia',    hex: '#9CAF88' },
  { name: 'Verde',           hex: '#4C7A4C' },
  { name: 'Verde Oliva',     hex: '#6B7A3A' },
  { name: 'Verde Musgo',     hex: '#4A5D3A' },
  { name: 'Verde Escuro',    hex: '#264D26' },
  { name: 'Menta',           hex: '#A8DDC8' },

  // Rosas / vermelhos
  { name: 'Rosa Claro',      hex: '#F4C9D6' },
  { name: 'Rosa Bebê',       hex: '#F7D7E0' },
  { name: 'Rosa',            hex: '#E8A0B8' },
  { name: 'Rosa Antigo',     hex: '#C48A95' },
  { name: 'Pink',            hex: '#E0457A' },
  { name: 'Vermelho',        hex: '#B22222' },
  { name: 'Vermelho Vinho',  hex: '#5E1C2E' },
  { name: 'Bordô',           hex: '#6E1F2D' },
  { name: 'Coral',           hex: '#E8714A' },
  { name: 'Salmão',          hex: '#F0967A' },

  // Amarelos / laranjas
  { name: 'Amarelo Claro',   hex: '#F5E6A8' },
  { name: 'Amarelo',         hex: '#E8C547' },
  { name: 'Mostarda',        hex: '#C9A227' },
  { name: 'Dourado',         hex: '#C9A554' },
  { name: 'Laranja',         hex: '#D9722A' },
  { name: 'Ferrugem',        hex: '#9E4B26' },

  // Roxos / lilases
  { name: 'Lilás',           hex: '#C8B4D9' },
  { name: 'Lavanda',         hex: '#D4C5E8' },
  { name: 'Roxo',            hex: '#6B4480' },
  { name: 'Roxo Escuro',     hex: '#3D2347' },
  { name: 'Malva',           hex: '#9B7F9E' },

  // Estampados / mistos (cobre quando não é uma cor sólida)
  { name: 'Listrado',        hex: '#B0AFA8' },
  { name: 'Floral',          hex: '#D9A3AE' },
  { name: 'Xadrez',          hex: '#7A6F63' },
  { name: 'Estampado',       hex: '#A89B8C' },
];

/** Distância euclidiana entre duas cores RGB, quanto menor, mais parecidas */
function colorDistance(hex1: string, hex2: string): number {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  if (!c1 || !c2) return Infinity;
  return Math.sqrt((c1.r - c2.r) ** 2 + (c1.g - c2.g) ** 2 + (c1.b - c2.b) ** 2);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

/**
 * Hex → nome em português, 100% local e instantâneo (sem rede).
 * Encontra a cor mais próxima na paleta curada.
 */
export function hexToColorName(hex: string): string {
  let best = TEXTILE_COLORS[0];
  let bestDist = Infinity;
  for (const c of TEXTILE_COLORS) {
    const d = colorDistance(hex, c.hex);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best.name;
}

/**
 * Busca cores pelo nome digitado (busca por substring, acento-insensível).
 * Local e instantâneo.
 */
export function searchColorsByName(query: string, limit = 6): NamedColor[] {
  const q = normalize(query.trim());
  if (!q) return [];
  const starts = TEXTILE_COLORS.filter(c => normalize(c.name).startsWith(q));
  const contains = TEXTILE_COLORS.filter(c => !normalize(c.name).startsWith(q) && normalize(c.name).includes(q));
  return [...starts, ...contains].slice(0, limit);
}

/** Resolve um nome digitado pra cor mais próxima no banco, ou null se não achar nada parecido */
export function resolveColorName(name: string): NamedColor | null {
  const results = searchColorsByName(name, 1);
  return results[0] ?? null;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Amostra a cor dominante de uma foto — usado pra sugerir a cor do
 * tecido sozinho assim que a pessoa marca um tecido, sem precisar
 * descobrir/clicar em "pegar da foto" manualmente. Pra quem não é técnico,
 * um passo a menos importa bastante.
 *
 * Amostra uma grade de pontos numa janela central (evita fundo/bordas,
 * que costumam ser mais claros que o produto em fotos de still simples) e
 * tira a média — mais estável que um único pixel, que pode cair bem numa
 * dobra de tecido, sombra ou reflexo.
 */
export function sampleDominantColor(imageDataUrl: string): Promise<string | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const size = 64; // pequeno o bastante pra ser instantâneo
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);

        let r = 0, g = 0, b = 0, n = 0;
        // Janela central 50%–50% (de 25% a 75% da largura/altura)
        const from = Math.round(size * 0.25);
        const to = Math.round(size * 0.75);
        const data = ctx.getImageData(from, from, to - from, to - from).data;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i]; g += data[i + 1]; b += data[i + 2];
          n++;
        }
        if (n === 0) return resolve(null);
        const hex = '#' + [r, g, b].map(v => Math.round(v / n).toString(16).padStart(2, '0')).join('');
        resolve(hex);
      } catch {
        resolve(null); // canvas "tainted" por CORS, foto ainda não carregou etc — sem problema, cai no cinza padrão
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageDataUrl;
  });
}
