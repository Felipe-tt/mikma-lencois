const KEY = 'mikma_return_to';

/** Guarda o caminho atual pra voltar depois do login/cadastro. */
export function setReturnTo(path: string) {
  try { sessionStorage.setItem(KEY, path); } catch { /* sessionStorage indisponível (ex: modo privado) */ }
}

/** Lê e apaga o caminho guardado — uso único, senão fica "grudado" em navegações futuras. */
export function consumeReturnTo(): string | null {
  try {
    const v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return v;
  } catch {
    return null;
  }
}
