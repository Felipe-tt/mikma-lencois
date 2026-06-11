import { getSettings } from '@/lib/settings';

export default async function SobrePage() {
  const s = await getSettings();

  return (
    <div>
      <div className="page-header">
        <div className="container-shop">
          <span className="eyebrow mb-3 block">Nossa história</span>
          <h1 className="font-display font-normal text-ink text-4xl sm:text-5xl lg:text-6xl">
            Sobre a<br/><em className="text-clay not-italic">{s.storeName}</em>
          </h1>
        </div>
      </div>

      <div className="container-shop py-16 sm:py-24">
        <div className="grid lg:grid-cols-[1fr_380px] gap-16 lg:gap-24 items-start">

          {/* Text */}
          <div className="flex flex-col gap-6">
            {[s.aboutPara1, s.aboutPara2, s.aboutPara3].filter(Boolean).map((para, i) => (
              <p key={i} className={`leading-relaxed text-mid ${i === 0 ? 'text-xl font-normal' : 'text-[15px]'}`}>
                {para}
              </p>
            ))}
          </div>

          {/* Sidebar stats + address */}
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 divide-y divide-mist border border-mist">
              {[
                { label: 'Localização', value: s.storeCity },
                { label: 'Entrega local', value: 'Até 1 hora' },
                { label: 'Cobertura', value: 'Todo o Brasil' },
              ].map(({ label, value }) => (
                <div key={label} className="px-6 py-5">
                  <p className="text-2xs font-bold tracking-[0.2em] uppercase text-clay mb-2">{label}</p>
                  <p className="font-display text-2xl text-ink font-normal">{value}</p>
                </div>
              ))}
            </div>

            {s.storeAddress && (
              <div className="bg-warm border border-mist px-6 py-5">
                <p className="text-2xs font-bold tracking-[0.2em] uppercase text-clay mb-3">Endereço</p>
                <address className="text-sm text-mid leading-relaxed not-italic">
                  {s.storeAddress}<br/>
                  {s.storeNeighborhood && <>{s.storeNeighborhood} · </>}{s.storeCity}<br/>
                  {s.storeCep && <>CEP {s.storeCep}</>}
                </address>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
