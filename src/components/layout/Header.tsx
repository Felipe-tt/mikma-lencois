'use client';
import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useCartCount } from '@/lib/hooks/useCartCount';
import { useCartTotal } from '@/lib/hooks/useCartTotal';
import { usePathname, useRouter } from 'next/navigation';
import { NavLink } from '@/components/ui/NavLink';
import { formatCurrency } from '@/lib/utils/format';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BrandLogo } from '@/components/BrandLogo';
import { useOverlay } from '@/lib/hooks/useOverlay';
import { setReturnTo } from '@/lib/auth/returnTo';

interface Props { topbarText?: string; freeShippingThresholdCents?: number }

const NAV_LINKS = [
  { href: '/produtos',         label: 'Produtos' },
  { href: '/guia-de-tamanhos', label: 'Guia de tamanhos' },
  { href: '/sobre',            label: 'Sobre' },
];

export function Header({ topbarText, freeShippingThresholdCents = 0 }: Props) {
  const { user, logout, loading: authLoading } = useAuth();
  const count      = useCartCount();
  const cartTotal  = useCartTotal();
  const pathname   = usePathname();
  const router     = useRouter();
  const [scrolled, setScrolled]     = useState(false);
  const [menuOpen, setMenuOpen]     = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery]           = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  // No celular a lupa abre o menu já com o campo de busca focado (a
  // busca inline do header só existe do md pra cima).
  const [focusSearch, setFocusSearch] = useState(false);
  const drawer = useOverlay({
    open: menuOpen,
    onClose: () => setMenuOpen(false),
    panelRef: drawerRef,
    initialFocusRef: focusSearch ? mobileSearchRef : undefined,
  });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => { setMenuOpen(false); setSearchOpen(false); setQuery(''); }, [pathname]);
  useEffect(() => { if (searchOpen) setTimeout(() => searchRef.current?.focus(), 80); }, [searchOpen]);
  useEffect(() => { if (!menuOpen) setFocusSearch(false); }, [menuOpen]);

  // Entrar/Cadastrar pelo header volta pra página onde a pessoa estava
  // (antes sempre caía na home depois do login).
  function rememberHere() {
    if (/^\/(entrar|cadastro|redefinir-senha|confirmar)/.test(pathname)) return;
    setReturnTo(pathname + window.location.search);
  }

  function onSearchButton() {
    if (window.matchMedia('(min-width: 768px)').matches) { setSearchOpen(v => !v); return; }
    setFocusSearch(true);
    setMenuOpen(true);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) { router.push(`/produtos?q=${encodeURIComponent(query.trim())}`); setSearchOpen(false); setMenuOpen(false); setQuery(''); }
  }

  // Free shipping progress
  const threshold = freeShippingThresholdCents;
  const hasFreeShipping = threshold > 0;
  const remaining = Math.max(0, threshold - cartTotal);
  const progress = threshold > 0 ? Math.min(100, (cartTotal / threshold) * 100) : 0;
  const freeShippingUnlocked = cartTotal >= threshold && threshold > 0;
  const showFreeShippingBar = hasFreeShipping && count > 0;

  const isDark = false; // hero is now light, header stays light always

  return (
    <>
      {/* ── Topbar ──────────────────────────────────────────────── */}
      {topbarText && (
        <div className="theme-locked bg-ink text-paper/55 text-[10px] text-center py-2 tracking-[0.22em] uppercase font-medium">
          {topbarText}
        </div>
      )}

      {/* ── Main header ─────────────────────────────────────────── */}
      <header className={`sticky top-0 z-40 bg-paper transition-shadow duration-200 ${scrolled ? 'shadow-[0_1px_0_0_rgb(var(--c-mist))]' : 'border-b border-mist'}`}>
        <div className="container-shop h-[60px] flex items-center">

          {/* Mobile hamburger */}
          <button
            type="button"
            className={`p-2 -ml-2 md:hidden active:scale-90 transition-[color,transform] duration-150 ${isDark ? 'text-paper/60 hover:text-paper' : 'text-mid hover:text-ink'}`}
            onClick={() => setMenuOpen(true)} aria-label="Abrir menu" aria-haspopup="dialog" aria-expanded={menuOpen}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 7h18M3 12h18M3 17h18"/>
            </svg>
          </button>

          {/* Logo */}
          <NavLink href="/" className="shrink-0 mr-auto md:mr-0">
            <BrandLogo alt="Mikma Lençóis" className="h-8 w-auto object-contain" />
          </NavLink>

          {/* Desktop nav, right next to the logo */}
          <nav className={`hidden md:flex items-center gap-6 lg:gap-9 ml-6 lg:ml-8 transition-opacity duration-200 ${searchOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            {NAV_LINKS.map(({ href, label }) => (
              <NavLink key={href} href={href}
                className={`whitespace-nowrap text-[13px] font-medium tracking-[0.01em] transition-colors duration-150 relative pb-0.5
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

          {/* Search inline */}
          <div inert={!searchOpen} className={`hidden md:flex items-center flex-1 mx-8 transition-all duration-200 ${searchOpen ? 'opacity-100' : 'opacity-0 pointer-events-none w-0 overflow-hidden mx-0'}`}>
            <form onSubmit={handleSearch} className="flex items-center gap-2.5 flex-1 h-10 px-4 rounded-full bg-warm/70 border border-transparent focus-within:border-mist-d focus-within:bg-paper transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-faint shrink-0">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') setSearchOpen(false); }}
                placeholder="Buscar produtos, categorias…"
                aria-label="Buscar produtos"
                className="flex-1 bg-transparent text-[14px] text-ink placeholder:text-faint outline-none"
              />
              {query && (
                <button type="button" onClick={() => { setQuery(''); searchRef.current?.focus(); }} aria-label="Limpar busca" className="text-faint hover:text-ink transition-colors p-0.5">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              )}
            </form>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-0.5 ml-auto md:ml-0">

            {/* Search */}
            <button
              type="button"
              className={`w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-[color,background-color,transform] duration-150 ${isDark ? 'text-paper/50 hover:text-paper' : 'text-mid hover:text-ink hover:bg-warm'}`}
              onClick={onSearchButton} aria-label={searchOpen ? 'Fechar busca' : 'Buscar'} aria-expanded={searchOpen}
            >
              {searchOpen
                ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              }
            </button>

            {/* Auth */}
            {authLoading ? (
              // Evita o flash de "Entrar/Cadastrar" antes do Firebase confirmar
              // a sessão já logada (leva uns instantes, mesmo com cache local).
              <div className="hidden md:block w-[92px] h-[30px]" aria-hidden />
            ) : user ? (
              <>
                {(user.role === 'seller' || user.role === 'admin') && (
                  <NavLink href="/painel" className={`hidden md:inline-flex items-center h-8 px-3 mr-1 rounded-full border text-[12px] font-medium transition-colors ${isDark ? 'border-paper/20 text-paper/70 hover:text-paper hover:bg-paper/10' : 'border-mist text-mid hover:text-ink hover:bg-warm'}`}>Painel</NavLink>
                )}
                {/* Pílula com a inicial: leva pra área do cliente (o "Sair"
                    fica lá e no menu, longe de um clique sem querer). */}
                <NavLink href="/conta" aria-label="Minha conta" className={`hidden md:inline-flex items-center gap-2 h-9 pl-1 pr-3.5 mr-1 rounded-full border transition-colors ${isDark ? 'border-paper/20 text-paper hover:bg-paper/10' : 'border-mist text-ink hover:bg-warm hover:border-mist-d'}`}>
                  <span aria-hidden="true" className="w-7 h-7 rounded-full bg-clay text-paper font-display text-[0.95rem] flex items-center justify-center">
                    {(user.displayName || user.email || '?').trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="text-[13px] font-medium max-w-[110px] truncate">{user.displayName?.split(' ')[0] || 'Conta'}</span>
                </NavLink>
              </>
            ) : (
              <>
                <NavLink href="/entrar" onClick={rememberHere} className={`hidden md:block text-[13px] px-3 py-1.5 rounded-full transition-colors ${isDark ? 'text-paper/60 hover:text-paper' : 'text-mid hover:text-ink'}`}>Entrar</NavLink>
                <NavLink href="/cadastro" onClick={rememberHere} className={`hidden md:inline-flex items-center h-9 px-4 ml-1 mr-1 rounded-full text-[13px] font-medium transition-colors ${isDark ? 'bg-paper text-ink hover:bg-paper/85' : 'bg-ink text-paper hover:bg-clay'}`}>
                  Cadastrar
                </NavLink>
              </>
            )}

            {/* Theme toggle */}
            <ThemeToggle />

            {/* Favoritos */}
            {user && (
              <NavLink href="/favoritos" className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-colors ${isDark ? 'text-paper/60 hover:text-paper' : 'text-mid hover:text-ink hover:bg-warm'}`} aria-label="Favoritos">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z" />
                </svg>
              </NavLink>
            )}

            {/* Cart */}
            <NavLink href="/carrinho" className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-colors ${isDark ? 'text-paper/60 hover:text-paper' : 'text-mid hover:text-ink hover:bg-warm'}`} aria-label={count > 0 ? `Carrinho, ${count} ${count === 1 ? 'item' : 'itens'}` : 'Carrinho'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 01-8 0"/>
              </svg>
              {count > 0 && (
                <span key={count} className="animate-badge-bump absolute top-0 right-0 min-w-[17px] h-[17px] bg-clay text-paper text-[9px] font-bold flex items-center justify-center leading-none px-[4px] rounded-full ring-2 ring-paper">
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
              <div className="flex-1 h-1 bg-mist overflow-hidden rounded-full">
                <div className="h-full rounded-full bg-clay transition-all duration-500 ease-out w-[var(--w)]" style={{ '--w': `${progress}%` } as React.CSSProperties} />
              </div>
              <span className="text-[10px] font-medium text-mid shrink-0">
                {freeShippingUnlocked
                  ? <span className="text-clay font-semibold flex items-center gap-1">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      Frete grátis desbloqueado!
                    </span>
                  : <span>Frete grátis faltam <strong className="text-ink">{formatCurrency(remaining)}</strong></span>
                }
              </span>
            </div>
          </div>
        )}

      </header>

      {/* ── Mobile drawer ──────────────────────────────────────────── */}
      {drawer.mounted && (
        <div className="overlay-backdrop fixed inset-0 z-50" data-state={drawer.state} onClick={() => setMenuOpen(false)}>
          <div
            ref={drawerRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            data-variant="drawer-left"
            className="overlay-panel absolute top-0 left-0 w-[300px] max-w-[85vw] h-full bg-paper rounded-r-3xl overflow-hidden shadow-modal flex flex-col pb-[env(safe-area-inset-bottom)]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 h-[60px] border-b border-mist">
              <NavLink href="/" onClick={() => setMenuOpen(false)}>
                <BrandLogo alt="Logo" className="h-9 w-auto object-contain" />
              </NavLink>
              <button type="button" className="btn-ghost w-9 h-9 !p-0" onClick={() => setMenuOpen(false)} aria-label="Fechar menu">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Search mobile */}
            <div className="px-4 py-3 border-b border-mist">
              <form onSubmit={handleSearch} className="flex items-center gap-2 px-4 h-11 rounded-full border border-mist-d bg-paper focus-within:border-ink transition-colors duration-150">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-faint shrink-0">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input ref={mobileSearchRef} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar…"
                  aria-label="Buscar produtos" enterKeyHint="search"
                  className="flex-1 min-w-0 bg-transparent text-[16px] text-ink placeholder:text-faint outline-none" />
              </form>
            </div>

            {/* Links principais em tipo de título, cada um numa linha com
                seta; conta e atalhos ficam embaixo, menores. Antes era uma
                lista de texto 15px solta num painel quase vazio. */}
            <nav className="flex-1 flex flex-col overflow-y-auto">
              <ul className="px-5 pt-2">
                {NAV_LINKS.map(({ href, label }, i) => {
                  const active = pathname.startsWith(href);
                  return (
                    <li key={href} className="animate-drawer-item border-b border-mist" style={{ animationDelay: `${70 + i * 40}ms` }}>
                      <NavLink href={href} aria-current={active ? 'page' : undefined}
                        className={`group flex items-center justify-between py-4 font-display text-[1.6rem] leading-none tracking-[-0.01em] transition-colors ${active ? 'text-clay' : 'text-ink hover:text-clay'}`}
                      >
                        {label}
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                          aria-hidden="true" className={`shrink-0 transition-[transform,color] duration-200 group-hover:translate-x-0.5 ${active ? 'text-clay' : 'text-faint'}`}>
                          <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                      </NavLink>
                    </li>
                  );
                })}
              </ul>

              <div className="animate-drawer-item px-5 pt-7 pb-6 flex flex-col gap-1" style={{ animationDelay: `${70 + NAV_LINKS.length * 40}ms` }}>
                {authLoading ? null : user ? (
                  <>
                    <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint mb-2">Sua conta</p>
                    <NavLink href="/conta" className="py-2 text-[15px] text-ink hover:text-clay transition-colors">Minha conta</NavLink>
                    <NavLink href="/conta/pedidos" className="py-2 text-[15px] text-ink hover:text-clay transition-colors">Meus pedidos</NavLink>
                    <NavLink href="/favoritos" className="py-2 text-[15px] text-ink hover:text-clay transition-colors">Favoritos</NavLink>
                    {(user.role === 'seller' || user.role === 'admin') && (
                      <NavLink href="/painel" className="py-2 text-[15px] text-ink hover:text-clay transition-colors">Painel</NavLink>
                    )}
                    <button onClick={logout} className="text-left py-2 text-[15px] text-faint hover:text-ink transition-colors">
                      Sair da conta
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-[13px] text-mid leading-relaxed mb-4">Entre pra acompanhar pedidos e salvar favoritos.</p>
                    <div className="grid grid-cols-2 gap-2">
                      <NavLink href="/entrar" onClick={rememberHere} className="btn-outline justify-center text-[13px] py-3">Entrar</NavLink>
                      <NavLink href="/cadastro" onClick={rememberHere} className="btn-clay justify-center text-[13px] py-3">Criar conta</NavLink>
                    </div>
                  </>
                )}
              </div>
            </nav>

            <div className="px-5 py-4 border-t border-mist flex items-center justify-between">
              <p className="text-[10px] text-faint tracking-[0.18em] uppercase">Blumenau · SC · Brasil</p>
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
