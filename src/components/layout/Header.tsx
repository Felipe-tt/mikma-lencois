'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useCartCount } from '@/lib/hooks/useCartCount';
import { usePathname } from 'next/navigation';

export function Header() {
  const { user, logout } = useAuth();
  const count = useCartCount();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 4);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  return (
    <>
      {/* Topbar */}
      <div className="bg-ink text-paper/60 text-2xs text-center py-2 tracking-[0.15em] uppercase font-medium">
        Entrega local Blumenau em 1h &nbsp;·&nbsp; PIX com confirmação automática
      </div>

      <header className={`sticky top-0 z-40 bg-paper transition-all duration-250 ${scrolled ? 'shadow-[0_1px_0_0_#E8E4DC]' : ''}`}>
        <div className="container-shop h-16 flex items-center gap-4">

          {/* Mobile menu btn */}
          <button className="btn-ghost p-2 -ml-2 md:hidden" onClick={() => setMenuOpen(true)} aria-label="Menu">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M3 7h18M3 12h12M3 17h18"/>
            </svg>
          </button>

          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 mr-auto md:mr-0 group">
            <div className="w-8 h-8 bg-ink flex items-center justify-center group-hover:bg-clay transition-colors duration-250">
              <span className="font-display text-paper text-base font-bold leading-none">M</span>
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-display text-ink text-lg font-medium tracking-tight leading-none">Mikma</span>
              <span className="text-2xs text-clay font-semibold tracking-[0.2em] uppercase leading-none mt-0.5">Lençóis</span>
            </div>
          </Link>

          {/* Nav desktop */}
          <nav className="hidden md:flex items-center gap-8 mx-auto">
            {[{href:'/produtos',label:'Produtos'},{href:'/sobre',label:'Sobre'}].map(({href,label}) => (
              <Link key={href} href={href}
                className={`text-sm font-medium transition-colors duration-200 relative
                  after:absolute after:bottom-0 after:left-0 after:h-px after:bg-clay after:transition-all after:duration-250
                  ${pathname.startsWith(href) ? 'text-ink after:w-full' : 'text-mid hover:text-ink after:w-0 hover:after:w-full'}`}>
                {label}
              </Link>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-1 ml-auto md:ml-0">
            {user ? (
              <>
                {(user.role === 'seller' || user.role === 'admin') && (
                  <Link href="/painel" className="hidden md:flex btn-ghost text-2xs font-bold tracking-[0.15em] uppercase px-3 py-2">Painel</Link>
                )}
                <Link href="/conta" className="hidden md:block btn-ghost text-sm">
                  {user.displayName?.split(' ')[0] ?? 'Conta'}
                </Link>
                <button onClick={logout} className="hidden md:block btn-ghost text-sm text-faint">Sair</button>
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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 01-8 0"/>
              </svg>
              {count > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] rounded-full bg-clay text-paper text-2xs font-bold flex items-center justify-center leading-none px-1">
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
          <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm animate-fade-in" onClick={() => setMenuOpen(false)} />
          <div className="fixed top-0 left-0 z-50 w-80 h-full bg-paper shadow-2xl animate-slide-in flex flex-col">
            <div className="flex items-center justify-between px-6 h-16 border-b border-mist">
              <Link href="/" className="flex items-center gap-2.5" onClick={() => setMenuOpen(false)}>
                <div className="w-7 h-7 bg-ink flex items-center justify-center">
                  <span className="font-display text-paper text-sm font-bold">M</span>
                </div>
                <span className="font-display text-ink text-lg">Mikma</span>
              </Link>
              <button className="btn-ghost p-2" onClick={() => setMenuOpen(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <nav className="flex-1 px-3 py-6 flex flex-col gap-0.5 overflow-y-auto">
              {[{href:'/produtos',label:'Produtos'},{href:'/sobre',label:'Sobre'}].map(({href,label}) => (
                <Link key={href} href={href}
                  className="px-4 py-3.5 text-base font-medium text-ink hover:bg-warm rounded-sm transition-colors">
                  {label}
                </Link>
              ))}
              <div className="divider my-3 mx-4" />
              {user ? (
                <>
                  <Link href="/conta" className="px-4 py-3.5 text-base font-medium text-ink hover:bg-warm rounded-sm transition-colors">Minha conta</Link>
                  {(user.role === 'seller' || user.role === 'admin') && (
                    <Link href="/painel" className="px-4 py-3.5 text-base font-medium text-ink hover:bg-warm rounded-sm transition-colors">Painel</Link>
                  )}
                  <button onClick={logout} className="text-left px-4 py-3.5 text-base font-medium text-faint hover:text-ink hover:bg-warm rounded-sm transition-colors">
                    Sair da conta
                  </button>
                </>
              ) : (
                <>
                  <Link href="/entrar" className="px-4 py-3.5 text-base font-medium text-ink hover:bg-warm rounded-sm transition-colors">Entrar</Link>
                  <div className="px-4 pt-2">
                    <Link href="/cadastro" className="btn-clay w-full justify-center">Criar conta</Link>
                  </div>
                </>
              )}
            </nav>
          </div>
        </>
      )}
    </>
  );
}
