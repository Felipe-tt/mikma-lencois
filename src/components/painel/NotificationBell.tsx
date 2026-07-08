'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

type Notification = {
  id: string;
  type: string;
  message: string;
  url?: string;
  orderId?: string;
  read: boolean;
  createdAt: { toMillis: () => number } | null;
};

const ICON_BY_TYPE: Record<string, string> = {
  payment_initiated: '💳',
  new_order: '🎉',
  uber_pickup: '🛵',
  uber_delivered: '✅',
  uber_problem: '⚠️',
  low_stock: '📦',
};

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
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'notifications', 'seller', 'items'),
      orderBy('createdAt', 'desc'),
      limit(30)
    );
    return onSnapshot(q, snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notification)));
    });
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

  function toggleOpen() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    }
    setOpen(o => !o);
  }

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
        className="relative p-2 text-[#705A48] hover:text-[#1E1208] hover:bg-[#F0EBE1] transition-colors rounded-sm"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unread.length > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[15px] h-[15px] px-[3px] rounded-full bg-[#C4714A] text-white text-[9px] font-bold leading-[15px] text-center">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && pos && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, right: pos.right }}
          className="w-80 max-w-[90vw] bg-white border border-[#E6DFD5] shadow-lg z-[100] max-h-[70vh] flex flex-col"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#E6DFD5]">
            <p className="text-[12px] font-bold text-[#1E1208] uppercase tracking-wide">Notificações</p>
            {unread.length > 0 && (
              <button onClick={markAllRead} className="text-[11px] font-semibold text-[#C4714A] hover:text-[#A05432] transition-colors">
                Marcar todas como lidas
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1">
            {items.length === 0 ? (
              <p className="text-[12px] text-[#B09C8C] text-center py-8">Nenhuma notificação ainda.</p>
            ) : items.map(n => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`w-full text-left px-4 py-3 border-b border-[#F0EBE1] last:border-0 hover:bg-[#F0EBE1] transition-colors flex items-start gap-2.5 ${!n.read ? 'bg-[#FDF6EF]' : ''}`}
              >
                <span className="text-[15px] shrink-0 mt-0.5">{ICON_BY_TYPE[n.type] ?? '🔔'}</span>
                <span className="flex-1 min-w-0">
                  <span className={`block text-[12.5px] leading-snug ${!n.read ? 'font-semibold text-[#1E1208]' : 'text-[#705A48]'}`}>
                    {n.message}
                  </span>
                  {n.createdAt && (
                    <span className="block text-[10.5px] text-[#B09C8C] mt-0.5">{timeAgo(n.createdAt.toMillis())}</span>
                  )}
                </span>
                {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-[#C4714A] shrink-0 mt-1.5" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
