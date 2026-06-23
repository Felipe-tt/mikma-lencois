'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import Link from 'next/link';
import Image from 'next/image';

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: 'Mínimo 8 caracteres', ok: password.length >= 8 },
    { label: 'Letra maiúscula', ok: /[A-Z]/.test(password) },
    { label: 'Número', ok: /[0-9]/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  if (!password) return null;
  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[0,1,2].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
            i < score ? ['bg-red-400','bg-yellow-400','bg-green-500'][score-1] : 'bg-mist'
          }`} />
        ))}
      </div>
      <p className={`text-xs ${score===3?'text-green-500':score===2?'text-yellow-500':'text-red-400'}`}>
        {score===3?'✓ Senha forte':score===2?'Senha média':'Senha fraca — adicione maiúscula e número'}
      </p>
    </div>
  );
}

function ResetForm() {
  const router    = useRouter();
  const params    = useSearchParams();
  const emailParam = params.get('email') ?? '';
  const tokenParam = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);
  const [checking, setChecking] = useState(true);
  const [linkInvalid, setLinkInvalid] = useState('');

  // Se não veio com os params (acesso direto), redireciona
  useEffect(() => {
    if (!emailParam || !tokenParam) { router.replace('/entrar'); return; }
  }, [emailParam, tokenParam, router]);

  // Valida o token assim que a página carrega — sem o usuário digitar nada,
  // o próprio clique no botão do e-mail já trouxe tudo que é necessário.
  useEffect(() => {
    if (!emailParam || !tokenParam) return;
    (async () => {
      try {
        const res = await fetch(`/api/auth/reset-password?email=${encodeURIComponent(emailParam)}&token=${tokenParam}`);
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        setChecking(false);
      } catch (err: unknown) {
        setLinkInvalid(err instanceof Error ? err.message : 'Link inválido ou expirado.');
        setChecking(false);
      }
    })();
  }, [emailParam, tokenParam]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('A senha precisa ter pelo menos 8 caracteres.');
    if (password !== confirm) return setError('As senhas não são iguais. Confira e tente de novo.');

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailParam, token: tokenParam, newPassword: password }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);

      // Login automático: a pessoa acabou de definir esta senha agora
      // mesmo, então já temos tudo para autenticar direto no client,
      // sem precisar pedir a senha de novo na tela de login.
      try {
        await signInWithEmailAndPassword(auth, emailParam, password);
      } catch (loginErr) {
        // Troca de senha já aconteceu com sucesso — se o login automático
        // falhar por qualquer motivo, a pessoa ainda consegue entrar
        // manualmente com a senha nova na tela de login.
        console.error('[redefinir-senha] login automático falhou', loginErr);
      }

      setDone(true);
      setTimeout(() => router.push('/'), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao redefinir. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  if (checking) return (
    <div className="text-center py-10">
      <span className="spinner-dark mx-auto" />
      <p className="text-mid text-sm mt-4">Verificando link…</p>
    </div>
  );

  if (linkInvalid) return (
    <div className="text-center py-10">
      <div className="w-20 h-20 bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-6">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-500">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h2 className="font-display text-2xl text-ink mb-2">Link inválido</h2>
      <p className="text-mid text-sm mb-6">{linkInvalid}</p>
      <Link href="/entrar" className="btn-primary inline-flex h-12 px-8 items-center justify-center text-[13px] font-semibold">
        Voltar para o login
      </Link>
    </div>
  );

  if (done) return (
    <div className="text-center py-10">
      <div className="w-20 h-20 bg-green-50 border border-green-100 flex items-center justify-center mx-auto mb-6">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-green-500">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      </div>
      <h2 className="font-display text-2xl text-ink mb-2">Senha redefinida!</h2>
      <p className="text-mid text-sm">Sua nova senha está ativa. Redirecionando…</p>
    </div>
  );

  return (
    <>
      <h1 className="font-display font-normal text-ink text-[2rem] mb-2">Nova senha</h1>
      <p className="text-[14px] text-mid mb-8 leading-relaxed">
        Crie uma senha nova para a conta <strong className="text-ink">{emailParam}</strong>.
      </p>

      {error && (
        <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label className="label">Nova senha</label>
          <div className="relative">
            <input type={showPass ? 'text' : 'password'} value={password}
              onChange={e => setPassword(e.target.value)}
              className="input text-base pr-11" placeholder="Mínimo 8 caracteres"
              autoComplete="new-password" autoFocus />
            <button type="button" onClick={() => setShowPass(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-mist hover:text-mid p-1">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                {showPass
                  ? <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></>
                  : <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>}
              </svg>
            </button>
          </div>
          <PasswordStrength password={password} />
        </div>

        <div>
          <label className="label">Repita a nova senha</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            className="input text-base" placeholder="Digite a senha novamente"
            autoComplete="new-password" />
          {confirm && password === confirm && (
            <p className="mt-1.5 text-xs text-green-500 flex items-center gap-1"><span>✓</span> Senhas iguais</p>
          )}
        </div>

        <button type="submit" disabled={loading}
          className="btn-primary w-full h-12 text-[14px] font-semibold flex items-center justify-center gap-2 mt-1">
          {loading ? <><span className="spinner"/> Salvando…</> : 'Salvar nova senha'}
        </button>
      </form>

      <p className="text-center text-sm text-mid mt-6">
        Lembrou a senha?{' '}
        <Link href="/entrar" className="text-clay font-medium hover:underline">Entrar</Link>
      </p>
    </>
  );
}

export default function RedefinirSenhaPage() {
  return (
    <div className="min-h-screen bg-paper flex">
      <div className="hidden lg:flex w-[42%] flex-col justify-between p-12 xl:p-16 bg-warm border-r border-mist">
        <Link href="/"><Image src="/logo-dark.png" alt="Mikma" width={800} height={242} className="h-9 w-auto object-contain" /></Link>
        <div>
          <p className="font-display text-ink font-normal leading-[1.08] mb-4 text-[clamp(1.8rem,2.5vw,2.6rem)]">
            Nova<br /><em className="text-clay not-italic">senha.</em>
          </p>
          <p className="text-[13px] text-mid leading-relaxed max-w-[26ch]">
            Crie uma senha nova e segura para acessar sua conta.
          </p>
        </div>
        <p className="text-xs text-faint tracking-widest uppercase">Blumenau · SC · Brasil</p>
      </div>

      <div className="flex-1 flex flex-col justify-center p-6 sm:p-12 min-h-screen">
        <div className="w-full max-w-[400px] mx-auto">
          <Link href="/" className="flex mb-8 lg:hidden">
            <Image src="/logo-dark.png" alt="Mikma" width={800} height={242} className="h-8 w-auto object-contain" />
          </Link>
          <Suspense fallback={<div className="spinner-dark mx-auto" />}>
            <ResetForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
