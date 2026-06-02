'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/AuthContext'

const NAV = [
  { href: '/painel', label: 'Dashboard', icon: '📊' },
  { href: '/painel/pedidos', label: 'Pedidos', icon: '🛒' },
  { href: '/painel/produtos/novo', label: 'Novo produto', icon: '➕' },
  { href: '/painel/estoque', label: 'Estoque', icon: '📦' },
  { href: '/painel/configuracoes', label: 'Configurações', icon: '⚙️' },
]

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (loading) return
    if (!user) { router.push('/entrar'); return }
    // Role check happens server-side too, but let's guard client side
    // role is stored in Firestore; we rely on Firestore rules for real auth
  }, [user, loading, router])

  if (loading) return <div className="seller-loading">Carregando...</div>

  return (
    <div className="seller-layout">
      <aside className="seller-sidebar">
        <div className="seller-sidebar-brand">
          <span className="seller-sidebar-icon">🛏</span>
          <span className="seller-sidebar-name">Mikma</span>
        </div>
        <nav className="seller-nav">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`seller-nav-item${pathname === item.href ? ' seller-nav-item--active' : ''}`}
            >
              <span className="seller-nav-icon">{item.icon}</span>
              <span className="seller-nav-label">{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>
      <main className="seller-main">{children}</main>
    </div>
  )
}
