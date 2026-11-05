'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { whatsappWithText } from '@/lib/whatsapp';
import { getOpenStatus, parseBusinessHours } from '@/lib/business-hours';

/**
 * Contato pelo WhatsApp em pontos discretos da loja: link de texto na
 * compra e no checkout, item no menu do celular e um botão pequeno no
 * canto das páginas de navegação. O número vem das Configurações.
 */

interface Ctx { href: string | null; hours?: string; timeZone?: string }
const WhatsAppContext = createContext<Ctx>({ href: null });

export function WhatsAppProvider({ href, hours, timeZone, children }: Ctx & { children: React.ReactNode }) {
  return <WhatsAppContext.Provider value={{ href, hours, timeZone }}>{children}</WhatsAppContext.Provider>;
}

export function useWhatsApp() {
  return useContext(WhatsAppContext);
}

/** "respondemos a partir das 8h" fora do horário (só depois de montar: o horário é do aparelho). */
function useClosedHint(hours?: string, timeZone?: string) {
  const [hint, setHint] = useState('');
  useEffect(() => {
    if (!hours) return;
    try {
      const st = getOpenStatus(parseBusinessHours(hours), timeZone);
      const label = st.nextChangeLabel ?? '';
      const today = label.match(/^Abre hoje às (.+)$/);
      setHint(st.isOpen ? '' : today ? `Respondemos a partir das ${today[1]}` : label ? `Respondemos quando abrir (${label.charAt(0).toLowerCase()}${label.slice(1)})` : '');
    } catch { setHint(''); }
  }, [hours, timeZone]);
  return hint;
}

export function WhatsAppIcon({ size = 15, className = '' }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.4z" />
      <path d="M9 8.6c.2-.5.5-.6.9-.6h.4c.2 0 .4.1.5.4l.6 1.5c.1.3 0 .5-.1.7l-.5.6c.6 1.2 1.6 2.1 2.8 2.7l.6-.6c.2-.2.5-.2.7-.1l1.5.7c.3.1.4.3.4.6v.4c0 .4-.2.7-.6.9-.6.3-1.4.4-2.2.1-2.3-.8-4.2-2.7-5-5-.2-.8-.2-1.6 0-2.2z" />
    </svg>
  );
}

/** Link de texto pequeno: "Dúvida? Fale no WhatsApp". */
export function WhatsAppInline({ label = 'Dúvida? Fale no WhatsApp', message, className = '' }: { label?: string; message: string; className?: string }) {
  const { href } = useWhatsApp();
  if (!href) return null;
  return (
    <a href={whatsappWithText(href, message)} target="_blank" rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 text-[12.5px] text-mid hover:text-ink underline-offset-4 hover:underline transition-colors ${className}`}>
      <WhatsAppIcon size={14} />
      {label}
    </a>
  );
}

// Só nas páginas de navegação. Produto já tem o link perto da compra e a
// barra fixa; checkout tem o próprio link; painel, conta e login não.
const FLOAT_PATHS = [/^\/$/, /^\/produtos\/?$/, /^\/carrinho\/?$/, /^\/guia-de-tamanhos\/?$/, /^\/sobre\/?$/, /^\/favoritos\/?$/];

/** Botão pequeno no canto, que só aparece depois de rolar um pouco. */
export function WhatsAppFloat() {
  const { href, hours, timeZone } = useWhatsApp();
  const pathname = usePathname() ?? '';
  const [shown, setShown] = useState(false);
  const hint = useClosedHint(hours, timeZone);
  const allowed = FLOAT_PATHS.some(r => r.test(pathname));

  useEffect(() => {
    if (!allowed) return;
    const onScroll = () => setShown(window.scrollY > 360);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [allowed]);

  if (!href || !allowed) return null;
  const label = hint ? `Falar no WhatsApp. ${hint}` : 'Falar no WhatsApp';
  return (
    <a
      href={whatsappWithText(href, 'Olá! Vim pelo site da Mikma e tenho uma dúvida.')}
      target="_blank" rel="noopener noreferrer"
      aria-label={label}
      data-no-print
      className={`wa-float group fixed z-30 right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] sm:right-6 sm:bottom-6 flex items-center h-11 rounded-full border border-mist bg-paper/90 backdrop-blur-md text-mid hover:text-ink shadow-[0_6px_20px_-10px_rgba(40,24,12,0.45)] transition-[opacity,transform,color] duration-300 ${shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'}`}
    >
      <span className="w-11 h-11 flex items-center justify-center shrink-0"><WhatsAppIcon size={19} /></span>
      {/* No computador, o texto abre ao passar o mouse. */}
      <span className="hidden sm:block max-w-0 group-hover:max-w-[16rem] group-focus-visible:max-w-[16rem] overflow-hidden whitespace-nowrap text-[12.5px] transition-[max-width] duration-300 ease-out">
        <span className="pr-4 block">{hint || 'Falar no WhatsApp'}</span>
      </span>
    </a>
  );
}
