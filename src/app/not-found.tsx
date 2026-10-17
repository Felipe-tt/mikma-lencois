import Image from 'next/image';
import Link from 'next/link';
import { getSettings } from '@/lib/settings';
import { BrandLogo } from '@/components/BrandLogo';

// Fica fora do layout da loja (sem header/rodapé), então traz o próprio
// logo pra pessoa ter por onde voltar. A lua grande e apagada no fundo é
// a mesma do login/cadastro, centralizada atrás do texto.
export default async function NotFound() {
  const s = await getSettings();

  return (
    <div className="relative min-h-screen bg-paper flex flex-col overflow-hidden">
      <Image
        src="/logo-moon-transparent.png"
        alt=""
        width={400}
        height={400}
        aria-hidden="true"
        className="pointer-events-none select-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[86vw] max-w-[560px] h-auto object-contain opacity-[0.06] dark:opacity-[0.05]"
      />

      <header className="relative z-10 container-shop pt-8 sm:pt-10">
        <Link href="/" aria-label="Página inicial" className="inline-block">
          <BrandLogo alt="Mikma" className="h-8 w-auto object-contain" />
        </Link>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-16 text-center animate-fade-up">
        <p className="flex items-center gap-3 font-mono text-[10px] tracking-[0.26em] uppercase text-faint mb-7">
          <span className="h-px w-8 bg-clay/60" aria-hidden="true" />
          Erro 404
          <span className="h-px w-8 bg-clay/60" aria-hidden="true" />
        </p>
        <h1 className="font-display font-normal text-ink leading-[0.95] tracking-[-0.02em] text-[clamp(3.4rem,10vw,7.5rem)]">
          Ops, <em className="text-clay">sumiu.</em>
        </h1>
        <p className="text-[15px] text-mid max-w-[34ch] leading-relaxed text-balance mt-6 mb-10">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-5">
          <Link href="/produtos" className="btn-primary px-8 py-3.5 text-[13px]">
            Ver produtos
          </Link>
          <Link
            href="/"
            className="text-[13px] text-mid hover:text-ink transition-colors border-b border-mist-d hover:border-ink pb-px"
          >
            Voltar ao início
          </Link>
        </div>
      </main>

      <footer className="relative z-10 pb-8 text-center font-mono text-[10px] tracking-[0.2em] uppercase text-faint">
        {s.storeName || 'Mikma Lençóis'} · {s.storeCity || 'Blumenau, SC'}
      </footer>
    </div>
  );
}
