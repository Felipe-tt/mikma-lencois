'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useCartCount } from '@/lib/hooks/useCartCount';

export function Header() {
  const { user, logout } = useAuth();
  const cartCount = useCartCount();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <header className={`sticky top-0 z-50 bg-paper transition-all duration-200 ${scrolled ? 'border-b border-cream-dark shadow-sm shadow-ink/5' : 'border-b border-transparent'}`}>
      {/* Announcement bar */}
      <div className="bg-ink text-cream text-[11px] text-center py-1.5 px-4 tracking-[0.08em]">
        Entrega local em Blumenau em até 1h · Frete para todo o Brasil
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex h-16 items-center justify-between">
        {/* Logo */}
        <Link href="/" className="no-underline flex items-baseline gap-1.5">
          <span className="font-display text-[22px] text-ink tracking-[0.04em]">Mikma</span>
          <span className="text-[10px] font-semibold text-warm-dark tracking-[0.2em] uppercase">Lençóis</span>
        </Link>

        {/* Nav desktop */}
        <nav className="hidden md:flex items-center gap-8">
          {[
            { href: '/produtos', label: 'Produtos' },
            { href: '/sobre', label: 'Sobre' },
          ].map(({ href, label }) => (
            <Link key={href} href={href} className="text-[13px] text-ink-mid font-medium tracking-[0.03em] no-underline hover:text-ink transition-colors">
              {label}
            </Link>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Cart */}
          <Link href="/carrinho" aria-label="Carrinho" className="relative flex items-center p-2 text-ink-mid hover:text-ink transition-colors no-underline">
            <CartIcon />
            {cartCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] rounded-full bg-warm-dark text-paper text-[10px] font-semibold flex items-center justify-center">
                {cartCount > 9 ? '9+' : cartCount}
              </span>
            )}
          </Link>

          {/* Auth desktop */}
          {user ? (
            <div className="hidden md:flex items-center gap-3">
              {(user.role === 'seller' || user.role === 'admin') && (
                <Link href="/painel" className="text-[11px] font-semibold tracking-[0.1em] uppercase text-ink border border-ink px-3.5 py-1.5 no-underline hover:bg-ink hover:text-paper transition-all">
                  Painel
                </Link>
              )}
              <Link href="/conta" className="text-[13px] text-ink-mid no-underline hover:text-ink transition-colors">
                {user.displayName?.split(' ')[0] ?? 'Conta'}
              </Link>
              <button onClick={logout} className="text-[13px] text-ink-light bg-none border-none hover:text-ink transition-colors">
                Sair
              </button>
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-3">
              <Link href="/entrar" className="text-[13px] text-ink-mid no-underline hover:text-ink transition-colors">Entrar</Link>
              <Link href="/cadastro" className="btn-primary !py-1.5 !px-4 !text-[12px] !tracking-[0.08em]">Cadastrar</Link>
            </div>
          )}

          {/* Hamburger */}
          <button
            className="md:hidden p-1.5 text-ink bg-transparent border-none"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Menu"
          >
            {menuOpen ? <XIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-t border-cream-dark bg-paper px-6 py-5 flex flex-col gap-4 animate-fade-in md:hidden">
          <Link href="/produtos" onClick={() => setMenuOpen(false)} className="text-[15px] text-ink-mid font-medium no-underline">Produtos</Link>
          <Link href="/sobre" onClick={() => setMenuOpen(false)} className="text-[15px] text-ink-mid font-medium no-underline">Sobre</Link>
          <hr className="divider" />
          {user ? (
            <>
              <Link href="/conta" onClick={() => setMenuOpen(false)} className="text-[14px] text-ink-mid no-underline">Minha conta</Link>
              {(user.role === 'seller' || user.role === 'admin') && (
                <Link href="/painel" onClick={() => setMenuOpen(false)} className="text-[14px] text-ink-mid no-underline">Painel</Link>
              )}
              <button onClick={() => { logout(); setMenuOpen(false); }} className="text-left text-[14px] text-ink-light bg-transparent border-none p-0">
                Sair
              </button>
            </>
          ) : (
            <>
              <Link href="/entrar" onClick={() => setMenuOpen(false)} className="text-[14px] text-ink-mid no-underline">Entrar</Link>
              <Link href="/cadastro" onClick={() => setMenuOpen(false)} className="btn-primary !text-[13px]">Criar conta</Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}

function CartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
    </svg>
  );
}
function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  );
}
function XIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}
