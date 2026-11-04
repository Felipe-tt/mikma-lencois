'use client';

import { PackageContents } from '@/components/product/PackageContents';
import { packageContents, parseTable } from '@/lib/packageContents';
import type { StoreSettings } from '@/lib/store-settings';

function EmptyTableHint({ label }: { label: string }) {
  return (
    <p className="text-[12px] text-faint italic py-6 text-center border border-dashed border-[#E4DED5]">
      {label}
    </p>
  );
}

/** Espelha o bloco "Garantias" (trust signals) da página do produto */
export function ProductTrustPreview({ s }: { s: StoreSettings }) {
  const items = [
    { text: s.productTrust1 || 'Entrega local em Blumenau em até 1h', Icon: TruckIcon },
    { text: s.productTrust2 || 'Frete para todo o Brasil com rastreio', Icon: PackageIcon },
    { text: s.productTrust3 || 'Pagamento PIX com confirmação imediata', Icon: PixIcon },
  ];

  return (
    <div className="bg-white dark:bg-warm px-6 sm:px-10 py-10 sm:py-14">
      <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-faint mb-5">
        Como aparece na página do produto
      </p>
      <div className="flex flex-col gap-2.5 border-t border-mist pt-5 max-w-[420px]">
        {items.map(({ text, Icon }, i) => (
          <div key={i} className="flex items-center gap-3 text-[13px] text-mid">
            <span className="text-clay/80 shrink-0"><Icon /></span>
            <span>{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Espelha o bloco "Esta embalagem contém" da página do produto */
export function SizeGuidePreview({ s }: { s: StoreSettings }) {
  const { columns, rows } = parseTable(s.sizeGuideColumns, s.sizeGuideRows);
  const lines = packageContents(columns, rows);

  return (
    <div className="bg-white dark:bg-warm px-6 sm:px-10 py-10 sm:py-14">
      <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-faint mb-5">
        Como aparece na página do produto (cada produto mostra só os tamanhos dele)
      </p>
      <div className="max-w-xl">
        <span className="eyebrow mb-3 block">Esta embalagem contém</span>
        {lines.length > 0 ? <PackageContents lines={lines} /> : <EmptyTableHint label="Preencha as medidas do lençol e da fronha para aparecer aqui." />}
        {s.sizeGuideNote && <p className="text-[11.5px] text-faint leading-relaxed mt-3">{s.sizeGuideNote}</p>}
      </div>
    </div>
  );
}

// ── Ícones, cópia exata dos usados na página de produto ─────────────────────
function TruckIcon() {
  return <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
}
function PackageIcon() {
  return <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
}
function PixIcon() {
  return <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 7v10M7 12h10"/></svg>;
}
