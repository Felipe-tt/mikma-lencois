'use client';
import { useAuth } from '@/lib/auth/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';

const LINKS = [
  { href: '/conta/pedidos', label: 'Meus pedidos', desc: 'Acompanhe o status das suas compras' },
  { href: '/perfil', label: 'Meu perfil', desc: 'Edite seu nome, e-mail e senha' },
];

export default function ContaPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push('/entrar');
  }, [user, loading, router]);

  if (loading || !user) return <div className="min-h-[400px] flex items-center justify-center"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-hero">
        <div className="container-shop">
          <span className="eyebrow mb-2 block">Área do cliente</span>
          <h1 className="font-display text-4xl font-light text-stone-900">
            Olá, {user.displayName?.split(' ')[0] ?? 'cliente'}
          </h1>
        </div>
      </div>

      <div className="container-shop py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-stone-200 max-w-xl">
          {LINKS.map(({ href, label, desc }) => (
            <Link key={href} href={href} className="flex flex-col gap-1 bg-white px-7 py-7 group hover:bg-stone-50 transition-colors">
              <p className="text-base font-semibold text-stone-900">{label}</p>
              <p className="text-sm text-stone-500">{desc}</p>
              <p className="text-xs text-gold-600 mt-3 font-medium group-hover:translate-x-0.5 transition-transform">Acessar →</p>
            </Link>
          ))}
        </div>

        <button
          onClick={logout}
          className="mt-10 text-sm text-stone-400 hover:text-stone-700 transition-colors"
        >
          Sair da conta
        </button>
      </div>
    </div>
  );
}
