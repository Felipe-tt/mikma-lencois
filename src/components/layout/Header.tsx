'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useCartCount } from '@/lib/hooks/useCartCount';
import { usePathname } from 'next/navigation';

interface Props { topbarText?: string }

const NAV_LINKS = [
  { href: '/produtos', label: 'Produtos' },
  { href: '/sobre', label: 'Sobre' },
];

export function Header({ topbarText }: Props) {
  const { user, logout } = useAuth();
  const count = useCartCount();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  return (
    <>
      {topbarText && (
        <div className="bg-ink text-paper/50 text-2xs text-center py-2 tracking-[0.18em] uppercase font-medium">
          {topbarText}
        </div>
      )}

      <header className={`sticky top-0 z-40 bg-paper/95 backdrop-blur-sm transition-shadow duration-300 ${scrolled ? 'shadow-[0_1px_0_0_#E8E4DC]' : ''}`}>
        <div className="container-shop h-16 flex items-center gap-4">

          {/* Mobile menu toggle */}
          <button
            className="btn-ghost p-2 -ml-2 md:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 7h18M3 12h12M3 17h18"/>
            </svg>
          </button>

          {/* Logo */}
          <Link href="/" className="mr-auto md:mr-0 shrink-0">
            <Image src="/logo-dark.png" alt="Logo" width={110} height={55} className="h-9 w-auto object-contain" priority />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8 mx-auto">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`text-sm font-medium transition-colors duration-200 relative pb-0.5
                  after:absolute after:bottom-0 after:left-0 after:h-px after:bg-clay after:transition-all after:duration-250
                  ${pathname.startsWith(href)
                    ? 'text-ink after:w-full'
                    : 'text-mid hover:text-ink after:w-0 hover:after:w-full'
                  }`}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-1 ml-auto md:ml-0">
            {user ? (
              <>
                {(user.role === 'seller' || user.role === 'admin') && (
                  <Link href="/painel" className="hidden md:flex btn-ghost text-2xs font-bold tracking-[0.15em] uppercase">
                    Painel
                  </Link>
                )}
                <Link href="/conta" className="hidden md:block btn-ghost text-sm">
                  {user.displayName?.split(' ')[0] ?? 'Conta'}
                </Link>
                <button onClick={logout} className="hidden md:block btn-ghost text-sm text-faint">
                  Sair
                </button>
              </>
            ) : (
              <>
                <Link href="/entrar" className="hidden md:block btn-ghost text-sm">Entrar</Link>
                <Link href="/cadastro" className="hidden md:flex btn-clay text-2xs font-bold tracking-[0.12em] uppercase px-4 py-2.5">
                  Cadastrar
                </Link>
              </>
            )}

            {/* Cart */}
            <Link href="/carrinho" className="btn-ghost relative p-2" aria-label="Carrinho">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 01-8 0"/>
              </svg>
              {count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] rounded-full bg-clay text-paper text-2xs font-bold flex items-center justify-center leading-none px-1">
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-sm animate-fade-in"
            onClick={() => setMenuOpen(false)}
          />
          <div className="fixed top-0 left-0 z-50 w-[300px] h-full bg-paper shadow-2xl animate-slide-in flex flex-col">
            <div className="flex items-center justify-between px-5 h-16 border-b border-mist">
              <Link href="/" onClick={() => setMenuOpen(false)}>
                <Image src="/logo-dark.png" alt="Logo" width={100} height={50} className="h-8 w-auto object-contain" />
              </Link>
              <button className="btn-ghost p-2" onClick={() => setMenuOpen(false)} aria-label="Fechar menu">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <nav className="flex-1 px-2 py-5 flex flex-col overflow-y-auto">
              {NAV_LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={`px-4 py-3 text-base font-medium rounded-sm transition-colors ${
                    pathname.startsWith(href) ? 'text-clay bg-warm' : 'text-ink hover:bg-warm'
                  }`}
                >
                  {label}
                </Link>
              ))}

              <div className="divider my-4 mx-4" />

              {user ? (
                <>
                  <Link href="/conta" className="px-4 py-3 text-base font-medium text-ink hover:bg-warm rounded-sm transition-colors">
                    Minha conta
                  </Link>
                  {(user.role === 'seller' || user.role === 'admin') && (
                    <Link href="/painel" className="px-4 py-3 text-base font-medium text-ink hover:bg-warm rounded-sm transition-colors">
                      Painel
                    </Link>
                  )}
                  <button
                    onClick={logout}
                    className="text-left px-4 py-3 text-base font-medium text-faint hover:text-ink hover:bg-warm rounded-sm transition-colors"
                  >
                    Sair da conta
                  </button>
                </>
              ) : (
                <>
                  <Link href="/entrar" className="px-4 py-3 text-base font-medium text-ink hover:bg-warm rounded-sm transition-colors">
                    Entrar
                  </Link>
                  <div className="px-4 pt-3">
                    <Link href="/cadastro" className="btn-clay w-full justify-center">Criar conta</Link>
                  </div>
                </>
              )}
            </nav>

            <div className="px-5 py-4 border-t border-mist">
              <p className="text-2xs text-faint tracking-widest uppercase">Blumenau · SC · Brasil</p>
            </div>
          </div>
        </>
      )}
    </>
  );
}
