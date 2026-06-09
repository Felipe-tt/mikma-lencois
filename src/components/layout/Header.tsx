'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useCartCount } from '@/lib/hooks/useCartCount';
import { usePathname, useRouter } from 'next/navigation';
import { NavLink } from '@/components/ui/NavLink';

interface Props { topbarText?: string }

const NAV_LINKS = [
  { href: '/produtos', label: 'Produtos' },
  { href: '/sobre',    label: 'Sobre' },
];

export function Header({ topbarText }: Props) {
  const { user, logout } = useAuth();
  const count = useCartCount();
  const pathname = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled]     = useState(false);
  const [menuOpen, setMenuOpen]     = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery]           = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  useEffect(() => { setMenuOpen(false); setSearchOpen(false); }, [pathname]);

  useEffect(() => {
    if (searchOpen) setTimeout(() => searchRef.current?.focus(), 80);
  }, [searchOpen]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/produtos?q=${encodeURIComponent(query.trim())}`);
      setSearchOpen(false);
      setQuery('');
    }
  }

  return (
    <>
      {/* ── Topbar ──────────────────────────────────────────── */}
      {topbarText && (
        <div className="bg-ink text-paper/60 text-2xs text-center py-2.5 tracking-[0.2em] uppercase font-medium">
          {topbarText}
        </div>
      )}

      {/* ── Main header ─────────────────────────────────────── */}
      <header className={`sticky top-0 z-40 bg-paper/96 backdrop-blur-md transition-all duration-300 ${
        scrolled ? 'shadow-[0_1px_0_0_#E8E4DC]' : ''
      }`}>
        <div className="container-shop h-16 flex items-center gap-3">

          {/* Mobile hamburger */}
          <button
            className="btn-ghost p-2 -ml-2 md:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 7h18M3 12h18M3 17h18"/>
            </svg>
          </button>

          {/* Logo */}
          <NavLink href="/" className="shrink-0 mr-auto md:mr-0">
            <Image src="/logo-dark.png" alt="Mikma Lençóis" width={160} height={160} className="h-12 w-auto object-contain" priority />
          </NavLink>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8 mx-auto">
            {NAV_LINKS.map(({ href, label }) => (
              <NavLink
                key={href}
                href={href}
                className={`text-sm font-medium transition-colors duration-200 relative pb-0.5
                  after:absolute after:bottom-0 after:left-0 after:h-px after:bg-clay
                  after:transition-all after:duration-250
                  ${pathname.startsWith(href)
                    ? 'text-ink after:w-full'
                    : 'text-mid hover:text-ink after:w-0 hover:after:w-full'
                  }`}
              >
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-0.5 ml-auto md:ml-0">

            {/* Search toggle */}
            <button
              className="btn-ghost p-2"
              onClick={() => setSearchOpen(v => !v)}
              aria-label="Buscar"
            >
              {searchOpen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
              )}
            </button>

            {/* Auth links */}
            {user ? (
              <>
                {(user.role === 'seller' || user.role === 'admin') && (
                  <NavLink href="/painel" className="hidden md:flex btn-ghost text-2xs font-bold tracking-[0.15em] uppercase">
                    Painel
                  </NavLink>
                )}
                <NavLink href="/conta" className="hidden md:block btn-ghost text-sm">
                  {user.displayName?.split(' ')[0] ?? 'Conta'}
                </NavLink>
                <button onClick={logout} className="hidden md:block btn-ghost text-sm text-faint">Sair</button>
              </>
            ) : (
              <>
                <NavLink href="/entrar" className="hidden md:block btn-ghost text-sm">Entrar</NavLink>
                <NavLink href="/cadastro" className="hidden md:flex btn-clay text-2xs font-bold tracking-[0.12em] uppercase px-4 py-2.5 ml-1">
                  Cadastrar
                </NavLink>
              </>
            )}

            {/* Cart */}
            <NavLink href="/carrinho" className="btn-ghost relative p-2 ml-0.5" aria-label="Carrinho">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 01-8 0"/>
              </svg>
              {count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] rounded-full bg-clay text-paper text-3xs font-bold flex items-center justify-center leading-none px-1">
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </NavLink>
          </div>
        </div>

        {/* ── Search bar (animated) ─────────────────────────── */}
        <div className={`overflow-hidden transition-all duration-300 ease-out border-t border-mist/0 ${
          searchOpen ? 'max-h-16 border-mist' : 'max-h-0'
        }`}>
          <form onSubmit={handleSearch} className="container-shop py-3 flex items-center gap-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-faint shrink-0">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar produtos, categorias…"
              className="flex-1 bg-transparent text-sm text-ink placeholder:text-faint outline-none py-0.5"
            />
            {query && (
              <button type="submit" className="text-2xs font-semibold text-clay tracking-wide uppercase hover:text-clay-d transition-colors">
                Buscar
              </button>
            )}
          </form>
        </div>
      </header>

      {/* ── Mobile drawer ───────────────────────────────────── */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm animate-fade-in"
            onClick={() => setMenuOpen(false)}
          />
          <div className="fixed top-0 left-0 z-50 w-[300px] h-full bg-paper shadow-modal animate-slide-in flex flex-col">
            <div className="flex items-center justify-between px-5 h-16 border-b border-mist">
              <NavLink href="/" onClick={() => setMenuOpen(false)}>
                <Image src="/logo-dark.png" alt="Logo" width={140} height={140} className="h-11 w-auto object-contain" />
              </NavLink>
              <button className="btn-ghost p-2" onClick={() => setMenuOpen(false)} aria-label="Fechar menu">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="px-4 py-3 border-b border-mist">
              <form onSubmit={handleSearch} className="flex items-center gap-2 px-3 py-2.5 bg-warm border border-mist">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-faint">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input
                  type="search"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Buscar…"
                  className="flex-1 bg-transparent text-sm text-ink placeholder:text-faint outline-none"
                />
              </form>
            </div>

            <nav className="flex-1 px-2 py-5 flex flex-col overflow-y-auto">
              {NAV_LINKS.map(({ href, label }) => (
                <NavLink
                  key={href}
                  href={href}
                  className={`px-4 py-3 text-base font-medium transition-colors ${
                    pathname.startsWith(href) ? 'text-clay bg-warm' : 'text-ink hover:bg-warm'
                  }`}
                >
                  {label}
                </NavLink>
              ))}
              <div className="divider my-4 mx-4" />
              {user ? (
                <>
                  <NavLink href="/conta" className="px-4 py-3 text-base font-medium text-ink hover:bg-warm transition-colors">Minha conta</NavLink>
                  {(user.role === 'seller' || user.role === 'admin') && (
                    <NavLink href="/painel" className="px-4 py-3 text-base font-medium text-ink hover:bg-warm transition-colors">Painel</NavLink>
                  )}
                  <button onClick={logout} className="text-left px-4 py-3 text-base font-medium text-faint hover:text-ink hover:bg-warm transition-colors">
                    Sair da conta
                  </button>
                </>
              ) : (
                <>
                  <NavLink href="/entrar" className="px-4 py-3 text-base font-medium text-ink hover:bg-warm transition-colors">Entrar</NavLink>
                  <div className="px-4 pt-3">
                    <NavLink href="/cadastro" className="btn-clay w-full justify-center">Criar conta</NavLink>
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
