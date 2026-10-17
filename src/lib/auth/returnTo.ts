const KEY = 'mikma_return_to';

/** Guarda o caminho atual pra voltar depois do login/cadastro. */
export function setReturnTo(path: string) {
  try { sessionStorage.setItem(KEY, path); } catch { /* sessionStorage indisponível (ex: modo privado) */ }
}

/** Lê e apaga o caminho guardado, uso único, senão fica "grudado" em navegações futuras. */
export function consumeReturnTo(): string | null {
  try {
    const v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return v;
  } catch {
    return null;
  }
}

/** Lê sem apagar (pra mostrar no login por que a pessoa foi mandada pra lá). */
export function peekReturnTo(): string | null {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}

/** Frase curta pro login explicar o redirecionamento ("Entre para ver seu carrinho"). */
export function returnToReason(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('/carrinho')) return 'Entre para ver seu carrinho.';
  if (path.startsWith('/checkout')) return 'Entre para finalizar sua compra.';
  if (path.startsWith('/favoritos')) return 'Entre para ver seus favoritos.';
  if (path.startsWith('/conta') || path.startsWith('/perfil') || path.startsWith('/pedidos')) return 'Entre para acessar sua conta.';
  return null;
}
