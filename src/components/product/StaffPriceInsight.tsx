'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { formatCurrency } from '@/lib/utils/format';
import { sitePriceCents, type SitePriceRounding } from '@/lib/sitePrice';

/**
 * Preço com raio-x para a equipe: passando o mouse (ou tocando no celular)
 * mostra o preço da loja física, o acréscimo do site, o arredondamento e a
 * diferença. Cliente vê só o preço, sem nada a mais. O preço da loja vem
 * de /api/painel/preco/[id] (não vai no HTML da loja).
 */

interface Detail { price: number; storePrice: number | null; pct: number; rounding: SitePriceRounding }

const cache = new Map<string, { at: number; data: Detail }>();
const TTL = 60_000;

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Número subindo até o valor final (respeita "reduzir movimento"). */
function useCountUp(target: number, from: number, run: boolean) {
  const [v, setV] = useState(target);
  useEffect(() => {
    if (!run || reduceMotion() || from === target) { setV(target); return; }
    let raf = 0;
    const start = performance.now();
    const dur = 750;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setV(Math.round(from + (target - from) * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    setV(from);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, from, run]);
  return v;
}

const pctText = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

function Panel({ detail, error }: { detail: Detail | null; error: string }) {
  const store = detail?.storePrice ?? null;
  const price = detail?.price ?? 0;
  const exact = store ? sitePriceCents(store, { pct: detail!.pct, rounding: 'exato' }) : 0;
  const computed = store ? sitePriceCents(store, { pct: detail!.pct, rounding: detail!.rounding }) : 0;
  const markup = store ? exact - store : 0;
  const roundUp = store ? computed - exact : 0;
  const diff = store ? price - store : 0;
  const shown = useCountUp(price, store ?? price, !!detail);

  if (error) return <p className="text-[12.5px] text-mid leading-relaxed">{error}</p>;
  if (!detail) {
    return (
      <div className="flex flex-col gap-2.5" aria-hidden="true">
        <div className="h-7 w-32 rounded-md skeleton" />
        <div className="h-2.5 w-full rounded-full skeleton" />
        <div className="h-4 w-full rounded skeleton" />
        <div className="h-4 w-3/4 rounded skeleton" />
      </div>
    );
  }

  const total = Math.max(price, computed, store ?? 0) || 1;
  const seg = (n: number) => `${Math.max(0, (n / total) * 100)}%`;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">No site hoje</p>
          <p className="font-display text-[1.75rem] leading-none text-ink tabular-nums mt-1">{formatCurrency(shown)}</p>
        </div>
        {store && diff > 0 && (
          <span className="staff-insight-chip inline-flex items-center gap-1 rounded-full bg-clay/12 text-clay px-2.5 py-1 text-[12px] font-semibold tabular-nums">
            <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M9 7h8v8" /></svg>
            {pctText((diff / store) * 100)}
          </span>
        )}
      </div>

      {store ? (
        <>
          {/* Barra: loja + acréscimo + arredondamento = preço do site */}
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-mist/60" aria-hidden="true">
            <span className="staff-insight-seg h-full bg-ink/75" style={{ width: seg(store), animationDelay: '60ms' }} />
            {markup > 0 && <span className="staff-insight-seg h-full bg-clay" style={{ width: seg(markup), animationDelay: '220ms' }} />}
            {roundUp > 0 && <span className="staff-insight-seg staff-insight-stripes h-full bg-clay-l" style={{ width: seg(roundUp), animationDelay: '360ms' }} />}
          </div>

          <dl className="flex flex-col gap-1.5 text-[12.5px]">
            <div className="staff-insight-row flex items-center justify-between gap-4" style={{ animationDelay: '120ms' }}>
              <dt className="flex items-center gap-2 text-mid"><span aria-hidden="true" className="w-2 h-2 rounded-full bg-ink/75" />Loja física</dt>
              <dd className="tabular-nums text-ink">{formatCurrency(store)}</dd>
            </div>
            <div className="staff-insight-row flex items-center justify-between gap-4" style={{ animationDelay: '200ms' }}>
              <dt className="flex items-center gap-2 text-mid"><span aria-hidden="true" className="w-2 h-2 rounded-full bg-clay" />Acréscimo de {pctText(detail.pct)}</dt>
              <dd className="tabular-nums text-ink">+ {formatCurrency(markup)}</dd>
            </div>
            {detail.rounding === '90' && (
              <div className="staff-insight-row flex items-center justify-between gap-4" style={{ animationDelay: '280ms' }}>
                <dt className="flex items-center gap-2 text-mid"><span aria-hidden="true" className="staff-insight-stripes w-2 h-2 rounded-full bg-clay-l" />Para terminar em ,90</dt>
                <dd className="tabular-nums text-ink">{roundUp > 0 ? `+ ${formatCurrency(roundUp)}` : <span className="text-faint">já termina em ,90</span>}</dd>
              </div>
            )}
            <div className="staff-insight-row flex items-center justify-between gap-4 border-t border-mist pt-2 mt-0.5" style={{ animationDelay: '360ms' }}>
              <dt className="font-semibold text-ink">Diferença para a loja</dt>
              <dd className="tabular-nums font-semibold text-clay">+ {formatCurrency(diff)}</dd>
            </div>
          </dl>

          {detail.pct === 0 && <p className="text-[11.5px] text-faint">Sem acréscimo: o site cobra o mesmo preço da loja.</p>}
          {computed !== price && (
            <p className="text-[11.5px] leading-relaxed rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 px-2.5 py-2">
              Pelo acréscimo atual seria {formatCurrency(computed)}. Salve as Configurações para atualizar.
            </p>
          )}
        </>
      ) : (
        <p className="text-[12.5px] text-mid leading-relaxed">
          Este produto ainda não tem o preço da loja salvo. Em Configurações → Produtos, salve o acréscimo, ou edite o produto.
        </p>
      )}
    </div>
  );
}

export function StaffPriceInsight({ productId, children }: { productId?: string; children: React.ReactNode }) {
  const { user } = useAuth();
  const staff = !!productId && (user?.role === 'seller' || user?.role === 'admin');
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [pos, setPos] = useState<{ y: number; left: number; above: boolean; arrow: number } | null>(null);
  const trigger = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  const load = useCallback(async () => {
    if (!productId || !user) return;
    const hit = cache.get(productId);
    if (hit && Date.now() - hit.at < TTL) { setDetail(hit.data); return; }
    setError('');
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/painel/preco/${encodeURIComponent(productId)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      const data = await res.json() as Detail;
      cache.set(productId, { at: Date.now(), data });
      setDetail(data);
    } catch {
      setError('Não deu para carregar o detalhe do preço agora.');
    }
  }, [productId, user]);

  const place = useCallback(() => {
    const el = trigger.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(300, window.innerWidth - 24);
    const left = Math.min(Math.max(12, r.left + r.width / 2 - width / 2), window.innerWidth - width - 12);
    const above = r.bottom + 260 > window.innerHeight && r.top > 260;
    setPos({ y: above ? window.innerHeight - r.top + 10 : r.bottom + 10, left, above, arrow: Math.min(width - 18, Math.max(18, r.left + r.width / 2 - left)) });
  }, []);

  const show = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    place();
    setOpen(true);
    void load();
  }, [load, place]);
  const hideSoon = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 140);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const onMove = () => place();
    const onDown = (e: PointerEvent) => {
      if (trigger.current?.contains(e.target as Node) || panel.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, place]);

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  if (!staff) return <>{children}</>;

  return (
    <>
      <span
        ref={trigger}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label="Ver de onde vem este preço (só a equipe vê)"
        className="staff-insight-trigger relative inline-flex items-center gap-1.5 cursor-help rounded-md -mx-1 px-1 outline-none focus-visible:ring-2 focus-visible:ring-clay/50"
        onPointerEnter={e => { if (e.pointerType === 'mouse') show(); }}
        onPointerLeave={e => { if (e.pointerType === 'mouse') hideSoon(); }}
        onClick={e => {
          // Dentro do cartão do produto (um link): o toque abre o detalhe, não a página.
          e.preventDefault();
          e.stopPropagation();
          if (open && (e.nativeEvent as PointerEvent).pointerType !== 'mouse') setOpen(false);
          else show();
        }}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (open) { setOpen(false); } else { show(); } } }}
      >
        {children}
        <span aria-hidden="true" className="staff-insight-dot" />
      </span>
      {open && pos && createPortal(
        <div
          ref={panel}
          id={id}
          role="dialog"
          aria-label="Detalhe do preço"
          onPointerEnter={() => { if (closeTimer.current) clearTimeout(closeTimer.current); }}
          onPointerLeave={e => { if (e.pointerType === 'mouse') hideSoon(); }}
          onClick={e => e.stopPropagation()}
          className={`staff-insight-panel fixed z-[80] w-[min(300px,calc(100vw-24px))] rounded-2xl border border-mist bg-paper/95 backdrop-blur-xl p-4 text-left shadow-[0_18px_50px_-12px_rgba(40,24,12,0.35)] ${pos.above ? 'staff-insight-above' : ''}`}
          style={{ ...(pos.above ? { bottom: pos.y } : { top: pos.y }), left: pos.left, ['--arrow' as string]: `${pos.arrow}px` }}
        >
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-clay mb-3">
            <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            Só a equipe vê
          </p>
          <Panel detail={detail} error={error} />
        </div>,
        document.body,
      )}
    </>
  );
}
