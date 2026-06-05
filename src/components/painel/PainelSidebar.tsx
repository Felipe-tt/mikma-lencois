'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';

const NAV = [
  { href:'/painel', label:'Dashboard', exact:true },
  { href:'/painel/pedidos', label:'Pedidos' },
  { href:'/painel/produtos', label:'Produtos' },
  { href:'/painel/estoque', label:'Estoque' },
  { href:'/painel/relatorios', label:'Relatórios' },
  { href:'/painel/cupons', label:'Cupons' },
  { href:'/painel/configuracoes', label:'Config.' },
];

export function PainelSidebar({ onClose }: { onClose?: () => void } = {}) {
  const pathname = usePathname();
  const { logout, user } = useAuth();

  return (
    <aside className="w-52 shrink-0 flex flex-col border-r border-mist bg-paper min-h-screen">
      {/* Brand */}
      <div className="h-14 flex items-center px-5 border-b border-mist">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo-dark.png" alt="Mikma Lençóis" width={90} height={45} className="h-8 w-auto object-contain" />
          <span className="text-2xs text-clay font-semibold tracking-[0.2em] uppercase leading-none">Painel</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4">
        <ul className="flex flex-col gap-0.5">
          {NAV.map(({ href, label, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link href={href}
                  className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all duration-200 rounded-sm
                    ${active
                      ? 'bg-ink text-paper'
                      : 'text-mid hover:text-ink hover:bg-warm'
                    }`}>
                  <span className={`w-1 h-4 rounded-full ${active ? 'bg-clay' : 'bg-transparent'}`} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User */}
      <div className="border-t border-mist px-5 py-4">
        <p className="text-xs text-faint truncate mb-2">{user?.email}</p>
        <button onClick={logout}
          className="text-xs text-faint hover:text-clay transition-colors font-medium tracking-wide">
          Sair da conta
        </button>
      </div>
    </aside>
  );
}
