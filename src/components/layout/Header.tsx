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
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--white)',
        borderBottom: scrolled ? '1px solid var(--cream-d)' : '1px solid transparent',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        boxShadow: scrolled ? '0 1px 16px rgba(28,24,21,0.06)' : 'none',
      }}
    >
      {/* Top bar */}
      <div style={{ background: 'var(--ink)', color: 'var(--cream)', fontSize: 12, textAlign: 'center', padding: '6px 16px', letterSpacing: '0.08em' }}>
        Entrega local em Blumenau em até 1h · Frete para todo o Brasil
      </div>

      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, fontWeight: 400, color: 'var(--ink)', letterSpacing: '0.04em' }}>
            Mikma
          </span>
          <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 500, color: 'var(--warm-d)', letterSpacing: '0.18em', textTransform: 'uppercase', marginLeft: 6 }}>
            Lençóis
          </span>
        </Link>

        {/* Nav desktop */}
        <nav className="hidden items-center gap-8 md:flex">
          <Link href="/produtos" style={{ fontSize: 13, color: 'var(--ink-m)', letterSpacing: '0.04em', fontWeight: 500, textDecoration: 'none' }}
            className="hover:text-ink transition-colors">Produtos</Link>
          <Link href="/sobre" style={{ fontSize: 13, color: 'var(--ink-m)', letterSpacing: '0.04em', fontWeight: 500, textDecoration: 'none' }}
            className="hover:text-ink transition-colors">Sobre</Link>
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Cart */}
          <Link href="/carrinho" aria-label="Carrinho" style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '8px', color: 'var(--ink-m)', textDecoration: 'none' }}
            className="hover:text-ink transition-colors">
            <CartIcon />
            {cartCount > 0 && (
              <span style={{
                position: 'absolute', top: 2, right: 2,
                minWidth: 18, height: 18, borderRadius: '50%',
                background: 'var(--warm-d)', color: 'var(--white)',
                fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {cartCount > 9 ? '9+' : cartCount}
              </span>
            )}
          </Link>

          {user ? (
            <div className="hidden items-center gap-3 md:flex">
              {(user.role === 'seller' || user.role === 'admin') && (
                <Link href="/painel" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink)', border: '1px solid var(--ink)', padding: '5px 14px', textDecoration: 'none' }}
                  className="transition-colors hover:bg-ink hover:text-white-pure">Painel</Link>
              )}
              <Link href="/conta" style={{ fontSize: 13, color: 'var(--ink-m)', textDecoration: 'none' }} className="hover:text-ink transition-colors">
                {user.displayName?.split(' ')[0] ?? 'Conta'}
              </Link>
              <button onClick={logout} style={{ fontSize: 13, color: 'var(--ink-l)', background: 'none', border: 'none', cursor: 'pointer' }}
                className="hover:text-ink transition-colors">Sair</button>
            </div>
          ) : (
            <div className="hidden items-center gap-3 md:flex">
              <Link href="/entrar" style={{ fontSize: 13, color: 'var(--ink-m)', textDecoration: 'none' }} className="hover:text-ink transition-colors">Entrar</Link>
              <Link href="/cadastro" className="btn-primary" style={{ padding: '7px 18px', fontSize: 12, letterSpacing: '0.08em' }}>Cadastrar</Link>
            </div>
          )}

          {/* Hamburger */}
          <button className="md:hidden" onClick={() => setMenuOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--ink)' }}>
            {menuOpen ? <XIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div style={{ borderTop: '1px solid var(--cream-d)', background: 'var(--white)', padding: '20px 24px 24px' }}>
          <nav className="flex flex-col gap-4">
            <Link href="/produtos" onClick={() => setMenuOpen(false)} style={{ fontSize: 15, color: 'var(--ink-m)', textDecoration: 'none', fontWeight: 500 }}>Produtos</Link>
            <Link href="/sobre" onClick={() => setMenuOpen(false)} style={{ fontSize: 15, color: 'var(--ink-m)', textDecoration: 'none', fontWeight: 500 }}>Sobre</Link>
            <hr className="divider" />
            {user ? (
              <>
                <Link href="/conta" onClick={() => setMenuOpen(false)} style={{ fontSize: 14, color: 'var(--ink-m)', textDecoration: 'none' }}>Minha conta</Link>
                {(user.role === 'seller' || user.role === 'admin') && (
                  <Link href="/painel" onClick={() => setMenuOpen(false)} style={{ fontSize: 14, color: 'var(--ink-m)', textDecoration: 'none' }}>Painel</Link>
                )}
                <button onClick={() => { logout(); setMenuOpen(false); }} style={{ textAlign: 'left', fontSize: 14, color: 'var(--ink-l)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Sair</button>
              </>
            ) : (
              <>
                <Link href="/entrar" onClick={() => setMenuOpen(false)} style={{ fontSize: 14, color: 'var(--ink-m)', textDecoration: 'none' }}>Entrar</Link>
                <Link href="/cadastro" onClick={() => setMenuOpen(false)} className="btn-primary" style={{ fontSize: 13 }}>Criar conta</Link>
              </>
            )}
          </nav>
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
