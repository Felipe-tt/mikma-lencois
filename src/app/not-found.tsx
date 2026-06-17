import Link from 'next/link';
import { getSettings } from '@/lib/settings';

export default async function NotFound() {
  const s = await getSettings();

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center">
      <p className="font-mono text-[11px] tracking-[0.25em] uppercase text-[#9C8878] mb-6">
        Erro 404
      </p>
      <h1
        className="font-display font-normal text-[#1E1208] leading-none tracking-[-0.02em] mb-6"
        style={{ fontSize: 'clamp(4rem, 12vw, 9rem)' }}
      >
        Ops.
      </h1>
      <p className="text-[15px] text-[#705A48] max-w-[32ch] leading-relaxed mb-10">
        A página que você procura não existe ou foi movida.
      </p>
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <Link
          href="/produtos"
          className="inline-flex items-center justify-center h-12 px-7 bg-[#1E1208] text-[#F9F6F1] text-[13px] font-medium tracking-[0.05em] hover:bg-[#7C5C3E] transition-colors duration-200"
        >
          Ver produtos
        </Link>
        <Link
          href="/"
          className="text-[13px] text-[#9C8878] hover:text-[#1E1208] transition-colors border-b border-[#D4C4AE] hover:border-[#1E1208] pb-px"
        >
          Voltar ao início
        </Link>
      </div>
      <p className="mt-16 font-mono text-[10px] tracking-[0.2em] uppercase text-[#C8B8A8]">
        {s.storeName || 'Mikma Lençóis'} · {s.storeCity || 'Blumenau, SC'}
      </p>
    </div>
  );
}
