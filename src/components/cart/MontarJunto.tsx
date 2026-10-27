'use client';
import { useEffect, useState } from 'react';
import type { Cart } from '@/types';
import { VIEWER_TTL_MS } from '@/lib/sharedCart';
import { ChatBox, OnlineStack, useTabBadge } from '@/components/cart/montarUi';
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
  useTabBadge(active ? [...log, ...(share?.chat ?? [])] : [], me);
  async function sendMsg(text: string): Promise<true | string> {
    try {
      const msg = { by: me, text: text.slice(0, 200), at: Date.now() };
      await updateDoc(doc(db, 'carts', user.uid), { 'share.chat': [...(share?.chat ?? []), msg].slice(-CHAT_MAX) });
      return true;
    } catch { return 'Não deu para enviar. Tente de novo.'; }
  }

  async function call(method: 'POST' | 'DELETE' | 'PATCH') {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/cart/share', { method, headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? 'Não deu certo. Tente de novo.');
    } catch { setError('Sem conexão. Tente de novo.'); }
    finally { setBusy(false); }
  }

  async function shareLink() {
    await navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }


  // Os recados só aparecem depois que alguém entrou pelo link. Antes disso
  // é só o link, discreto.
  const othersLog = log.filter(e => e.by !== me);
  const chat = share?.chat ?? [];
  const joined = !!share?.joinedAt || othersLog.length > 0 || chat.some(m => m.by !== me);
  const eyebrow = 'font-sans text-xs font-bold tracking-[0.2em] uppercase text-faint';

  if (active) return (
    <section aria-labelledby="montar-junto-titulo" className="mt-6 rounded-2xl overflow-hidden border border-mist bg-warm/30 text-left">
      <div className="px-5 py-4 border-b border-mist flex items-center justify-between gap-3">
        <h2 id="montar-junto-titulo" className={eyebrow}>Montar junto</h2>
        <OnlineStack people={online} />
      </div>
      <div className="px-5 py-4">
        <p className="text-[13px] text-mid leading-relaxed">
          {!joined
            ? 'Link ligado. Mande para quem vai escolher com você.'
            : online.length === 0
              ? 'Ninguém está no link agora.'
              : online.length === 1 ? `${online[0].name} está montando com você.` : `${online.length} pessoas montando com você.`}
        </p>
        <p role="status" className="text-[12px] text-clay empty:hidden">{notice}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={`https://wa.me/?text=${encodeURIComponent(`Me ajuda a montar meu pedido na Mikma? ${url}`)}`} target="_blank" rel="noopener noreferrer"
                  className="h-10 px-4 rounded-full bg-[#1f7a4d] text-white text-[13px] font-semibold inline-flex items-center gap-2 hover:opacity-90 transition-opacity">
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 01-2-1.2 7.4 7.4 0 01-1.4-1.7c-.1-.2 0-.4.1-.5l.4-.4.2-.4v-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.7 11.8 11.8 0 004.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 001.8-1.2 2.2 2.2 0 00.1-1.3c0-.1-.2-.2-.4-.3z" /></svg>
                  WhatsApp
                </a>
          <button type="button" onClick={shareLink} className="h-10 px-4 rounded-full border border-mist bg-paper text-ink text-[13px] font-semibold hover:border-ink transition-colors">
            {copied ? 'Link copiado' : 'Copiar link'}
          </button>
        </div>
        <p className="mt-3 text-[11px] text-faint">
          Vale até {new Date(share!.expiresAt.toMillis()).toLocaleDateString('pt-BR')} ·{' '}
          {share!.expiresAt.toMillis() - openedAt < 3 * 86_400_000 && (
            <><button type="button" disabled={busy} onClick={() => call('PATCH')} className="font-semibold text-clay underline underline-offset-2 disabled:opacity-40">renovar por mais 7 dias</button>{' · '}</>
          )}
          <button type="button" disabled={busy} onClick={() => call('DELETE')} className="underline underline-offset-2 hover:text-ink disabled:opacity-40">desligar link</button>
        </p>
        {error && <p role="alert" className="mt-2 text-[12px] text-red-700">{error}</p>}
      </div>

      {joined && (
        <div className="px-5 py-4 border-t border-mist">
          <h3 className={`${eyebrow} mb-3`}>Recados</h3>
          <ChatBox id="carrinho-recados" messages={chat} now={now} me={me} onSend={sendMsg} />
        </div>
      )}
    </section>
  );

  return (
    <div className="mt-6 text-center">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="inline-block py-3 -my-3 text-xs text-faint hover:text-clay transition-colors">
          Montar junto com alguém
        </button>
      ) : (
        <div className="mt-2 rounded-2xl border border-mist bg-warm/30 p-5 text-left">
          <h2 className="font-sans text-xs font-bold tracking-[0.2em] uppercase text-faint">Montar junto</h2>
          <p className="mt-2 text-[13px] text-mid leading-relaxed">
            Gere um link e mande pra quem vai escolher com você: a pessoa vê este carrinho e pode adicionar, tirar, trocar fronhas e mandar recados em tempo real. Só você finaliza a compra.
          </p>
          {error && <p role="alert" className="mt-2 text-[12px] text-red-700">{error}</p>}
          <button type="button" disabled={busy} onClick={() => call('POST')} className="mt-3 h-11 px-5 rounded-full bg-ink text-paper text-[13px] font-semibold hover:bg-clay transition-colors disabled:opacity-40">
            {busy ? 'Criando…' : 'Criar link'}
          </button>
        </div>
      )}
    </div>
  );
}
