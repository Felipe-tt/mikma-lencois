import { revalidatePath, revalidateTag } from 'next/cache';

/**
 * Regenera as páginas da loja que mostram um produto (home, catálogo e a
 * página dele). Sem isso, preço, fotos ou "ativo" mudados no painel só
 * apareciam no site depois do intervalo do ISR (até 15 min na home).
 */
export function revalidateProduct(id: string) {
  try {
    revalidateTag('products', { expire: 0 });
    revalidatePath('/');
    revalidatePath('/produtos');
    revalidatePath(`/produtos/${id}`);
  } catch { /* best-effort: o ISR atualiza sozinho depois */ }
}
