'use client';
import { useEffect, useState } from 'react';
import type { Cart } from '@/types';
import { VIEWER_TTL_MS } from '@/lib/sharedCart';
import { ActivityList, ChatBox, OnlineStack } from '@/components/cart/montarUi';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { CHAT_MAX } from '@/lib/sharedCart';

/**
 * "Montar junto": link secreto pra outras pessoas mexerem neste carrinho
 * ao vivo (ver src/lib/sharedCart.ts). Discreto: um link de texto que abre
 * o painel com o endereço, copiar/compartilhar e desligar.
 */
export function MontarJunto({ cart, user }: { cart: Cart | null; user: { uid: string; getIdToken(): Promise<string> } }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [openedAt] = useState(() => Date.now());
  const share = cart?.share;
  const active = !!share && !share.paidAt && share.expiresAt.toMillis() > openedAt;
  const url = active ? `${window.location.origin}/montar/${share.token}` : '';

  // Aviso discreto quando alguém mexe pelo link ("Ana adicionou ...").
  const edit = share?.lastEdit;
  const [hiddenAt, setHiddenAt] = useState(0);
  const notice = edit && edit.at > openedAt && edit.at !== hiddenAt ? `${edit.by} ${edit.text}` : '';
  useEffect(() => {
    if (!edit) return;
    const t = setTimeout(() => setHiddenAt(edit.at), 5000);
    return () => clearTimeout(t);
  }, [edit]);

  // Enquanto o link está ligado, avisa que o dono está com o carrinho
  // aberto e atualiza o "há 2 min" das mudanças.
  const [now, setNow] = useState(openedAt);
  useEffect(() => {
    if (!active) return;
    const ping = () => {
      setNow(Date.now());
      if (document.visibilityState !== 'visible') return;
      user.getIdToken().then(t => fetch('/api/cart/share', { method: 'PUT', headers: { Authorization: `Bearer ${t}` } })).catch(() => {});
    };
    ping();
    const t = setInterval(ping, 45_000);
    return () => clearInterval(t);
  }, [active, user]);
  const online = Object.entries(share?.viewers ?? {})
    .filter(([id, v]) => id !== 'owner' && now - v.at < VIEWER_TTL_MS)
    .map(([, v]) => v);
  const log = share?.log ?? [];

  // Recado do dono: escreve direto no próprio carrinho (a regra deixa).
  const me = share?.ownerName || 'Dono';
  async function sendMsg(text: string): Promise<true | string> {
    try {
      const msg = { by: me, text: text.slice(0, 200), at: Date.now() };
      await updateDoc(doc(db, 'carts', user.uid), { 'share.chat': [...(share?.chat ?? []), msg].slice(-CHAT_MAX) });
      return true;
    } catch { return 'Não deu para enviar. Tente de novo.'; }
  }

  async function call(method: 'POST' | 'DELETE') {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/cart/share', { method, headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? 'Não deu certo. Tente de novo.');
    } catch { setError('Sem conexão. Tente de novo.'); }
    finally { setBusy(false); }
  }

  async function shareLink() {
    if (navigator.share) {
      try { await navigator.share({ title: 'Monta o pedido comigo', url }); return; } catch { /* cancelado */ }
    }
    await navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mt-6 text-center">
      <p role="status" className="min-h-0 text-[12px] text-clay">{notice}</p>
      {active && (
        <div className="mb-3 rounded-2xl border border-mist p-4 text-left">
          {online.length > 0 && (
            <p className="flex items-center gap-2 text-[12px] text-mid mb-3">
              <OnlineStack people={online} />
              {online.length === 1 ? `${online[0].name} está montando com você` : `${online.length} pessoas montando com você`}
            </p>
          )}
          {log.length > 0 && <ActivityList log={log} now={now} limit={3} />}
          <p className="mt-4 mb-2 text-[12px] font-semibold text-ink">Recados</p>
          <ChatBox id="carrinho-recados" messages={share?.chat ?? []} now={now} me={me} onSend={sendMsg} />
        </div>
      )}
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="inline-block py-3 -my-3 text-xs text-faint hover:text-clay transition-colors">
          {active ? 'Montando junto · ver link' : 'Montar junto com alguém'}
        </button>
      ) : (
        <div className="mt-2 rounded-2xl border border-mist p-4 text-left">
          <p className="text-[13px] font-semibold text-ink">Montar junto</p>
          <p className="mt-1 text-[12px] text-mid leading-relaxed">
            Quem tiver o link vê este carrinho e pode adicionar, tirar e trocar fronhas em tempo real. Só você finaliza a compra.
          </p>
          {error && <p role="alert" className="mt-2 text-[12px] text-red-700">{error}</p>}
          {active ? (
            <>
              <input readOnly value={url} aria-label="Link do carrinho" onFocus={e => e.currentTarget.select()}
                className="mt-3 w-full h-10 rounded-full border border-mist bg-warm/50 px-4 text-[12px] text-ink" />
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={shareLink} className="h-11 px-5 rounded-full bg-ink text-paper text-[13px] font-semibold hover:bg-clay transition-colors">
                  {copied ? 'Link copiado' : 'Compartilhar link'}
                </button>
                <button type="button" disabled={busy} onClick={() => call('DELETE')} className="h-11 px-4 rounded-full text-[13px] text-mid hover:text-ink disabled:opacity-40">
                  Desligar link
                </button>
              </div>
              <p className="mt-2 text-[11px] text-faint">Vale até {new Date(share!.expiresAt.toMillis()).toLocaleDateString('pt-BR')}.</p>
            </>
          ) : (
            <button type="button" disabled={busy} onClick={() => call('POST')} className="mt-3 h-11 px-5 rounded-full bg-ink text-paper text-[13px] font-semibold hover:bg-clay transition-colors disabled:opacity-40">
              {busy ? 'Criando…' : 'Criar link'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
