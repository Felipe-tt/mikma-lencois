/**
 * Tira do HTML de um e-mail recebido o histórico citado (respostas anteriores
 * da conversa), para o painel mostrar só a mensagem nova.
 *
 * Sem regex sobre o corpo inteiro: o HTML vem de qualquer pessoa, e padrões
 * como /<blockquote[\s\S]*?<\/blockquote>/ levam tempo quadrático com muitas
 * aberturas sem fechamento. Aqui cada trecho é lido uma vez só.
 */

/**
 * Remove de cada tag que começa com `abre` (e que `casa` aceita) até o
 * primeiro `fecha` seguinte, como /abre[\s\S]*?fecha/gi. Tag sem fechamento
 * fica como está.
 */
function cortarBlocos(html: string, abre: string, fecha: string, casa: (tag: string) => boolean = () => true): string {
  // Só A-Z: toLowerCase() muda o tamanho de alguns caracteres (İ), e os
  // índices deixariam de bater com o HTML original.
  const lower = html.replace(/[A-Z]/g, c => c.toLowerCase());
  let out = '';
  let pos = 0;
  let from = 0;
  for (;;) {
    const start = lower.indexOf(abre, from);
    if (start < 0) break;
    const tagEnd = lower.indexOf('>', start);
    if (tagEnd < 0) break;
    from = tagEnd + 1;
    if (!casa(lower.slice(start, tagEnd + 1))) continue;
    const end = lower.indexOf(fecha, from);
    if (end < 0) break;
    out += html.slice(pos, start);
    pos = from = end + fecha.length;
  }
  return out + html.slice(pos);
}

/** Valor do atributo (`class`, `id`) dentro de uma tag já em minúsculas. */
function atributo(tag: string, nome: string): string | null {
  const alvo = `${nome}="`;
  for (let i = tag.indexOf(alvo); i >= 0; i = tag.indexOf(alvo, i + 1)) {
    // Atributo de verdade: começa depois de um espaço (não "data-class=").
    if (!/\s/.test(tag[i - 1] ?? '')) continue;
    const inicio = i + alvo.length;
    const fim = tag.indexOf('"', inicio);
    return fim < 0 ? null : tag.slice(inicio, fim);
  }
  return null;
}

const tagDiv = (tag: string) => /^<div[\s>]/.test(tag.slice(0, 5));

export function stripQuotedHtml(h: string): string {
  // Gmail e Apple Mail citam em <blockquote>.
  let s = cortarBlocos(h, '<blockquote', '</blockquote>');
  // Gmail: <div class="gmail_quote">; Outlook: <div id="divRplyFwdMsg"> e <div id="appendonsend">.
  s = cortarBlocos(s, '<div', '</div>', tag => tagDiv(tag) && (
    (atributo(tag, 'class') ?? '').includes('gmail_quote')
    || atributo(tag, 'id') === 'divrplyfwdmsg'
    || atributo(tag, 'id') === 'appendonsend'));
  // <hr> isolado que costuma separar o histórico.
  s = cortarBlocos(s, '<hr', '', tag => /^<hr[\s/>]/.test(tag.slice(0, 4)));
  // Espaço que sobra das tags removidas: no máximo duas quebras seguidas.
  s = s.replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>');
  return s.trim();
}
