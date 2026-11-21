import sanitizeHtmlLib from 'sanitize-html';

/** Imagem embutida no próprio e-mail (o Resend entrega as inline assim). Sem SVG. */
const INLINE_IMAGE = /^data:image\/(png|jpe?g|gif|webp|avif|bmp);/i;

/**
 * Limpa o HTML de um e-mail recebido antes de gravar (api/email/inbound).
 *
 * Esse HTML vem de QUALQUER pessoa que escreva para contato@mikma.com.br,
 * então passa por uma lib dedicada com allowlist restrita (regex é
 * contornável): só tags e atributos de texto formatado, nada que rode
 * script, abra formulário ou navegue para fora sozinho. É a primeira trava;
 * a segunda é o iframe sem scripts onde o painel mostra o e-mail
 * (components/painel/EmailHtmlFrame).
 *
 * Imagem só a embutida (data:). Imagem de outro site é o "pixel" que avisa
 * quem mandou quando e de onde a equipe abriu, e a CSP do painel já
 * bloqueava; agora nem é gravada.
 */
export function sanitizeInboundHtml(html: string): string {
  return sanitizeHtmlLib(html, {
    allowedTags: [
      'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'span', 'div',
      'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'table', 'thead', 'tbody', 'tr', 'td', 'th',
      'a', 'img',
    ],
    allowedAttributes: {
      // rel precisa estar aqui: sem ele, o rel do transformTags abaixo era
      // descartado e o link saía sem noopener/noreferrer.
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
      '*': ['style'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    // data: só em <img>: num link, data:text/html abriria uma página com
    // HTML/JS de quem mandou, disfarçada de link.
    allowedSchemesByTag: { img: ['data'] },
    // "//site.com" é endereço de outro site sem o https: na frente.
    allowProtocolRelative: false,
    exclusiveFilter: frame => frame.tag === 'img' && !INLINE_IMAGE.test(frame.attribs.src ?? ''),
    // CSS só de cor e ênfase: nada de url(), posição ou tamanho.
    allowedStyles: {
      '*': {
        'color': [/^#[0-9a-f]{3,6}$/i, /^rgb/],
        'background-color': [/^#[0-9a-f]{3,6}$/i, /^rgb/],
        'font-weight': [/^(bold|normal|[0-9]+)$/],
        'font-style': [/^italic$/],
        'text-decoration': [/^underline$/],
      },
    },
    // Links sempre abrem em nova aba e sem repassar referrer/opener
    transformTags: {
      a: sanitizeHtmlLib.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
    },
    disallowedTagsMode: 'discard',
  });
}
