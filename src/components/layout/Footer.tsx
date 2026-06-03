import Link from 'next/link';

export function Footer() {
  return (
    <footer className="bg-stone-900 text-stone-400 mt-auto">
      <div className="container-shop py-14">
        <div className="grid grid-cols-2 md:grid-cols-[2fr_1fr_1fr_1fr] gap-10">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <p className="font-display text-xl text-stone-100 mb-1">Mikma</p>
            <p className="text-2xs tracking-[0.2em] uppercase text-gold-500 mb-4">Lençóis · Blumenau</p>
            <p className="text-sm leading-relaxed text-stone-500">
              Fios selecionados, acabamento cuidadoso,<br />
              direto da nossa fábrica para sua casa.
            </p>
          </div>

          <div>
            <p className="eyebrow text-stone-500 mb-4">Loja</p>
            <FooterLinks links={[
              { href: '/produtos', label: 'Produtos' },
              { href: '/sobre', label: 'Sobre nós' },
            ]} />
          </div>

          <div>
            <p className="eyebrow text-stone-500 mb-4">Conta</p>
            <FooterLinks links={[
              { href: '/conta/pedidos', label: 'Meus pedidos' },
              { href: '/perfil', label: 'Meu perfil' },
            ]} />
          </div>

          <div>
            <p className="eyebrow text-stone-500 mb-4">Legal</p>
            <FooterLinks links={[
              { href: '/privacidade', label: 'Privacidade (LGPD)' },
              { href: '/termos', label: 'Termos de uso' },
            ]} />
          </div>
        </div>
      </div>

      <div className="border-t border-stone-800">
        <div className="container-shop py-5 flex flex-wrap justify-between gap-2 items-center">
          <p className="text-xs text-stone-600">
            © {new Date().getFullYear()} Mikma Lençóis. Todos os direitos reservados.
          </p>
          <p className="text-xs text-stone-700 uppercase tracking-widest">Blumenau · SC</p>
        </div>
      </div>
    </footer>
  );
}

function FooterLinks({ links }: { links: { href: string; label: string }[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {links.map(({ href, label }) => (
        <li key={href}>
          <Link href={href} className="text-sm text-stone-500 hover:text-stone-200 transition-colors">
            {label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
