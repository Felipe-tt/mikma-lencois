// Opções fixas de produto, compartilhadas entre o formulário do painel
// (ProductForm) e a importação de catálogo do WhatsApp — mantém as duas
// telas sempre sincronizadas com os mesmos valores válidos.

export const CATEGORIES = ['Lençóis', 'Fronhas', 'Edredons', 'Travesseiros', 'Jogos de cama', 'Outros'] as const;
export type Category = typeof CATEGORIES[number];

export const SIZES = ['solteiro', 'casal', 'queen', 'king', 'berco', 'unico'] as const;
export type Size = typeof SIZES[number];

export const SIZE_LABEL: Record<string, string> = { solteiro: 'Solteiro', casal: 'Casal', queen: 'Queen', king: 'King', berco: 'Berço', unico: 'Único' };

export const FABRICS = ['Algodão', 'Malha', 'Percal 200 fios', 'Percal 300 fios', 'Cetim'] as const;
export type Fabric = typeof FABRICS[number];

// Fiação/espessura do fio — mostrado como "Fio 30/1" no produto. Lista fixa
// pra manter sempre o mesmo valor salvo (evita "30/1", "30 / 1", "Fio 30/1"
// variando de produto pra produto).
export const YARN_COUNTS = ['24/1', '30/1', '30/2', '36/1', '40/1'] as const;
export type YarnCount = typeof YARN_COUNTS[number];
