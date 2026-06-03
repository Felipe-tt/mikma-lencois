'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';

const NAV = [
  { href: '/painel',              label: 'Dashboard',   icon: GridIcon,     exact: true },
  { href: '/painel/pedidos',      label: 'Pedidos',     icon: ClipboardIcon },
  { href: '/painel/produtos',     label: 'Produtos',    icon: BoxIcon },
  { href: '/painel/estoque',      label: 'Estoque',     icon: StackIcon },
  { href: '/painel/relatorios',   label: 'Relatórios',  icon: ChartIcon },
  { href: '/painel/cupons',       label: 'Cupons',      icon: TagIcon },
  { href: '/painel/configuracoes',label: 'Config.',     icon: GearIcon },
];

export function PainelSidebar() {
  const path = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="w-56 shrink-0 flex flex-col border-r border-stone-200 bg-white min-h-screen">
      <div className="h-14 flex items-center px-5 border-b border-stone-200">
        <Link href="/" className="flex items-baseline gap-1.5">
          <span className="font-display text-lg text-stone-900">Mikma</span>
          <span className="text-2xs font-semibold tracking-[0.2em] uppercase text-gold-600">Painel</span>
        </Link>
      </div>

      <nav className="flex-1 py-4 px-3">
        <ul className="flex flex-col gap-0.5">
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? path === href : path.startsWith(href);
            return (
              <li key={href}>
                <Link href={href} className={`flex items-center gap-2.5 px-3 py-2 text-sm border-l-2 rounded-sm transition-all duration-150
                  ${active
                    ? 'border-l-gold-600 text-stone-900 font-semibold bg-stone-100'
                    : 'border-l-transparent text-stone-500 hover:text-stone-900 hover:bg-stone-50'
                  }`}
                >
                  <span className={`w-[18px] h-[18px] shrink-0 ${active ? 'text-gold-600' : 'text-stone-400'}`}>
                    <Icon />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-stone-200 px-5 py-4">
        <p className="text-xs text-stone-400 truncate mb-1">{user?.email}</p>
        <Link href="/" className="text-xs text-stone-400 hover:text-stone-700 transition-colors block mb-1">← Voltar à loja</Link>
        <button onClick={logout} className="text-xs text-stone-400 hover:text-stone-700 transition-colors">Sair</button>
      </div>
    </aside>
  );
}

function GridIcon()      { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>; }
function ClipboardIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>; }
function BoxIcon()       { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>; }
function StackIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>; }
function ChartIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>; }
function TagIcon()       { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>; }
function GearIcon()      { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>; }
