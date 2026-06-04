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

  if (loading) return <div className="p-6 text-sm text-gray-500">Carregando…</div>;

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Estoque</h1>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhum item no estoque.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Produto', 'Variação', 'Disponível', 'Reservado', 'Alerta', 'Ações'].map(h => (
                  <th key={h} className={`px-4 py-3 text-gray-600 font-medium ${h === 'Ações' ? 'text-right' : h === 'Produto' ? 'text-left' : 'text-center'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(item => {
                const e = editing[item.id];
                const low = isLow(item);
                return (
                  <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${low ? 'bg-orange-50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{item.productName}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {item.variant.size}
                      {item.variant.fabric ? ` · ${item.variant.fabric}` : ''}
                      {item.variant.color ? ` · ${item.variant.color}` : ''}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {e ? (
                        <input
                          type="number" min={0} value={e.qty}
                          onChange={ev => setEditing(ed => ({ ...ed, [item.id]: { ...ed[item.id], qty: Number(ev.target.value) } }))}
                          className="w-16 border border-indigo-300 rounded px-2 py-0.5 text-center text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      ) : (
                        <span className={`font-medium ${low ? 'text-orange-600' : 'text-gray-900'}`}>
                          {available(item)}{low && <span className="ml-1">⚠️</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500">{item.reserved}</td>
                    <td className="px-4 py-3 text-center">
                      {e ? (
                        <input
                          type="number" min={0} value={e.threshold}
                          onChange={ev => setEditing(ed => ({ ...ed, [item.id]: { ...ed[item.id], threshold: Number(ev.target.value) } }))}
                          className="w-16 border border-gray-300 rounded px-2 py-0.5 text-center text-sm focus:outline-none"
                        />
                      ) : (
                        <span className="text-gray-500">{item.lowStockThreshold}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {e ? (
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => saveItem(item.id)} className="text-xs text-green-600 hover:text-green-800 font-medium">Salvar</button>
                          <button onClick={() => cancelEdit(item.id)} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditing(e => ({ ...e, [item.id]: { qty: available(item), threshold: item.lowStockThreshold } }))}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
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
