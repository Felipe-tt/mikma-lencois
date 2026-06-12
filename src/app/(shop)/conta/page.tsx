'use client';
import { useAuth } from '@/lib/auth/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import { AccountSkeleton } from '@/components/ui/Skeleton';

const LINKS = [
  {
    href: '/conta/pedidos',
    label: 'Meus pedidos',
    desc: 'Acompanhe o status das suas compras',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
  },
  {
    href: '/perfil',
    label: 'Meu perfil',
    desc: 'Edite seu nome, e-mail e senha',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
];

export default function ContaPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push('/entrar');
  }, [user, loading, router]);

  if (loading || !user) return <AccountSkeleton />;

  return (
    <div>
      {/* Header — clean, sem bg separado */}
      <div className="border-b border-mist">
        <div className="container-shop py-12 sm:py-16">
          <span className="eyebrow mb-3 block">Área do cliente</span>
          <h1 className="font-display font-normal text-ink text-4xl sm:text-5xl leading-tight">
            Olá, {user.displayName?.split(' ')[0] ?? 'cliente'}
          </h1>
          <p className="text-[14px] text-faint mt-2">{user.email}</p>
        </div>
      </div>

      <div className="container-shop py-8 sm:py-12 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 max-w-2xl border border-mist">
          {LINKS.map(({ href, label, desc, icon }, idx) => (
            <Link
              key={href}
              href={href}
              className={`flex items-start gap-5 bg-paper px-6 py-7 group hover:bg-warm transition-colors duration-150 ${
                idx % 2 === 0 ? 'border-b sm:border-b-0 sm:border-r border-mist' : 'border-b last:border-b-0 border-mist'
              }`}
            >
              <span className="text-clay mt-0.5 shrink-0">{icon}</span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-ink">{label}</p>
                <p className="text-[13px] text-mid mt-1 leading-relaxed">{desc}</p>
                <p className="text-[11px] text-clay mt-3 font-semibold inline-flex items-center gap-1.5 group-hover:gap-2.5 transition-all duration-150">
                  Acessar
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </p>
              </div>
            </Link>
          ))}
        </div>

        <button
          onClick={logout}
          className="mt-10 text-[13px] text-faint hover:text-ink transition-colors inline-flex items-center gap-2"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sair da conta
        </button>
      </div>
    </div>
  );
}
