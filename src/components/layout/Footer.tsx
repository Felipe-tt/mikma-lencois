import Link from 'next/link';

const LINKS = {
  Loja:  [{ href: '/produtos', label: 'Produtos' }, { href: '/sobre', label: 'Sobre nós' }],
  Conta: [{ href: '/conta/pedidos', label: 'Meus pedidos' }, { href: '/conta', label: 'Meu perfil' }],
  Legal: [{ href: '/privacidade', label: 'Privacidade (LGPD)' }, { href: '/termos', label: 'Termos de uso' }],
};

export function Footer() {
  return (
    <footer className="bg-ink text-cream mt-auto">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 py-14">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <p className="font-display text-[20px] tracking-[0.04em] mb-2">
              Mikma{' '}
              <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-warm align-middle">Lençóis</span>
            </p>
            <p className="text-[12px] text-cream/50 leading-relaxed">
              <br />
              Garcia · Blumenau, SC
            </p>
          </div>

          {/* Link groups */}
          {Object.entries(LINKS).map(([title, items]) => (
            <div key={title}>
              <p className="text-[10px] font-semibold tracking-[0.16em] uppercase text-warm mb-4">{title}</p>
              <ul className="flex flex-col gap-2.5 list-none p-0 m-0">
                {items.map(({ href, label }) => (
                  <li key={href}>
                    <Link href={href} className="text-[13px] text-cream/65 no-underline hover:text-cream transition-colors">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-cream/10 py-5 flex items-center justify-between flex-wrap gap-2">
          <p className="text-[11px] text-cream/30 tracking-[0.04em]">
            © {new Date().getFullYear()} Mikma Lençóis. Todos os direitos reservados.
          </p>
          <p className="text-[11px] text-cream/20">Blumenau, SC · Brasil</p>
        </div>
      </div>
    </footer>
  );
}
