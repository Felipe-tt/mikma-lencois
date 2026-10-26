'use client';
import { useEffect, useRef, useState } from 'react';
import type { SharedCartEdit } from '@/types';

// Peças visuais do "Montar junto", usadas pelo dono (carrinho) e por quem
// abriu o link.

const TONES = ['bg-clay text-paper', 'bg-ink text-paper', 'bg-[#6b7f5e] text-paper', 'bg-[#8a6a9e] text-paper', 'bg-[#4f7590] text-paper', 'bg-[#b07d3a] text-paper'];

function tone(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

export function Avatar({ name, size = 28, ring = true }: { name: string; size?: number; ring?: boolean }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?';
  return (
    <span title={name} aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${tone(name)} ${ring ? 'ring-2 ring-paper' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </span>
  );
}

/** Quem está online: bolinhas sobrepostas e o texto pra leitor de tela. */
export function OnlineStack({ people }: { people: { name: string; owner?: boolean }[] }) {
  if (people.length === 0) return null;
  const label = people.map(p => p.owner ? `${p.name} (quem compartilhou)` : p.name).join(', ');
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex -space-x-2">
        {people.slice(0, 5).map((p, i) => <Avatar key={p.name + i} name={p.name} />)}
      </span>
      {people.length > 5 && <span className="text-[12px] text-mid">+{people.length - 5}</span>}
      <span className="sr-only">Online agora: {label}</span>
    </span>
  );
}

export function timeAgo(at: number, now: number) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return 'agora';
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.round(h / 24)} d`;
}

/** Histórico das mudanças, da mais nova pra mais antiga. */
export function ActivityList({ log, now, limit = 15 }: { log: SharedCartEdit[]; now: number; limit?: number }) {
  const list = [...log].reverse().slice(0, limit);
  if (list.length === 0) return <p className="text-[12px] text-faint">Nenhuma mudança ainda.</p>;
  return (
    <ol className="flex flex-col gap-3">
      {list.map(e => (
        <li key={e.at + e.by} className="flex items-start gap-2.5 text-[12.5px] leading-snug">
          <Avatar name={e.by} size={22} ring={false} />
          <span className="flex-1 min-w-0 text-mid">
            <strong className="font-semibold text-ink">{e.by}</strong> {e.text}
            <span className="block text-[11px] text-faint mt-0.5">{timeAgo(e.at, now)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Recados entre quem está montando. `me` é o nome de quem está vendo. */
export function ChatBox({ messages, now, me, onSend, id }: {
  messages: SharedCartEdit[];
  now: number;
  me: string;
  onSend: (text: string) => Promise<true | string>;
  id?: string;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLOListElement>(null);
  const last = messages[messages.length - 1]?.at;
  // Rola pro recado mais novo quando chega um.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [last]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true); setError('');
    const r = await onSend(t);
    setSending(false);
    if (r === true) setText(''); else setError(r);
  }

  return (
    <div id={id} className="scroll-mt-24">
      {messages.length === 0
        ? <p className="text-[12px] text-faint mb-3">Mande um recado pra quem está montando, tipo &quot;essa cor combina com o quarto?&quot;.</p>
        : (
          <ol ref={listRef} className="mb-3 flex max-h-72 flex-col gap-2.5 overflow-y-auto pr-1" aria-label="Recados">
            {messages.map((m, i) => {
              const mine = m.by === me;
              // Seguidas da mesma pessoa: nome só na primeira, bolinha só na última.
              const first = messages[i - 1]?.by !== m.by;
              const last = messages[i + 1]?.by !== m.by;
              return (
                <li key={m.at + m.by} className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''} ${first ? '' : '-mt-1.5'}`}>
                  {!mine && (last ? <Avatar name={m.by} size={22} ring={false} /> : <span className="w-[22px] shrink-0" aria-hidden="true" />)}
                  <span className={`max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-snug break-words ${mine ? 'bg-ink text-paper' : 'bg-warm text-ink'} ${last ? (mine ? 'rounded-br-md' : 'rounded-bl-md') : ''}`}>
                    {!mine && first && <span className="block text-[11px] font-semibold text-mid mb-0.5">{m.by}</span>}
                    {m.text}
                    <span className={`block text-[10px] mt-1 ${mine ? 'text-paper/60' : 'text-faint'}`}>{timeAgo(m.at, now)}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      <form onSubmit={submit} className="flex gap-2">
        <label className="sr-only" htmlFor={`${id ?? 'chat'}-input`}>Recado</label>
        <input id={`${id ?? 'chat'}-input`} value={text} onChange={e => setText(e.target.value)} maxLength={200} placeholder="Escreva um recado" autoComplete="off" enterKeyHint="send"
          className="flex-1 min-w-0 h-11 rounded-full border border-mist bg-paper px-4 text-[14px] text-ink" />
        <button type="submit" disabled={!text.trim() || sending} aria-label="Enviar recado"
          className="w-11 h-11 shrink-0 rounded-full bg-ink text-paper flex items-center justify-center disabled:opacity-40">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
        </button>
      </form>
      {error && <p role="alert" className="mt-2 text-[12px] text-red-700">{error}</p>}
    </div>
  );
}

/** "Ana e Bia curtiram": nomes numa frase curta. */
export function likeText(names: string[]) {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} curtiu`;
  if (names.length === 2) return `${names[0]} e ${names[1]} curtiram`;
  return `${names[0]}, ${names[1]} e mais ${names.length - 2} curtiram`;
}

/** Coração pra votar num item. Sem `onToggle`, só mostra quem curtiu. */
export function LikeButton({ names, me, onToggle }: { names: string[]; me: string; onToggle?: () => void }) {
  const liked = names.includes(me);
  const heart = (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 000-7.8z" />
    </svg>
  );
  if (!onToggle) {
    return names.length > 0 ? <p className="inline-flex items-center gap-1.5 text-[12px] text-clay">{heart}{likeText(names)}</p> : null;
  }
  return (
    <button type="button" onClick={onToggle} aria-pressed={liked}
      className={`inline-flex items-center gap-1.5 min-h-9 rounded-full px-3 text-[12px] font-semibold transition-colors ${liked ? 'bg-clay/10 text-clay' : 'text-mid hover:text-clay'}`}>
      <span key={String(liked)} className={liked ? 'animate-heart-pop' : ''}>{heart}</span>
      {names.length > 0 ? likeText(names) : 'Curtir'}
    </button>
  );
}

/**
 * Com a aba em segundo plano, conta as novidades (mudanças e recados de
 * outras pessoas) no título: "(2) Carrinho de Maria". Some ao voltar.
 */
export function useTabBadge(events: { at: number; by: string }[], me: string) {
  const hiddenSince = useRef<number | null>(null);
  useEffect(() => {
    const strip = () => document.title.replace(/^\(\d+\) /, '');
    const onVis = () => {
      if (document.hidden) hiddenSince.current = Date.now();
      else { hiddenSince.current = null; document.title = strip(); }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  const last = events.reduce((m, e) => Math.max(m, e.at), 0);
  useEffect(() => {
    const since = hiddenSince.current;
    if (since === null || !document.hidden) return;
    const count = events.filter(e => e.at > since && e.by !== me).length;
    if (count > 0) document.title = `(${count}) ${document.title.replace(/^\(\d+\) /, '')}`;
  }, [last]); // eslint-disable-line react-hooks/exhaustive-deps
}
