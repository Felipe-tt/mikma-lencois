/**
 * CEP que a pessoa digitou para ver o frete (na página do produto ou no
 * carrinho), guardado só neste aparelho: o carrinho cota com ele e o
 * checkout começa o endereço por ele. Comodidade, não dado da conta.
 */
const KEY = 'mikma-cep';

export function readTypedCep(): string {
  try {
    const v = localStorage.getItem(KEY) ?? '';
    return /^\d{8}$/.test(v) ? v : '';
  } catch {
    return '';
  }
}

export function saveTypedCep(cep: string) {
  const d = cep.replace(/\D/g, '');
  if (d.length !== 8) return;
  try { localStorage.setItem(KEY, d); } catch { /* sem storage */ }
}
