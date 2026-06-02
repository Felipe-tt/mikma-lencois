'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

type StoreSettings = {
  storeName: string;
  originCep: string;
  freeShippingThresholdCents: number;
  localDeliveryRadiusKm: number;
  lowStockThreshold: number;
  dispatchCutoffTime: string;
};

const DEFAULTS: StoreSettings = {
  storeName: 'Mikma Lençóis',
  originCep: '',
  freeShippingThresholdCents: 0,
  localDeliveryRadiusKm: 10,
  lowStockThreshold: 3,
  dispatchCutoffTime: '17:00',
};

export default function ConfiguracoesPage() {
  const [settings, setSettings] = useState<StoreSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'settings', 'store')).then(snap => {
      if (snap.exists()) setSettings({ ...DEFAULTS, ...snap.data() });
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await setDoc(doc(db, 'settings', 'store'), settings, { merge: true });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const update = (field: keyof StoreSettings, value: string | number) =>
    setSettings(s => ({ ...s, [field]: value }));

  if (loading) return <div className="p-6 text-sm text-gray-500">Carregando...</div>;

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Configurações da loja</h1>

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome da loja</label>
          <input
            value={settings.storeName}
            onChange={e => update('storeName', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">CEP de origem (para cálculo de frete)</label>
          <input
            value={settings.originCep}
            onChange={e => update('originCep', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder=""
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Frete grátis a partir de (R$) — 0 para desativar
          </label>
          <input
            type="number"
            min={0}
            value={settings.freeShippingThresholdCents / 100}
            onChange={e => update('freeShippingThresholdCents', Math.round(parseFloat(e.target.value) * 100))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="150"
          />
          <p className="mt-1 text-xs text-gray-400">
            {settings.freeShippingThresholdCents === 0
              ? 'Frete grátis desativado'
              : `Frete grátis para pedidos acima de R$ ${(settings.freeShippingThresholdCents / 100).toFixed(2)}`}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Raio de entrega local — Uber Direct (km)
          </label>
          <input
            type="number"
            min={1}
            max={50}
            value={settings.localDeliveryRadiusKm}
            onChange={e => update('localDeliveryRadiusKm', Number(e.target.value))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="mt-1 text-xs text-gray-400">
            Pedidos dentro de {settings.localDeliveryRadiusKm} km usarão Uber Direct. Acima, Melhor Envio.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Alerta de estoque baixo (unidades)
          </label>
          <input
            type="number"
            min={0}
            value={settings.lowStockThreshold}
            onChange={e => update('lowStockThreshold', Number(e.target.value))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="mt-1 text-xs text-gray-400">
            Alerta quando estoque disponível ≤ {settings.lowStockThreshold} unidades.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Horário de corte para despacho do dia (formato HH:MM)
          </label>
          <input
            type="time"
            value={settings.dispatchCutoffTime}
            onChange={e => update('dispatchCutoffTime', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="mt-1 text-xs text-gray-400">
            Pedidos pagos após {settings.dispatchCutoffTime} são despachados no próximo dia útil.
          </p>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar configurações'}
          </button>
          {saved && <span className="text-sm text-green-600 font-medium">✓ Salvo!</span>}
        </div>
      </div>
    </div>
  );
}
