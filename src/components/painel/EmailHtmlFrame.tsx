'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EMAIL_FRAME_SANDBOX, emailFrameDoc } from '@/lib/email/frame';

let fontCssCache: string | null = null;

/**
 * A fonte do painel (Inter, servida pelo próprio site) também dentro do
 * quadro: copia as regras @font-face dela das folhas de estilo da página.
 * Sem achar, fica a fonte do sistema.
 */
function siteFontCss(): string {
  if (fontCssCache !== null) return fontCssCache;
  const family = getComputedStyle(document.documentElement).getPropertyValue('--font-inter').trim();
  const names = family.split(',').map(f => f.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  const rules: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let list: CSSRuleList;
    try { list = sheet.cssRules; } catch { continue; } // folha de outro site
    for (const rule of Array.from(list)) {
      if (rule instanceof CSSFontFaceRule && names.includes(rule.style.getPropertyValue('font-family').trim().replace(/^['"]|['"]$/g, ''))) {
        rules.push(rule.cssText);
      }
    }
  }
  fontCssCache = rules.length ? `${rules.join('')}body{font-family:${family},ui-sans-serif,system-ui,sans-serif}` : '';
  return fontCssCache;
}

const isDark = () => document.documentElement.classList.contains('dark');

/**
 * Balão com o corpo HTML de um e-mail recebido, num iframe sandbox sem
 * scripts (ver lib/email/frame). A altura acompanha o conteúdo; o tema
 * acompanha o painel. Só roda no navegador: as mensagens chegam pelo
 * Firestore depois de montar.
 */
export function EmailHtmlFrame({ html, onResize }: { html: string; onResize?: () => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);
  const doc = useMemo(
    () => (typeof document === 'undefined' ? '' : emailFrameDoc(html, { dark: isDark(), css: siteFontCss() })),
    [html],
  );

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const content = () => frame.contentDocument?.getElementById('m') ?? null;
    const measure = () => {
      const el = content();
      if (el) setHeight(Math.ceil(el.getBoundingClientRect().height));
    };
    const syncTheme = () => frame.contentDocument?.documentElement.classList.toggle('dark', isDark());
    let inner: ResizeObserver | null = null;
    const onLoad = () => {
      syncTheme();
      measure();
      inner?.disconnect();
      const el = content();
      if (el) { inner = new ResizeObserver(measure); inner.observe(el, { box: 'border-box' }); }
    };
    frame.addEventListener('load', onLoad);
    if (content()) onLoad();
    // Largura do balão mudou (janela, painel lateral): o texto quebra diferente.
    const outer = new ResizeObserver(measure);
    outer.observe(frame);
    const theme = new MutationObserver(syncTheme);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      frame.removeEventListener('load', onLoad);
      inner?.disconnect();
      outer.disconnect();
      theme.disconnect();
    };
  }, [doc]);

  useEffect(() => { if (height) onResize?.(); }, [height, onResize]);

  return (
    <iframe
      ref={ref}
      title="Conteúdo do e-mail"
      sandbox={EMAIL_FRAME_SANDBOX}
      srcDoc={doc}
      referrerPolicy="no-referrer"
      className="block w-full border-0 bg-transparent"
      style={{ height }}
    />
  );
}
