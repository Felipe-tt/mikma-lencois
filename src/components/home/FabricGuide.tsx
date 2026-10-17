import Link from 'next/link';
import { MoonPhase } from './MoonPhase';

// Como cada tecido é na cama, em palavras de quem dorme e não em número de
// fios. Só aparecem os tecidos que existem no catálogo; um tecido novo sem
// descrição aqui entra com o texto genérico.
const FABRICS: { family: string; match: RegExp; feel: string; text: string; traits: string[] }[] = [
  { family: 'Percal', match: /percal/i, feel: 'Fresco e sequinho',
    text: 'Trama bem fechada, toque seco e fosco. Para quem sente calor à noite e gosta de lençol “de hotel”.',
    traits: ['Respira bem', 'Toque seco', 'Fica mais macio a cada lavagem'] },
  { family: 'Malha', match: /malha/i, feel: 'Macio como camiseta',
    text: 'Tecido de malha, com elasticidade: abraça o colchão e quase não amassa. Aconchegante o ano todo.',
    traits: ['Não precisa passar', 'Estica no colchão', 'Toque macio'] },
  { family: 'Cetim', match: /cetim|acetinad|sateen/i, feel: 'Liso e com brilho suave',
    text: 'Fios na superfície deixam o toque escorregadio e um brilho discreto. Um pouco mais quente que o percal.',
    traits: ['Toque sedoso', 'Brilho suave', 'Cai bem na cama'] },
  { family: 'Flanela', match: /flanela/i, feel: 'Quentinho de inverno',
    text: 'Fibras levantadas que seguram o calor. Para as noites frias do Sul.',
    traits: ['Aquece', 'Toque felpudo', 'Ideal no inverno'] },
  { family: 'Microfibra', match: /microfibra|micro/i, feel: 'Leve e prático',
    text: 'Fibra fina e leve, seca rápido e mantém a cor por muito tempo.',
    traits: ['Seca rápido', 'Não desbota', 'Leve'] },
  { family: 'Linho', match: /linho/i, feel: 'Natural e arejado',
    text: 'Textura rústica e muito fresca, que fica mais bonita com o uso.',
    traits: ['Muito fresco', 'Textura natural', 'Visual despojado'] },
  { family: 'Algodão', match: /algod/i, feel: 'Natural e respirável',
    text: 'Fibra natural, confortável em qualquer estação e fácil de cuidar.',
    traits: ['Respira bem', 'Fibra natural', 'Fácil de lavar'] },
];

const GENERIC = { feel: 'Conforto para todo dia', text: 'Escolhido a dedo para durar e ficar gostoso na pele.', traits: ['Durável', 'Confortável'] };

export function FabricGuide({ fabrics }: { fabrics: string[] }) {
  // Agrupa variações do mesmo tecido ("Percal 200 fios" e "Percal 300
  // fios" viram um cartão só de Percal); a busca pelo nome da família
  // encontra todas.
  const seen = new Set<string>();
  const items: { name: string; feel: string; text: string; traits: string[] }[] = [];
  for (const raw of fabrics) {
    const known = FABRICS.find(f => f.match.test(raw));
    const name = known?.family ?? raw;
    if (seen.has(name)) continue;
    seen.add(name);
    items.push({ name, ...(known ?? GENERIC) });
    if (items.length === 4) break;
  }
  if (items.length < 2) return null;
  // Fases da lua de crescente a cheia, uma por cartão.
  const phases = items.length === 2 ? [0.15, 0.5] : items.length === 3 ? [0.12, 0.3, 0.5] : [0.1, 0.22, 0.34, 0.5];

  return (
    <section aria-labelledby="tecidos-titulo" className="bg-warm/60 border-y border-mist">
      <div className="container-shop py-20 sm:py-28">
        <div className="max-w-2xl mb-10 sm:mb-14">
          <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-clay mb-4">Guia de tecidos</p>
          <h2 id="tecidos-titulo" className="font-display font-normal text-ink leading-[1.05] tracking-[-0.02em] text-[clamp(2rem,4vw,3.2rem)]">
            Qual tecido combina <em className="text-clay">com o seu sono?</em>
          </h2>
          <p className="mt-4 text-[15px] text-mid leading-relaxed max-w-[52ch]">
            Cada tecido muda o jeito de dormir. Sente calor, sente frio, odeia passar roupa? Comece por aqui.
          </p>
        </div>

        {/* No celular os cartões rolam de lado (empilhados viravam uma
            parede de texto); a partir do tablet, grade. */}
        <ul className={`-mx-5 px-5 sm:mx-0 sm:px-0 flex sm:grid sm:grid-cols-2 gap-3 sm:gap-4 overflow-x-auto sm:overflow-visible snap-x snap-mandatory scroll-px-5 scrollbar-none pb-2 sm:pb-0 ${items.length >= 4 ? 'lg:grid-cols-4' : items.length === 3 ? 'lg:grid-cols-3' : ''}`}>
          {items.map((f, i) => (
            <li key={f.name} className="snap-start shrink-0 w-[80%] sm:w-auto">
              <Link
                href={`/produtos?q=${encodeURIComponent(f.name)}`}
                className="group h-full flex flex-col rounded-2xl border border-mist bg-paper p-6 sm:p-7 hover:border-mist-d hover:shadow-[0_22px_44px_-30px_rgba(30,18,8,0.45)] hover:-translate-y-0.5 transition-[border-color,box-shadow,transform] duration-300"
              >
                <MoonPhase phase={phases[i]} size={40} className="text-clay mb-7 transition-transform duration-500 group-hover:rotate-[-12deg]" />
                <p className="text-[11px] font-semibold tracking-[0.12em] uppercase text-faint">{f.feel}</p>
                <h3 className="mt-1.5 font-display font-normal text-ink text-[1.75rem] leading-tight first-letter:uppercase">{f.name}</h3>
                <p className="mt-3 text-[14px] text-mid leading-relaxed">{f.text}</p>
                <ul className="mt-5 flex flex-wrap gap-1.5" aria-label={`Características do ${f.name}`}>
                  {f.traits.map(t => (
                    <li key={t} className="rounded-full bg-warm px-2.5 py-1 text-[11.5px] text-mid">{t}</li>
                  ))}
                </ul>
                <span className="mt-auto pt-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink">
                  Ver peças em {f.name.toLowerCase()}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
