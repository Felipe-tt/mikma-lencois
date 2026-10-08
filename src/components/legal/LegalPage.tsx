import type { ReactNode } from 'react';
import { LEGAL_UPDATED_LABEL, type StoreIdentity } from '@/lib/legal';

export type LegalSection = {
  id: string;
  title: string;
  body: ReactNode;
};

export function LegalPage({
  title,
  intro,
  summary,
  sections,
  footer,
}: {
  title: string;
  intro: ReactNode;
  /** Pontos-chave em linguagem simples, mostrados antes do índice. */
  summary?: string[];
  sections: LegalSection[];
  footer?: ReactNode;
}) {
  return (
    <div>
      <div className="border-b border-mist bg-warm/60">
        <div className="container-shop py-12 sm:py-16">
          <span className="eyebrow mb-3 block">Legal</span>
          <h1 className="font-display font-normal text-ink text-4xl sm:text-5xl leading-tight">
            {title}
          </h1>
          <p className="mt-4 text-[13px] text-faint">
            Última atualização: {LEGAL_UPDATED_LABEL}
          </p>
        </div>
      </div>

      <div className="container-shop py-12 pb-20">
        <div className="max-w-2xl flex flex-col gap-10">
          <P>{intro}</P>

          {summary && summary.length > 0 && (
            <aside aria-label="Em resumo" className="border-l-2 border-clay bg-warm/50 px-5 py-4">
              <p className="eyebrow mb-3">Em resumo</p>
              <ul className="flex flex-col gap-2 text-[14px] leading-relaxed text-mid">
                {summary.map(item => (
                  <li key={item} className="flex gap-2.5">
                    <span aria-hidden className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-clay" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </aside>
          )}

          <nav aria-label="Índice" className="border border-mist bg-warm/40 p-5">
            <p className="eyebrow mb-3">Índice</p>
            <ol className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 text-[14px] leading-snug">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="text-mid hover:text-ink underline-offset-2 hover:underline"
                  >
                    {i + 1}. {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="font-display font-normal text-ink text-2xl mb-4">
                {i + 1}. {s.title}
              </h2>
              <div className="flex flex-col gap-3">{s.body}</div>
            </section>
          ))}

          {footer && (
            <div className="text-[12px] text-faint border-t border-mist pt-6">{footer}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-[15px] text-mid leading-relaxed">{children}</p>;
}

export function H3({ children }: { children: ReactNode }) {
  return <h3 className="text-[15px] font-medium text-ink mt-2">{children}</h3>;
}

export function UL({ children }: { children: ReactNode }) {
  return (
    <ul className="list-disc pl-5 flex flex-col gap-2 text-[15px] text-mid leading-relaxed marker:text-faint">
      {children}
    </ul>
  );
}

export function B({ children }: { children: ReactNode }) {
  return <strong className="font-medium text-ink">{children}</strong>;
}

/** Canais de contato; só mostra o que a loja preencheu no painel. */
export function ContactList({ id }: { id: StoreIdentity }) {
  const hasAny = id.email || id.phone || id.whatsappUrl;
  if (!hasAny) {
    return <P>Os canais de atendimento estão disponíveis no rodapé do site.</P>;
  }
  return (
    <UL>
      {id.email && (
        <li>
          E-mail:{' '}
          <a href={`mailto:${id.email}`} className="text-clay underline underline-offset-2">
            {id.email}
          </a>
        </li>
      )}
      {id.phone && <li>Telefone: {id.phone}</li>}
      {id.whatsappUrl && (
        <li>
          WhatsApp:{' '}
          <a
            href={id.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-clay underline underline-offset-2"
          >
            falar com a loja
          </a>
        </li>
      )}
    </UL>
  );
}
