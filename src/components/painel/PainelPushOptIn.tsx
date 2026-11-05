'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { enablePush, getPushPermissionState } from '@/lib/firebase/messaging-client';

const DISMISS_KEY = 'mikma_push_dismissed_at';
const DISMISS_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000; // some por 30 dias se ignorado

export function PainelPushOptIn() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  useEffect(() => {
    if (!user) return;
    const state = getPushPermissionState();
    if (state !== 'default') return; // já concedeu, já negou, ou não suportado

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_SNOOZE_MS) return;

    setVisible(true);
  }, [user]);

  if (!visible || !user) return null;

  async function handleEnable() {
    setStatus('loading');
    const result = await enablePush(user!.getIdToken);
    if (result.ok) {
      setStatus('done');
      setTimeout(() => setVisible(false), 1800);
    } else {
      setStatus('error');
    }
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  }

  // Uma linha só: antes era um cartão alto com texto longo.
  return (
    <div data-no-print className="mb-6 flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-warm border border-mist rounded-xl">
      <svg aria-hidden="true" className="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C4714A" strokeWidth="2">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      <p className="flex-1 min-w-0 text-[12.5px] text-mid leading-snug">
        {status === 'error' ? <span className="text-red-600">Não foi possível ativar. Tente de novo.</span> : 'Receber aviso no celular a cada pedido novo'}
      </p>
      <button onClick={handleDismiss} className="shrink-0 text-[12px] text-faint px-2 min-h-9 hover:text-mid">
        Agora não
      </button>
      <button
        onClick={handleEnable}
        disabled={status === 'loading' || status === 'done'}
        className="shrink-0 text-[12px] font-semibold text-paper bg-clay-l px-3.5 min-h-9 rounded-full disabled:opacity-60"
      >
        {status === 'done' ? 'Ativado ✓' : status === 'loading' ? 'Ativando…' : 'Ativar'}
      </button>
    </div>
  );
}
