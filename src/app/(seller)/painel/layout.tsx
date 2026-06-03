'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';

const NAV = [
  { href: '/painel', label: 'Dashboard', exact: true },
  { href: '/painel/pedidos', label: 'Pedidos' },
  { href: '/painel/produtos/novo', label: 'Novo produto' },
  { href: '/painel/estoque', label: 'Estoque' },
  { href: '/painel/configuracoes', label: 'Configurações' },
];

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) router.push('/entrar');
  }, [user, loading, router]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="spinner" /></div>;
  }

  return (
    <div className="flex min-h-screen bg-paper">
      <aside className="w-52 shrink-0 flex flex-col border-r border-cream-dark bg-paper min-h-screen">
        <div className="h-14 flex items-center px-5 border-b border-cream-dark">
          <Link href="/" className="no-underline flex items-baseline gap-1">
            <span className="font-display text-[17px] text-ink">Mikma</span>
            <span className="text-[9px] font-semibold tracking-[0.2em] uppercase text-warm-dark ml-1">Painel</span>
          </Link>
        </div>
        <nav className="flex-1 py-3 px-2">
          <ul className="list-none p-0 m-0 flex flex-col gap-0.5">
            {NAV.map(({ href, label, exact }) => {
              const active = exact ? pathname === href : pathname.startsWith(href);
              return (
                <li key={href}>
                  <Link href={href} className={`flex items-center px-3 py-2 text-[13px] no-underline border-l-2 transition-all duration-150
                    ${active
                      ? 'border-l-warm-dark text-ink font-semibold bg-cream'
                      : 'border-l-transparent text-ink-light hover:text-ink hover:bg-cream/50'
                    }`}>
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
      <main className="flex-1 px-10 py-9">{children}</main>
    </div>
  );
}
