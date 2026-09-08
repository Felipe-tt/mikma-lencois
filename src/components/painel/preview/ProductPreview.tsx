'use client';

import type { StoreSettings } from '@/lib/store-settings';

function parseTable(colsJson: string, rowsJson: string): { columns: string[]; rows: Record<string, string>[] } {
  let columns: string[] = [];
  let rows: Record<string, string>[] = [];
  try { columns = JSON.parse(colsJson || '[]'); } catch { /* ignore */ }
  try { rows = JSON.parse(rowsJson || '[]'); } catch { /* ignore */ }
  return { columns, rows };
}

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

/** Espelha src/components/product/SizeGuideModal.tsx (tabela "Guia de medidas") */
export function SizeGuidePreview({ s }: { s: StoreSettings }) {
  const { columns, rows } = parseTable(s.sizeGuideColumns, s.sizeGuideRows);
  const hasTable = columns.length > 0 && rows.length > 0;

  return (
    <div className="bg-white dark:bg-warm px-6 sm:px-10 py-10 sm:py-14">
      <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-faint mb-5">
        Como abre no botão &quot;Guia de medidas&quot; da página do produto
      </p>
      <div className="max-w-xl border border-mist rounded-sm overflow-hidden shadow-sm">
        <div className="px-6 py-5 border-b border-mist">
          <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-faint mb-1">Produto</p>
          <h3 className="font-display font-normal text-ink text-xl leading-none">Guia de medidas</h3>
        </div>

        {hasTable ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-warm border-b border-mist">
                  {columns.map(col => (
                    <th key={col} className="text-left px-5 py-3 text-[10px] font-bold tracking-[0.16em] uppercase text-faint whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-mist">
                {rows.map((row, i) => (
                  <tr key={i}>
                    {columns.map((col, j) => (
                      <td key={col} className={`px-5 py-3.5 whitespace-nowrap ${j === 0 ? 'font-semibold text-ink' : 'text-mid font-mono text-[12px]'}`}>
                        {row[col] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-10 text-center text-sm text-faint">Guia de medidas não configurado.</div>
        )}

        {s.sizeGuideNote && (
          <div className="px-6 py-4 border-t border-mist bg-warm/50">
            <p className="text-[11px] text-faint leading-relaxed">{s.sizeGuideNote}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Espelha o bloco "Guia de tamanhos" (accordion) da página do produto */
export function BedSizeGuidePreview({ s }: { s: StoreSettings }) {
  const { columns, rows } = parseTable(s.bedSizeColumns, s.bedSizeRows);
  const hasTable = columns.length > 0 && rows.length > 0;

  return (
    <div className="bg-white dark:bg-warm px-6 sm:px-10 py-10 sm:py-14">
      <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-faint mb-5">
        Como aparece (aberto) na página do produto
      </p>
      <div className="max-w-xl border-t border-mist pt-4">
        <p className="text-[12px] font-semibold text-mid tracking-[0.08em] uppercase mb-4">Guia de tamanhos</p>

        {hasTable ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr className="border-b border-mist">
                  {columns.map(h => (
                    <th key={h} className="text-left font-semibold text-[10px] tracking-[0.12em] uppercase text-faint pb-2 pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-mist/50 last:border-0">
                    {columns.map((col, j) => (
                      <td key={col} className={`py-2 pr-4 ${j === 0 ? 'font-medium text-ink' : 'text-mid'}`}>
                        {row[col] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyTableHint label="Guia de tamanhos de cama não configurado ainda." />
        )}

        <p className="text-[11px] text-faint mt-4">
          A coluna &quot;Cama&quot; também alimenta a calculadora em /guia-de-tamanhos.
        </p>
      </div>
    </div>
  );
}

// ── Ícones, cópia exata dos usados na página de produto ─────────────────────
function TruckIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
}
function PackageIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
}
function PixIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 7v10M7 12h10"/></svg>;
}
