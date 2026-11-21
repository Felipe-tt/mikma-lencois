import { describe, expect, it } from 'vitest';
import { sanitizeInboundHtml } from './sanitize';

describe('HTML de e-mail recebido', () => {
  it('tira script, evento e tag que roda ou navega', () => {
    const out = sanitizeInboundHtml(
      '<p onclick="a()">oi</p><script>alert(1)</script><iframe src="https://x.com"></iframe>'
      + '<form action="https://x.com"><input name="senha"></form><svg><script>alert(2)</script></svg>'
      + '<style>body{display:none}</style><object data="x"></object>',
    );
    expect(out).toBe('<p>oi</p>');
  });

  it('link só http, https e mailto, sempre em outra aba sem opener nem referrer', () => {
    const out = sanitizeInboundHtml(
      '<a href="https://x.com" target="_self">a</a><a href="javascript:alert(1)">b</a>'
      + '<a href="data:text/html,<script>alert(1)</script>">c</a><a href="//x.com">d</a><a href="mailto:a@b.com">e</a>',
    );
    expect(out).toBe(
      '<a href="https://x.com" target="_blank" rel="noopener noreferrer">a</a>'
      + '<a target="_blank" rel="noopener noreferrer">b</a><a target="_blank" rel="noopener noreferrer">c</a>'
      + '<a target="_blank" rel="noopener noreferrer">d</a><a href="mailto:a@b.com" target="_blank" rel="noopener noreferrer">e</a>',
    );
  });

  it('imagem só a embutida no e-mail: a de outro site (pixel de rastreio) sai', () => {
    const out = sanitizeInboundHtml(
      '<img src="data:image/png;base64,AAAA" alt="foto"><img src="https://x.com/pixel.gif">'
      + '<img src="//x.com/p.gif"><img src="/api/x"><img src="data:image/svg+xml;base64,AA"><img alt="sem src">'
      + '<img src="x" onerror="alert(1)">',
    );
    expect(out).toBe('<img src="data:image/png;base64,AAAA" alt="foto" />');
  });

  it('CSS só de cor e ênfase: nada de posição, tamanho ou url()', () => {
    const out = sanitizeInboundHtml(
      '<p style="color:#fff;position:fixed;inset:0;background-image:url(https://x.com/p.gif);font-weight:bold">x</p>',
    );
    expect(out).toBe('<p style="color:#fff;font-weight:bold">x</p>');
  });

  it('texto continua texto (sem virar tag de novo)', () => {
    expect(sanitizeInboundHtml('<p>1 &lt; 2 &amp; &lt;b&gt;</p>')).toBe('<p>1 &lt; 2 &amp; &lt;b&gt;</p>');
    expect(sanitizeInboundHtml('<title><img src=x onerror=alert(1)></title><p>ok</p>'))
      .toBe('&lt;img src=x onerror=alert(1)&gt;<p>ok</p>');
  });
});
