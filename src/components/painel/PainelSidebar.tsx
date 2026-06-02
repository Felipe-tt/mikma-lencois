'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';

const NAV = [
  { href: '/painel', label: 'Dashboard', exact: true, icon: <DashIcon /> },
  { href: '/painel/pedidos', label: 'Pedidos', icon: <OrdersIcon /> },
  { href: '/painel/produtos', label: 'Produtos', icon: <ProductsIcon /> },
  { href: '/painel/estoque', label: 'Estoque', icon: <StockIcon /> },
  { href: '/painel/relatorios', label: 'Relatórios', icon: <ChartIcon /> },
  { href: '/painel/cupons', label: 'Cupons', icon: <TagIcon /> },
  { href: '/painel/configuracoes', label: 'Config.', icon: <SettingsIcon /> },
];

export function PainelSidebar() {
  const pathname = usePathname();
  const { logout, user } = useAuth();

  return (
    <aside className="w-52 shrink-0 flex flex-col border-r border-cream-dark bg-paper min-h-screen">
      {/* Brand */}
      <div className="h-14 flex items-center px-5 border-b border-cream-dark">
        <Link href="/" className="no-underline flex items-baseline gap-1">
          <span className="font-display text-[17px] text-ink">Mikma</span>
          <span className="text-[9px] font-semibold tracking-[0.2em] uppercase text-warm-dark ml-1">Painel</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2">
        <ul className="list-none p-0 m-0 flex flex-col gap-0.5">
          {NAV.map(({ href, label, icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link href={href} className={`flex items-center gap-2.5 px-3 py-2 text-[13px] no-underline rounded-none border-l-2 transition-all duration-150
                  ${active
                    ? 'border-l-warm-dark text-ink font-semibold bg-cream'
                    : 'border-l-transparent text-ink-light font-normal hover:text-ink hover:bg-cream/50'
                  }`}
                >
                  <span className={`w-4 h-4 shrink-0 ${active ? 'text-warm-dark' : 'text-ink-light'}`}>{icon}</span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User */}
      <div className="border-t border-cream-dark px-5 py-4">
        <p className="text-[11px] text-ink-light truncate mb-1.5">{user?.email}</p>
        <button onClick={logout} className="text-[11px] text-ink-light bg-transparent border-none p-0 hover:text-ink transition-colors tracking-[0.04em]">
          Sair da conta
        </button>
      </div>
    </aside>
  );
}

function DashIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>;
}
function OrdersIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>;
}
function ProductsIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
}
function StockIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>;
}
function ChartIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
}
function TagIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
}
function SettingsIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
}
