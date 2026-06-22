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

      {/* ── Trust bar ── */}
      <div className="border-b border-paper/[0.06]">
        <div className="container-shop py-5">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 sm:justify-between">

            {/* Selos de segurança */}
            <div className="flex flex-wrap items-center gap-5">
              {/* Site seguro */}
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-green-400 shrink-0">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  <polyline points="9 12 11 14 15 10"/>
                </svg>
                <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-paper/50">Site seguro SSL</span>
              </div>

              {/* Dados protegidos LGPD */}
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-blue-400 shrink-0">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0110 0v4"/>
                </svg>
                <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-paper/50">LGPD</span>
              </div>

              {/* Pagamento PIX */}
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-emerald-400 shrink-0">
                  <polyline points="20 12 20 22 4 22 4 12"/>
                  <rect x="2" y="7" width="20" height="5"/>
                  <line x1="12" y1="22" x2="12" y2="7"/>
                  <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/>
                  <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/>
                </svg>
                <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-paper/50">Pagamento seguro</span>
              </div>

              {/* Entrega rastreada */}
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-amber-400 shrink-0">
                  <rect x="1" y="3" width="15" height="13"/>
                  <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
                  <circle cx="5.5" cy="18.5" r="2.5"/>
                  <circle cx="18.5" cy="18.5" r="2.5"/>
                </svg>
                <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-paper/50">Entrega rastreada</span>
              </div>
            </div>

            {/* Métodos de pagamento */}
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-paper/25 uppercase tracking-wider hidden sm:block">Aceito</span>
              {/* PIX badge */}
              <div className="px-2.5 py-1 border border-paper/10 rounded-sm bg-paper/5">
                <span className="text-[11px] font-bold text-[#32BCAD] tracking-wide">PIX</span>
              </div>
              {/* Cartão */}
              <div className="px-2.5 py-1 border border-paper/10 rounded-sm bg-paper/5">
                <span className="text-[11px] font-semibold text-paper/40">Cartão</span>
              </div>
              {/* Boleto */}
              <div className="px-2.5 py-1 border border-paper/10 rounded-sm bg-paper/5">
                <span className="text-[11px] font-semibold text-paper/40">Boleto</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Corpo ── */}
      <div className="container-shop py-14 border-t border-paper/[0.07]">
        <div className="grid grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr_1fr] gap-10 md:gap-8 lg:gap-12 pb-12 border-b border-paper/[0.07]">

          {/* Col 1 — Marca */}
          <div className="col-span-2 md:col-span-1 flex flex-col gap-5">
            {/* Logo lua branca (boa em fundo escuro) */}
            <div className="flex items-center gap-3">
              <Image
                src="/logo-white.png"
                alt={storeName}
                width={200}
                height={200}
                className="h-12 w-12 object-contain rounded-full opacity-85"
              />
              <div>
                <p className="text-sm font-semibold text-paper/80 leading-tight">Mikma</p>
                <p className="text-[11px] text-paper/35 tracking-widest uppercase">Lençóis</p>
              </div>
            </div>

            <p className="text-[13px] text-paper/45 leading-relaxed max-w-[22ch]">
              {tagline || `Direto da fábrica para sua casa. ${storeCity}.`}
            </p>

            {/* Social */}
            {(instagramUrl || wa) && (
              <div className="flex items-center gap-4 mt-1">
                {instagramUrl && (
                  <a href={instagramUrl} target="_blank" rel="noopener noreferrer"
                    className="text-[11px] font-semibold tracking-[0.12em] uppercase text-paper/40 hover:text-paper transition-colors duration-150 flex items-center gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                      <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/>
                      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
                    </svg>
                    Instagram
                  </a>
                )}
                {wa && (
                  <a href={wa} target="_blank" rel="noopener noreferrer"
                    className="text-[11px] font-semibold tracking-[0.12em] uppercase text-paper/40 hover:text-paper transition-colors duration-150 flex items-center gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-green-400">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    WhatsApp
                  </a>
                )}
              </div>
            )}

            {/* Status funcionamento */}
            {status && (
              <div className="flex items-center gap-2 mt-1">
                <span className={`w-2 h-2 rounded-full shrink-0 ${status.isOpen ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]' : 'bg-paper/20'}`} />
                <span className={`text-[12px] font-medium ${status.isOpen ? 'text-green-400/90' : 'text-paper/40'}`}>
                  {status.isOpen ? 'Aberto agora' : 'Fechado no momento'}
                </span>
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

          {/* Col 4 — Contato + Legal */}
          <div>
            <p className="text-[9px] font-bold tracking-[0.24em] uppercase text-paper/30 mb-5">Contato</p>
            <ul className="flex flex-col gap-3.5">
              {storeEmail && (
                <li>
                  <a href={`mailto:${storeEmail}`} className="text-[13px] text-paper/50 hover:text-paper transition-colors duration-150">
                    {storeEmail}
                  </a>
                </li>
              )}
              {[
                { href: '/privacidade', label: 'Privacidade (LGPD)' },
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
                    className="text-[13px] text-paper/50 hover:text-paper transition-colors duration-150 flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-[#E8373F]" />
                    ReclameAqui
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* ── Emblemas de marketplace ── */}
        <div className="py-8 border-b border-paper/[0.07]">
          <p className="text-[9px] font-bold tracking-[0.24em] uppercase text-paper/20 mb-5 text-center">Compra 100% segura</p>
          <div className="flex flex-wrap items-center justify-center gap-3">

            {/* SSL / HTTPS */}
            <div className="flex items-center gap-2 px-3.5 py-2.5 border border-paper/10 bg-paper/[0.04] rounded-sm">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-green-400 shrink-0">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <polyline points="9 12 11 14 15 10"/>
              </svg>
              <div>
                <p className="text-[10px] font-bold text-paper/60 leading-none">SSL 256-bit</p>
                <p className="text-[9px] text-paper/25 leading-none mt-0.5">Conexão criptografada</p>
              </div>
            </div>

            {/* LGPD */}
            <div className="flex items-center gap-2 px-3.5 py-2.5 border border-paper/10 bg-paper/[0.04] rounded-sm">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-blue-400 shrink-0">
                <rect x="3" y="11" width="18" height="11" rx="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
              <div>
                <p className="text-[10px] font-bold text-paper/60 leading-none">LGPD</p>
                <p className="text-[9px] text-paper/25 leading-none mt-0.5">Dados protegidos</p>
              </div>
            </div>

            {/* PIX Banco Central */}
            <div className="flex items-center gap-2 px-3.5 py-2.5 border border-paper/10 bg-paper/[0.04] rounded-sm">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-[#32BCAD] shrink-0">
                <path d="M7.5 12l3 3 6-6"/><circle cx="12" cy="12" r="10"/>
              </svg>
              <div>
                <p className="text-[10px] font-bold text-[#32BCAD] leading-none">PIX</p>
                <p className="text-[9px] text-paper/25 leading-none mt-0.5">Banco Central</p>
              </div>
            </div>

            {/* Entrega rastreada */}
            <div className="flex items-center gap-2 px-3.5 py-2.5 border border-paper/10 bg-paper/[0.04] rounded-sm">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-amber-400 shrink-0">
                <rect x="1" y="3" width="15" height="13"/>
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
                <circle cx="5.5" cy="18.5" r="2.5"/>
                <circle cx="18.5" cy="18.5" r="2.5"/>
              </svg>
              <div>
                <p className="text-[10px] font-bold text-paper/60 leading-none">Rastreamento</p>
                <p className="text-[9px] text-paper/25 leading-none mt-0.5">Entrega garantida</p>
              </div>
            </div>

            {/* Trocas e devoluções */}
            <div className="flex items-center gap-2 px-3.5 py-2.5 border border-paper/10 bg-paper/[0.04] rounded-sm">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-violet-400 shrink-0">
                <polyline points="1 4 1 10 7 10"/>
                <polyline points="23 20 23 14 17 14"/>
                <path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15"/>
              </svg>
              <div>
                <p className="text-[10px] font-bold text-paper/60 leading-none">Trocas</p>
                <p className="text-[9px] text-paper/25 leading-none mt-0.5">Política clara</p>
              </div>
            </div>

            {/* ReclameAqui */}
            {reclameAquiUrl && (
              <a href={reclameAquiUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-3.5 py-2.5 border border-paper/10 bg-paper/[0.04] rounded-sm hover:border-paper/20 transition-colors">
                <span className="w-3 h-3 rounded-full bg-[#E8373F] shrink-0" />
                <div>
                  <p className="text-[10px] font-bold text-paper/60 leading-none">ReclameAqui</p>
                  <p className="text-[9px] text-paper/25 leading-none mt-0.5">Reputação verificada</p>
                </div>
              </a>
            )}

          </div>
        </div>

        {/* ── Rodapé legal ── */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-7">
          <p className="text-[11px] text-paper/30">
            © {year} {storeName} · Todos os direitos reservados
          </p>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-paper/20 tracking-[0.16em] uppercase">
              {storeCity.toUpperCase().replace(', ', '\u00a0·\u00a0')}
            </span>
            <span className="text-paper/10">·</span>
            <span className="text-[10px] text-paper/20 tracking-wider">CNPJ em breve</span>
          </div>
        </div>
      </div>

    </footer>
  );
}
