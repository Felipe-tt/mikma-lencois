import Link from 'next/link';
import Image from 'next/image';

interface Props {
  storeName?: string;
  storeCity?: string;
  footerTagline?: string;
}

export function Footer({ storeName = 'Mikma Lençóis', storeCity = 'Blumenau, SC', footerTagline }: Props) {
  const tagline = footerTagline ?? `Produzido em ${storeCity}. Entregamos em todo o Brasil.`;

  return (
    <footer className="bg-ink text-paper/50 mt-auto">
      <div className="container-shop pt-16 pb-10">
        <div className="grid grid-cols-2 md:grid-cols-[1fr_auto_auto_auto] gap-12 pb-12 border-b border-paper/10">
          <div className="col-span-2 md:col-span-1">
            <div className="mb-4">
              <Image src="/logo-white.png" alt={storeName} width={120} height={60} className="h-10 w-auto object-contain" />
            </div>
            <p className="text-sm text-paper/40 leading-relaxed max-w-[220px]">{tagline}</p>
          </div>

          {[
            { title: 'Loja', links: [{href:'/produtos',label:'Produtos'},{href:'/sobre',label:'Sobre nós'}] },
            { title: 'Conta', links: [{href:'/conta/pedidos',label:'Meus pedidos'},{href:'/perfil',label:'Meu perfil'}] },
            { title: 'Legal', links: [{href:'/privacidade',label:'Privacidade (LGPD)'},{href:'/termos',label:'Termos de uso'}] },
          ].map(col => (
            <div key={col.title}>
              <p className="text-2xs font-semibold tracking-[0.2em] uppercase text-clay mb-5">{col.title}</p>
              <ul className="flex flex-col gap-3">
                {col.links.map(({href,label}) => (
                  <li key={href}>
                    <Link href={href} className="text-sm text-paper/40 hover:text-paper/80 transition-colors duration-200">{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <p className="text-xs text-paper/25">© {new Date().getFullYear()} {storeName}. Todos os direitos reservados.</p>
          <p className="text-xs text-paper/20 tracking-widest uppercase font-medium">{storeCity.toUpperCase().replace(', ', ' · ')}</p>
        </div>
      </div>
    </footer>
  );
}
