'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { createPasskey, passkeyCancelled, passkeySupported, type PasskeySummary } from '@/lib/auth/passkeyClient';

const noopSubscribe = () => () => {};
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

/** Perfil: passkeys da conta (criar e remover). */
export function PasskeyManager() {
  const { user } = useAuth();
  const supported = useSyncExternalStore(noopSubscribe, passkeySupported, () => false);
  const [list, setList] = useState<PasskeySummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    user.getIdToken()
      .then(token => fetch('/api/auth/passkey', { headers: { Authorization: `Bearer ${token}` } }))
      .then(r => (r.ok ? r.json() : { passkeys: [] }))
      .then(d => { if (alive) setList(d.passkeys ?? []); })
      .catch(() => { if (alive) setList([]); });
    return () => { alive = false; };
  }, [user]);

  if (!user || list === null) return null;

  async function handleCreate() {
    if (!user) return;
    setBusy('new'); setMsg(null);
    try {
      const pk = await createPasskey(await user.getIdToken());
      setList(l => [...(l ?? []), pk]);
      setMsg({ ok: true, text: 'Passkey criada. Da próxima vez, é só escolher ela ao entrar.' });
    } catch (err) {
      if (!passkeyCancelled(err)) setMsg({ ok: false, text: err instanceof Error ? err.message : 'Não foi possível criar a passkey.' });
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove(id: string) {
    if (!user) return;
    setBusy(id); setMsg(null);
    try {
      const res = await fetch(`/api/auth/passkey?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Não foi possível remover.');
      setList(l => (l ?? []).filter(p => p.id !== id));
      setMsg({ ok: true, text: 'Passkey removida. Apague também do gerenciador de senhas do aparelho, se quiser.' });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Não foi possível remover.' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6 pt-5 border-t border-mist">
      <p className="text-[13.5px] font-semibold text-ink">Passkeys</p>
      <p className="text-[12.5px] text-mid mt-1 mb-4 leading-relaxed">
        Entre com o Face ID, a digital ou o PIN do aparelho, sem digitar senha. Mais rápido e não cai em site falso.
      </p>

      {list.length > 0 && (
        <ul className="flex flex-col gap-2.5 mb-4">
          {list.map(p => (
            <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-mist px-4 py-3">
              <span className="min-w-0">
                <span className="block text-[13.5px] text-ink truncate">{p.name}</span>
                <span className="block text-[11.5px] text-faint">
                  Criada em {fmtDate(p.createdAt)}
                  {p.lastUsedAt ? ` · usada em ${fmtDate(p.lastUsedAt)}` : ''}
                  {p.synced ? ' · sincronizada' : ''}
                </span>
              </span>
              <button
                onClick={() => handleRemove(p.id)}
                disabled={busy !== null}
                aria-label={`Remover passkey ${p.name}`}
                className="py-3 -my-3 text-[13px] font-medium text-mid hover:text-red-600 transition-colors disabled:opacity-50 shrink-0"
              >
                {busy === p.id ? 'Removendo…' : 'Remover'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {supported ? (
        <button onClick={handleCreate} disabled={busy !== null} className="btn-outline">
          {busy === 'new' ? <><span className="spinner-dark w-3.5 h-3.5" /> Aguardando o aparelho…</> : list.length ? 'Criar outra passkey' : 'Criar passkey'}
        </button>
      ) : (
        <p className="text-[12.5px] text-mid">Este navegador não suporta passkeys.</p>
      )}

      {msg && (
        <p role="status" className={`mt-3 text-[12.5px] font-medium animate-fade-in ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
