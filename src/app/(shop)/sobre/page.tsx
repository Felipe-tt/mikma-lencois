export const revalidate = 86400;
import { getSettings } from '@/lib/settings';
import Image from 'next/image';
import { BusinessHoursCard } from '@/components/storefront/BusinessHoursCard';

export default async function SobrePage() {
  const s = await getSettings();

  const heroLine1 = s.aboutHeroLine1 || s.storeName || 'Mikma Lençóis';
  const heroLine2 = s.aboutHeroLine2 || `em ${s.storeCity || 'Blumenau'}, SC.`;

  const stats = [
    { label: s.aboutStat1Label || 'Localização',   value: s.aboutStat1Value || s.storeCity || 'Blumenau, SC' },
    { label: s.aboutStat2Label || 'Entrega local', value: s.aboutStat2Value || 'Até 1 hora' },
    { label: s.aboutStat3Label || 'Cobertura',     value: s.aboutStat3Value || 'Todo o Brasil' },
  ];

  const timelineTitle = s.aboutTimelineTitle || 'Nossa trajetória';

  let timeline: { year: string; label: string; desc: string }[] = [];
  try { timeline = JSON.parse(s.aboutTimeline || '[]'); } catch {}
  timeline = timeline.filter(t => t.year && t.desc);

  const whatsappLabel = s.aboutWhatsappLabel || 'Falar no WhatsApp';
  const whatsappHref = s.whatsappUrl || `https://wa.me/${(s.storePhone ?? '').replace(/\D/g,'')}`;

  return (
    <div>
      {/* ── Hero ── */}
      <div className="relative overflow-hidden bg-warm border-b border-mist">
        <div className="absolute inset-0 pointer-events-none select-none">
          <img src="/sobre-bg.jpg" alt="" aria-hidden="true" className="w-full h-full object-cover object-center opacity-[0.18]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--color-warm)_0%,transparent_50%,var(--color-warm)_100%)]" />
        </div>
        <div className="container-shop py-20 sm:py-28 relative z-10">
          <div className="flex flex-col gap-6 max-w-2xl">
            <p className="page-label">Sobre nós</p>
            <h1 className="font-display font-normal leading-[1.02]">
              <em className="text-clay not-italic text-5xl sm:text-6xl lg:text-[5.5rem] block">{heroLine1}</em>
              <span className="text-ink/35 text-3xl sm:text-4xl lg:text-[3.6rem] block mt-1">{heroLine2}</span>
            </h1>
          </div>
        </div>
      </div>

      {/* ── Corpo ── */}
      <div className="container-shop section-md">
        <div className="grid lg:grid-cols-[1fr_340px] gap-16 lg:gap-24 items-start">

          {/* Texto + Timeline */}
          <div className="flex flex-col gap-12">
            {[s.aboutPara1, s.aboutPara2, s.aboutPara3].filter(Boolean).length > 0 && (
              <div className="flex flex-col gap-5">
                {[s.aboutPara1, s.aboutPara2, s.aboutPara3].filter(Boolean).map((para, i) => (
                  <p key={i} className={`leading-relaxed text-mid ${i === 0 ? 'text-[1.15rem]' : 'text-[15px]'}`}>{para}</p>
                ))}
              </div>
            )}

            {timeline.length > 0 && (
              <div>
                <p className="page-label mb-8">{timelineTitle}</p>
                <div className="relative">
                  <div className="absolute left-[50px] top-3 bottom-3 w-px bg-mist" />
                  <div className="flex flex-col gap-9">
                    {timeline.map((item, i) => (
                      <div key={i} className="flex gap-7 items-start">
                        <div className="shrink-0 w-[50px] flex flex-col items-center pt-0.5">
                          <div className="w-2.5 h-2.5 bg-clay shrink-0 relative z-10 rotate-45" />
                          <span className="font-display text-[1rem] text-clay/60 leading-none mt-2.5 font-normal tabular-nums">{item.year}</span>
                        </div>
                        <div className="pb-2 border-b border-mist/60 flex-1">
                          <p className="text-[11px] font-bold tracking-[0.12em] uppercase text-ink mb-1.5">{item.label}</p>
                          <p className="text-[14px] text-mid leading-relaxed">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-4 lg:sticky lg:top-24">
            <div className="border border-mist divide-y divide-mist">
              {stats.map(({ label, value }) => (
                <div key={label} className="px-6 py-5 flex flex-col gap-1.5 hover:bg-warm transition-colors duration-150">
                  <p className="text-[9px] font-bold tracking-[0.22em] uppercase text-faint">{label}</p>
                  <p className="font-display text-[1.65rem] text-ink font-normal leading-tight">{value}</p>
                </div>
              ))}
            </div>

            <BusinessHoursCard businessHours={s.businessHours} timezone={s.businessHoursTimezone} />

            {s.storeAddress && (
              <div className="border border-mist px-6 py-5">
                <p className="text-[9px] font-bold tracking-[0.22em] uppercase text-faint mb-3">Endereço</p>
                <address className="text-[14px] text-mid leading-relaxed not-italic">
                  {s.storeAddress}{s.storeNumber && `, ${s.storeNumber}`}{s.storeComplement && ` — ${s.storeComplement}`}<br />
                  {s.storeNeighborhood && <>{s.storeNeighborhood} · </>}{s.storeCity}<br />
                  {s.storeCep && <>CEP {s.storeCep}</>}
                </address>
              </div>
            )}

            <a href={whatsappHref} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-between px-6 py-4 bg-ink text-paper hover:bg-clay transition-colors duration-200 group">
              <span className="text-[13px] font-semibold">{whatsappLabel}</span>
              <svg className="w-4 h-4 opacity-60 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </a>

            <div className="flex justify-center pt-2 pb-1">
              <Image src="/logo-dark.png" alt={s.storeName ?? ''} width={600} height={180} className="h-9 w-auto object-contain opacity-15" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
