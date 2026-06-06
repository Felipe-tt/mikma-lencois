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
  const wa = storePhone
    ? `https://wa.me/${storePhone.replace(/\D/g, '')}`
    : null;

  return (
    <footer className="bg-ink text-paper mt-auto">

      {/* ── Corpo ── */}
      <div className="container-shop pt-14 pb-10">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-12 sm:gap-20 pb-10 border-b border-paper/10">

          {/* Marca */}
          <div className="flex flex-col gap-5 max-w-xs">
            <Image
              src="/logo-white.png"
              alt={storeName}
              width={110}
              height={55}
              className="h-9 w-auto object-contain"
            />
            <p className="text-sm text-paper/40 leading-relaxed">
              Lençóis feitos em {storeCity}.<br />
              Entregamos em todo o Brasil.
            </p>

            {/* Contato */}
            <div className="flex flex-col gap-2">
              {wa && (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2.5 text-sm text-paper/40 hover:text-emerald-400 transition-colors w-fit"
                >
                  <IconWA />
                  {storePhone}
                </a>
              )}
              {storeEmail && (
                <a
                  href={`mailto:${storeEmail}`}
                  className="inline-flex items-center gap-2.5 text-sm text-paper/40 hover:text-paper/70 transition-colors w-fit"
                >
                  <IconMail />
                  {storeEmail}
                </a>
              )}
            </div>

            {/* Redes */}
            <div className="flex gap-2 pt-1">
              <SocialBtn href="https://instagram.com/mikmalencois" label="Instagram">
                <IconInsta />
              </SocialBtn>
              {wa && (
                <SocialBtn href={wa} label="WhatsApp">
                  <IconWA />
                </SocialBtn>
              )}
            </div>
          </div>

          {/* Links — 2 colunas */}
          <div className="grid grid-cols-2 gap-x-16 gap-y-8 sm:gap-x-20 content-start">
            <NavCol title="Loja" links={[
              { href: '/produtos', label: 'Produtos' },
              { href: '/sobre', label: 'Sobre nós' },
            ]} />
            <NavCol title="Ajuda" links={[
              { href: '/conta/pedidos', label: 'Meus pedidos' },
              { href: '/privacidade', label: 'Privacidade' },
              { href: '/termos', label: 'Termos de uso' },
            ]} />
          </div>
        </div>

        {/* Rodapé legal */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-7">
          <p className="text-xs text-paper/20">
            © {year} {storeName}. Todos os direitos reservados.
          </p>
          <div className="flex items-center gap-5">
            <span className="text-xs text-paper/15 tracking-widest uppercase font-medium">
              {storeCity.toUpperCase().replace(', ', ' · ')}
            </span>
            {/* PIX único método — sem inventar outros */}
            <span className="text-xs font-bold text-emerald-500/60 tracking-wide">PIX</span>
          </div>
        </div>
      </div>

    </footer>
  );
}

function NavCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <p className="text-2xs font-bold tracking-[0.2em] uppercase text-clay mb-4">{title}</p>
      <ul className="flex flex-col gap-3">
        {links.map(({ href, label }) => (
          <li key={href}>
            <Link href={href} className="text-sm text-paper/40 hover:text-paper/75 transition-colors">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SocialBtn({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="w-9 h-9 rounded-full border border-paper/15 flex items-center justify-center text-paper/40 hover:text-paper/80 hover:border-paper/30 transition-colors"
    >
      {children}
    </a>
  );
}

function IconWA() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 shrink-0" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

function IconMail() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0" aria-hidden="true">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  );
}

function IconInsta() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
      <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/>
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
    </svg>
  );
}
