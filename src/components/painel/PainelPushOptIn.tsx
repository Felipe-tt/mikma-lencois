'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { enablePush, getPushPermissionState } from '@/lib/firebase/messaging-client';

const DISMISS_KEY = 'mikma_push_dismissed_at';
const DISMISS_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // some por 7 dias se ignorado

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

  return (
    <div className="mb-5 flex flex-col sm:flex-row sm:items-center gap-3 justify-between px-4 py-3.5 bg-white border border-[#E6DFD5] rounded-sm">
      <div className="flex items-start gap-3">
        <svg className="shrink-0 mt-0.5" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C4714A" strokeWidth="2">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        <div>
          <p className="text-[13px] font-semibold text-[#1E1208]">Ativar notificações de novo pedido</p>
          <p className="text-[12px] text-[#705A48] mt-0.5">
            Receba um aviso no celular assim que alguém iniciar o pagamento ou o pedido for confirmado — mesmo com o painel fechado.
          </p>
          {status === 'error' && (
            <p className="text-[12px] text-red-600 mt-1">Não foi possível ativar. Tente novamente.</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
        <button
          onClick={handleDismiss}
          className="text-[12px] text-[#B09C8C] px-3 py-2 hover:text-[#705A48]"
        >
          Agora não
        </button>
        <button
          onClick={handleEnable}
          disabled={status === 'loading' || status === 'done'}
          className="text-[12px] font-semibold text-white bg-[#C4714A] px-4 py-2 rounded-sm disabled:opacity-60"
        >
          {status === 'done' ? 'Ativado ✓' : status === 'loading' ? 'Ativando…' : 'Ativar'}
        </button>
      </div>
    </div>
  );
}
