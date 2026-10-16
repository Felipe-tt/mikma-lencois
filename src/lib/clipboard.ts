/**
 * Copia texto pra área de transferência. Retorna false se não deu.
 *
 * navigator.clipboard falha em navegadores embutidos (Instagram,
 * WhatsApp) e fora de contexto seguro; o fallback com execCommand cobre
 * a maioria desses casos. Quem chama deve avisar o cliente quando
 * retornar false, em vez de mostrar "Copiado" com a área vazia.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // cai no fallback abaixo
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    el.remove();
    return ok;
  } catch {
    return false;
  }
}
