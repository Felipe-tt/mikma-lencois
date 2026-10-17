import Image from 'next/image';
import Link from 'next/link';

// "Do fio à sua cama": o que a loja tem que as grandes não têm, a fábrica
// em Blumenau, no Vale do Itajaí, berço da indústria têxtil do país.
export function OriginSection({ city, foundedYear }: { city: string; foundedYear?: string | number }) {
  const steps = [
    { title: 'Tecido escolhido a dedo', text: 'Só entra o que a gente usaria na própria cama: toque, gramatura e caimento.' },
    { title: `Cortado e costurado em ${city}`, text: 'Feito na nossa fábrica, no coração do Vale do Itajaí, terra de tradição têxtil.' },
    { title: 'Conferido peça por peça', text: 'Costura, medidas e acabamento revisados antes de embalar.' },
    { title: 'Direto para a sua casa', text: 'Sem intermediário: da fábrica para você, com rastreio do começo ao fim.' },
  ];
  return (
    <section aria-labelledby="origem-titulo" className="bg-paper">
      <div className="container-shop py-20 sm:py-28 grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-20 items-center">
        {/* A foto da fachada é azulada e tem grafismos: em tons de cinza com
            um véu terracota ela entra na paleta da loja sem deixar de ser a
            fábrica de verdade. */}
        <div className="relative aspect-[4/3] lg:aspect-[5/4] rounded-3xl overflow-hidden bg-warm isolate">
          <Image src="/sobre-bg.jpg" alt={`Fachada da fábrica Mikma em ${city}`} fill sizes="(min-width: 1024px) 46vw, 100vw" className="object-cover object-[52%_62%] scale-[1.35] grayscale contrast-[1.08] brightness-[1.02]" />
          <div aria-hidden="true" className="absolute inset-0 bg-[#C98A5E] mix-blend-multiply opacity-45" />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
          <p className="absolute left-4 bottom-4 sm:left-6 sm:bottom-6 inline-flex items-center gap-2 rounded-full bg-paper/85 backdrop-blur-md px-3.5 py-2 text-[12px] font-medium text-ink shadow-sm">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-clay"><path d="M12 22s-7-6.2-7-12a7 7 0 0114 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>
            {city}, Santa Catarina
          </p>
        </div>

        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-clay mb-4">
            Nossa fábrica{foundedYear ? ` · desde ${foundedYear}` : ''}
          </p>
          <h2 id="origem-titulo" className="font-display font-normal text-ink leading-[1.05] tracking-[-0.02em] text-[clamp(2rem,4vw,3.2rem)]">
            Do tecido <em className="text-clay">à sua cama.</em>
          </h2>
          <p className="mt-4 text-[15px] text-mid leading-relaxed max-w-[48ch]">
            A gente faz o que vende. Por isso dá para cuidar de cada detalhe e cobrar um preço justo.
          </p>

          <ol className="mt-10">
            {steps.map((s, i) => (
              // Cada passo desenha a linha até o próximo: a linha única
              // passava do último círculo.
              <li key={s.title} className="relative flex gap-5 pb-7 last:pb-0">
                {i < steps.length - 1 && <span aria-hidden="true" className="absolute left-[15.5px] top-8 bottom-0 w-px bg-mist" />}
                <span className="relative z-10 w-8 h-8 shrink-0 rounded-full bg-paper border border-mist-d text-[12px] font-semibold text-clay flex items-center justify-center tabular-nums">
                  {i + 1}
                </span>
                <div className="pt-1">
                  <h3 className="font-sans text-[15px] font-semibold text-ink">{s.title}</h3>
                  <p className="mt-1 text-[14px] text-mid leading-relaxed">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>

          <Link href="/sobre" className="mt-10 inline-flex items-center gap-2 h-11 px-6 rounded-full border border-ink text-ink text-[13px] font-medium hover:bg-ink hover:text-paper transition-colors duration-200">
            Conheça nossa história
          </Link>
        </div>
      </div>
    </section>
  );
}
