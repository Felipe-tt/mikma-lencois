'use client';
import { useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';

export interface RestockOption { id: string; label: string }

// "Avise-me quando chegar": aparece quando a variação está esgotada. O aviso
// é da variação (tamanho e cor) que o cliente quer; com mais de uma esgotada,
// ele escolhe. Quem está logado já vem com o e-mail preenchido.
export function StockAlert({ productId, options, defaultVariantId }: { productId: string; options: RestockOption[]; defaultVariantId?: string }) {
  const { user } = useAuth();
  const [variantId, setVariantId] = useState(defaultVariantId ?? options[0]?.id ?? '');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState('');
  const value = touched ? email : (user?.email ?? '');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) { setError('Confira o e-mail.'); return; }
    setState('sending'); setError('');
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(productId)}/restock-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: clean, variantId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Não deu para registrar agora. Tente de novo.');
      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu para registrar agora. Tente de novo.');
      setState('idle');
    }
  }

  if (state === 'done') {
    return (
      <div role="status" className="rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-500/[0.07] px-4 py-3.5 flex items-start gap-3 animate-fade-in">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" className="text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5"><polyline points="20 6 9 17 4 12"/></svg>
        <p className="text-[13px] text-ink leading-snug">
          Pronto! Avisamos em <strong className="font-semibold break-all">{value.trim()}</strong> assim que
          {options.length > 1 ? <> o <strong className="font-semibold">{options.find(o => o.id === variantId)?.label}</strong> voltar.</> : ' voltar.'}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="rounded-2xl border border-mist bg-warm/40 p-4 flex flex-col gap-2.5">
      <div>
        <p className="text-[14px] font-semibold text-ink">Avise-me quando chegar</p>
        <p className="text-[12.5px] text-mid mt-0.5">Mandamos um e-mail assim que voltar ao estoque. É um aviso só.</p>
      </div>
      {options.length > 1 && (
        <div role="radiogroup" aria-label="Qual você quer" className="flex flex-wrap gap-1.5">
          {options.map(o => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={variantId === o.id}
              onClick={() => setVariantId(o.id)}
              className={`h-9 px-3.5 rounded-full border text-[12.5px] font-medium transition-colors ${variantId === o.id ? 'border-ink bg-ink text-paper' : 'border-mist-d text-mid hover:border-ink hover:text-ink'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <label htmlFor={`alerta-${productId}`} className="sr-only">Seu e-mail</label>
        <input
          id={`alerta-${productId}`}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="seu@email.com"
          value={value}
          onChange={e => { setTouched(true); setEmail(e.target.value); setError(''); }}
          aria-invalid={!!error}
          aria-describedby={error ? `alerta-${productId}-err` : undefined}
          className={`input flex-1 min-w-0 ${error ? '!border-red-400' : ''}`}
        />
        <button type="submit" disabled={state === 'sending'} className="btn-primary shrink-0">
          {state === 'sending' ? <span className="spinner w-3.5 h-3.5" /> : 'Avisar'}
        </button>
      </div>
      {error && <p id={`alerta-${productId}-err`} role="alert" className="text-[12px] text-red-600">{error}</p>}
    </form>
  );
}
