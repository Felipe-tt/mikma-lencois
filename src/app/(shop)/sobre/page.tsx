import { getSettings } from '@/lib/settings';

export default async function SobrePage() {
  const s = await getSettings();

  return (
    <div>
      {/* Header — clean, sem bg separado */}
      <div className="border-b border-mist">
        <div className="container-shop py-16 sm:py-24">
          <span className="eyebrow mb-5 block">Nossa história</span>
          <h1 className="font-display font-normal text-ink text-5xl sm:text-6xl lg:text-[5.5rem] leading-[1.02] max-w-2xl">
            Sobre a<br/><em className="text-clay not-italic">{s.storeName}</em>
          </h1>
        </div>
      </div>

      <div className="container-shop section-md">
        <div className="grid lg:grid-cols-[1fr_360px] gap-16 lg:gap-28 items-start">

          {/* Texto editorial */}
          <div className="flex flex-col gap-7">
            {[s.aboutPara1, s.aboutPara2, s.aboutPara3].filter(Boolean).map((para, i) => (
              <p key={i} className={`leading-relaxed text-mid ${i === 0 ? 'text-xl' : 'text-[15px]'}`}>
                {para}
              </p>
            ))}
          </div>

          {/* Stats + endereço */}
          <div className="flex flex-col gap-5 lg:sticky lg:top-24">
            {/* Stats com valores grandes */}
            <div className="border border-mist divide-y divide-mist">
              {[
                { label: 'Localização',   value: s.storeCity ?? 'Blumenau, SC' },
                { label: 'Entrega local', value: 'Até 1 hora' },
                { label: 'Cobertura',     value: 'Todo o Brasil' },
              ].map(({ label, value }) => (
                <div key={label} className="px-6 py-5 flex flex-col gap-1.5 group hover:bg-warm transition-colors duration-150">
                  <p className="text-[9px] font-bold tracking-[0.22em] uppercase text-faint">{label}</p>
                  <p className="font-display text-[1.6rem] text-ink font-normal leading-tight">{value}</p>
                </div>
              ))}
            </div>

            {/* Endereço */}
            {s.storeAddress && (
              <div className="border border-mist px-6 py-5">
                <p className="text-[9px] font-bold tracking-[0.22em] uppercase text-faint mb-3">Endereço</p>
                <address className="text-[14px] text-mid leading-relaxed not-italic">
                  {s.storeAddress}<br/>
                  {s.storeNeighborhood && <>{s.storeNeighborhood} · </>}{s.storeCity}<br/>
                  {s.storeCep && <>CEP {s.storeCep}</>}
                </address>
              </div>
            )}

            {/* CTA */}
            <a
              href={s.whatsappUrl || `https://wa.me/${(s.storePhone ?? '').replace(/\D/g,'')}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-between px-6 py-4 bg-ink text-paper group hover:bg-clay transition-colors duration-150"
            >
              <span className="text-[13px] font-semibold">Falar no WhatsApp</span>
              <svg className="transition-transform duration-150 group-hover:translate-x-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
