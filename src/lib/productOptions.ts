// Opções fixas de produto, compartilhadas entre o formulário do painel
// (ProductForm) e a importação de catálogo do WhatsApp, mantém as duas
// telas sempre sincronizadas com os mesmos valores válidos.

// A Mikma vende só lençóis, fronhas e jogos de lençol.
export const CATEGORIES = ['Lençóis', 'Fronhas', 'Jogos de cama'] as const;
export type Category = typeof CATEGORIES[number];

export const SIZES = ['solteiro', 'casal', 'queen', 'king', 'berco', 'unico'] as const;
export type Size = typeof SIZES[number];

export const SIZE_LABEL: Record<string, string> = { solteiro: 'Solteiro', casal: 'Casal', queen: 'Queen', king: 'King', berco: 'Berço', unico: 'Único' };

// A Mikma só trabalha com malha 100% algodão: um tecido só, e o cadastro
// nem pergunta mais. O valor salvo continua 'Malha' (entra no ID da
// variação e no SKU dos produtos que já existem).
export const FABRICS = ['Malha'] as const;
export const FABRIC_LABEL = 'Malha 100% algodão';
// O que a loja mostra ao cliente. Produtos antigos podem ter outro valor
// salvo em `fabric` (cadastro de antes); na loja ele nunca aparece.
export const FABRIC_SHORT = 'Malha';
export const DEFAULT_COMPOSITION = '100% Algodão';
export type Fabric = typeof FABRICS[number];

// Fiação/espessura do fio, mostrado como "Fio 30/1" no produto. Lista fixa
// pra manter sempre o mesmo valor salvo (evita "30/1", "30 / 1", "Fio 30/1"
// variando de produto pra produto).
export const YARN_COUNTS = ['24/1', '30/1', '30/2', '36/1', '40/1'] as const;
export type YarnCount = typeof YARN_COUNTS[number];

// Prefixo singular usado na sugestão de nome, uma peça por categoria.
// "Jogos de cama" não entra aqui de propósito: jogo de cama
// tem regra própria (soma peças = lençol + fronhas, ver
// suggestProductName).
const CATEGORY_PREFIX: Partial<Record<Category, string>> = {
  'Lençóis': 'Lençol',
  'Fronhas': 'Fronha',
};

/**
 * Sugere um nome de produto a partir da categoria + tamanho da primeira
 * variação (+ contagem de fronhas, só pra Jogos de cama). Usado no
 * ProductForm pra preencher o campo Nome automaticamente enquanto o
 * vendedor não escrever algo manualmente ali (ver `nameEditedManually`
 * no form) — sempre pode ser sobrescrito digitando por cima.
 *
 * Ex: category='Jogos de cama', size='queen', fronhaCount=2
 *  → "Jogo de Cama Queen 3 Peças" (1 lençol + 2 fronhas = 3 peças)
 * Ex: category='Lençóis', size='casal'
 *  → "Lençol Casal"
 *
 * Retorna string vazia se não há informação suficiente ainda (nenhuma
 * variação com tamanho definido) ou se a categoria não é conhecida
 * (produto antigo com outra categoria).
 */
export function suggestProductName(params: {
  category: Category;
  size?: string;       // size da primeira variação (variants[0]?.size)
  fronhaCount?: number; // só relevante pra category === 'Jogos de cama'
}): string {
  const { category, size, fronhaCount } = params;
  const sizeLabel = size ? SIZE_LABEL[size] : undefined;

  if (category === 'Jogos de cama') {
    if (!sizeLabel) return '';
    const pecas = 1 + (fronhaCount && fronhaCount > 0 ? fronhaCount : 2);
    return `Jogo de Cama ${sizeLabel} ${pecas} Peças`;
  }

  const prefix = CATEGORY_PREFIX[category];
  if (!prefix) return ''; // categoria desconhecida (produto antigo)
  return sizeLabel ? `${prefix} ${sizeLabel}` : prefix;
}

/**
 * Texto de descrição pronto, montado com o que já foi escolhido no
 * cadastro, para quem não sabe o que escrever. Só afirma o que é certo
 * (malha 100% algodão, tamanho, peças, cor); a pessoa edita à vontade.
 */
export function suggestProductDescription(params: {
  category: Category;
  size?: string;
  fronhaCount?: number;
  colorName?: string;
}): string {
  const { category, size, fronhaCount, colorName } = params;
  const sizeLabel = size && size !== 'unico' ? SIZE_LABEL[size] : undefined;
  const cor = colorName ? ` na cor ${colorName.toLowerCase()}` : '';
  const lines: string[] = [];
  if (category === 'Jogos de cama') {
    const f = fronhaCount && fronhaCount > 0 ? fronhaCount : 2;
    lines.push(`Jogo de cama${sizeLabel ? ` ${sizeLabel.toLowerCase()}` : ''} em malha 100% algodão${cor}.`);
    lines.push(`Vem com ${1 + f} peças: 1 lençol e ${f} ${f === 1 ? 'fronha' : 'fronhas'}.`);
  } else {
    const prefix = CATEGORY_PREFIX[category] ?? 'Peça';
    lines.push(`${prefix}${sizeLabel ? ` ${sizeLabel.toLowerCase()}` : ''} em malha 100% algodão${cor}.`);
  }
  lines.push('Tecido macio, gostoso para o dia a dia.');
  return lines.join('\n');
}
