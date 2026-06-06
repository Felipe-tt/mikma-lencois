import Link from 'next/link';
import Image from 'next/image';

interface Props {
  storeName?: string;
  storeCity?: string;
  storePhone?: string;
  storeEmail?: string;
}

export function Footer({
  storeName = 'Mikma Lençóis',
  storeCity = 'Blumenau, SC',
  storePhone,
  storeEmail,
}: Props) {
  const year = new Date().getFullYear();
  const wa = storePhone ? `https://wa.me/${storePhone.replace(/\D/g, '')}` : null;

  return (
    <footer className="bg-ink text-paper mt-auto overflow-hidden">

      {/* ── Frase editorial grande ── */}
      <div className="container-shop pt-16 pb-12 border-b border-paper/8">
        <p className="font-display font-normal text-paper/10 text-[clamp(2.5rem,8vw,6rem)] leading-[1.05] tracking-tight select-none pointer-events-none">
          Feito em {storeCity.split(',')[0]}.<br />
          <em className="text-paper/20">Dorme bem.</em>
        </p>
      </div>

      {/* ── Corpo principal ── */}
      <div className="container-shop py-14">
        <div className="grid grid-cols-1 md:grid-cols-[1.8fr_1fr_1fr] gap-12 md:gap-8 lg:gap-16 pb-14 border-b border-paper/8">

          {/* Col 1 — Marca */}
          <div className="flex flex-col gap-6">
            <Image
              src="/logo-white.png"
              alt={storeName}
              width={100}
              height={50}
              className="h-8 w-auto object-contain opacity-80"
            />
            <p className="text-sm text-paper/35 leading-relaxed max-w-[22ch]">
              Lençóis de qualidade real,<br />direto de quem fabrica.
            </p>

            {/* Contato inline */}
            <div className="flex flex-col gap-1.5">
              {wa && (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-2 w-fit"
                >
                  <span className="text-xs text-paper/25 group-hover:text-paper/50 transition-colors font-medium tracking-wide uppercase">WhatsApp</span>
                  <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3 text-paper/20 group-hover:text-paper/50 transition-colors -rotate-45" stroke="currentColor" strokeWidth="1.5"><path d="M2 14L14 2M14 2H6M14 2v8"/></svg>
                </a>
              )}
              {storeEmail && (
                <a
                  href={`mailto:${storeEmail}`}
                  className="group flex items-center gap-2 w-fit"
                >
                  <span className="text-xs text-paper/25 group-hover:text-paper/50 transition-colors font-medium tracking-wide uppercase">{storeEmail}</span>
                  <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3 text-paper/20 group-hover:text-paper/50 transition-colors -rotate-45" stroke="currentColor" strokeWidth="1.5"><path d="M2 14L14 2M14 2H6M14 2v8"/></svg>
                </a>
              )}
            </div>

            {/* Redes sociais */}
            <div className="flex items-center gap-3">
              <a
                href="https://instagram.com/mikmalencois"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold tracking-[0.12em] uppercase text-paper/25 hover:text-paper/70 transition-colors"
              >
                Instagram
              </a>
              <span className="text-paper/15">·</span>
              {wa && (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold tracking-[0.12em] uppercase text-paper/25 hover:text-paper/70 transition-colors"
                >
                  WhatsApp
                </a>
              )}
            </div>
          </div>

          {/* Col 2 — Loja */}
          <div>
            <p className="text-2xs font-bold tracking-[0.22em] uppercase text-paper/20 mb-5">Loja</p>
            <ul className="flex flex-col gap-3.5">
              {[
                { href: '/produtos', label: 'Todos os produtos' },
                { href: '/sobre', label: 'Sobre nós' },
              ].map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-paper/40 hover:text-paper transition-colors duration-150">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3 — Conta & Legal */}
          <div>
            <p className="text-2xs font-bold tracking-[0.22em] uppercase text-paper/20 mb-5">Conta</p>
            <ul className="flex flex-col gap-3.5">
              {[
                { href: '/conta/pedidos', label: 'Meus pedidos' },
                { href: '/privacidade', label: 'Privacidade' },
                { href: '/termos', label: 'Termos de uso' },
              ].map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-paper/40 hover:text-paper transition-colors duration-150">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── Rodapé legal ── */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-7">
          <p className="text-xs text-paper/20">
            © {year} {storeName}
          </p>
          <p className="text-xs text-paper/15 tracking-[0.2em] uppercase">
            {storeCity.toUpperCase().replace(', ', '\u00a0·\u00a0')}
          </p>
        </div>
      </div>

    </footer>
  );
}
