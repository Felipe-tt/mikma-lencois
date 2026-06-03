'use client';
import { useAuth } from '@/lib/auth/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';

export default function ContaPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push('/entrar');
  }, [user, loading, router]);

  if (loading || !user) return <div className="min-h-[320px] flex items-center justify-center"><div className="spinner" /></div>;

  return (
    <div className="bg-paper min-h-[60vh]">
      <div className="border-b border-cream-dark bg-cream py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="section-label mb-2">Área do cliente</p>
          <h1 className="font-display font-light text-[34px] text-ink">
            Olá, {user.displayName?.split(' ')[0] ?? 'cliente'}
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-cream-dark max-w-2xl">
          {[
            { href: '/conta/pedidos', label: 'Meus pedidos', desc: 'Acompanhe o status das suas compras' },
            { href: '/perfil', label: 'Meu perfil', desc: 'Edite suas informações pessoais' },
          ].map(({ href, label, desc }) => (
            <Link key={href} href={href} className="bg-paper px-7 py-6 no-underline group hover:bg-cream transition-colors">
              <p className="text-[15px] font-medium text-ink mb-1 group-hover:text-ink">{label}</p>
              <p className="text-[13px] text-ink-light">{desc}</p>
              <p className="text-[12px] text-warm-dark mt-3 tracking-[0.04em]">Acessar →</p>
            </Link>
          ))}
        </div>

        <button onClick={logout} className="mt-10 text-[13px] text-ink-light bg-transparent border-none p-0 hover:text-ink transition-colors">
          Sair da conta
        </button>
      </div>
    </div>
  );
}
