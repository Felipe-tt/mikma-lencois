'use client';
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
