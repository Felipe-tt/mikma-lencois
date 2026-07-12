'use client';
import { useState } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import type { Order, ReturnItem, ReturnType } from '@/types';
import { IconX } from '@/components/ui/Icon';

interface Props {
  order: Order;
  customerName?: string;
  onClose: () => void;
  onDone: () => void;
}

export function RegisterReturnModal({ order, customerName, onClose, onDone }: Props) {
  const { user } = useAuth();
  const [type, setType] = useState<ReturnType>('troca');
  const [selected, setSelected] = useState<Record<number, number>>({}); // índice do item -> quantidade
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function toggleItem(i: number, max: number) {
    setSelected(prev => {
      const next = { ...prev };
      if (i in next) delete next[i];
      else next[i] = 1;
      return next;
    });
    void max;
  }

  function setQty(i: number, qty: number, max: number) {
    setSelected(prev => ({ ...prev, [i]: Math.min(Math.max(1, qty), max) }));
  }

  async function submit() {
    const chosenIndexes = Object.keys(selected).map(Number);
    if (chosenIndexes.length === 0) { setError('Escolha ao menos um item.'); return; }
    if (!reason.trim()) { setError('Descreve rapidamente o motivo.'); return; }
    setSaving(true);
    setError('');
    try {
      const items: ReturnItem[] = chosenIndexes.map(i => {
        const it = order.items[i];
        return {
          sku: it.sku, productId: it.productId, productName: it.productName,
          variant: it.variant, quantity: selected[i],
        };
      });
      await addDoc(collection(db, 'returns'), {
        orderId: order.id,
        userId: order.userId,
        customerName: customerName || '',
        type,
        reason: reason.trim(),
        items,
        status: 'solicitada',
        restocked: false,
        createdAt: new Date().toISOString(),
        createdBy: user?.email || '',
      });
      onDone();
    } catch (err) {
      console.error('[registrar-troca] falha ao salvar', err);
      setError('Não deu pra salvar agora. Tenta de novo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-paper w-full sm:max-w-md sm:border sm:border-mist max-h-[90vh] flex flex-col animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-mist shrink-0">
          <p className="text-[14px] font-bold text-ink">Registrar troca ou devolução</p>
          <button onClick={onClose} className="text-faint hover:text-mid p-1" aria-label="Fechar"><IconX size={18} /></button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto">
          <div className="grid grid-cols-2 border border-mist p-1">
            <button onClick={() => setType('troca')}
              className={`py-2 text-[12px] font-bold uppercase tracking-wide transition-colors ${type === 'troca' ? 'bg-ink text-paper' : 'text-mid'}`}>
              Troca
            </button>
            <button onClick={() => setType('devolucao')}
              className={`py-2 text-[12px] font-bold uppercase tracking-wide transition-colors ${type === 'devolucao' ? 'bg-ink text-paper' : 'text-mid'}`}>
              Devolução
            </button>
          </div>

          <div>
            <p className="text-[11px] font-bold text-faint uppercase tracking-wide mb-2">Quais itens</p>
            <div className="flex flex-col gap-2">
              {order.items.map((it, i) => (
                <label key={i} className="flex items-center gap-2.5 border border-mist px-3 py-2.5 cursor-pointer">
                  <input type="checkbox" checked={i in selected} onChange={() => toggleItem(i, it.quantity)} className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-ink truncate">{it.productName}</p>
                    <p className="text-[11px] text-faint">
                      {it.variant.size} · {it.variant.fabric}{it.variant.colorName ? ` · ${it.variant.colorName}` : ''} · comprou {it.quantity}
                    </p>
                  </div>
                  {i in selected && it.quantity > 1 && (
                    <input
                      type="number" min={1} max={it.quantity} value={selected[i]}
                      onChange={e => setQty(i, Number(e.target.value), it.quantity)}
                      onClick={e => e.stopPropagation()}
                      className="w-14 border border-mist px-1.5 py-1 text-[12px] text-center shrink-0"
                    />
                  )}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold text-faint uppercase tracking-wide mb-2">Motivo</p>
            <textarea
              value={reason} onChange={e => setReason(e.target.value)} rows={3}
              placeholder="Ex: cliente pediu tamanho errado, veio com defeito de costura..."
              className="w-full border border-mist bg-white dark:bg-warm px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-clay-l/20 resize-none"
            />
          </div>

          {error && <p className="text-[12px] text-red-600">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-mist shrink-0">
          <button
            onClick={submit}
            disabled={saving}
            className="w-full bg-ink text-paper text-[12px] font-bold uppercase tracking-[0.08em] py-3 hover:bg-ink/80 transition-colors disabled:opacity-50"
          >
            {saving ? 'Registrando...' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  );
}
