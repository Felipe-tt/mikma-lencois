import type { ReactNode } from 'react';
import Link from 'next/link';
import { LEGAL_PAGES, LEGAL_UPDATED_LABEL, type StoreIdentity } from '@/lib/legal';

/** Um parágrafo da seção, com uma lista opcional de tópicos logo abaixo. */
export type Clause = { text: ReactNode; items?: ReactNode[] };

export type LegalSection = {
  id: string;
  title: string;
  clauses: Clause[];
  /** Conteúdo extra depois das cláusulas (ex.: tabela). */
  after?: ReactNode;
};

export const clause = (text: ReactNode, items?: ReactNode[]): Clause => ({ text, items });

const linkCls = 'text-clay underline underline-offset-2 hover:text-clay-d transition-colors';

export function LegalPage({
  title,
  current,
  intro,
  summary,
  sections,
}: {
  title: string;
  /** Rota desta página, para destacar no menu lateral. */
  current: string;
  intro: ReactNode;
  /** "Em poucas palavras": o essencial, antes do texto completo. */
  summary?: ReactNode[];
  sections: LegalSection[];
}) {
  return (
    <div>
      <div className="container-shop pt-8 sm:pt-12 pb-8 sm:pb-10">
        <nav aria-label="Você está em" className="mb-6">
          <ol className="flex items-center gap-2 text-[12px] text-faint">
            <li>
              <Link href="/" className="hover:text-ink transition-colors">
                Início
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="text-mid">
              {title}
            </li>
          </ol>
        </nav>
        <h1 className="font-display font-normal text-ink text-4xl sm:text-5xl leading-tight">
          {title}
        </h1>
        <p className="mt-3 text-[13px] text-faint">Última atualização: {LEGAL_UPDATED_LABEL}</p>
      </div>

      <div className="border-t border-mist">
        <div className="container-shop py-10 pb-20 grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16">
          {/* Mobile: atalhos para as outras políticas */}
          <nav
            aria-label="Políticas e termos"
            className="lg:hidden flex flex-wrap gap-2"
          >
            {LEGAL_PAGES.map(p => {
              const active = p.href === current;
              return (
                <Link
                  key={p.href}
                  href={p.href}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex items-center min-h-10 rounded-full border px-4 py-2 text-[13px] transition-colors ${
                    active
                      ? 'border-ink bg-ink text-paper'
                      : 'border-mist text-mid hover:border-ink hover:text-ink'
                  }`}
                >
                  {p.label}
                </Link>
              );
            })}
          </nav>

          {/* Desktop: menu lateral fixo */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 flex flex-col gap-8">
              <nav aria-label="Políticas e termos">
                <p className="eyebrow mb-3">Políticas</p>
                <ul className="flex flex-col">
                  {LEGAL_PAGES.map(p => {
                    const active = p.href === current;
                    return (
                      <li key={p.href}>
                        <Link
                          href={p.href}
                          aria-current={active ? 'page' : undefined}
                          className={`block border-l-2 py-1.5 pl-3 text-[14px] transition-colors ${
                            active
                              ? 'border-clay font-medium text-ink'
                              : 'border-transparent text-mid hover:text-ink'
                          }`}
                        >
                          {p.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              <nav aria-label="Nesta página">
                <p className="eyebrow mb-3">Nesta página</p>
                <ol className="flex flex-col gap-1.5 text-[13px] leading-snug">
                  {sections.map(s => (
                    <li key={s.id}>
                      <a href={`#${s.id}`} className="text-mid hover:text-ink transition-colors">
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            </div>
          </aside>

          <article className="max-w-3xl min-w-0 flex flex-col gap-10">
            <p className="text-[16px] leading-[1.75] text-mid">{intro}</p>

            {summary && summary.length > 0 && (
              <aside aria-label="Em poucas palavras" className="rounded-3xl border border-mist bg-warm/50 p-5 sm:p-7">
                <p className="eyebrow mb-4">Em poucas palavras</p>
                <ul className="flex flex-col gap-3">
                  {summary.map((it, k) => (
                    <li key={k} className="flex gap-3 text-[15px] leading-relaxed text-ink/85">
                      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-[3px] shrink-0 text-clay"><path d="M5 12l5 5 9-10" /></svg>
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </aside>
            )}

            {sections.map(s => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <h2 className="font-display font-normal text-ink text-[24px] leading-snug mb-4">
                  {s.title}
                </h2>
                <div className="flex flex-col gap-4">
                  {s.clauses.map((c, j) => (
                    <div key={j} className="flex flex-col gap-2.5 text-[15.5px] leading-[1.75] text-mid">
                      <p>{c.text}</p>
                      {c.items && c.items.length > 0 && (
                        <ul className="flex flex-col gap-2">
                          {c.items.map((it, k) => (
                            <li key={k} className="flex gap-3">
                              <span aria-hidden="true" className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full bg-clay/70" />
                              <span>{it}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
                {s.after && <div className="mt-5">{s.after}</div>}
              </section>
            ))}
          </article>
        </div>
      </div>
    </div>
  );
}

export function B({ children }: { children: ReactNode }) {
  return <strong className="font-medium text-ink">{children}</strong>;
}

/** Link no estilo do site, para uso dentro das cláusulas. */
export function A({ href, children }: { href: string; children: ReactNode }) {
  const external = /^https?:\/\//.test(href);
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={linkCls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={linkCls}>
      {children}
    </Link>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto border border-mist rounded-2xl">
      <table className="w-full min-w-[34rem] text-left text-[13.5px] leading-snug">
        <thead className="bg-warm/60 text-ink">
          <tr>
            {head.map(h => (
              <th key={h} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-mist align-top">
              {r.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-mid">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Itens de contato preenchidos no painel (e-mail, telefone, WhatsApp). */
export function contactItems(id: StoreIdentity): ReactNode[] {
  const items: ReactNode[] = [];
  if (id.email) {
    items.push(
      <>
        E-mail: <A href={`mailto:${id.email}`}>{id.email}</A>
      </>,
    );
  }
  if (id.phone) items.push(<>Telefone: {id.phone}</>);
  if (id.whatsappUrl) {
    items.push(
      <>
        WhatsApp: <A href={id.whatsappUrl}>falar com a gente</A>
      </>,
    );
  }
  return items;
}

/** Cláusula padrão de contato; cai num texto neutro se nada foi preenchido. */
export function contactClause(id: StoreIdentity, lead: string): Clause {
  const items = contactItems(id);
  return items.length
    ? clause(lead, items)
    : clause('Os nossos contatos estão no rodapé do site.');
}
