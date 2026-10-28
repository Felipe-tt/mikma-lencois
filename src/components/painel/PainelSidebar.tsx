'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/BrandLogo';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/db';
import {
  IconHome, IconOrders, IconMessages, IconProducts,
  IconInventory, IconReports, IconCoupons, IconSettings, IconMaintenance, IconExchange, IconStar, IconShield,
} from '@/components/ui/Icon';
import { NotificationBell } from './NotificationBell';
import { applyNavOrder, moveItem } from '@/lib/navOrder';
import { getStaffPrefs, setStaffPref } from '@/lib/staffPrefs';

// Segurar um item do menu por 2s entra no modo de reorganizar; aí é só
// arrastar para cima ou para baixo. A ordem fica salva na conta (vale em
// qualquer aparelho). Mexer o dedo antes dos 2s é rolagem normal.
const HOLD_MS = 2000;
const MOVE_TOLERANCE = 8;

export const NAV = [
  { href: '/painel',                label: 'Início',         desc: 'Resumo da loja',             exact: true, Icon: IconHome },
  { href: '/painel/pedidos',        label: 'Pedidos',        desc: 'Ver e separar pedidos',                   Icon: IconOrders },
  { href: '/painel/trocas',         label: 'Trocas',         desc: 'Trocas e devoluções',                     Icon: IconExchange },
  { href: '/painel/mensagens',      label: 'Mensagens',      desc: 'Conversas com clientes',                  Icon: IconMessages },
  { href: '/painel/produtos',       label: 'Produtos',       desc: 'Cadastrar e editar',                      Icon: IconProducts },
  { href: '/painel/estoque',        label: 'Estoque',        desc: 'Quantidades disponíveis',                 Icon: IconInventory },
  { href: '/painel/relatorios',     label: 'Relatórios',     desc: 'Vendas e faturamento',                    Icon: IconReports },
  { href: '/painel/cupons',         label: 'Cupons',         desc: 'Descontos para clientes',                 Icon: IconCoupons },
  { href: '/painel/configuracoes',  label: 'Configurações',  desc: 'Textos e informações',                    Icon: IconSettings },
  { href: '/painel/manutencao',     label: 'Manutenção',     desc: 'Controle de acesso ao site',              Icon: IconMaintenance },
  { href: '/painel/avaliacoes',     label: 'Avaliações',     desc: 'Moderar avaliações de clientes',          Icon: IconStar },
  { href: '/painel/seguranca',      label: 'Segurança',      desc: 'Verificação em duas etapas',              Icon: IconShield },
];

// Itens que ficam na barra inferior do mobile (os mais usados no dia a
// dia) — o resto continua acessível pelo drawer. Ver PainelSidebarWrapper.
export const TABBAR_NAV = [NAV[0], NAV[1], NAV[3], NAV[4], NAV[5]];

