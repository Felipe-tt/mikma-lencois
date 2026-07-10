'use client';

import type { StoreSettings } from '@/lib/store-settings';
import { parseBusinessHours, getOpenStatus, groupConsecutiveDays } from '@/lib/business-hours';

interface TimelineItem { year: string; label: string; desc: string }

function parseTimeline(json: string): TimelineItem[] {
  try {
    const arr = JSON.parse(json || '[]');
    return Array.isArray(arr) ? arr.filter((t: TimelineItem) => t.year && t.desc) : [];
  } catch { return []; }
}

/** Espelha src/app/(shop)/sobre/page.tsx */
export function SobrePreview({ s }: { s: StoreSettings }) {
  const heroLine1 = s.aboutHeroLine1 || s.storeName || 'Mikma Lençóis';
  const heroLine2 = s.aboutHeroLine2 || `em ${s.storeCity || 'Blumenau'}, SC.`;

  const stats = [
    { label: s.aboutStat1Label || 'Localização', value: s.aboutStat1Value || s.storeCity || 'Blumenau, SC' },
    { label: s.aboutStat2Label || 'Entrega local', value: s.aboutStat2Value || 'Até 1 hora' },
    { label: s.aboutStat3Label || 'Cobertura', value: s.aboutStat3Value || 'Todo o Brasil' },
  ];

  const timelineTitle = s.aboutTimelineTitle || 'Nossa trajetória';
  const timeline = parseTimeline(s.aboutTimeline);
  const whatsappLabel = s.aboutWhatsappLabel || 'Falar no WhatsApp';

  return (
    <div className="bg-white dark:bg-warm">
      {/* Hero */}
      <div className="relative overflow-hidden bg-paper border-b border-[#E4DED5]">
        <div className="px-6 sm:px-10 py-12 sm:py-16 relative z-10">
          <div className="flex flex-col gap-4 max-w-xl">
            <p className="text-[9px] font-bold tracking-[0.24em] uppercase text-clay-l">Sobre nós</p>
            <h1 className="font-display font-normal leading-[1.02]">
              <em className="text-clay-l not-italic block text-[clamp(1.8rem,6vw,3rem)]">{heroLine1}</em>
              <span className="text-ink/35 block mt-1 text-[clamp(1.2rem,4vw,1.9rem)]">{heroLine2}</span>
            </h1>
          </div>
        </div>
      </div>

      {/* Corpo */}
      <div className="px-6 sm:px-10 py-10 sm:py-14">
        <div className="grid lg:grid-cols-[1fr_280px] gap-10 lg:gap-14 items-start">

          {/* Texto + Timeline */}
          <div className="flex flex-col gap-9">
            {[s.aboutPara1, s.aboutPara2, s.aboutPara3].filter(Boolean).length > 0 && (
              <div className="flex flex-col gap-4">
                {[s.aboutPara1, s.aboutPara2, s.aboutPara3].filter(Boolean).map((para, i) => (
                  <p key={i} className={`leading-relaxed text-mid ${i === 0 ? 'text-[1rem]' : 'text-[13px]'}`}>{para}</p>
                ))}
              </div>
            )}

            {timeline.length > 0 && (
              <div>
                <p className="text-[9px] font-bold tracking-[0.24em] uppercase text-clay-l mb-6">{timelineTitle}</p>
                <div className="relative">
                  <div className="absolute left-[38px] top-2 bottom-2 w-px bg-[#E4DED5]" />
                  <div className="flex flex-col gap-7">
                    {timeline.map((item, i) => (
                      <div key={i} className="flex gap-5 items-start">
                        <div className="shrink-0 w-[38px] flex flex-col items-center pt-0.5">
                          <div className="w-2 h-2 bg-clay-l shrink-0 relative z-10 rotate-45" />
                          <span className="font-display text-[0.85rem] text-clay-l/60 leading-none mt-2 font-normal tabular-nums">{item.year}</span>
                        </div>
                        <div className="pb-1.5 border-b border-[#E4DED5]/60 flex-1">
                          <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-ink mb-1">{item.label}</p>
                          <p className="text-[12px] text-mid leading-relaxed">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {[s.aboutPara1, s.aboutPara2, s.aboutPara3].filter(Boolean).length === 0 && timeline.length === 0 && (
              <p className="text-[12px] text-faint italic py-6 text-center border border-dashed border-[#E4DED5]">
                Nenhum texto ou marco adicionado ainda — preencha ao lado para ver aqui.
              </p>
            )}
          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-3">
            <div className="border border-[#E4DED5] divide-y divide-[#E4DED5]">
              {stats.map(({ label, value }) => (
                <div key={label} className="px-4 py-3.5 flex flex-col gap-1">
                  <p className="text-[8px] font-bold tracking-[0.22em] uppercase text-faint">{label}</p>
                  <p className="font-display text-[1.2rem] text-ink font-normal leading-tight">{value}</p>
                </div>
              ))}
            </div>

            {(() => {
              const hours = parseBusinessHours(s.businessHours);
              const status = getOpenStatus(hours, s.businessHoursTimezone);
              const groups = groupConsecutiveDays(hours);
              return (
                <div className="border border-[#E4DED5] px-4 py-3.5">
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="text-[8px] font-bold tracking-[0.22em] uppercase text-faint">Horário de funcionamento</p>
                    <span className={`flex items-center gap-1 text-[9px] font-bold tracking-wide uppercase px-1.5 py-0.5 shrink-0 ${
                      status.isOpen ? 'bg-green-100 text-green-700' : 'bg-paper text-faint'
                    }`}>
                      <span className={`w-1 h-1 rounded-full ${status.isOpen ? 'bg-green-500' : 'bg-faint'}`} />
                      {status.isOpen ? 'Aberto' : 'Fechado'}
                    </span>
                  </div>
                  <p className="text-[11px] text-mid mb-2.5">{status.nextChangeLabel}</p>
                  <dl className="flex flex-col gap-1">
                    {groups.map(g => (
                      <div key={g.label} className="flex items-baseline justify-between gap-3 text-[11px]">
                        <dt className="text-faint shrink-0">{g.label}</dt>
                        <dd className={`text-right tabular-nums ${g.text === 'Fechado' ? 'text-faint-l' : 'text-ink'}`}>{g.text}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })()}

            {s.storeAddress && (
              <div className="border border-[#E4DED5] px-4 py-3.5">
                <p className="text-[8px] font-bold tracking-[0.22em] uppercase text-faint mb-2">Endereço</p>
                <address className="text-[12px] text-mid leading-relaxed not-italic">
                  {s.storeAddress}{s.storeNumber && `, ${s.storeNumber}`}{s.storeComplement && ` — ${s.storeComplement}`}<br />
                  {s.storeNeighborhood && <>{s.storeNeighborhood} · </>}{s.storeCity}<br />
                  {s.storeCep && <>CEP {s.storeCep}</>}
                </address>
              </div>
            )}

            <div className="flex items-center justify-between px-4 py-3 bg-ink text-paper">
              <span className="text-[12px] font-semibold">{whatsappLabel}</span>
              <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
