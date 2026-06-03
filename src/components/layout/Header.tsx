'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useCartCount } from '@/lib/hooks/useCartCount';

export function Header() {
  const { user, logout } = useAuth();
  const count = useCartCount();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // Lock scroll when mobile menu open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  return (
    <>
      {/* Announcement bar */}
      <div className="bg-stone-900 text-stone-300 text-2xs text-center py-2 tracking-widest uppercase">
        Entrega local Blumenau em 1h · PIX com confirmação automática
      </div>

      <header className={`sticky top-0 z-40 bg-stone-50 transition-shadow duration-250 ${scrolled ? 'shadow-sm shadow-stone-900/8' : ''}`}>
        <div className="container-shop h-16 flex items-center gap-6">

          {/* Hamburger — mobile */}
          <button
            className="btn-ghost md:hidden p-2 -ml-2"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
          >
            <BurgerIcon />
          </button>

          {/* Logo */}
          <Link href="/" className="flex items-baseline gap-2 mr-auto md:mr-0">
            <span className="font-display text-2xl text-stone-900 tracking-tight">Mikma</span>
            <span className="text-2xs font-semibold tracking-[0.22em] uppercase text-gold-600 leading-none self-end mb-0.5">
              Lençóis
            </span>
          </Link>

          {/* Nav — desktop */}
          <nav className="hidden md:flex items-center gap-8 mx-auto">
            <NavLink href="/produtos">Produtos</NavLink>
            <NavLink href="/sobre">Sobre</NavLink>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-1 ml-auto md:ml-0">
            {user ? (
              <>
                {(user.role === 'seller' || user.role === 'admin') && (
                  <Link href="/painel" className="hidden md:block btn-ghost text-xs font-semibold tracking-wider uppercase">
                    Painel
                  </Link>
                )}
                <Link href="/conta" className="hidden md:block btn-ghost text-sm">{user.displayName?.split(' ')[0] ?? 'Conta'}</Link>
                <button onClick={logout} className="hidden md:block btn-ghost text-sm text-stone-400">Sair</button>
              </>
            ) : (
              <>
                <Link href="/entrar" className="hidden md:block btn-ghost text-sm">Entrar</Link>
                <Link href="/cadastro" className="hidden md:block btn-primary text-xs tracking-wider uppercase py-2.5">Cadastrar</Link>
              </>
            )}

            {/* Cart */}
            <Link href="/carrinho" aria-label="Carrinho" className="btn-ghost relative p-2">
              <CartIcon />
              {count > 0 && (
                <span className="absolute top-1 right-1 flex items-center justify-center w-4 h-4 rounded-full bg-stone-900 text-stone-50 text-2xs font-bold leading-none">
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
          <div className="fixed inset-0 z-50 bg-stone-900/50 animate-fade-in" onClick={() => setMenuOpen(false)} />
          <div className="fixed top-0 left-0 z-50 w-72 h-full bg-stone-50 shadow-2xl animate-slide-in flex flex-col">
            <div className="flex items-center justify-between px-6 h-16 border-b border-stone-200">
              <span className="font-display text-xl text-stone-900">Menu</span>
              <button className="btn-ghost p-2" onClick={() => setMenuOpen(false)} aria-label="Fechar">
                <CloseIcon />
              </button>
            </div>
            <nav className="flex-1 px-4 py-6 flex flex-col gap-1">
              <MobileNavLink href="/produtos" onClick={() => setMenuOpen(false)}>Produtos</MobileNavLink>
              <MobileNavLink href="/sobre" onClick={() => setMenuOpen(false)}>Sobre</MobileNavLink>
              <div className="divider my-4" />
              {user ? (
                <>
                  <MobileNavLink href="/conta" onClick={() => setMenuOpen(false)}>Minha conta</MobileNavLink>
                  {(user.role === 'seller' || user.role === 'admin') && (
                    <MobileNavLink href="/painel" onClick={() => setMenuOpen(false)}>Painel</MobileNavLink>
                  )}
                  <button
                    onClick={() => { logout(); setMenuOpen(false); }}
                    className="text-left px-4 py-3 text-sm text-stone-400 hover:text-stone-900 transition-colors"
                  >
                    Sair da conta
                  </button>
                </>
              ) : (
                <>
                  <MobileNavLink href="/entrar" onClick={() => setMenuOpen(false)}>Entrar</MobileNavLink>
                  <MobileNavLink href="/cadastro" onClick={() => setMenuOpen(false)}>Cadastrar</MobileNavLink>
                </>
              )}
            </nav>
          </div>
        </>
      )}
    </>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors tracking-wide">
      {children}
    </Link>
  );
}
function MobileNavLink({ href, onClick, children }: { href: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link href={href} onClick={onClick} className="px-4 py-3 text-base text-stone-800 hover:bg-stone-100 transition-colors rounded-sm font-medium">
      {children}
    </Link>
  );
}

function CartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
    </svg>
  );
}
function BurgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 6h18M3 12h18M3 18h18"/>
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M18 6L6 18M6 6l12 12"/>
    </svg>
  );
}
