'use client';

import type { StoreSettings } from '@/lib/store-settings';

/** Espelha src/components/layout/Footer.tsx */
export function FooterPreview({ s }: { s: StoreSettings }) {
  const year = new Date().getFullYear();
  const storeName = s.storeName || 'Mikma Lençóis';
  const wa = s.whatsappUrl || (s.storePhone ? `https://wa.me/${s.storePhone.replace(/\D/g, '')}` : null);

  return (
    <footer className="bg-[#1E1208] text-[#FAF8F5]">
      <div className="px-6 sm:px-10 py-10 border-t border-[#FAF8F5]/[0.07]">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 pb-9 border-b border-[#FAF8F5]/[0.07]">

          <div className="col-span-2 sm:col-span-1 flex flex-col gap-4">
            <div className="h-5 w-24 bg-[#FAF8F5]/15 rounded-sm" />
            <p className="text-[12px] text-[#FAF8F5]/45 leading-relaxed max-w-[20ch]">
              {s.storeSlogan}
            </p>
            {(s.instagramUrl || wa) && (
              <div className="flex items-center gap-3 mt-1">
                {s.instagramUrl && <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#FAF8F5]/40">Instagram</span>}
                {wa && <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#FAF8F5]/40">WhatsApp</span>}
              </div>
            )}
          </div>

          <div>
            <p className="text-[8px] font-bold tracking-[0.24em] uppercase text-[#FAF8F5]/30 mb-4">Loja</p>
            <ul className="flex flex-col gap-2.5">
              <li className="text-[12px] text-[#FAF8F5]/50">Produtos</li>
              <li className="text-[12px] text-[#FAF8F5]/50">Sobre nós</li>
            </ul>
          </div>

          <div>
            <p className="text-[8px] font-bold tracking-[0.24em] uppercase text-[#FAF8F5]/30 mb-4">Conta</p>
            <ul className="flex flex-col gap-2.5">
              <li className="text-[12px] text-[#FAF8F5]/50">Meus pedidos</li>
              <li className="text-[12px] text-[#FAF8F5]/50">Minha conta</li>
            </ul>
          </div>

          <div>
            <p className="text-[8px] font-bold tracking-[0.24em] uppercase text-[#FAF8F5]/30 mb-4">Contato</p>
            <ul className="flex flex-col gap-2.5">
              {s.storeEmail && <li className="text-[12px] text-[#FAF8F5]/50">{s.storeEmail}</li>}
              <li className="text-[12px] text-[#FAF8F5]/50">Privacidade</li>
              <li className="text-[12px] text-[#FAF8F5]/50">Termos de uso</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <p className="text-[10px] text-[#FAF8F5]/35">
            © {year} {storeName} · Todos os direitos reservados
          </p>
          <div className="flex items-center gap-3">
            <span className="text-[9px] font-semibold tracking-[0.1em] text-[#FAF8F5]/25 uppercase">Pagamento seguro</span>
            <span className="text-[#FAF8F5]/10">·</span>
            <span className="text-[9px] font-semibold tracking-[0.1em] text-[#FAF8F5]/25 uppercase">PIX</span>
            <span className="text-[#FAF8F5]/10">·</span>
            <span className="text-[9px] text-[#FAF8F5]/25 tracking-[0.16em] uppercase">{(s.storeCity || '').toUpperCase().replace(', ', '\u00a0·\u00a0')}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
