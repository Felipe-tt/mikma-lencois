export const revalidate = 86400;
import { getSettings } from '@/lib/settings';
import { BrandLogo } from '@/components/BrandLogo';
import { BusinessHoursCard } from '@/components/storefront/BusinessHoursCard';
import Image from 'next/image';
import { JsonLd } from '@/components/seo/JsonLd';
import { parseBusinessHours, WEEKDAYS } from '@/lib/business-hours';
import type { Metadata } from 'next';
import { shareMeta } from '@/lib/seo';

// Sem isso a página herdava o título e a descrição da home.
export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  const name = s.storeName || 'Mikma Lençóis';
  const city = s.storeCity || 'Blumenau';
  const title = 'Sobre';
  const description = `Conheça a ${name}: lençóis de qualidade direto de fábrica em ${city}, SC, com entrega rápida na cidade e envio para todo o Brasil.`;
  return {
    title,
    description,
    alternates: { canonical: '/sobre' },
    ...shareMeta({ title: `Sobre a ${name}`, description, path: '/sobre' }),
  };
}

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

  // LocalBusiness com horário de funcionamento — Google pode mostrar
  // isso direto no resultado de busca (e no Google Maps, se o negócio
  // também estiver cadastrado lá com o mesmo nome/endereço).
  const DAY_NAME: Record<string, string> = {
    mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
    fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
  };
  const businessHours = parseBusinessHours(s.businessHours);
  const openingHoursSpecification = WEEKDAYS.flatMap(({ key }) => {
    const day = businessHours[key];
    if (day.closed) return [];
    return day.ranges.map(r => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: `https://schema.org/${DAY_NAME[key]}`,
      opens: r.open,
      closes: r.close,
    }));
  });
  const localBusinessJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: s.storeName || 'Mikma Lençóis',
    url: 'https://mikma.com.br/sobre',
    ...(s.storeCity && { address: { '@type': 'PostalAddress', addressLocality: s.storeCity, addressCountry: 'BR' } }),
    ...(s.storePhone && { telephone: s.storePhone }),
    ...(openingHoursSpecification.length > 0 && { openingHoursSpecification }),
  };

  return (
    <div>
      <JsonLd data={localBusinessJsonLd} />
      {/* ── Hero ── */}
      {/* Foto real da fábrica, nítida, com degradê escuro pro texto. Antes
          ficava com 18% de opacidade atrás do título, lavada e sem leitura. */}
      <div className="theme-locked relative overflow-hidden bg-ink">
        <div className="absolute inset-0 pointer-events-none select-none">
          <Image src="/sobre-bg.jpg" alt="Fachada da fábrica da Mikma em Blumenau" fill priority sizes="100vw" className="object-cover object-center" />
          <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(30,18,8,0.88)_0%,rgba(30,18,8,0.7)_42%,rgba(30,18,8,0.15)_100%)]" />
        </div>
        <div className="container-shop relative z-10 pt-24 pb-16 sm:pt-36 sm:pb-24 lg:pt-44 lg:pb-28">
          <div className="flex flex-col gap-6 max-w-2xl animate-fade-up">
            <p className="flex items-center gap-3 font-mono text-[10px] tracking-[0.26em] uppercase text-paper/70">
              <span className="h-px w-8 bg-clay-l" aria-hidden="true" />
              Sobre nós
            </p>
            <h1 className="font-display font-normal leading-[1.02] tracking-[-0.02em]">
              <span className="text-paper text-[2.8rem] sm:text-6xl lg:text-[5.5rem] block">{heroLine1}</span>
              <em className="text-clay-l text-[1.9rem] sm:text-4xl lg:text-[3.4rem] block mt-1">{heroLine2}</em>
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
                  <div className="absolute left-[25px] top-3 bottom-3 w-px bg-mist" />
                  <div className="flex flex-col gap-9">
                    {timeline.map((item, i) => (
                      <div key={i} className="flex gap-7 items-start">
                        <div className="shrink-0 w-[50px] flex flex-col items-center pt-0.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-clay shrink-0 relative z-10 ring-4 ring-paper" />
                          <span className="relative z-10 bg-paper px-1 py-0.5 font-display text-[1rem] text-clay/60 leading-none mt-2 font-normal tabular-nums">{item.year}</span>
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
            <div className="border border-mist rounded-2xl overflow-hidden divide-y divide-mist">
              {stats.map(({ label, value }) => (
                <div key={label} className="px-6 py-5 flex flex-col gap-1.5 hover:bg-warm transition-colors duration-150">
                  <p className="text-[9px] font-bold tracking-[0.22em] uppercase text-faint">{label}</p>
                  <p className="font-display text-[1.65rem] text-ink font-normal leading-tight">{value}</p>
                </div>
              ))}
            </div>

            <BusinessHoursCard businessHours={s.businessHours} timezone={s.businessHoursTimezone} />

            {s.storeAddress && (
              <div className="border border-mist rounded-2xl px-6 py-5">
                <p className="text-[9px] font-bold tracking-[0.22em] uppercase text-faint mb-3">Endereço</p>
                <address className="text-[14px] text-mid leading-relaxed not-italic">
                  {s.storeAddress}{s.storeNumber && `, ${s.storeNumber}`}{s.storeComplement && `, ${s.storeComplement}`}<br />
                  {s.storeNeighborhood && <>{s.storeNeighborhood} · </>}{s.storeCity}<br />
                  {s.storeCep && <>CEP {s.storeCep}</>}
                </address>
              </div>
            )}

            <a href={whatsappHref} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-between rounded-full pl-7 pr-6 py-4 bg-ink text-paper hover:bg-clay transition-colors duration-200 group">
              <span className="text-[13px] font-semibold">{whatsappLabel}</span>
              <svg className="w-4 h-4 opacity-60 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </a>

          </div>
        </div>
      </div>
    </div>
  );
}