export function PainelSidebar({ onClose }: { onClose?: () => void } = {}) {
  const pathname = usePathname();
  const { logout, user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const uid = user?.uid;

  const [order, setOrder] = useState<string[] | null>(null);
  const items = useMemo(() => applyNavOrder(NAV, order), [order]);
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);
  const [editing, setEditing] = useState(false);
  const [dragHref, setDragHref] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const press = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const dragging = useRef(false);
  const suppressClick = useRef(false);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    getStaffPrefs(uid)
      .then(p => { if (alive && Array.isArray(p.navOrder)) setOrder(p.navOrder); })
      .catch(() => { /* sem preferência: ordem padrão */ });
    return () => { alive = false; };
  }, [uid]);

  const save = useCallback((hrefs: string[] | null) => {
    if (uid) setStaffPref(uid, 'navOrder', hrefs ?? []).catch(() => {});
  }, [uid]);

  const startDrag = useCallback((href: string, el: HTMLElement, pointerId: number) => {
    dragging.current = true;
    suppressClick.current = true;
    setDragHref(href);
    try { el.setPointerCapture(pointerId); } catch { /* ponteiro já solto */ }
  }, []);

  function onPointerDown(e: React.PointerEvent<HTMLLIElement>, href: string) {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const { pointerId } = e;
    if (editing) { startDrag(href, el, pointerId); return; }
    press.current = {
      x: e.clientX,
      y: e.clientY,
      timer: setTimeout(() => {
        press.current = null;
        setEditing(true);
        navigator.vibrate?.(30);
        startDrag(href, el, pointerId);
      }, HOLD_MS),
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLLIElement>) {
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE) {
      clearTimeout(p.timer);
      press.current = null;
    }
    if (!dragging.current || !dragHref || !listRef.current) return;
    // Posição alvo: o primeiro item cuja metade está abaixo do dedo.
    const rows = Array.from(listRef.current.children) as HTMLElement[];
    let to = rows.length - 1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { to = i; break; }
    }
    const list = itemsRef.current;
    const from = list.findIndex(i => i.href === dragHref);
    if (from === -1 || from === to) return;
    setOrder(moveItem(list, from, to).map(i => i.href));
  }

  function endPress() {
    if (press.current) { clearTimeout(press.current.timer); press.current = null; }
    if (!dragging.current) return;
    dragging.current = false;
    setDragHref(null);
    save(itemsRef.current.map(i => i.href));
  }

  // Arrastando com o dedo: impede a página de rolar junto (o touchmove
  // precisa ser não passivo para o preventDefault valer).
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const stop = (e: TouchEvent) => { if (dragging.current) e.preventDefault(); };
    el.addEventListener('touchmove', stop, { passive: false });
    return () => el.removeEventListener('touchmove', stop);
  }, []);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setEditing(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing]);

  useEffect(() => {
    // Contador de não lidas: se falhar, some o selinho e nada mais.
    return onSnapshot(
      query(collection(db, 'conversations'), where('unread', '==', true)),
      snap => setUnreadCount(snap.size),
      err => console.error('[PainelSidebar] contador de mensagens:', err)
    );
  }, []);

  return (
    <aside aria-label="Menu do painel" className="w-64 shrink-0 flex flex-col bg-paper h-full border-r border-mist/70">
      {/* Brand */}
      <div className="h-16 flex items-center justify-between px-4">
        {/* <a> normal (não <Link>) de propósito: sair do painel precisa de
            um reload de página completo, não uma navegação client-side do
            Next.js. Se o site estiver em manutenção e o cookie de bypass
            do staff (__session, expira em 1h) tiver expirado nesse
            instante, o middleware redireciona pra /manutencao — só que
            durante uma navegação client-side (<Link>) o App Router às
            vezes não segue esse redirect corretamente, deixando a pessoa
            "presa" na tela do painel sem nenhum erro visível. Um <a>
            força reload completo, o navegador sempre respeita o redirect
            do middleware, então na pior das hipóteses cai em /manutencao
            (nunca fica parado sem reação). */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 -ml-2 hover:bg-warm transition-colors">
          <BrandLogo alt="Mikma" className="h-7 w-auto object-contain" />
          <div className="w-px h-4 bg-mist" />
          <span className="font-mono text-[9px] text-clay tracking-[0.22em] uppercase">Painel</span>
        </a>
        <NotificationBell />
      </div>

      {/* Nav */}
      <nav aria-label="Navegação principal" data-nav-editing={editing ? '' : undefined} className="flex-1 px-3 py-2 overflow-y-auto scrollbar-none">
        {editing && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-clay/10 px-3 py-2">
            <span className="text-[11.5px] font-medium text-ink">Arraste para mudar a ordem</span>
            <span className="flex gap-1">
              <button type="button" onClick={() => { setOrder(null); save(null); }} className="rounded-lg px-2 py-1 text-[11px] text-mid hover:bg-warm">Padrão</button>
              <button type="button" onClick={() => setEditing(false)} className="rounded-lg bg-ink px-2.5 py-1 text-[11px] font-semibold text-paper">Pronto</button>
            </span>
          </div>
        )}
        <ul ref={listRef} className="flex flex-col gap-1">
          {items.map(({ href, label, desc, exact, Icon }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            const isDragged = dragHref === href;
            return (
              <li
                key={href}
                onPointerDown={e => onPointerDown(e, href)}
                onPointerMove={onPointerMove}
                onPointerUp={endPress}
                onPointerCancel={endPress}
                onContextMenu={e => e.preventDefault()}
                className={`select-none [-webkit-touch-callout:none] rounded-xl transition-[transform,box-shadow] duration-150 ${
                  editing ? 'touch-none cursor-grab' : ''
                } ${isDragged ? 'relative z-10 scale-[1.03] shadow-lg bg-paper cursor-grabbing' : ''}`}
              >
                <Link
                  href={href}
                  draggable={false}
                  onClick={e => {
                    if (editing || suppressClick.current) { e.preventDefault(); suppressClick.current = false; return; }
                    onClose?.();
                  }}
                  aria-current={active ? 'page' : undefined}
                  className={`panel-nav-item ${active ? 'is-active' : ''}`}
                >
                  <span className={`shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                    active ? 'bg-clay/15 text-clay' : 'text-mid'
                  }`}>
                    <Icon size={15} />
                  </span>
                  <span className="flex flex-col flex-1 min-w-0">
                    <span className="text-[13px] font-semibold leading-tight flex items-center gap-2">
                      {label}
                      {href === '/painel/mensagens' && unreadCount > 0 && (
                        <span className="text-[10px] font-bold leading-none px-1.5 py-0.5 rounded-full bg-clay-l text-paper">
                          {unreadCount}
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] leading-tight truncate text-faint">{desc}</span>
                  </span>
                  {editing && (
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-faint">
                      <path d="M4 8h16M4 16h16" />
                    </svg>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 pt-2 space-y-1">
        <div className="rounded-xl bg-warm/60 px-3 py-2.5 mb-2">
          <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-faint mb-0.5">Sessão</p>
          <p className="text-[11.5px] text-ink font-medium truncate">{user?.email}</p>
        </div>
        {/* <a> normal, não <Link>, mesmo motivo do logo acima. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="flex items-center gap-2 min-h-10 px-3 py-2 text-[12px] text-mid hover:text-ink hover:bg-warm transition-colors rounded-xl"
        >
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          Ver loja
        </a>
        <button
          onClick={logout}
          className="flex items-center gap-2 w-full px-3 py-2 text-[12px] text-mid hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors rounded-xl text-left"
        >
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sair da conta
        </button>
      </div>
    </aside>
  );
}
