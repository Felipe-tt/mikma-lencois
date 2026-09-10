'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/BrandLogo';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import {
  IconHome, IconOrders, IconMessages, IconProducts,
  IconInventory, IconReports, IconCoupons, IconSettings, IconMaintenance, IconExchange,
} from '@/components/ui/Icon';
import { NotificationBell } from './NotificationBell';

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
];

// Itens que ficam na barra inferior do mobile (os mais usados no dia a
// dia) — o resto continua acessível pelo drawer. Ver PainelSidebarWrapper.
export const TABBAR_NAV = [NAV[0], NAV[1], NAV[3], NAV[4], NAV[5]];

export function PainelSidebar({ onClose }: { onClose?: () => void } = {}) {
  const pathname = usePathname();
  const { logout, user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'conversations'), where('unread', '==', true)),
      snap => setUnreadCount(snap.size)
    );
  }, []);

  return (
    <aside className="w-64 shrink-0 flex flex-col bg-paper h-full border-r border-mist/70">
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
        <a href="/" className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 -ml-2 hover:bg-warm transition-colors">
          <BrandLogo alt="Mikma" className="h-7 w-auto object-contain" />
          <div className="w-px h-4 bg-mist" />
          <span className="font-mono text-[9px] text-clay-l tracking-[0.22em] uppercase">Painel</span>
        </a>
        <NotificationBell />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto scrollbar-none">
        <ul className="flex flex-col gap-1">
          {NAV.map(({ href, label, desc, exact, Icon }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onClose}
                  className={`panel-nav-item ${active ? 'is-active' : ''}`}
                >
                  <span className={`shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                    active ? 'bg-clay/15 text-clay-l' : 'text-mid'
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
        <a
          href="/"
          className="flex items-center gap-2 px-3 py-2 text-[12px] text-mid hover:text-ink hover:bg-warm transition-colors rounded-xl"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          Ver loja
        </a>
        <button
          onClick={logout}
          className="flex items-center gap-2 w-full px-3 py-2 text-[12px] text-mid hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors rounded-xl text-left"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sair da conta
        </button>
      </div>
    </aside>
  );
}
