'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { IconCard, IconMoney, IconBox, IconTruck, IconCheck, IconAlert, IconBell } from '@/components/ui/Icon';

type Notification = {
  id: string;
  type: string;
  message: string;
  url?: string;
  orderId?: string;
  read: boolean;
  createdAt: { toMillis: () => number } | null;
};

// Mesma paleta pastel usada nos badges de status do pedido (ver
// TIMELINE_TONE em painel/pedidos/[id]/page.tsx e .badge-* em
// globals.css) — fundo suave + ícone colorido, não círculo sólido com
// ícone branco. Mantém as notificações visualmente ligadas ao resto do
// painel em vez de introduzir uma paleta "SaaS genérica" nova.
const NOTIF_STYLE: Record<string, { Icon: React.FC<{ size?: number; className?: string }>; tone: string }> = {
  payment_initiated: { Icon: IconCard,  tone: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' },
  new_order:         { Icon: IconMoney, tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' },
  low_stock:         { Icon: IconBox,   tone: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' },
  uber_pickup:       { Icon: IconTruck, tone: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300' },
  uber_delivered:    { Icon: IconCheck, tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' },
  uber_problem:      { Icon: IconAlert, tone: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' },
};
const NOTIF_STYLE_DEFAULT = { Icon: IconBell, tone: 'bg-warm text-faint' };

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'notifications', 'seller', 'items'),
      orderBy('createdAt', 'desc'),
      limit(30)
    );
    // Falha aqui degrada em silêncio de propósito: o sino é um extra no
    // topo do painel, não pode virar erro na cara de quem está no meio
    // de um atendimento. Sem notificação é melhor que painel quebrado.
    return onSnapshot(
      q,
      snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notification))),
      err => console.error('[NotificationBell] onSnapshot:', err)
    );
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const PANEL_WIDTH = 320;
  const MARGIN = 12;

  function computePos() {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const left = Math.min(
      Math.max(MARGIN, r.right - PANEL_WIDTH),
      window.innerWidth - PANEL_WIDTH - MARGIN
    );
    setPos({ top: r.bottom + 8, left });
  }

  function toggleOpen() {
    if (!open) computePos();
    setOpen(o => !o);
  }

  useEffect(() => {
    if (!open) return;
    function onReposition() { computePos(); }
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const unread = items.filter(n => !n.read);

  async function handleClick(n: Notification) {
    if (!n.read) {
      updateDoc(doc(db, 'notifications', 'seller', 'items', n.id), { read: true }).catch(() => {});
    }
    setOpen(false);
    if (n.url) router.push(n.url);
  }

  async function markAllRead() {
    if (unread.length === 0) return;
    const batch = writeBatch(db);
    unread.forEach(n => batch.update(doc(db, 'notifications', 'seller', 'items', n.id), { read: true }));
    await batch.commit().catch(() => {});
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggleOpen}
        aria-label="Notificações"
        className="relative p-2 text-mid hover:text-ink hover:bg-warm transition-colors rounded-xl"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unread.length > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[15px] h-[15px] px-[3px] rounded-full bg-clay-l text-paper text-[9px] font-bold leading-[15px] text-center">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && pos && mounted && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: PANEL_WIDTH }}
          className="max-w-[calc(100vw-24px)] bg-white dark:bg-warm border border-mist/80 shadow-modal z-[100] max-h-[70vh] flex flex-col overflow-hidden rounded-xl"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-mist bg-warm/50">
            <p className="text-[12px] font-bold text-ink uppercase tracking-wide">Notificações</p>
            {unread.length > 0 && (
              <button onClick={markAllRead} className="text-[11px] font-semibold text-clay-l hover:text-clay-d transition-colors">
                Marcar todas como lidas
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1">
            {items.length === 0 ? (
              <p className="text-[12px] text-faint text-center py-8">Nenhuma notificação ainda.</p>
            ) : items.map(n => {
              const { Icon: NotifIcon, tone } = NOTIF_STYLE[n.type] ?? NOTIF_STYLE_DEFAULT;
              return (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 border-b border-warm last:border-0 hover:bg-warm transition-colors flex items-start gap-3 ${!n.read ? 'bg-[#FDF6EF]' : ''}`}
                >
                  <span className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center ${tone}`}>
                    <NotifIcon size={13} />
                  </span>
                  <span className="flex-1 min-w-0 pt-0.5">
                    <span className={`block text-[12.5px] leading-snug ${!n.read ? 'font-semibold text-ink' : 'text-mid'}`}>
                      {n.message}
                    </span>
                    {n.createdAt && (
                      <span className="block text-[10.5px] text-faint mt-0.5">{timeAgo(n.createdAt.toMillis())}</span>
                    )}
                  </span>
                  {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-clay-l shrink-0 mt-2" />}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
