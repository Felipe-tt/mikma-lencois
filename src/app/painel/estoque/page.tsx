'use client';

import { useEffect, useState } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, orderBy } from 'firebase/firestore';
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
  const [editing, setEditing] = useState<Record<string, number>>({});

  useEffect(() => {
    const q = query(collection(db, 'inventory'));
    const unsub = onSnapshot(q, async (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryItem));
      // enrich with product names
      const productIds = [...new Set(data.map(i => i.productId))];
      const nameMap: Record<string, string> = {};
      await Promise.all(productIds.map(async pid => {
        const { getDoc, doc: docRef } = await import('firebase/firestore');
        const pdoc = await getDoc(docRef(db, 'products', pid));
        if (pdoc.exists()) nameMap[pid] = pdoc.data().name;
      }));
      setItems(data.map(i => ({ ...i, productName: nameMap[i.productId] ?? i.productId })));
      setLoading(false);
    });
    return unsub;
  }, []);

  const saveQty = async (id: string, qty: number, threshold: number) => {
    await updateDoc(doc(db, 'inventory', id), { quantity: qty, lowStockThreshold: threshold });
    setEditing(e => { const n = { ...e }; delete n[id]; return n; });
  };

  const available = (item: InventoryItem) => item.quantity - item.reserved;
  const isLow = (item: InventoryItem) => available(item) <= item.lowStockThreshold;

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Estoque</h1>

      {loading ? (
        <div className="text-sm text-gray-500">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-gray-500">Nenhum item no estoque.</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Produto</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Variação</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">Disponível</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">Reservado</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">Alerta</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(item => (
                <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${isLow(item) ? 'bg-orange-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">{item.productName}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {item.variant.size} · {item.variant.fabric} · {item.variant.color}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {editing[item.id] !== undefined ? (
                      <input
                        type="number"
                        min={0}
                        value={editing[item.id]}
                        onChange={e => setEditing(ed => ({ ...ed, [item.id]: Number(e.target.value) }))}
                        className="w-16 border border-indigo-300 rounded px-2 py-0.5 text-center text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    ) : (
                      <span className={`font-medium ${isLow(item) ? 'text-orange-600' : 'text-gray-900'}`}>
                        {available(item)}
                        {isLow(item) && <span className="ml-1 text-xs">⚠️</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-500">{item.reserved}</td>
                  <td className="px-4 py-3 text-center text-gray-500">{item.lowStockThreshold}</td>
                  <td className="px-4 py-3 text-right">
                    {editing[item.id] !== undefined ? (
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => saveQty(item.id, editing[item.id], item.lowStockThreshold)}
                          className="text-xs text-green-600 hover:text-green-800 font-medium"
                        >
                          Salvar
                        </button>
                        <button
                          onClick={() => setEditing(e => { const n = { ...e }; delete n[item.id]; return n; })}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditing(e => ({ ...e, [item.id]: available(item) }))}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        Ajustar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
