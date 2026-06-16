'use client';
import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useCartCount } from '@/lib/hooks/useCartCount';
import { useCartTotal } from '@/lib/hooks/useCartTotal';
import { usePathname, useRouter } from 'next/navigation';
import { NavLink } from '@/components/ui/NavLink';
import { formatCurrency } from '@/lib/utils/format';

interface Props { topbarText?: string; freeShippingThresholdCents?: number }

const NAV_LINKS = [
  { href: '/produtos', label: 'Produtos' },
  { href: '/sobre',    label: 'Sobre' },
];

export function Header({ topbarText, freeShippingThresholdCents = 0 }: Props) {
  const { user, logout } = useAuth();
  const count      = useCartCount();
  const cartTotal  = useCartTotal();
  const pathname   = usePathname();
  const router     = useRouter();
  const [scrolled, setScrolled]     = useState(false);
  const [menuOpen, setMenuOpen]     = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery]           = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => { document.body.style.overflow = menuOpen ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [menuOpen]);
  useEffect(() => { setMenuOpen(false); setSearchOpen(false); setQuery(''); }, [pathname]);
  useEffect(() => { if (searchOpen) setTimeout(() => searchRef.current?.focus(), 80); }, [searchOpen]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) { router.push(`/produtos?q=${encodeURIComponent(query.trim())}`); setSearchOpen(false); setQuery(''); }
  }

  // Free shipping progress
  const threshold = freeShippingThresholdCents;
  const hasFreeShipping = threshold > 0;
  const remaining = Math.max(0, threshold - cartTotal);
  const progress = threshold > 0 ? Math.min(100, (cartTotal / threshold) * 100) : 0;
  const freeShippingUnlocked = cartTotal >= threshold && threshold > 0;
  const showFreeShippingBar = hasFreeShipping && count > 0;

  const isHome = pathname === '/';
  const isDark = false; // hero is now light, header stays light always

  return (
    <>
      {/* ── Topbar ──────────────────────────────────────────────── */}
      {topbarText && (
        <div className="bg-ink text-paper/55 text-[10px] text-center py-2 tracking-[0.22em] uppercase font-medium">
          {topbarText}
        </div>
      )}

      {/* ── Main header ─────────────────────────────────────────── */}
      <header className={`sticky top-0 z-40 bg-paper transition-shadow duration-200 ${scrolled ? 'shadow-[0_1px_0_0_#E4DED5]' : 'border-b border-mist'}`}>
        <div className="container-shop h-[60px] flex items-center gap-3">

          {/* Mobile hamburger */}
          <button
            className={`p-2 -ml-2 md:hidden transition-colors ${isDark ? 'text-paper/60 hover:text-paper' : 'text-mid hover:text-ink'}`}
            onClick={() => setMenuOpen(true)} aria-label="Abrir menu"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 7h18M3 12h18M3 17h18"/>
            </svg>
          </button>

          {/* Logo */}
          <NavLink href="/" className="shrink-0 mr-auto md:mr-0">
            <Image src="/logo-dark.png" alt="Mikma Lençóis" width={800} height={242} className="h-[44px] w-auto object-contain" priority />
          </NavLink>

          {/* Desktop nav — collapses when search opens */}
          <nav className={`hidden md:flex items-center gap-9 mx-auto transition-all duration-200 ${searchOpen ? 'opacity-0 pointer-events-none absolute' : 'opacity-100'}`}>
            {NAV_LINKS.map(({ href, label }) => (
              <NavLink key={href} href={href}
                className={`text-[13px] font-medium tracking-[0.01em] transition-colors duration-150 relative pb-0.5
                  after:absolute after:bottom-0 after:left-0 after:h-px after:bg-clay after:transition-all after:duration-200
                  ${pathname.startsWith(href)
                    ? `${isDark ? 'text-paper' : 'text-ink'} after:w-full`
                    : `${isDark ? 'text-paper/50 hover:text-paper' : 'text-mid hover:text-ink'} after:w-0 hover:after:w-full`
                  }`}
              >
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Search inline — expands in the nav area */}
          <div className={`hidden md:flex items-center flex-1 mx-8 transition-all duration-200 ${searchOpen ? 'opacity-100' : 'opacity-0 pointer-events-none w-0 overflow-hidden mx-0'}`}>
            <form onSubmit={handleSearch} className="flex items-center gap-2.5 flex-1 border-b-2 border-ink/20 pb-1 focus-within:border-clay/50 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-faint shrink-0">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar produtos, categorias…"
                className="flex-1 bg-transparent text-[14px] text-ink placeholder:text-faint outline-none"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="text-faint hover:text-ink transition-colors p-0.5">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              )}
            </form>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-0.5 ml-auto md:ml-0">

            {/* Search */}
            <button
              className={`p-2 transition-colors duration-150 ${isDark ? 'text-paper/50 hover:text-paper' : 'text-mid hover:text-ink hover:bg-warm'}`}
              onClick={() => setSearchOpen(v => !v)} aria-label="Buscar"
            >
              {searchOpen
                ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              }
            </button>

            {/* Auth */}
            {user ? (
              <>
                {(user.role === 'seller' || user.role === 'admin') && (
                  <NavLink href="/painel" className={`hidden md:flex text-[10px] font-bold tracking-[0.14em] uppercase px-2 py-1.5 transition-colors ${isDark ? 'text-paper/40 hover:text-paper' : 'text-mid hover:text-ink'}`}>Painel</NavLink>
                )}
                <NavLink href="/conta" className={`hidden md:block text-[13px] px-2 py-1.5 transition-colors ${isDark ? 'text-paper/60 hover:text-paper' : 'text-mid hover:text-ink'}`}>
                  {user.displayName?.split(' ')[0] ?? 'Conta'}
                </NavLink>
                <button onClick={logout} className={`hidden md:block text-[13px] px-2 py-1.5 transition-colors ${isDark ? 'text-paper/30 hover:text-paper/60' : 'text-faint hover:text-mid'}`}>Sair</button>
              </>
            ) : (
              <>
                <NavLink href="/entrar" className={`hidden md:block text-[13px] px-2 py-1.5 transition-colors ${isDark ? 'text-paper/60 hover:text-paper' : 'text-mid hover:text-ink'}`}>Entrar</NavLink>
                <NavLink href="/cadastro" className={`hidden md:flex text-[10px] font-bold tracking-[0.1em] uppercase px-4 py-2 ml-1 border transition-all ${isDark ? 'border-paper/20 text-paper hover:bg-paper/10' : 'border-mist text-ink hover:bg-warm'}`}>
                  Cadastrar
                </NavLink>
              </>
            )}

            {/* Cart */}
            <NavLink href="/carrinho" className={`relative p-2 ml-0.5 transition-colors ${isDark ? 'text-paper/60 hover:text-paper' : 'text-mid hover:text-ink'}`} aria-label="Carrinho">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 01-8 0"/>
              </svg>
              {count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] bg-clay text-paper text-[9px] font-bold flex items-center justify-center leading-none px-[3px]" style={{borderRadius: '2px'}}>
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </NavLink>
          </div>
        </div>

        {/* Free shipping progress bar */}
        {showFreeShippingBar && (
          <div className="border-t border-mist/60 bg-warm/50">
            <div className="container-shop py-1.5 flex items-center gap-3">
              <div className="flex-1 h-[3px] bg-mist overflow-hidden" style={{borderRadius: '2px'}}>
                <div className="h-full bg-clay transition-all duration-500 ease-out" style={{width: `${progress}%`}} />
              </div>
              <span className="text-[10px] font-medium text-mid shrink-0">
                {freeShippingUnlocked
                  ? <span className="text-clay font-semibold">✓ Frete grátis desbloqueado!</span>
                  : <span>Frete grátis faltam <strong className="text-ink">{formatCurrency(remaining)}</strong></span>
                }
              </span>
            </div>
          </div>
        )}

      </header>

      {/* ── Mobile drawer ──────────────────────────────────────────── */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-ink/45 backdrop-blur-sm animate-fade-in" onClick={() => setMenuOpen(false)} />
          <div className="fixed top-0 left-0 z-50 w-[300px] h-full bg-paper shadow-modal animate-slide-in flex flex-col">
            <div className="flex items-center justify-between px-5 h-[60px] border-b border-mist">
              <NavLink href="/" onClick={() => setMenuOpen(false)}>
                <Image src="/logo-dark.png" alt="Logo" width={800} height={242} className="h-9 w-auto object-contain" />
              </NavLink>
              <button className="btn-ghost p-2" onClick={() => setMenuOpen(false)} aria-label="Fechar">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Search mobile */}
            <div className="px-4 py-3 border-b border-mist">
              <form onSubmit={handleSearch} className="flex items-center gap-2 px-3 py-2 border border-mist bg-paper/80" style={{borderRadius: '2px'}}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-faint shrink-0">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar…"
                  className="flex-1 bg-transparent text-sm text-ink placeholder:text-faint outline-none" />
              </form>
            </div>

            <nav className="flex-1 px-2 py-4 flex flex-col overflow-y-auto">
              {NAV_LINKS.map(({ href, label }) => (
                <NavLink key={href} href={href}
                  className={`px-4 py-3 text-[15px] font-medium transition-colors ${pathname.startsWith(href) ? 'text-clay bg-warm' : 'text-ink hover:bg-warm'}`}
                >
                  {label}
                </NavLink>
              ))}
              <div className="h-px bg-mist mx-4 my-3" />
              {user ? (
                <>
                  <NavLink href="/conta" className="px-4 py-3 text-[15px] font-medium text-ink hover:bg-warm transition-colors">Minha conta</NavLink>
                  {(user.role === 'seller' || user.role === 'admin') && (
                    <NavLink href="/painel" className="px-4 py-3 text-[15px] font-medium text-ink hover:bg-warm transition-colors">Painel</NavLink>
                  )}
                  <button onClick={logout} className="text-left px-4 py-3 text-[15px] font-medium text-faint hover:text-ink hover:bg-warm transition-colors">
                    Sair da conta
                  </button>
                </>
              ) : (
                <>
                  <NavLink href="/entrar" className="px-4 py-3 text-[15px] font-medium text-ink hover:bg-warm transition-colors">Entrar</NavLink>
                  <div className="px-4 pt-3">
                    <NavLink href="/cadastro" className="btn-clay w-full justify-center text-[13px]">Criar conta</NavLink>
                  </div>
                </>
              )}
            </nav>

            <div className="px-5 py-4 border-t border-mist">
              <p className="text-[10px] text-faint tracking-[0.18em] uppercase">Blumenau · SC · Brasil</p>
            </div>
          </div>
        </>
      )}
    </>
  );
}
