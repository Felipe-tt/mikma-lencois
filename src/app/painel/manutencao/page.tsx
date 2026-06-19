'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';

type QueueEntry = {
  id: string;
  ip: string;
  released: boolean;
  enteredAt: string;
  releasedAt?: string;
  releasedBy?: string;
};

type Status = {
  active: boolean;
  updatedAt?: string;
  updatedBy?: string;
};

export default function ManutencaoPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>({ active: false });
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [releasing, setReleasing] = useState<string | null>(null);

  const headers = useCallback(async () => {
    const token = await user?.getIdToken();
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }, [user]);

  const load = useCallback(async () => {
    const h = await headers();
    const res = await fetch('/api/maintenance', { headers: h });
    if (res.ok) {
      const data = await res.json();
      setStatus(data.status);
      setQueue(data.queue);
    }
    setLoading(false);
  }, [headers]);

  useEffect(() => { load(); }, [load]);

  const toggle = async () => {
    setToggling(true);
    const h = await headers();
    const res = await fetch('/api/maintenance', {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ action: 'toggle' }),
    });
    if (res.ok) {
      const data = await res.json();
      setStatus(s => ({ ...s, active: data.active }));
    }
    setToggling(false);
  };

  const releaseIp = async (ip: string) => {
    setReleasing(ip);
    const h = await headers();
    await fetch('/api/maintenance', {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ action: 'release', ip }),
    });
    setQueue(q => q.map(e => e.ip === ip ? { ...e, released: true } : e));
    setReleasing(null);
  };

  const releaseAll = async () => {
    const h = await headers();
    await fetch('/api/maintenance', {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ action: 'release_all' }),
    });
    setQueue(q => q.map(e => ({ ...e, released: true })));
  };

  const clearQueue = async () => {
    if (!confirm('Limpar toda a fila? Visitantes bloqueados serão removidos.')) return;
    const h = await headers();
    await fetch('/api/maintenance', {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ action: 'clear_queue' }),
    });
    setQueue([]);
  };

  const waiting = queue.filter(e => !e.released);
  const released = queue.filter(e => e.released);

  if (loading) return (
    <div className="flex flex-col gap-3">
      {[1, 2, 3].map(i => <div key={i} className="h-12 bg-[#F0EBE1] animate-pulse border border-[#E6DFD5]" />)}
    </div>
  );

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-7">
        <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#C4714A] mb-1">Painel</p>
        <h1 className="font-display font-normal text-[#1E1208] text-2xl">Manutenção</h1>
      </div>

      {/* Toggle card */}
      <div className={`border p-6 mb-6 ${status.active ? 'border-amber-300 bg-amber-50' : 'border-[#E6DFD5] bg-white'}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[14px] font-bold text-[#1E1208] mb-0.5">
              {status.active ? '🔧 Site em manutenção' : '✅ Site online'}
            </p>
            <p className="text-[12px] text-[#B09C8C]">
              {status.active
                ? 'Visitantes são redirecionados para a página de manutenção e entram na fila.'
                : 'O site está acessível normalmente para todos os visitantes.'}
            </p>
            {status.updatedBy && (
              <p className="text-[11px] text-[#C8BAB0] mt-1">
                Alterado por {status.updatedBy} · {status.updatedAt ? new Date(status.updatedAt).toLocaleString('pt-BR') : ''}
              </p>
            )}
          </div>
          <button
            onClick={toggle}
            disabled={toggling}
            className={`shrink-0 px-5 py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-50 ${
              status.active
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-amber-500 text-white hover:bg-amber-600'
            }`}
          >
            {toggling ? '…' : status.active ? 'Reativar site' : 'Ativar manutenção'}
          </button>
        </div>
      </div>

      {/* CLI hint */}
      <div className="border border-[#E6DFD5] bg-[#FAF8F5] px-5 py-4 mb-6">
        <p className="text-[11px] font-bold text-[#705A48] mb-2 tracking-[0.1em] uppercase">Pelo Firebase CLI</p>
        <div className="flex flex-col gap-1.5">
          <code className="text-[11px] bg-[#1E1208] text-[#FAF8F5] px-3 py-2 block">
            firebase firestore:set --project mikma-lencois maintenance/status '{JSON.stringify({ active: true })}'
          </code>
          <p className="text-[10px] text-[#B09C8C]">Para reativar, troque <code>true</code> por <code>false</code></p>
        </div>
      </div>

      {/* Queue */}
      <div className="border border-[#E6DFD5] bg-white">
        <div className="px-5 py-4 border-b border-[#E6DFD5] bg-[#FAF8F5] flex items-center justify-between">
          <div>
            <p className="text-[13px] font-bold text-[#1E1208]">Fila de visitantes</p>
            <p className="text-[11px] text-[#B09C8C] mt-0.5">
              {waiting.length} aguardando · {released.length} liberados
            </p>
          </div>
          <div className="flex gap-2">
            {waiting.length > 0 && (
              <button
                onClick={releaseAll}
                className="px-3 py-1.5 text-[11px] font-semibold bg-[#1E1208] text-[#FAF8F5] hover:bg-[#1E1208]/80 transition-colors"
              >
                Liberar todos
              </button>
            )}
            {queue.length > 0 && (
              <button
                onClick={clearQueue}
                className="px-3 py-1.5 text-[11px] font-semibold border border-[#E6DFD5] text-[#705A48] hover:bg-[#F0EBE1] transition-colors"
              >
                Limpar fila
              </button>
            )}
          </div>
        </div>

        {queue.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-[13px] text-[#B09C8C]">Nenhum visitante na fila ainda.</p>
            <p className="text-[11px] text-[#C8BAB0] mt-1">Quando o site estiver em manutenção, os IPs aparecerão aqui.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#E6DFD5]">
            {queue.map(entry => (
              <div key={entry.id} className="flex items-center justify-between px-5 py-3 gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`shrink-0 w-2 h-2 rounded-full ${entry.released ? 'bg-green-400' : 'bg-amber-400'}`} />
                  <div className="min-w-0">
                    <p className="text-[13px] font-mono text-[#1E1208] truncate">{entry.ip}</p>
                    <p className="text-[10px] text-[#B09C8C]">
                      Entrou: {new Date(entry.enteredAt).toLocaleString('pt-BR')}
                      {entry.released && entry.releasedAt && (
                        <span> · Liberado: {new Date(entry.releasedAt).toLocaleString('pt-BR')}</span>
                      )}
                    </p>
                  </div>
                </div>
                {!entry.released && (
                  <button
                    onClick={() => releaseIp(entry.ip)}
                    disabled={releasing === entry.ip}
                    className="shrink-0 px-3 py-1 text-[11px] font-semibold bg-[#1E1208] text-[#FAF8F5] hover:bg-[#1E1208]/80 transition-colors disabled:opacity-50"
                  >
                    {releasing === entry.ip ? '…' : 'Liberar'}
                  </button>
                )}
                {entry.released && (
                  <span className="shrink-0 text-[11px] text-green-600 font-semibold">✓ Liberado</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
