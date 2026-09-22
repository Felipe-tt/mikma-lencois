/**
 * A AbacatePay rejeita com 400 "Disallowed character in description" qualquer
 * caractere fora de um conjunto ASCII básico na descrição do PIX (confirmado
 * em produção com "·" U+00B7). O bug real que travava o PIX era exatamente
 * esse: a descrição usava "·" como separador.
 *
 * Em vez de confiar que cada string interpolada na descrição (nome de
 * transportadora, nome de produto etc.) nunca vai ter um caractere fora
 * desse conjunto, sanitiza a descrição inteira antes de mandar pra API.
 * Acentos viram a letra sem acento (á -> a), qualquer outra coisa fora do
 * conjunto permitido vira espaço, e espaços duplicados colapsam.
 */
export function sanitizePixDescription(description: string): string {
  const semAcento = description
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // remove os diacríticos (acentos, til, cedilha etc.)

  return semAcento
    .replace(/[^A-Za-z0-9 #\-/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
