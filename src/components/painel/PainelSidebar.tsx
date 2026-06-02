'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';

const NAV = [
  { href: '/painel', label: 'Dashboard', icon: '▦' },
  { href: '/painel/pedidos', label: 'Pedidos', icon: '🛍' },
  { href: '/painel/produtos', label: 'Produtos', icon: '📦' },
  { href: '/painel/estoque', label: 'Estoque', icon: '📊' },
  { href: '/painel/relatorios', label: 'Relatórios', icon: '📈' },
  { href: '/painel/configuracoes', label: 'Configurações', icon: '⚙' },
];

export function PainelSidebar() {
  const pathname = usePathname();
  const { logout, user } = useAuth();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center border-b border-gray-200 px-5">
        <span className="text-sm font-semibold text-gray-900">Mikma · Painel</span>
      </div>

      <nav className="flex-1 px-3 py-4">
        <ul className="space-y-1">
          {NAV.map(({ href, label, icon }) => {
            const active = pathname === href;
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                    active
                      ? 'bg-blue-50 font-medium text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <span className="text-base">{icon}</span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-gray-200 px-4 py-4">
        <p className="truncate text-xs text-gray-500">{user?.email}</p>
        <button onClick={logout} className="mt-1 text-xs text-gray-400 hover:text-gray-700">
          Sair
        </button>
      </div>
    </aside>
  );
}
