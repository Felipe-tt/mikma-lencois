import { getSettings } from '@/lib/settings';

export default async function SobrePage() {
  const s = await getSettings();

  return (
    <div>
      <div className="page-header">
        <div className="container-shop">
          <span className="eyebrow mb-3 block">Nossa história</span>
          <h1 className="font-display font-normal text-ink" style={{fontSize:'clamp(2.5rem,6vw,4.5rem)'}}>
            Sobre a<br/><em className="text-clay">{s.storeName}</em>
          </h1>
        </div>
      </div>

      <div className="container-shop py-16 max-w-3xl">
        <div className="flex flex-col gap-8 mb-16">
          <p className="text-lg text-mid leading-relaxed">{s.aboutPara1}</p>
          <p className="text-base text-mid leading-relaxed">{s.aboutPara2}</p>
          <p className="text-base text-mid leading-relaxed">{s.aboutPara3}</p>
        </div>

        <div className="grid grid-cols-3 gap-px bg-mist mb-12">
          {[
            { label:'Localização', value: s.storeCity },
            { label:'Entrega local', value: 'Até 1 hora' },
            { label:'Cobertura', value: 'Todo o Brasil' },
          ].map(({label,value}) => (
            <div key={label} className="bg-paper px-6 py-8">
              <p className="text-2xs font-bold tracking-[0.2em] uppercase text-clay mb-3">{label}</p>
              <p className="font-display text-2xl text-ink font-normal">{value}</p>
            </div>
          ))}
        </div>

        {s.storeAddress && (
          <div className="bg-warm border border-mist p-8">
            <p className="text-2xs font-bold tracking-[0.2em] uppercase text-clay mb-4">Endereço</p>
            <address className="text-base text-mid leading-relaxed not-italic">
              {s.storeAddress}<br/>
              {s.storeNeighborhood && <>{s.storeNeighborhood} · </>}{s.storeCity}<br/>
              {s.storeCep && <>CEP {s.storeCep}</>}
            </address>
          </div>
        )}
      </div>
    </div>
  );
}
