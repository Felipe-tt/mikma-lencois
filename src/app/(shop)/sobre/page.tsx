import { getSettings } from '@/lib/settings';
import Image from 'next/image';

export default async function SobrePage() {
  const s = await getSettings();

  const timeline = [
    { year: s.foundedYear ?? '2018', label: 'Fundação', desc: 'A Mikma nasce em Blumenau com o objetivo de levar qualidade têxtil direto da fábrica para as casas.' },
    { year: '2020', label: 'Entrega local', desc: 'Lançamos entrega em até 1h para toda Blumenau, sem custo adicional.' },
    { year: '2022', label: 'Brasil todo', desc: 'Expandimos com frete nacional via PAC, SEDEX e transportadoras com rastreio em tempo real.' },
    { year: '2024', label: 'Loja online', desc: 'Inauguramos nossa loja virtual — compra fácil, pagamento via PIX, confirmação automática.' },
  ].filter(t => t.year && t.desc);

  return (
    <div>
      {/* ── Header ── */}
      <div className="border-b border-mist bg-warm">
        <div className="container-shop py-16 sm:py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-end">
            <h1 className="font-display font-normal text-ink text-5xl sm:text-6xl lg:text-[5rem] leading-[1.02]">
              <em className="text-clay not-italic">{s.storeName}</em><br/>
              <span className="text-ink/40 text-4xl sm:text-5xl lg:text-[3.8rem]">em Blumenau, SC.</span>
            </h1>
            <div className="flex justify-start lg:justify-end items-end">
              <Image
                src="/logo-dark.png"
                alt={s.storeName ?? 'Mikma Lençóis'}
                width={800}
                height={242}
                className="h-14 w-auto object-contain opacity-30"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="container-shop section-md">
        <div className="grid lg:grid-cols-[1fr_360px] gap-16 lg:gap-28 items-start">

          {/* Editorial text */}
          <div className="flex flex-col gap-10">
            <div className="flex flex-col gap-6">
              {[s.aboutPara1, s.aboutPara2, s.aboutPara3].filter(Boolean).map((para, i) => (
                <p key={i} className={`leading-relaxed text-mid ${i === 0 ? 'text-xl' : 'text-[15px]'}`}>
                  {para}
                </p>
              ))}
            </div>

            {/* ── Timeline ── */}
            {timeline.length > 0 && (
              <div>
                <p className="page-label mb-8">Nossa trajetória</p>
                <div className="relative">
                  {/* Vertical line */}
                  <div className="absolute left-[52px] top-2 bottom-2 w-px bg-mist" />

                  <div className="flex flex-col gap-8">
                    {timeline.map((item, i) => (
                      <div key={i} className="flex gap-6 items-start">
                        {/* Year bubble */}
                        <div className="shrink-0 w-[52px] flex flex-col items-center">
                          <div className="w-2 h-2 bg-clay shrink-0 relative z-10" />
                          <span className="font-display text-[1.1rem] text-clay/70 leading-none mt-2 font-normal">
                            {item.year}
                          </span>
                        </div>
                        {/* Content */}
                        <div className="pb-2 pt-0.5">
                          <p className="text-[12px] font-bold tracking-[0.1em] uppercase text-ink mb-1.5">{item.label}</p>
                          <p className="text-[14px] text-mid leading-relaxed">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar — stats + address + CTA */}
          <div className="flex flex-col gap-5 lg:sticky lg:top-24">
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

            <a
              href={s.whatsappUrl || `https://wa.me/${(s.storePhone ?? '').replace(/\D/g,'')}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-between px-6 py-4 bg-ink text-paper group hover:bg-clay transition-colors duration-150"
            >
              <span className="text-[13px] font-semibold">Falar no WhatsApp</span>
              
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
