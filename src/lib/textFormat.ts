// Formatação de nome de produto — usada tanto no cadastro manual
// (ProductForm) quanto na publicação de rascunhos importados do CSV/WhatsApp
// (catalog-drafts). Garante que não importa como o usuário digitou
// ("LENÇO QUEEN 3PÇS", "jogo   casal  padrão"), o que fica salvo e visível
// pro cliente sempre sai formatado de forma consistente.

// Palavras que ficam em minúsculo no meio do nome (preposições/conectivos),
// exceto quando são a primeira palavra.
const LOWERCASE_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'em', 'a', 'o']);

// Abreviações comuns que expandimos por extenso.
const ABBREVIATIONS: Record<string, string> = {
  'pçs': 'peças',
  'pcs': 'peças',
  'pç': 'peça',
  'pc': 'peça',
  'un': 'unidade',
  'und': 'unidade',
};

function capitalizeWord(word: string): string {
  if (!word) return word;
  return word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1).toLocaleLowerCase('pt-BR');
}

export function formatProductName(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/\s+/g, ' ')
    // separa número colado em palavra: "3pçs" -> "3 pçs", "200gr" -> "200 gr"
    .replace(/(\d)([a-zà-öø-ÿ]+)/gi, '$1 $2')
    // separa palavra colada em número: "queen3" -> "queen 3"
    .replace(/([a-zà-öø-ÿ])(\d)/gi, '$1 $2');

  if (!cleaned) return cleaned;

  const words = cleaned.split(' ').map((word, i) => {
    const lower = word.toLocaleLowerCase('pt-BR');
    const expanded = ABBREVIATIONS[lower] ?? lower;
    if (i > 0 && LOWERCASE_WORDS.has(expanded)) return expanded;
    return capitalizeWord(expanded);
  });

  return words.join(' ');
}
