'use client';
import Link from 'next/link';
import Image from 'next/image';
import { parseBusinessHours, getOpenStatus } from '@/lib/business-hours';

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
    <footer className="bg-ink text-paper mt-auto overflow-hidden">

      {/* ── Corpo ── */}
      <div className="container-shop py-14 border-t border-paper/[0.07]">
        <div className="grid grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr_1fr] gap-10 md:gap-8 lg:gap-12 pb-12 border-b border-paper/[0.07]">

          {/* Col 1 — Marca */}
          <div className="col-span-2 md:col-span-1 flex flex-col gap-5">
            <Image
              src="/logo-white.png"
              alt={storeName}
              width={800}
              height={242}
              className="h-7 w-auto object-contain object-left opacity-80 self-start"
            />
            <p className="text-[13px] text-paper/45 leading-relaxed max-w-[20ch]">
              {tagline}
            </p>

            {/* Social */}
            {(instagramUrl || wa) && (
              <div className="flex items-center gap-4 mt-1">
                {instagramUrl && (
                  <a href={instagramUrl} target="_blank" rel="noopener noreferrer"
                    className="text-[11px] font-semibold tracking-[0.12em] uppercase text-paper/40 hover:text-paper transition-colors duration-150">
                    Instagram
                  </a>
                )}
                {wa && (
                  <a href={wa} target="_blank" rel="noopener noreferrer"
                    className="text-[11px] font-semibold tracking-[0.12em] uppercase text-paper/40 hover:text-paper transition-colors duration-150">
                    WhatsApp
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Col 2 — Loja */}
          <div>
            <p className="text-[9px] font-bold tracking-[0.24em] uppercase text-paper/30 mb-5">Loja</p>
            <ul className="flex flex-col gap-3.5">
              {[
                { href: '/produtos', label: 'Produtos' },
                { href: '/sobre', label: 'Sobre nós' },
              ].map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-[13px] text-paper/50 hover:text-paper transition-colors duration-150">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3 — Conta */}
          <div>
            <p className="text-[9px] font-bold tracking-[0.24em] uppercase text-paper/30 mb-5">Conta</p>
            <ul className="flex flex-col gap-3.5">
              {[
                { href: '/conta/pedidos', label: 'Meus pedidos' },
                { href: '/conta', label: 'Minha conta' },
              ].map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-[13px] text-paper/50 hover:text-paper transition-colors duration-150">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 4 — Legal + contato */}
          <div>
            <p className="text-[9px] font-bold tracking-[0.24em] uppercase text-paper/30 mb-5">Contato</p>
            <ul className="flex flex-col gap-3.5">
              {status && (
                <li className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${status.isOpen ? 'bg-green-400' : 'bg-paper/25'}`} />
                  <span className={`text-[13px] ${status.isOpen ? 'text-green-400/90' : 'text-paper/50'}`}>
                    {status.isOpen ? 'Aberto agora' : 'Fechado agora'}
                  </span>
                </li>
              )}
              {storeEmail && (
                <li>
                  <a href={`mailto:${storeEmail}`} className="text-[13px] text-paper/50 hover:text-paper transition-colors duration-150">
                    {storeEmail}
                  </a>
                </li>
              )}
              {[
                { href: '/privacidade', label: 'Privacidade' },
                { href: '/termos', label: 'Termos de uso' },
              ].map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-[13px] text-paper/50 hover:text-paper transition-colors duration-150">
                    {label}
                  </Link>
                </li>
              ))}
              {reclameAquiUrl && (
                <li>
                  <a href={reclameAquiUrl} target="_blank" rel="noopener noreferrer"
                    className="text-[13px] text-paper/50 hover:text-paper transition-colors duration-150">
                    ReclameAqui
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* ── Rodapé legal ── */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-7">
          <p className="text-[11px] text-paper/35">
            © {year} {storeName} · Todos os direitos reservados
          </p>
          <div className="flex items-center gap-4">
            {/* Trust seals */}            <span className="text-paper/10">·</span>
            <span className="text-[10px] font-semibold tracking-[0.1em] text-paper/25 uppercase">PIX</span>
            <span className="text-paper/10">·</span>
            <span className="text-[10px] text-paper/25 tracking-[0.16em] uppercase">{storeCity.toUpperCase().replace(', ', '\u00a0·\u00a0')}</span>
          </div>
        </div>
      </div>

    </footer>
  );
}
