'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';
import { useCartCount } from '@/lib/hooks/useCartCount';

export function Header() {
  const { user, logout } = useAuth();
  const cartCount = useCartCount();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="text-xl font-semibold tracking-tight text-gray-900">
          Mikma Lençóis
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <Link href="/produtos" className="text-sm text-gray-600 hover:text-gray-900">
            Produtos
          </Link>
          <Link href="/sobre" className="text-sm text-gray-600 hover:text-gray-900">
            Sobre
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/carrinho"
            className="relative rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            aria-label="Carrinho"
          >
            <CartIcon />
            {cartCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-medium text-white">
                {cartCount > 9 ? '9+' : cartCount}
              </span>
            )}
          </Link>

          {user ? (
            <div className="flex items-center gap-2">
              {(user.role === 'seller' || user.role === 'admin') && (
                <Link
                  href="/painel"
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Painel
                </Link>
              )}
              <Link
                href="/conta"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                {user.displayName?.split(' ')[0] ?? 'Conta'}
              </Link>
              <button
                onClick={logout}
                className="text-sm text-gray-500 hover:text-gray-900"
              >
                Sair
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/entrar"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Entrar
              </Link>
              <Link
                href="/cadastro"
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Cadastrar
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function CartIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
      />
    </svg>
  );
}
