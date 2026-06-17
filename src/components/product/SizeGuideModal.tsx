'use client';
import { useState } from 'react';

const SIZES = [
  { name: 'Solteiro',   lencol: '150×220 cm', fronha: '50×70 cm', capa: '150×200 cm' },
  { name: 'Casal',      lencol: '180×220 cm', fronha: '50×70 cm', capa: '180×200 cm' },
  { name: 'Queen',      lencol: '200×230 cm', fronha: '50×70 cm', capa: '200×200 cm' },
  { name: 'King',       lencol: '220×240 cm', fronha: '50×70 cm', capa: '220×200 cm' },
];

export function SizeGuideModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-clay hover:text-clay-d transition-colors uppercase tracking-[0.08em]"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M21 6H3M21 12H3M21 18H3"/><circle cx="9" cy="6" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="18" r="1" fill="currentColor"/>
        </svg>
        Guia de medidas
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full sm:max-w-lg bg-paper"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-mist">
              <div>
                <p className="eyebrow mb-1">Produto</p>
                <h3 className="font-display font-normal text-ink text-xl">Guia de medidas</h3>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-faint hover:text-ink transition-colors p-1"
                aria-label="Fechar"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-warm">
                    <th className="text-left px-6 py-3 text-[10px] font-bold tracking-[0.16em] uppercase text-faint">Tamanho</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold tracking-[0.16em] uppercase text-faint">Lençol</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold tracking-[0.16em] uppercase text-faint">Fronha</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold tracking-[0.16em] uppercase text-faint">Capa duvet</th>
                  </tr>
                </thead>
                <tbody>
                  {SIZES.map((s, i) => (
                    <tr key={s.name} className={i < SIZES.length - 1 ? 'border-b border-mist' : ''}>
                      <td className="px-6 py-3.5 font-semibold text-ink">{s.name}</td>
                      <td className="px-4 py-3.5 text-mid font-mono text-[12px]">{s.lencol}</td>
                      <td className="px-4 py-3.5 text-mid font-mono text-[12px]">{s.fronha}</td>
                      <td className="px-4 py-3.5 text-mid font-mono text-[12px]">{s.capa}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer note */}
            <div className="px-6 py-4 border-t border-mist bg-warm/50">
              <p className="text-[11px] text-faint leading-relaxed">
                Medidas podem variar ±2 cm após lavagem. Recomendamos lavar antes do primeiro uso.
                Dúvidas? <a href="https://wa.me/" target="_blank" rel="noopener noreferrer" className="text-clay font-medium hover:text-clay-d transition-colors">Fale conosco no WhatsApp</a>.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
