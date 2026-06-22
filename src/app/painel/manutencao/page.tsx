'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { db } from '@/lib/firebase/client';
import { collection, onSnapshot, orderBy, query, doc } from 'firebase/firestore';

type QueueEntry = {
  id: string;
  ip: string;
  uid?: string;
  email?: string;
  displayName?: string;
  released: boolean;
  enteredAt: string;
  releasedAt?: string;
  releasedBy?: string;
  userAgent?: string;
  referer?: string;
  acceptLanguage?: string;
  requestedPath?: string;
  method?: string;
  platform?: string;
  isMobile?: string;
  geoCity?: string;
  geoRegion?: string;
  geoCountry?: string;
  isp?: string;
  geoDebug?: string;
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
  const [tab, setTab] = useState<'ips' | 'users'>('ips');

  const getHeaders = useCallback(async () => {
    const token = await user?.getIdToken();
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }, [user]);

  const load = useCallback(async () => {
    try {
      const h = await getHeaders();
      const res = await fetch('/api/maintenance', { headers: h });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
        setQueue(data.queue ?? []);
      }
    } catch {
      // network error — show empty state instead of stuck skeleton
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  // Carga inicial via API (já autenticada/verificada no backend)
  useEffect(() => { load(); }, [load]);

  // Realtime listeners — only set up after initial load succeeds
  useEffect(() => {
    const unsubStatus = onSnapshot(
      doc(db, 'maintenance', 'status'),
      snap => { if (snap.exists()) setStatus(snap.data() as Status); },
      err => console.warn('maintenance/status listener:', err.code)
    );

    const unsubQueue = onSnapshot(
      query(collection(db, 'maintenance_queue'), orderBy('enteredAt', 'desc')),
      snap => {
        setQueue(snap.docs.map(d => ({ id: d.id, ...d.data() })) as QueueEntry[]);
      },
      err => console.warn('maintenance_queue listener:', err.code)
    );

    return () => { unsubStatus(); unsubQueue(); };
  }, []);

  const toggle = async () => {
    setToggling(true);
    const h = await getHeaders();
    const res = await fetch('/api/maintenance', {
      method: 'POST', headers: h,
      body: JSON.stringify({ action: 'toggle' }),
    });
    if (res.ok) {
      const data = await res.json();
      setStatus(s => ({ ...s, active: data.active }));
    }
    setToggling(false);
  };

  const releaseEntry = async (entry: QueueEntry) => {
    const key = entry.uid ?? entry.ip;
    setReleasing(key);
    const h = await getHeaders();
    await fetch('/api/maintenance', {
      method: 'POST', headers: h,
      body: JSON.stringify({ action: 'release', ip: entry.ip, uid: entry.uid }),
    });
    setQueue(q => q.map(e => (e.id === entry.id ? { ...e, released: true } : e)));
    setReleasing(null);
  };

  const releaseAll = async () => {
    const h = await getHeaders();
    await fetch('/api/maintenance', {
      method: 'POST', headers: h,
      body: JSON.stringify({ action: 'release_all' }),
    });
    setQueue(q => q.map(e => ({ ...e, released: true })));
  };

  const clearQueue = async () => {
    if (!confirm('Limpar toda a fila?')) return;
    const h = await getHeaders();
    await fetch('/api/maintenance', {
      method: 'POST', headers: h,
      body: JSON.stringify({ action: 'clear_queue' }),
    });
    setQueue([]);
  };

  const ipEntries = queue.filter(e => !e.uid);
  const userEntries = queue.filter(e => !!e.uid);
  const waiting = queue.filter(e => !e.released);

  if (loading) return (
    <div className="flex flex-col gap-3">
      {[1, 2, 3].map(i => <div key={i} className="h-12 skeleton border border-mist" />)}
    </div>
  );

  const currentList = tab === 'ips' ? ipEntries : userEntries;

  return (
    <div className="max-w-2xl">
      <div className="mb-7">
        <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#C4714A] mb-1">Painel</p>
        <h1 className="font-display font-normal text-[#1E1208] text-2xl">Manutenção</h1>
      </div>

      {/* Toggle */}
      <div className={`border p-6 mb-6 ${status.active ? 'border-amber-300 bg-amber-50' : 'border-[#E6DFD5] bg-white'}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[14px] font-bold text-[#1E1208] mb-0.5">
              {status.active ? '🔧 Site em manutenção' : '✅ Site online'}
            </p>
            <p className="text-[12px] text-[#B09C8C]">
              {status.active
                ? 'Visitantes são redirecionados para a página de manutenção.'
                : 'O site está acessível normalmente para todos.'}
            </p>
            {status.updatedBy && (
              <p className="text-[11px] text-[#C8BAB0] mt-1">
                Alterado por {status.updatedBy}
                {status.updatedAt ? ` · ${new Date(status.updatedAt).toLocaleString('pt-BR')}` : ''}
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
        <p className="text-[11px] font-bold text-[#705A48] mb-2 tracking-[0.1em] uppercase">Pelo terminal</p>
        <div className="flex flex-col gap-1.5">
          <code className="text-[11px] bg-[#1E1208] text-[#FAF8F5] px-3 py-2 block font-mono">
            node scripts/maintenance.js on
          </code>
          <code className="text-[11px] bg-[#1E1208] text-[#FAF8F5] px-3 py-2 block font-mono">
            node scripts/maintenance.js allow
          </code>
          <p className="text-[10px] text-[#B09C8C]">
            Rode dentro da pasta do projeto. Vai pedir seu e-mail e senha de vendedor (os mesmos deste painel) — não precisa de Firebase CLI nem de nenhuma configuração extra. O comando <strong>allow</strong> detecta e libera seu IP automaticamente.
          </p>
        </div>
      </div>

      {/* Queue */}
      <div className="border border-[#E6DFD5] bg-white">
        <div className="px-5 py-4 border-b border-[#E6DFD5] bg-[#FAF8F5]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[13px] font-bold text-[#1E1208]">Fila de visitantes</p>
              <p className="text-[11px] text-[#B09C8C] mt-0.5">
                {waiting.length} aguardando · {queue.length - waiting.length} liberados
              </p>
            </div>
            <div className="flex gap-2">
              {waiting.length > 0 && (
                <button onClick={releaseAll}
                  className="px-3 py-1.5 text-[11px] font-semibold bg-[#1E1208] text-[#FAF8F5] hover:bg-[#1E1208]/80 transition-colors">
                  Liberar todos
                </button>
              )}
              {queue.length > 0 && (
                <button onClick={clearQueue}
                  className="px-3 py-1.5 text-[11px] font-semibold border border-[#E6DFD5] text-[#705A48] hover:bg-[#F0EBE1] transition-colors">
                  Limpar fila
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2">
            {(['ips', 'users'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                  tab === t ? 'bg-[#1E1208] text-[#FAF8F5]' : 'border border-[#E6DFD5] text-[#705A48] hover:bg-[#F0EBE1]'
                }`}>
                {t === 'ips' ? `IPs (${ipEntries.length})` : `Usuários (${userEntries.length})`}
              </button>
            ))}
          </div>
        </div>

        {currentList.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-[13px] text-[#B09C8C]">
              {tab === 'ips' ? 'Nenhum IP na fila.' : 'Nenhum usuário logado na fila.'}
            </p>
            <p className="text-[11px] text-[#C8BAB0] mt-1">
              Quando o site estiver em manutenção, os visitantes aparecerão aqui.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#E6DFD5]">
            {currentList.map(entry => {
              const location = [entry.geoCity, entry.geoRegion, entry.geoCountry].filter(Boolean).join(', ');
              const device = entry.isMobile === '?1' ? '📱 Celular' : entry.isMobile === '?0' ? '💻 Computador' : '';
              return (
                <div key={entry.id} className="px-5 py-3 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <span className={`shrink-0 mt-1.5 w-2 h-2 rounded-full ${entry.released ? 'bg-green-400' : 'bg-amber-400'}`} />
                    <div className="min-w-0 flex-1">
                      {entry.uid ? (
                        <>
                          <p className="text-[13px] font-semibold text-[#1E1208] truncate">
                            {entry.displayName || 'Usuário sem nome'}
                          </p>
                          <p className="text-[11px] text-[#B09C8C] truncate">{entry.email}</p>
                        </>
                      ) : (
                        <p className="text-[13px] font-mono text-[#1E1208] truncate">{entry.ip}</p>
                      )}

                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                        {entry.uid && (
                          <span className="text-[10px] text-[#C8BAB0] font-mono">{entry.ip}</span>
                        )}
                        {location && (
                          <span className="text-[10px] text-[#B09C8C]">📍 {location}</span>
                        )}
                        {entry.isp && (
                          <span className="text-[10px] text-[#B09C8C]">🌐 {entry.isp}</span>
                        )}
                        {device && (
                          <span className="text-[10px] text-[#B09C8C]">{device}</span>
                        )}
                        {entry.platform && (
                          <span className="text-[10px] text-[#B09C8C]">{entry.platform}</span>
                        )}
                        {entry.geoDebug && (
                          <span className="text-[10px] text-red-400">⚠ geo: {entry.geoDebug}</span>
                        )}
                      </div>

                      {entry.requestedPath && (
                        <p className="text-[10px] text-[#C8BAB0] mt-0.5 truncate">
                          Tentou acessar: <span className="font-mono">{entry.requestedPath}</span>
                        </p>
                      )}

                      <p className="text-[10px] text-[#B09C8C] mt-0.5">
                        Entrou: {new Date(entry.enteredAt).toLocaleString('pt-BR')}
                        {entry.released && entry.releasedAt && (
                          <span> · Liberado: {new Date(entry.releasedAt).toLocaleString('pt-BR')}</span>
                        )}
                      </p>

                      {entry.userAgent && (
                        <details className="mt-1">
                          <summary className="text-[10px] text-[#C8BAB0] cursor-pointer select-none">Mais detalhes</summary>
                          <div className="mt-1 text-[10px] text-[#B09C8C] space-y-0.5 pl-2 border-l border-[#E6DFD5]">
                            <p className="break-all"><strong>User-Agent:</strong> {entry.userAgent}</p>
                            {entry.referer && <p className="break-all"><strong>Veio de:</strong> {entry.referer}</p>}
                            {entry.acceptLanguage && <p><strong>Idioma:</strong> {entry.acceptLanguage}</p>}
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                  {!entry.released ? (
                    <button
                      onClick={() => releaseEntry(entry)}
                      disabled={releasing === (entry.uid ?? entry.ip)}
                      className="shrink-0 px-3 py-1 text-[11px] font-semibold bg-[#1E1208] text-[#FAF8F5] hover:bg-[#1E1208]/80 transition-colors disabled:opacity-50">
                      {releasing === (entry.uid ?? entry.ip) ? '…' : 'Liberar'}
                    </button>
                  ) : (
                    <span className="shrink-0 text-[11px] text-green-600 font-semibold">✓ Liberado</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
