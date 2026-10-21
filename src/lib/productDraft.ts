// Rascunho do cadastro de produto novo, guardado no aparelho (localStorage).
// Compartilhado entre o formulário e a lista de produtos, que oferece
// "Continuar cadastro" quando alguém sai no meio.
export const PRODUCT_DRAFT_KEY = 'mikma:product-draft:v1';

/** Nome do produto do rascunho, ou null se não há rascunho. */
export function readDraftName(): string | null {
  try {
    const raw = localStorage.getItem(PRODUCT_DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as { name?: string };
    return typeof d.name === 'string' ? d.name : '';
  } catch {
    return null;
  }
}
