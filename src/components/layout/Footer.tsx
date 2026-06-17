import Link from 'next/link';
import Image from 'next/image';

interface Props {
  storeName?: string;
  storeCity?: string;
  storePhone?: string;
  storeEmail?: string;
  instagramUrl?: string;
  whatsappUrl?: string;
  reclameAquiUrl?: string;
}

export function Footer({
  storeName = 'Mikma Lençóis',
  storeCity = 'Blumenau, SC',
  storePhone,
  storeEmail,
  instagramUrl,
  whatsappUrl,
  reclameAquiUrl,
}: Props) {
  const year = new Date().getFullYear();
  const wa = whatsappUrl || (storePhone ? `https://wa.me/${storePhone.replace(/\D/g, '')}` : null);
  const city = storeCity.split(',')[0];

  return (
    <footer className="bg-ink text-paper mt-auto overflow-hidden">

      {/* ── Frase editorial ── */}
      <div className="container-shop pt-16 pb-12 border-b border-paper/[0.07]">
        <p className="font-display font-normal text-paper/[0.18] text-[clamp(2.4rem,7vw,5.5rem)] leading-[1.06] tracking-tight select-none pointer-events-none">
          Feito em {city}.<br />
          <em className="text-paper/[0.28] not-italic">Dorme bem.</em>
        </p>
      </div>

      {/* ── Corpo ── */}
      <div className="container-shop py-14">
        <div className="grid grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr_1fr] gap-10 md:gap-8 lg:gap-12 pb-12 border-b border-paper/[0.07]">

          {/* Col 1 — Marca */}
          <div className="col-span-2 md:col-span-1 flex flex-col gap-5">
            <Image
              src="/logo-white.png"
              alt={storeName}
              width={800}
              height={242}
              className="h-7 w-auto object-contain opacity-80"
            />
            <p className="text-[13px] text-paper/45 leading-relaxed max-w-[20ch]">
              Lençóis de qualidade,<br />direto de fábrica.
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
            {/* Trust seals */}
            <span className="text-[10px] font-semibold tracking-[0.1em] text-paper/25 uppercase">Pagamento seguro</span>
            <span className="text-paper/10">·</span>
            <span className="text-[10px] font-semibold tracking-[0.1em] text-paper/25 uppercase">PIX</span>
            <span className="text-paper/10">·</span>
            <span className="text-[10px] text-paper/25 tracking-[0.16em] uppercase">{storeCity.toUpperCase().replace(', ', '\u00a0·\u00a0')}</span>
          </div>
        </div>
      </div>

    </footer>
  );
}
