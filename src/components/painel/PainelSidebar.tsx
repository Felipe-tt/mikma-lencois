'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

const NAV = [
  { href: '/painel', label: 'Início', desc: 'Resumo da loja', exact: true, icon: '🏠' },
  { href: '/painel/pedidos', label: 'Pedidos', desc: 'Ver e separar pedidos', icon: '📦' },
  { href: '/painel/mensagens', label: 'Mensagens', desc: 'Conversas com clientes', icon: '✉️' },
  { href: '/painel/produtos', label: 'Produtos', desc: 'Cadastrar e editar', icon: '🛍' },
  { href: '/painel/estoque', label: 'Estoque', desc: 'Quantidades disponíveis', icon: '📋' },
  { href: '/painel/relatorios', label: 'Relatórios', desc: 'Vendas e faturamento', icon: '📊' },
  { href: '/painel/cupons', label: 'Cupons', desc: 'Descontos para clientes', icon: '🎟' },
  { href: '/painel/configuracoes', label: 'Configurações', desc: 'Textos e informações', icon: '⚙️' },
  { href: '/painel/manutencao', label: 'Manutenção', desc: 'Controle de acesso ao site', icon: '🔧' },
];

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
    <aside className="w-60 shrink-0 flex flex-col border-r border-[#E6DFD5] bg-[#FAF8F5] min-h-screen">
      {/* Brand */}
      <div className="h-[64px] flex items-center px-5 border-b border-[#E6DFD5]">
        <Link href="/" className="flex items-center gap-3" onClick={onClose}>
          <Image src="/logo-dark.png" alt="Mikma" width={800} height={242} className="h-7 w-auto object-contain" />
          <div className="w-px h-4 bg-[#E6DFD5]" />
          <span className="font-mono text-[9px] text-[#C4714A] tracking-[0.22em] uppercase">Painel</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <ul className="flex flex-col gap-0.5">
          {NAV.map(({ href, label, desc, exact, icon }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2.5 transition-all duration-150 rounded-sm
                    ${active
                      ? 'bg-[#1E1208] text-[#FAF8F5]'
                      : 'text-[#705A48] hover:text-[#1E1208] hover:bg-[#F0EBE1]'
                    }`}
                >
                  <span className="text-base shrink-0">{icon}</span>
                  <span className="flex flex-col flex-1">
                    <span className="text-[13px] font-semibold leading-tight flex items-center gap-2">
                      {label}
                      {href === '/painel/mensagens' && unreadCount > 0 && (
                        <span className="text-[10px] font-bold leading-none px-1.5 py-0.5 rounded-full bg-[#C4714A] text-white">
                          {unreadCount}
                        </span>
                      )}
                    </span>
                    <span className={`text-[10px] leading-tight ${active ? 'text-[#FAF8F5]/50' : 'text-[#B09C8C]'}`}>{desc}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-[#E6DFD5] px-4 py-4 space-y-1">
        <p className="text-[11px] text-[#B09C8C] truncate font-medium px-3 py-1">{user?.email}</p>
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2 text-[12px] text-[#705A48] hover:text-[#1E1208] hover:bg-[#F0EBE1] transition-colors rounded-sm"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          Ver loja
        </Link>
        <button
          onClick={logout}
          className="flex items-center gap-2 w-full px-3 py-2 text-[12px] text-[#705A48] hover:text-red-500 hover:bg-red-50 transition-colors rounded-sm text-left"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sair da conta
        </button>
      </div>
    </aside>
  );
}
