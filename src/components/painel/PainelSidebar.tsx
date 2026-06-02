'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';

const NAV = [
  { href: '/painel', label: 'Dashboard', icon: '▦', exact: true },
  { href: '/painel/pedidos', label: 'Pedidos', icon: '◫' },
  { href: '/painel/produtos', label: 'Produtos', icon: '◻' },
  { href: '/painel/estoque', label: 'Estoque', icon: '◈' },
  { href: '/painel/relatorios', label: 'Relatórios', icon: '◉' },
  { href: '/painel/cupons', label: 'Cupons', icon: '◇' },
  { href: '/painel/configuracoes', label: 'Config.', icon: '◎' },
];

export function PainelSidebar() {
  const pathname = usePathname();
  const { logout, user } = useAuth();

  return (
    <aside style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--cream-d)', background: 'var(--white)', minHeight: '100vh' }}>
      {/* Brand */}
      <div style={{ height: 56, display: 'flex', alignItems: 'center', padding: '0 20px', borderBottom: '1px solid var(--cream-d)' }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 17, color: 'var(--ink)' }}>Mikma</span>
          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--warm-d)', marginLeft: 5 }}>Painel</span>
        </Link>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 8px' }}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map(({ href, label, icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link href={href} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', textDecoration: 'none', fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--ink)' : 'var(--ink-l)',
                  background: active ? 'var(--cream)' : 'transparent',
                  borderLeft: active ? '2px solid var(--warm-d)' : '2px solid transparent',
                  transition: 'all 0.15s',
                }}>
                  <span style={{ fontSize: 14, color: active ? 'var(--warm-d)' : 'var(--ink-l)', width: 16, textAlign: 'center' }}>{icon}</span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User */}
      <div style={{ borderTop: '1px solid var(--cream-d)', padding: '16px 20px' }}>
        <p style={{ fontSize: 11, color: 'var(--ink-l)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 6 }}>{user?.email}</p>
        <button onClick={logout} style={{ fontSize: 11, color: 'var(--ink-l)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, letterSpacing: '0.04em' }}
          className="hover:text-ink transition-colors">
          Sair da conta
        </button>
      </div>
    </aside>
  );
}
