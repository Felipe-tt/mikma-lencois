import Link from 'next/link';

export function Footer() {
  return (
    <footer className="bg-ink text-cream mt-auto">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 py-14">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <p className="font-display text-xl tracking-[0.04em] mb-2">
              Mikma <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-warm align-middle ml-0.5">Lençóis</span>
            </p>
            <p className="text-[12px] text-cream/50 leading-relaxed">
              <br />Garcia · Blumenau, SC
            </p>
          </div>

          {/* Loja */}
          <div>
            <p className="text-[10px] font-semibold tracking-[0.16em] uppercase text-warm mb-4">Loja</p>
            <ul className="flex flex-col gap-2.5 list-none p-0 m-0">
              <li><Link href="/produtos" className="text-[13px] text-cream/60 no-underline hover:text-cream transition-colors">Produtos</Link></li>
              <li><Link href="/sobre" className="text-[13px] text-cream/60 no-underline hover:text-cream transition-colors">Sobre nós</Link></li>
            </ul>
          </div>

          {/* Conta */}
          <div>
            <p className="text-[10px] font-semibold tracking-[0.16em] uppercase text-warm mb-4">Conta</p>
            <ul className="flex flex-col gap-2.5 list-none p-0 m-0">
              <li><Link href="/conta/pedidos" className="text-[13px] text-cream/60 no-underline hover:text-cream transition-colors">Meus pedidos</Link></li>
              <li><Link href="/conta" className="text-[13px] text-cream/60 no-underline hover:text-cream transition-colors">Meu perfil</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <p className="text-[10px] font-semibold tracking-[0.16em] uppercase text-warm mb-4">Legal</p>
            <ul className="flex flex-col gap-2.5 list-none p-0 m-0">
              <li><Link href="/privacidade" className="text-[13px] text-cream/60 no-underline hover:text-cream transition-colors">Privacidade (LGPD)</Link></li>
              <li><Link href="/termos" className="text-[13px] text-cream/60 no-underline hover:text-cream transition-colors">Termos de uso</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-cream/10 py-5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-cream/30 tracking-[0.04em]">
            © {new Date().getFullYear()} Mikma Lençóis. Todos os direitos reservados.
          </p>
          <p className="text-[11px] text-cream/20">Blumenau, SC · Brasil</p>
        </div>
      </div>
    </footer>
  );
}
