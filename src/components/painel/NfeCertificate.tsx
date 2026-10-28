'use client';
import { useEffect, useId, useState } from 'react';

type CertInfo = { titular: string; cnpj: string | null; validFrom: string; validTo: string };
const fmt = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

/**
 * Importação do certificado digital A1 (.pfx) para a nota fiscal (só admin).
 * O arquivo e a senha vão uma vez para o servidor, que guarda criptografado;
 * a tela só mostra titular, CNPJ e validade.
 */
export function NfeCertificate({ user }: { user: { getIdToken: () => Promise<string> } | null }) {
  const [info, setInfo] = useState<CertInfo | null | undefined>(undefined);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const id = useId();

  async function api(init?: RequestInit) {
    const token = await user?.getIdToken();
    const res = await fetch('/api/painel/nfe', { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? 'Não foi possível falar com o servidor.');
    return data as { certificate: CertInfo | null };
  }

  useEffect(() => {
    if (!user) return;
    api().then(d => setInfo(d.certificate)).catch(() => setInfo(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function upload() {
    if (!file || !password) return;
    if (file.size > 100_000) { setMsg({ ok: false, text: 'Arquivo grande demais para um certificado A1 (.pfx).' }); return; }
    setBusy(true);
    setMsg(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      bytes.forEach(b => { binary += String.fromCharCode(b); });
      const d = await api({ method: 'POST', body: JSON.stringify({ pfxBase64: btoa(binary), password }) });
      setInfo(d.certificate);
      setFile(null);
      setPassword('');
      setMsg({ ok: true, text: 'Certificado importado.' });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm('Remover o certificado? Nenhuma nota será emitida até importar outro.')) return;
    setBusy(true);
    try {
      await api({ method: 'DELETE' });
      setInfo(null);
      setMsg({ ok: true, text: 'Certificado removido.' });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const daysLeft = info ? Math.floor((Date.parse(info.validTo) - Date.now()) / 86_400_000) : 0;

  return (
    <div className="flex flex-col gap-3">
      {info === undefined ? (
        <p className="text-[12px] text-faint">Carregando…</p>
      ) : info ? (
        <div className="rounded-lg border border-mist px-3 py-2.5">
          <p className="text-[13px] font-semibold text-ink">{info.titular}</p>
          <p className="text-[12px] text-mid">
            {info.cnpj ? `CNPJ ${info.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')} · ` : ''}válido até {fmt(info.validTo)}
          </p>
          {daysLeft <= 30 && <p className="text-[12px] font-semibold text-clay mt-1">{daysLeft < 0 ? 'Vencido: as notas não saem até importar um novo.' : `Vence em ${daysLeft} dias: renove e importe o novo.`}</p>}
        </div>
      ) : (
        <p className="text-[12px] text-faint">Nenhum certificado importado: as notas fiscais não são geradas.</p>
      )}
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-file`} className="block text-[13px] font-semibold text-mid">{info ? 'Trocar certificado (.pfx)' : 'Certificado A1 (.pfx ou .p12)'}</label>
        <input id={`${id}-file`} type="file" accept=".pfx,.p12,application/x-pkcs12" onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="text-[13px] text-ink file:mr-3 file:min-h-10 file:px-4 file:rounded-full file:border file:border-mist file:bg-paper file:text-[12px] file:font-semibold" />
        <label htmlFor={`${id}-pass`} className="block text-[13px] font-semibold text-mid">Senha do certificado</label>
        <input id={`${id}-pass`} type="password" autoComplete="off" value={password} onChange={e => setPassword(e.target.value)} className="panel-input" />
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy || !file || !password} onClick={upload}
            className="min-h-10 px-4 rounded-full bg-ink text-paper text-[12px] font-semibold disabled:opacity-50">{busy ? 'Conferindo…' : 'Importar certificado'}</button>
          {info && (
            <button type="button" disabled={busy} onClick={remove} className="min-h-10 px-3 text-[12px] font-semibold text-red-700 disabled:opacity-50">Remover</button>
          )}
        </div>
      </div>
      {msg && <p role="status" className={`text-[12px] font-semibold ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</p>}
    </div>
  );
}
