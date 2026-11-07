/**
 * Título e descrição dos produtos no feed do Google. O nome do cadastro é
 * curto ("Jogo Queen 3 Peças") e a descrição costuma vir vazia: o Google
 * acha o produto pelas palavras que a pessoa digita ("jogo de cama queen
 * malha 100% algodão rosa"), então o título leva tipo, tamanho, tecido,
 * composição e cor, sem repetir o que o nome já diz.
 */

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const has = (text: string, part: string) => norm(text).includes(norm(part));

export interface FeedTitleInput {
  name: string;
  category: string;
  size?: string;
  color?: string;
  material?: string;
  composition?: string;
}

export function feedTitle({ name, category, size, color, material, composition }: FeedTitleInput): string {
  let title = name.trim();
  // "Jogo Queen 3 Peças" vira "Jogo de Cama Queen 3 Peças".
  if (norm(category) === 'jogos de cama' && /^jogo\b/i.test(title) && !has(title, 'de cama')) {
    title = title.replace(/^jogo\b/i, 'Jogo de Cama');
  }
  const extras = [
    size && !/^unico$/.test(norm(size)) ? size : '',
    material ?? '',
    composition ?? '',
    color ?? '',
  ];
  // Palavra a palavra: "Malha 100% algodão" num título que já diz "Malha"
  // acrescenta só "100% algodão".
  for (const part of extras) {
    const words = part.split(/\s+/).filter(Boolean);
    const missing = words.filter(w => !norm(title).split(/\s+/).includes(norm(w)));
    if (missing.length) title += ` ${missing.join(' ')}`;
  }
  return title.replace(/\s+/g, ' ').trim().slice(0, 150);
}

export interface FeedDescriptionInput {
  title: string;
  description?: string;
  composition?: string;
  yarnCount?: string;
  /** "01 Lençol com elástico (158 x 198 x 30 cm) / 02 fronhas (50 x 70 cm)" */
  contents?: string;
}

export function feedDescription({ title, description, composition, yarnCount, contents }: FeedDescriptionInput): string {
  const own = (description ?? '').trim();
  const fabric = [composition, yarnCount ? `fio ${yarnCount}` : ''].filter(Boolean).join(', ');
  const parts = [
    own || `${title}.`,
    fabric && !has(own, composition ?? '') ? `Malha ${fabric}, macia e resistente.` : '',
    contents ? `No pacote: ${contents}.` : '',
    'Direto da fábrica em Blumenau (SC), com entrega para todo o Brasil.',
  ];
  return parts.filter(Boolean).join(' ').slice(0, 5000);
}
