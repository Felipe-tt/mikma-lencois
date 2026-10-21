/**
 * Lê um valor digitado do jeito brasileiro ("1.299,90", "189,90", "R$ 49")
 * e devolve o número (1299.9). Antes o painel fazia
 * parseFloat(s.replace(',', '.')): "1.299,90" virava "1.299.90", que o
 * parseFloat lê como 1.299, e o produto era salvo por R$ 1,30.
 *
 * Sem vírgula, um ponto seguido de exatamente 3 dígitos é separador de
 * milhar ("1.299" = 1299); seguido de 1 ou 2 dígitos é decimal ("189.90").
 * Devolve NaN para o que não dá para ler com segurança.
 */
export function parseBRL(input: string): number {
  const s = input.replace(/R\$|\s/g, '');
  if (!s) return NaN;
  let intPart: string;
  let decPart = '';
  if (s.includes(',')) {
    const parts = s.split(',');
    if (parts.length !== 2) return NaN;
    [intPart, decPart] = parts;
    if (intPart.includes('.') && !/^\d{1,3}(\.\d{3})+$/.test(intPart)) return NaN;
    intPart = intPart.replace(/\./g, '');
  } else {
    const parts = s.split('.');
    const last = parts[parts.length - 1];
    if (parts.length > 1 && last.length !== 3) {
      decPart = last;
      intPart = parts.slice(0, -1).join('');
      if (parts.length > 2 && !parts.slice(1, -1).every(p => p.length === 3)) return NaN;
    } else {
      if (parts.length > 1 && !parts.slice(1).every(p => p.length === 3)) return NaN;
      intPart = parts.join('');
    }
  }
  if (!/^\d+$/.test(intPart || '0') || !/^\d{0,2}$/.test(decPart)) return NaN;
  return Number(`${intPart || '0'}.${decPart || '0'}`);
}

/** Centavos -> texto editável no padrão brasileiro ("1299,90"). */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/**
 * Máscara de preço digitado como no app do banco: só dígitos, preenchendo
 * da direita para a esquerda ("8990" → "89,90", "129990" → "1.299,90").
 * Quem não sabe onde pôr a vírgula não erra o valor.
 */
export function maskBRL(typed: string): string {
  const digits = typed.replace(/\D/g, '').replace(/^0+/, '').slice(0, 8);
  if (!digits) return '';
  return (Number(digits) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
