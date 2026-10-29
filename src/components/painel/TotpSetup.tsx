'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  multiFactor,
  TotpMultiFactorGenerator,
  type MultiFactorInfo,
  type TotpSecret,
} from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { confirmDialog } from '@/components/ui/ConfirmDialog';

const errCode = (e: unknown) => (e as { code?: string } | null)?.code ?? '';

function friendly(e: unknown): string {
  const c = errCode(e);
  if (c === 'auth/requires-recent-login') return 'Por segurança, saia e entre de novo antes de mexer na verificação em duas etapas.';
  if (c === 'auth/invalid-verification-code') return 'Código incorreto. Confira no app e tente de novo.';
  if (c === 'auth/operation-not-allowed') return 'A verificação por app ainda não foi ligada no Firebase. Avise o admin.';
  if (c === 'auth/unverified-email') return 'Confirme seu e-mail antes de ligar a verificação em duas etapas.';
  return 'Não foi possível concluir. Tente de novo.';
}

/**
 * App autenticador (TOTP do Firebase Auth): ligar com QR code, ver e
 * desligar. Usado em /painel/seguranca e na tela obrigatória do PainelGuard.
 */
export function TotpSetup({ onEnrolled }: { onEnrolled?: () => void } = {}) {
  const [factors, setFactors] = useState<MultiFactorInfo[]>([]);
  const [secret, setSecret] = useState<TotpSecret | null>(null);
  const [qr, setQr] = useState('');
  const [uri, setUri] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) return;
    await u.reload();
    setFactors([...multiFactor(u).enrolledFactors]);
  }, []);

  useEffect(() => {
    let alive = true;
    auth.currentUser?.getIdTokenResult().then(() => {
      if (alive && auth.currentUser) setFactors([...multiFactor(auth.currentUser).enrolledFactors]);
    });
    return () => { alive = false; };
  }, []);

  async function start() {
    const u = auth.currentUser;
    if (!u) return;
    setBusy(true); setMsg(null);
    try {
      const s = await TotpMultiFactorGenerator.generateSecret(await multiFactor(u).getSession());
      const link = s.generateQrCodeUrl(u.email ?? 'equipe', 'Mikma Lençóis');
      const QR = (await import('qrcode')).default;
      setQr(await QR.toDataURL(link, { margin: 1, width: 220 }));
      setUri(link);
      setSecret(s);
      setCode('');
    } catch (e) {
      setMsg({ ok: false, text: friendly(e) });
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    const u = auth.currentUser;
    if (!u || !secret) return;
    setBusy(true); setMsg(null);
    try {
      await multiFactor(u).enroll(TotpMultiFactorGenerator.assertionForEnrollment(secret, code), 'App autenticador');
      setSecret(null); setQr(''); setUri('');
      setMsg({ ok: true, text: 'Pronto. Nos próximos logins com senha ou Google, o site pede o código do app.' });
      await refresh();
      onEnrolled?.();
    } catch (err) {
      setMsg({ ok: false, text: friendly(err) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(f: MultiFactorInfo) {
    const u = auth.currentUser;
    if (!u) return;
    const { confirmed } = await confirmDialog({
      message: 'Desligar o app autenticador?',
      detail: 'Sem ele, sua conta da equipe só entra no painel com passkey.',
      confirmLabel: 'Desligar',
      variant: 'danger',
    });
    if (!confirmed) return;
    setBusy(true); setMsg(null);
    try {
      await multiFactor(u).unenroll(f);
      setMsg({ ok: true, text: 'App autenticador desligado.' });
      await refresh();
    } catch (err) {
      setMsg({ ok: false, text: friendly(err) });
    } finally {
      setBusy(false);
    }
  }

  const totp = factors.filter(f => f.factorId === TotpMultiFactorGenerator.FACTOR_ID);
  const groupedKey = secret?.secretKey.replace(/(.{4})/g, '$1 ').trim();

  return (
    <section className="rounded-2xl border border-mist bg-paper p-5 sm:p-6">
      <p className="text-[14px] font-semibold text-ink">App autenticador</p>
      <p className="text-[12.5px] text-mid mt-1 leading-relaxed">
        Google Authenticator, Microsoft Authenticator, Authy ou o app de senhas do iPhone. A cada login com senha
        ou Google, o site pede o código de 6 dígitos que aparece no app.
      </p>

      {totp.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2.5">
          {totp.map(f => (
            <li key={f.uid} className="flex items-center justify-between gap-3 rounded-xl border border-mist px-4 py-3">
              <span className="text-[13.5px] text-ink">
                {f.displayName || 'App autenticador'}
                <span className="block text-[11.5px] text-faint">Ligado em {new Date(f.enrollmentTime).toLocaleDateString('pt-BR')}</span>
              </span>
              <button onClick={() => remove(f)} disabled={busy} className="py-3 -my-3 text-[13px] font-medium text-mid hover:text-red-600 disabled:opacity-50">
                Desligar
              </button>
            </li>
          ))}
        </ul>
      )}

      {totp.length === 0 && !secret && (
        <button onClick={start} disabled={busy} className="btn-outline mt-4">
          {busy ? 'Preparando…' : 'Ligar app autenticador'}
        </button>
      )}

      {secret && (
        <form onSubmit={confirm} className="mt-5 flex flex-col gap-4">
          <ol className="list-decimal pl-5 text-[13px] text-mid space-y-1.5">
            <li>No app autenticador, toque em adicionar e leia o QR code.</li>
            <li>Ou, no mesmo celular, <a href={uri} className="underline text-ink">abra direto no app</a>, ou digite a chave abaixo.</li>
            <li>Digite o código de 6 dígitos que o app mostrar.</li>
          </ol>
          {qr && <img src={qr} alt="QR code para o app autenticador" width={220} height={220} className="rounded-xl border border-mist self-start" />}
          <code className="self-start rounded-lg bg-warm px-3 py-2 text-[13px] tracking-wider text-ink break-all">{groupedKey}</code>
          <input
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="Código de 6 dígitos"
            placeholder="000000"
            className="w-40 rounded-xl border border-mist px-4 py-3 text-center text-[18px] tracking-[0.3em] outline-none focus:border-ink"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => { setSecret(null); setQr(''); }} className="btn-outline">Cancelar</button>
            <button type="submit" disabled={busy || code.length !== 6} className="btn-primary disabled:opacity-50">Confirmar</button>
          </div>
        </form>
      )}

      {msg && (
        <p role="status" className={`mt-3 text-[12.5px] font-medium ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</p>
      )}
    </section>
  );
}
