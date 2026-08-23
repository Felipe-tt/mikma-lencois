// Opções fixas de produto, compartilhadas entre o formulário do painel
// (ProductForm) e a importação de catálogo do WhatsApp, mantém as duas
// telas sempre sincronizadas com os mesmos valores válidos.

export const CATEGORIES = ['Lençóis', 'Fronhas', 'Edredons', 'Travesseiros', 'Jogos de cama', 'Outros'] as const;
export type Category = typeof CATEGORIES[number];

export const SIZES = ['solteiro', 'casal', 'queen', 'king', 'berco', 'unico'] as const;
export type Size = typeof SIZES[number];

export const SIZE_LABEL: Record<string, string> = { solteiro: 'Solteiro', casal: 'Casal', queen: 'Queen', king: 'King', berco: 'Berço', unico: 'Único' };

export const FABRICS = ['Algodão', 'Malha', 'Percal 200 fios', 'Percal 300 fios', 'Cetim'] as const;
export type Fabric = typeof FABRICS[number];

// Fiação/espessura do fio, mostrado como "Fio 30/1" no produto. Lista fixa
// pra manter sempre o mesmo valor salvo (evita "30/1", "30 / 1", "Fio 30/1"
// variando de produto pra produto).
export const YARN_COUNTS = ['24/1', '30/1', '30/2', '36/1', '40/1'] as const;
export type YarnCount = typeof YARN_COUNTS[number];

// Prefixo singular usado na sugestão de nome, uma peça por categoria.
// "Jogos de cama" e "Outros" não entram aqui de propósito: jogo de cama
// tem regra própria (soma peças = lençol + fronhas, ver
// suggestProductName), e "Outros" é catch-all genérico demais pra
// sugerir algo com confiança — melhor deixar em branco pro vendedor
// escrever livremente.
const CATEGORY_PREFIX: Partial<Record<Category, string>> = {
  'Lençóis': 'Lençol',
  'Fronhas': 'Fronha',
  'Edredons': 'Edredom',
  'Travesseiros': 'Travesseiro',
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
 * variação com tamanho definido) ou se a categoria é "Outros".
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
  if (!prefix) return ''; // "Outros", ou categoria desconhecida
  return sizeLabel ? `${prefix} ${sizeLabel}` : prefix;
}
