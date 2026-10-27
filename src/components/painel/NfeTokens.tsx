'use client';
import { useEffect, useId, useState } from 'react';
import type { NfeEnvironment } from '@/lib/nfe/config';

type Status = Record<NfeEnvironment, boolean>;
const LABEL: Record<NfeEnvironment, string> = { homologacao: 'Homologação (teste)', producao: 'Produção' };

/**
 * Tokens da Focus NFe (só admin). O token é enviado uma vez e guardado
 * criptografado no servidor; a tela só mostra se está cadastrado.
 */
export function NfeTokens({ user }: { user: { getIdToken: () => Promise<string> } | null }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [draft, setDraft] = useState<Record<NfeEnvironment, string>>({ homologacao: '', producao: '' });
  const [busy, setBusy] = useState<NfeEnvironment | null>(null);
  const [msg, setMsg] = useState<Partial<Record<NfeEnvironment, { ok: boolean; text: string }>>>({});
  const baseId = useId();

  async function api(init?: RequestInit) {
    const token = await user?.getIdToken();
    const res = await fetch('/api/painel/nfe', { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? 'Não foi possível falar com o servidor.');
    return data;
  }

  useEffect(() => {
    if (!user) return;
    api().then(setStatus).catch(() => setStatus(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function save(env: NfeEnvironment, token: string) {
    setBusy(env);
    try {
      setStatus(await api({ method: 'POST', body: JSON.stringify({ action: 'save', environment: env, token }) }));
      setDraft(d => ({ ...d, [env]: '' }));
      setMsg(m => ({ ...m, [env]: { ok: true, text: token ? 'Token salvo.' : 'Token removido.' } }));
    } catch (err) {
      setMsg(m => ({ ...m, [env]: { ok: false, text: (err as Error).message } }));
    } finally {
      setBusy(null);
    }
  }

  async function test(env: NfeEnvironment) {
    setBusy(env);
    try {
      const data = await api({ method: 'POST', body: JSON.stringify({ action: 'test', environment: env }) });
      setMsg(m => ({ ...m, [env]: { ok: !!data.ok, text: data.message } }));
    } catch (err) {
      setMsg(m => ({ ...m, [env]: { ok: false, text: (err as Error).message } }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {(['homologacao', 'producao'] as NfeEnvironment[]).map(env => (
        <div key={env}>
          <label htmlFor={`${baseId}-${env}`} className="block text-[13px] font-semibold text-mid mb-1.5">
            Token Focus NFe · {LABEL[env]}
            {status && <span className={`ml-2 text-[11px] font-bold ${status[env] ? 'text-emerald-700' : 'text-faint'}`}>{status[env] ? 'cadastrado' : 'não cadastrado'}</span>}
          </label>
          <div className="flex flex-wrap gap-2">
            <input id={`${baseId}-${env}`} type="password" autoComplete="off" value={draft[env]}
              onChange={e => setDraft(d => ({ ...d, [env]: e.target.value.trim() }))}
              placeholder={status?.[env] ? 'Colar para trocar o token' : 'Colar o token'}
              className="panel-input flex-1 min-w-[12rem]" />
            <button type="button" disabled={busy === env || !draft[env]} onClick={() => save(env, draft[env])}
              className="min-h-10 px-4 rounded-full bg-ink text-paper text-[12px] font-semibold disabled:opacity-50">Salvar</button>
            <button type="button" disabled={busy === env || !status?.[env]} onClick={() => test(env)}
              className="min-h-10 px-4 rounded-full border border-mist text-ink text-[12px] font-semibold disabled:opacity-50">Testar conexão</button>
            {status?.[env] && (
              <button type="button" disabled={busy === env} onClick={() => save(env, '')}
                className="min-h-10 px-3 text-[12px] font-semibold text-red-700 disabled:opacity-50">Remover</button>
            )}
          </div>
          {msg[env] && <p role="status" className={`mt-1.5 text-[11px] font-semibold ${msg[env]!.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg[env]!.text}</p>}
        </div>
      ))}
    </div>
  );
}
