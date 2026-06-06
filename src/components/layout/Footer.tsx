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

export function Footer({ storeName = 'Mikma Lençóis', storeCity = 'Blumenau, SC', footerTagline }: Props) {
  const tagline = footerTagline ?? `Produzido em ${storeCity}. Entregamos em todo o Brasil.`;
  const year = new Date().getFullYear();
  const cityFormatted = storeCity.toUpperCase().replace(', ', ' · ');

  return (
    <footer className="bg-ink text-paper/50 mt-auto">
      <div className="container-shop pt-14 pb-8">

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

        {/* Bottom bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <p className="text-xs text-paper/20">© {year} {storeName}. Todos os direitos reservados.</p>
          <p className="text-2xs text-paper/15 tracking-widest uppercase font-medium">{cityFormatted}</p>
        </div>
      </div>
    </footer>
  );
}
