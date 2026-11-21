/**
 * Documento do iframe onde o painel mostra o HTML de um e-mail recebido
 * (components/painel/EmailHtmlFrame).
 *
 * O HTML já chega limpo (lib/email/sanitize). O iframe é a segunda trava:
 * sem allow-scripts, nada roda lá dentro mesmo que algum truque passe pela
 * limpeza, e o e-mail não alcança a página do painel (sessão e dados da
 * equipe). allow-same-origin só deixa o painel medir a altura e trocar o
 * tema (sem script no quadro, ele não tem como usar essa origem). Links
 * abrem em outra aba, já fora do sandbox; formulário, navegar o painel e
 * plugin continuam bloqueados.
 */
export const EMAIL_FRAME_SANDBOX = 'allow-same-origin allow-popups allow-popups-to-escape-sandbox';

/**
 * O balão da conversa vem aqui dentro, nas cores do painel nos dois temas:
 * o quadro ocupa a largura toda e o balão fica do tamanho do texto.
 */
const CSS = [
  'html{-webkit-text-size-adjust:100%}',
  // color-scheme igual ao do painel: diferente, o navegador pinta o fundo do quadro.
  'html.dark{color-scheme:dark}',
  'html,body{margin:0;padding:0;background:transparent;overflow:hidden}',
  'body{font:13px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1E1208}',
  'html.dark body{color:#F1E9E0}',
  // Tabela larga rola de lado dentro do balão, em vez de cortar.
  '#m{box-sizing:border-box;width:fit-content;max-width:100%;padding:12px 16px;overflow-x:auto;overflow-wrap:anywhere;'
    + 'background:#fff;border:1px solid #E6DFD5;border-radius:16px 16px 6px 16px}',
  'html.dark #m{background:#201912;border-color:#382D21}',
  'a{color:#A35428;text-decoration:underline}',
  'html.dark a{color:#D98A5B}',
  'img{max-width:100%;height:auto}',
  'p{margin:0 0 .5em}',
  // Sem sobra embaixo do último parágrafo: o balão fica com o mesmo respiro em cima e embaixo.
  '#m>:last-child{margin-bottom:0}',
  'blockquote{margin:0 0 .5em;padding-left:.75em;border-left:2px solid #E6DFD5}',
  'html.dark blockquote{border-left-color:#382D21}',
  'table{border-collapse:collapse;max-width:100%}',
  'td,th{padding:4px 8px}',
  'pre{white-space:pre-wrap}',
].join('');

/** O HTML (já limpo) dentro de um documento completo, no tema do painel. */
export function emailFrameDoc(html: string, opts: { dark?: boolean; css?: string } = {}): string {
  return '<!doctype html>'
    + `<html${opts.dark ? ' class="dark"' : ''}><head><meta charset="utf-8">`
    + '<meta name="referrer" content="no-referrer"><base target="_blank">'
    + `<style>${CSS}${(opts.css ?? '').replace(/</g, '')}</style></head>`
    + `<body><div id="m">${html}</div></body></html>`;
}
