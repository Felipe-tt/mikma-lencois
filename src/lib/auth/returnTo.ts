const KEY = 'mikma_return_to';
// Cópia no localStorage, com validade curta: o link de confirmação do
// cadastro abre outra aba, onde o sessionStorage começa vazio.
const LOCAL_KEY = 'mikma_return_to_any_tab';
const LOCAL_TTL_MS = 60 * 60 * 1000;

/** Guarda o caminho atual para voltar depois do login/cadastro. */
export function setReturnTo(path: string) {
  try { sessionStorage.setItem(KEY, path); } catch { /* sessionStorage indisponível (ex: modo privado) */ }
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ path, at: Date.now() })); } catch { /* idem */ }
}

function readLocal(): string | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const { path, at } = JSON.parse(raw) as { path?: string; at?: number };
    return path && at && Date.now() - at < LOCAL_TTL_MS ? path : null;
  } catch {
    return null;
  }
}

/** Lê e apaga o caminho guardado, uso único, senão fica "grudado" em navegações futuras. */
export function consumeReturnTo(): string | null {
  let v: string | null = null;
  try {
    v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch { /* sessionStorage indisponível */ }
  const local = readLocal();
  try { localStorage.removeItem(LOCAL_KEY); } catch { /* idem */ }
  // Só caminhos internos (nunca "//outro-site").
  const path = v ?? local;
  return path && path.startsWith('/') && !path.startsWith('//') ? path : null;
}

/** Lê sem apagar (pra mostrar no login por que a pessoa foi mandada pra lá). */
export function peekReturnTo(): string | null {
  try { return sessionStorage.getItem(KEY) ?? readLocal(); } catch { return null; }
}

/** Frase curta para o login explicar o redirecionamento ("Entre para ver seu carrinho"). */
export function returnToReason(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('/carrinho')) return 'Entre para ver seu carrinho.';
  if (path.startsWith('/checkout')) return 'Entre para finalizar sua compra.';
  if (path.startsWith('/favoritos')) return 'Entre para ver seus favoritos.';
  if (path.startsWith('/conta') || path.startsWith('/perfil') || path.startsWith('/pedidos')) return 'Entre para acessar sua conta.';
  return null;
}
