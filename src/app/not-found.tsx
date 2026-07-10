import Link from 'next/link';
import { getSettings } from '@/lib/settings';

export default async function NotFound() {
  const s = await getSettings();

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center">
      <p className="font-mono text-[11px] tracking-[0.25em] uppercase text-faint mb-6">
        Erro 404
      </p>
      <h1
        className="font-display font-normal text-ink leading-none tracking-[-0.02em] mb-6 text-[clamp(4rem,12vw,9rem)]"
      >
        Ops.
      </h1>
      <p className="text-[15px] text-mid max-w-[32ch] leading-relaxed mb-10">
        A página que você procura não existe ou foi movida.
      </p>
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <Link
          href="/produtos"
          className="inline-flex items-center justify-center h-12 px-7 bg-ink text-paper text-[13px] font-medium tracking-[0.05em] hover:bg-mid transition-colors duration-200"
        >
          Ver produtos
        </Link>
        <Link
          href="/"
          className="text-[13px] text-faint hover:text-ink transition-colors border-b border-faint-l hover:border-ink pb-px"
        >
          Voltar ao início
        </Link>
      </div>
      <p className="mt-16 font-mono text-[10px] tracking-[0.2em] uppercase text-faint-l">
        {s.storeName || 'Mikma Lençóis'} · {s.storeCity || 'Blumenau, SC'}
      </p>
    </div>
  );
}
