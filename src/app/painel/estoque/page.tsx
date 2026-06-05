'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

type InventoryItem = {
  id: string;
  productId: string;
  productName?: string;
  sku: string;
  variant: { size: string; fabric: string; color: string };
  quantity: number;
  reserved: number;
  lowStockThreshold: number;
};

export default function EstoquePage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, { qty: number; threshold: number }>>({});

  useEffect(() => {
    // Single snapshot listener — enriches product names once per batch
    const unsub = onSnapshot(collection(db, 'inventory'), async snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryItem));

      // Deduplicated product name fetch — only missing names
      const productIds = Array.from(new Set(data.map(i => i.productId)));
      const nameMap: Record<string, string> = {};
      await Promise.all(
        productIds.map(async pid => {
          const pdoc = await getDoc(doc(db, 'products', pid));
          if (pdoc.exists()) nameMap[pid] = pdoc.data().name as string;
        })
      );

      setItems(data.map(i => ({ ...i, productName: nameMap[i.productId] ?? i.productId })));
      setLoading(false);
    });
    return unsub;
  }, []);

  async function saveItem(id: string) {
    const e = editing[id];
    if (!e) return;
    await updateDoc(doc(db, 'inventory', id), {
      quantity: e.qty,
      lowStockThreshold: e.threshold,
    });
    setEditing(prev => { const n = { ...prev }; delete n[id]; return n; });
  }

  function cancelEdit(id: string) {
    setEditing(prev => { const n = { ...prev }; delete n[id]; return n; });
  }

  const available = (item: InventoryItem) => item.quantity - item.reserved;
  const isLow = (item: InventoryItem) => available(item) <= item.lowStockThreshold;

  if (loading) return <div className="p-6 text-sm text-faint">Carregando…</div>;

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-ink mb-6">Estoque</h1>

      {items.length === 0 ? (
        <p className="text-sm text-faint">Nenhum item no estoque.</p>
      ) : (
        <div className="bg-paper border border-mist  overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-warm border-b border-mist">
              <tr>
                {['Produto', 'Variação', 'Disponível', 'Reservado', 'Alerta', 'Ações'].map(h => (
                  <th key={h} className={`px-4 py-3 text-mid font-medium ${h === 'Ações' ? 'text-right' : h === 'Produto' ? 'text-left' : 'text-center'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {items.map(item => {
                const e = editing[item.id];
                const low = isLow(item);
                return (
                  <tr key={item.id} className={`hover:bg-warm transition-colors ${low ? 'bg-orange-50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-ink">{item.productName}</td>
                    <td className="px-4 py-3 text-faint">
                      {item.variant.size}
                      {item.variant.fabric ? ` · ${item.variant.fabric}` : ''}
                      {item.variant.color ? ` · ${item.variant.color}` : ''}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {e ? (
                        <input
                          type="number" min={0} value={e.qty}
                          onChange={ev => setEditing(ed => ({ ...ed, [item.id]: { ...ed[item.id], qty: Number(ev.target.value) } }))}
                          className="w-16 border border-clay  px-2 py-0.5 text-center text-sm focus:outline-none focus:ring-2 focus:ring-clay/20"
                        />
                      ) : (
                        <span className={`font-medium ${low ? 'text-orange-600' : 'text-ink'}`}>
                          {available(item)}{low && <span className="ml-1">⚠️</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-faint">{item.reserved}</td>
                    <td className="px-4 py-3 text-center">
                      {e ? (
                        <input
                          type="number" min={0} value={e.threshold}
                          onChange={ev => setEditing(ed => ({ ...ed, [item.id]: { ...ed[item.id], threshold: Number(ev.target.value) } }))}
                          className="w-16 border border-mist  px-2 py-0.5 text-center text-sm focus:outline-none"
                        />
                      ) : (
                        <span className="text-faint">{item.lowStockThreshold}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {e ? (
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => saveItem(item.id)} className="text-xs text-green-600 hover:text-green-800 font-medium">Salvar</button>
                          <button onClick={() => cancelEdit(item.id)} className="text-xs text-faint hover:text-mid">Cancelar</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditing(e => ({ ...e, [item.id]: { qty: available(item), threshold: item.lowStockThreshold } }))}
                          className="text-xs text-clay hover:text-clay-d font-medium"
                        >
                          Ajustar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
