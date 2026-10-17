'use client';
import Link from 'next/link';
import Image from 'next/image';
import { parseBusinessHours, getOpenStatus } from '@/lib/business-hours';
import { CookiePreferencesButton } from '@/components/layout/CookiePreferencesButton';

interface Props {
  storeName?: string;
  storeCity?: string;
  storePhone?: string;
  storeEmail?: string;
  instagramUrl?: string;
  whatsappUrl?: string;
  reclameAquiUrl?: string;
  tagline?: string;
  businessHours?: string;
  businessHoursTimezone?: string;
}

export function Footer({
  storeName = 'Mikma Lençóis',
  storeCity = 'Blumenau, SC',
  storePhone,
  storeEmail,
  instagramUrl,
  whatsappUrl,
  reclameAquiUrl,
  tagline = '',
  businessHours,
  businessHoursTimezone,
}: Props) {
  const year = new Date().getFullYear();
  const wa = whatsappUrl || (storePhone ? `https://wa.me/${storePhone.replace(/\D/g, '')}` : null);
  const status = businessHours ? getOpenStatus(parseBusinessHours(businessHours), businessHoursTimezone) : null;

  return (
    <footer className="theme-locked bg-ink text-paper mt-auto overflow-hidden">

      {/* ── Corpo ── */}
      <div className="container-shop py-14">
        <div className="grid grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr_1fr] gap-10 md:gap-8 lg:gap-12 pb-12 border-b border-paper/[0.07]">

          {/* Col 1, Marca */}
          <div className="col-span-2 md:col-span-1 flex flex-col gap-5">
            <Image
              src="/logo-white.png"
              alt={storeName}
              width={800}
              height={242}
              sizes="120px"
              className="h-7 w-auto object-contain object-left opacity-80 self-start"
            />
            <p className="text-[13px] text-paper/60 leading-relaxed max-w-[28ch]">
              {tagline || (storeCity?.split(',')[0].trim()
                ? `Lençóis direto da fábrica em ${storeCity.split(',')[0].trim()}.`
                : 'Lençóis direto da fábrica.')}
            </p>

            {/* Contato: antes a coluna "Contato" só tinha status e links legais. */}
            <ul className="flex flex-col gap-2.5 mt-1">
              {status && (
                <li>
                  <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] ${status.isOpen ? 'bg-green-400/10 text-green-300' : 'bg-paper/[0.06] text-paper/60'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${status.isOpen ? 'bg-green-400' : 'bg-paper/35'}`} aria-hidden="true" />
                    {status.isOpen ? 'Aberto agora' : 'Fechado agora'}
                  </span>
                </li>
              )}
              {wa && (
                <li>
                  <a href={wa} target="_blank" rel="noopener noreferrer" className="text-[13px] text-paper/75 hover:text-paper transition-colors duration-150">
                    WhatsApp{storePhone ? ` · ${storePhone}` : ''}
                  </a>
                </li>
              )}
              {storeEmail && (
                <li>
                  <a href={`mailto:${storeEmail}`} className="text-[13px] text-paper/75 hover:text-paper transition-colors duration-150 break-all">
                    {storeEmail}
                  </a>
                </li>
              )}
            </ul>

            {(instagramUrl || wa) && (
              <div className="flex items-center gap-2 mt-1">
                {instagramUrl && (
                  <a href={instagramUrl} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="w-9 h-9 rounded-full border border-paper/15 flex items-center justify-center text-paper/70 hover:text-paper hover:border-paper/40 hover:bg-paper/[0.06] transition-colors duration-150">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor"/></svg>
                  </a>
                )}
                {wa && (
                  <a href={wa} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="w-9 h-9 rounded-full border border-paper/15 flex items-center justify-center text-paper/70 hover:text-paper hover:border-paper/40 hover:bg-paper/[0.06] transition-colors duration-150">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 20.5l1.3-4A8.5 8.5 0 1 1 8 19.6z"/><path d="M9 9.5c.3 1.7 1.8 3.8 4 4.8l1.2-1.1 1.8.8-.4 1.7c-3.6.2-7.3-3.4-7.3-7.1l1.7-.4.8 1.8z"/></svg>
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Col 2, Loja */}
          <div>
            <p className="text-[9px] font-bold tracking-[0.24em] uppercase text-paper/55 mb-5">Loja</p>
            <ul className="flex flex-col gap-3.5">
              {[
                { href: '/produtos', label: 'Produtos' },
                { href: '/guia-de-tamanhos', label: 'Guia de tamanhos' },
                { href: '/sobre', label: 'Sobre nós' },
              ].map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-[13px] text-paper/70 hover:text-paper transition-colors duration-150">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3, Conta */}
          <div>
            <p className="text-[9px] font-bold tracking-[0.24em] uppercase text-paper/55 mb-5">Conta</p>
            <ul className="flex flex-col gap-3.5">
              {[
                { href: '/conta/pedidos', label: 'Meus pedidos' },
                { href: '/conta', label: 'Minha conta' },
              ].map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-[13px] text-paper/70 hover:text-paper transition-colors duration-150">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 4, Ajuda (legal) */}
          <div>
            <p className="text-[9px] font-bold tracking-[0.24em] uppercase text-paper/55 mb-5">Ajuda</p>
            <ul className="flex flex-col gap-3.5">
              {[
                { href: '/trocas-e-devolucoes', label: 'Trocas e devoluções' },
                { href: '/privacidade', label: 'Privacidade' },
                { href: '/termos', label: 'Termos de uso' },
                { href: '/politica-de-cookies', label: 'Política de cookies' },
              ].map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-[13px] text-paper/70 hover:text-paper transition-colors duration-150">
                    {label}
                  </Link>
                </li>
              ))}
              <li>
                <CookiePreferencesButton className="text-[13px] text-paper/70 hover:text-paper transition-colors duration-150" />
              </li>
              {reclameAquiUrl && (
                <li>
                  <a href={reclameAquiUrl} target="_blank" rel="noopener noreferrer"
                    className="text-[13px] text-paper/70 hover:text-paper transition-colors duration-150">
                    ReclameAqui
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* ── Rodapé legal ── */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-7">
          <p className="text-[11px] text-paper/55">
            © {year} {storeName} · Todos os direitos reservados
          </p>
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-semibold tracking-[0.1em] text-paper/55 uppercase">PIX · Cartão de crédito</span>
            {storeCity && (
              <>
                <span aria-hidden className="text-paper/25">·</span>
                <span className="text-[10px] text-paper/55 tracking-[0.16em] uppercase">{storeCity.toUpperCase().replace(', ', '\u00a0·\u00a0')}</span>
              </>
            )}
          </div>
        </div>
      </div>

    </footer>
  );
}
