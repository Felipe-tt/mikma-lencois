import Link from 'next/link';
import Image from 'next/image';

interface Props {
  storeName?: string;
  storeCity?: string;
  footerTagline?: string;
}

const FOOTER_COLS = [
  { title: 'Loja',  links: [{ href: '/produtos', label: 'Produtos' }, { href: '/sobre', label: 'Sobre nós' }] },
  { title: 'Conta', links: [{ href: '/conta/pedidos', label: 'Meus pedidos' }, { href: '/perfil', label: 'Meu perfil' }] },
  { title: 'Legal', links: [{ href: '/privacidade', label: 'Privacidade (LGPD)' }, { href: '/termos', label: 'Termos de uso' }] },
];

const TRUST_BADGES = [
  {
    label: 'Pagamento Seguro',
    sublabel: 'SSL 256-bit',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
  {
    label: 'PIX & Cartão',
    sublabel: 'Aprovação imediata',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
      </svg>
    ),
  },
  {
    label: 'Entrega Garantida',
    sublabel: 'Todo o Brasil',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    ),
  },
  {
    label: 'Conforme LGPD',
    sublabel: 'Seus dados protegidos',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    ),
  },
  {
    label: 'Loja Verificada',
    sublabel: 'Desde 2022',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
    ),
  },
];

const PAYMENT_ICONS = ['PIX', 'Visa', 'Master', 'Elo', 'Boleto'];

export function Footer({ storeName = 'Mikma Lençóis', storeCity = 'Blumenau, SC', footerTagline }: Props) {
  const tagline = footerTagline ?? `Produzido em ${storeCity}. Entregamos em todo o Brasil.`;
  const year = new Date().getFullYear();
  const cityFormatted = storeCity.toUpperCase().replace(', ', ' · ');

  return (
    <footer className="bg-ink text-paper/50 mt-auto">
      <div className="container-shop pt-14 pb-8">

        {/* Trust badges strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-10 pb-10 border-b border-paper/10">
          {TRUST_BADGES.map(badge => (
            <div
              key={badge.label}
              className="flex items-center gap-3 px-4 py-3 rounded bg-paper/5 border border-paper/10"
            >
              <span className="text-clay shrink-0">{badge.icon}</span>
              <div>
                <p className="text-xs font-semibold text-paper/70 leading-tight">{badge.label}</p>
                <p className="text-2xs text-paper/30 leading-tight mt-0.5">{badge.sublabel}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 pb-10 border-b border-paper/10">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Image
              src="/logo-white.png"
              alt={storeName}
              width={100}
              height={50}
              className="h-8 w-auto object-contain mb-4 opacity-80"
            />
            <p className="text-sm text-paper/35 leading-relaxed max-w-[200px]">{tagline}</p>
          </div>

          {/* Link columns */}
          {FOOTER_COLS.map(col => (
            <div key={col.title}>
              <p className="text-2xs font-semibold tracking-[0.2em] uppercase text-clay mb-5">{col.title}</p>
              <ul className="flex flex-col gap-3">
                {col.links.map(({ href, label }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="text-sm text-paper/35 hover:text-paper/70 transition-colors duration-200"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Payment methods */}
        <div className="flex flex-wrap items-center gap-2 pt-6 pb-4 border-b border-paper/5">
          <span className="text-2xs text-paper/20 uppercase tracking-wider mr-2">Pagamento:</span>
          {PAYMENT_ICONS.map(method => (
            <span
              key={method}
              className="px-2.5 py-1 text-2xs font-semibold text-paper/40 bg-paper/5 border border-paper/10 rounded tracking-wide"
            >
              {method}
            </span>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-5">
          <p className="text-xs text-paper/20">© {year} {storeName}. Todos os direitos reservados.</p>
          <p className="text-2xs text-paper/15 tracking-widest uppercase font-medium">{cityFormatted}</p>
        </div>
      </div>
    </footer>
  );
}
