'use client';
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { auth } from '@/lib/firebase/client';
import { db } from '@/lib/firebase/db';
import { maskCep, onlyDigits } from '@/lib/masks';
import { formatCurrency } from '@/lib/utils/format';
import { estimatedDate } from '@/lib/deliveryDate';
import type { ShippingOption } from '@/lib/shipping-pricing';
import { readTypedCep, saveTypedCep } from '@/lib/cartCep';


type Quote = { option: ShippingOption | null; pickup: boolean };

const when = (o: ShippingOption) => o.whenLabel
  ?? (o.estimatedDays === 0 ? 'Chega hoje' : `Chega até ${estimatedDate(o.estimatedDays)}`);

/**
 * Frete no resumo do carrinho, antes do checkout. Com o CEP da conta (ou o
 * último digitado aqui), mostra a entrega mais barata, a mesma que o
 * checkout marca, e o total já com ela. Antes o carrinho dizia "Calculado
 * no checkout" e o total subia só no último passo.
 *
 * `signature` muda quando muda o que pesa no frete (itens, quantidades,
 * cupom): aí cota de novo, com uma pausa para não cotar a cada toque no +.
 */
export function CartShipping({ uid, signature, freeShip, onPrice }: {
  uid: string; signature: string;
  /** O carrinho já passou do valor do frete grátis (regra da loja). */
  freeShip: boolean;
  onPrice: (cents: number | null) => void;
}) {
  const [cep, setCep] = useState('');
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  // Cotação por CEP e carrinho ('erro' = não deu para cotar agora).
  const [quotes, setQuotes] = useState<Record<string, Quote | 'erro'>>({});

  // CEP do endereço salvo na conta; sem ele, o último digitado neste aparelho.
  useEffect(() => {
    let alive = true;
    const typed = readTypedCep();
    getDoc(doc(db, 'users', uid))
      .then(s => onlyDigits(String(s.data()?.address?.cep ?? '')))
      .catch(() => '')
      .then(saved => {
        if (!alive) return;
        setCep(saved.length === 8 ? saved : typed);
        setReady(true);
      });
    return () => { alive = false; };
  }, [uid]);

  const key = cep.length === 8 ? `${cep}|${signature}` : null;
  const entry = key ? quotes[key] : undefined;
  const loading = !!key && entry === undefined;
  const failed = entry === 'erro';
  const quote = entry && entry !== 'erro' ? entry : null;
  const price = quote?.option?.priceCents ?? null;

  useEffect(() => { onPrice(price); }, [price, onPrice]);

  useEffect(() => {
    if (!key || quotes[key] !== undefined) return;
    const t = setTimeout(async () => {
      let result: Quote | 'erro' = 'erro';
      try {
        const token = await auth.currentUser?.getIdToken();
        // ?from=carrinho: limite de cotações próprio, o do checkout fica livre.
        const res = token ? await fetch('/api/shipping/quote?from=carrinho', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ destCep: key.slice(0, 8) }),
        }) : null;
        if (res?.ok) {
          const options = ((await res.json()).options ?? []) as ShippingOption[];
          result = {
            option: options.find(o => o.carrier !== 'pickup' && o.available !== false) ?? null,
            pickup: options.some(o => o.carrier === 'pickup'),
          };
        }
      } catch { /* fica 'erro': o checkout calcula */ }
      setQuotes(q => ({ ...q, [key]: result }));
    }, 900);
    return () => clearTimeout(t);
  }, [key, quotes]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const d = onlyDigits(draft);
    if (d.length !== 8) return;
    saveTypedCep(d);
    setEditing(false);
    setCep(d);
  }

  const label = <span className="text-faint">Frete</span>;
  const openForm = (value: string) => { setDraft(value); setEditing(true); };

  if (!ready) {
    return <div className="flex justify-between items-baseline text-sm">{label}<span className="text-faint text-xs">…</span></div>;
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 text-sm">
        {label}
        <form onSubmit={submit} className="flex items-center gap-2">
          <label htmlFor="cart-cep" className="sr-only">CEP para calcular o frete</label>
          <input id="cart-cep" value={maskCep(draft)} onChange={e => setDraft(e.target.value)} inputMode="numeric" autoComplete="postal-code"
            placeholder="00000-000" maxLength={9} autoFocus
            className="min-w-0 flex-1 h-10 rounded-full border border-mist bg-white dark:bg-warm px-4 text-[13px] text-ink placeholder:text-faint focus:border-ink/40 focus:outline-none" />
          <button type="submit" disabled={onlyDigits(draft).length !== 8}
            className="shrink-0 h-10 px-4 rounded-full border border-ink text-[13px] font-semibold text-ink hover:bg-warm disabled:opacity-40 transition-colors">
            Calcular
          </button>
        </form>
      </div>
    );
  }

  if (!cep) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-baseline text-sm">
          {label}
          {freeShip ? (
            <span className="text-emerald-700 font-semibold text-xs">Grátis</span>
          ) : (
            <button type="button" onClick={() => openForm('')} className="text-xs font-semibold text-clay underline underline-offset-4 hover:text-ink">
              Calcular pelo CEP
            </button>
          )}
        </div>
        {freeShip && (
          <button type="button" onClick={() => openForm('')} className="self-end text-[11.5px] text-faint underline underline-offset-4 decoration-mist-d hover:text-ink">
            Ver o prazo pelo CEP
          </button>
        )}
      </div>
    );
  }

  const option = quote?.option;
  return (
    <div className="flex flex-col gap-1" aria-live="polite">
      <div className="flex justify-between items-baseline text-sm">
        {label}
        {loading ? (
          <span className="text-faint text-xs">Calculando…</span>
        ) : option ? (
          <span className={option.priceCents === 0 ? 'text-emerald-700 font-semibold' : 'text-ink font-medium'}>
            {option.priceCents === 0 ? 'Grátis' : formatCurrency(option.priceCents)}
          </span>
        ) : (
          <span className="text-faint text-xs">
            {failed ? 'Calculado no checkout' : quote?.pickup ? 'Só retirada na loja, grátis' : 'Sem entrega para esse CEP'}
          </span>
        )}
      </div>
      {!loading && option && (
        <p className="text-[11.5px] text-faint text-right">{option.label} · {when(option)}</p>
      )}
      {!loading && option && quote?.pickup && (
        <p className="text-[11.5px] text-faint text-right">ou grátis, retirando na loja</p>
      )}
      <p className="text-[11.5px] text-faint text-right">
        CEP {maskCep(cep)} ·{' '}
        <button type="button" onClick={() => openForm(cep)}
          className="underline underline-offset-4 decoration-mist-d hover:text-ink">
          trocar
        </button>
      </p>
    </div>
  );
}
