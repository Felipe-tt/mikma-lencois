'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import Link from 'next/link';
import Image from 'next/image';
import { GoogleSignInButton } from '@/components/ui/GoogleSignInButton';
import { maskPhone, maskCpf, isValidCpf, isValidPhone } from '@/lib/masks';

type Step = 'email' | 'awaiting' | 'password' | 'done';

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: 'Mínimo 8 caracteres', ok: password.length >= 8 },
    { label: 'Letra maiúscula', ok: /[A-Z]/.test(password) },
    { label: 'Número', ok: /[0-9]/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  if (!password) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[0,1,2].map(i => (
          <div key={i} className={`h-1 flex-1 transition-colors rounded-full ${
            i < score ? ['bg-red-400','bg-yellow-400','bg-green-500'][score-1] : 'bg-mist'
          }`} />
        ))}
      </div>
      <p className={`text-xs ${score===3?'text-green-500':score===2?'text-yellow-500':'text-red-400'}`}>
        {score===3?'✓ Senha forte':score===2?'Senha média — adicione maiúscula ou número':'Senha fraca'}
      </p>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2.5">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>{msg}</span>
    </div>
  );
}

function RegisterContent() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  // Se a pessoa chegou aqui pelo botão do e-mail de confirmação
  // (/confirmar-email já validou o token), pula direto para a etapa de senha.
  const resumeEmail = params.get('email');
  const resumeStep = params.get('step');

  const [step, setStep]         = useState<Step>(resumeStep === 'password' && resumeEmail ? 'password' : 'email');
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState(resumeEmail ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [phone, setPhone]       = useState('');
  const [cpf, setCpf]           = useState('');
  const [lgpd, setLgpd]         = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resent, setResent]     = useState(false);

  useEffect(() => { if (user) router.push('/'); }, [user, router]);

  // Countdown para reenvio
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // ── Step 1: envia link de confirmação por e-mail ─────────────────────────
  async function handleSendLink(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (name.trim().length < 2) return setError('Por favor, informe seu nome completo.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Por favor, informe um e-mail válido.');

    setLoading(true);
    try {
      const res = await fetch('/api/auth/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setStep('awaiting');
      setResendCooldown(60);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setLoading(true);
    setError('');
    setResent(false);
    try {
      const res = await fetch('/api/auth/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setResendCooldown(60);
      setResent(true);
      setTimeout(() => setResent(false), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao reenviar.');
    } finally {
      setLoading(false);
    }
  }

  // ── Step 3: cria conta ───────────────────────────────────────────────────
  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('A senha precisa ter pelo menos 8 caracteres.');
    if (password !== confirm) return setError('As senhas não são iguais.');
    if (phone && !isValidPhone(phone)) return setError('Telefone inválido.');
    if (cpf && !isValidCpf(cpf)) return setError('CPF inválido.');
    if (!lgpd) return setError('Aceite os termos para continuar.');

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          phone: phone || undefined,
          cpf: cpf.replace(/\D/g,'') || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      await signInWithEmailAndPassword(auth, email, password);
      setStep('done');
      setTimeout(() => router.push('/'), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar conta.');
    } finally {
      setLoading(false);
    }
  }

  // ── Layout wrapper ───────────────────────────────────────────────────────
  const stepNum = step === 'email' ? 1 : step === 'awaiting' ? 2 : step === 'password' ? 3 : 3;

  return (
    <div className="min-h-screen bg-paper flex">

      {/* Painel esquerdo */}
      <div className="hidden lg:flex w-[42%] flex-col justify-between p-12 xl:p-16 bg-warm border-r border-mist">
        <Link href="/"><Image src="/logo-dark.png" alt="Mikma" width={800} height={242} className="h-9 w-auto object-contain" /></Link>
        <div>
          <p className="font-display text-ink font-normal leading-[1.08] mb-4 text-[clamp(1.8rem,2.5vw,2.6rem)]">
            Crie sua<br /><em className="text-clay not-italic">conta.</em>
          </p>
          <p className="text-[13px] text-mid leading-relaxed max-w-[26ch]">
            Receba seus lençóis em até 1h em Blumenau.
          </p>
        </div>
        <p className="text-xs text-faint tracking-widest uppercase">Blumenau · SC · Brasil</p>
      </div>

      {/* Formulário */}
      <div className="flex-1 flex flex-col justify-center p-6 sm:p-12 min-h-screen overflow-y-auto">
        <div className="w-full max-w-[400px] mx-auto py-10">

          <Link href="/" className="flex mb-8 lg:hidden">
            <Image src="/logo-dark.png" alt="Mikma" width={800} height={242} className="h-8 w-auto object-contain" />
          </Link>

          {/* Indicador de progresso */}
          {step !== 'done' && (
            <div className="flex items-center gap-2 mb-8">
              {[1,2,3].map(n => (
                <div key={n} className="flex items-center gap-2 flex-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                    n < stepNum ? 'bg-green-500 text-white' :
                    n === stepNum ? 'bg-ink text-paper' :
                    'bg-mist text-faint'
                  }`}>
                    {n < stepNum ? '✓' : n}
                  </div>
                  <p className={`text-xs hidden sm:block ${n === stepNum ? 'text-ink font-medium' : 'text-faint'}`}>
                    {n===1?'Seu e-mail':n===2?'Confirmar':n===3?'Sua senha':''}
                  </p>
                  {n < 3 && <div className={`flex-1 h-px ${n < stepNum ? 'bg-green-500' : 'bg-mist'}`} />}
                </div>
              ))}
            </div>
          )}

          {/* ── ETAPA 1: nome + e-mail ── */}
          {step === 'email' && (
            <>
              <h1 className="font-display font-normal text-ink text-[2rem] mb-1">Criar conta</h1>
              <p className="text-[14px] text-mid mb-8">
                Já tem conta?{' '}
                <Link href="/entrar" className="text-clay font-medium hover:underline">Entrar</Link>
              </p>

              {error && <ErrorBox msg={error} />}

              <form onSubmit={handleSendLink} className="flex flex-col gap-5">
                <div>
                  <label className="label">Seu nome completo</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)}
                    className="input text-base" placeholder="Maria da Silva"
                    autoComplete="name" autoFocus />
                </div>
                <div>
                  <label className="label">Seu e-mail</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    className="input text-base" placeholder="seuemail@exemplo.com"
                    autoComplete="email" />
                  <p className="mt-1.5 text-xs text-mid">Vamos te enviar um e-mail com um botão para confirmar.</p>
                </div>

                <button type="submit" disabled={loading}
                  className="btn-primary w-full h-13 text-[14px] font-semibold tracking-wide flex items-center justify-center gap-2 mt-1">
                  {loading ? <><span className="spinner" /> Enviando…</> : 'Continuar →'}
                </button>
              </form>

              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 divider" /><span className="text-xs text-faint uppercase tracking-wider">ou</span><div className="flex-1 divider" />
              </div>
              <GoogleSignInButton onError={setError} />
            </>
          )}

          {/* ── ETAPA 2: aguardando clique no e-mail ── */}
          {step === 'awaiting' && (
            <>
              <div className="w-16 h-16 bg-clay/10 flex items-center justify-center mx-auto mb-6">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-clay">
                  <path d="M22 6l-10 7L2 6" /><rect x="2" y="4" width="20" height="16" rx="2" />
                </svg>
              </div>
              <h1 className="font-display font-normal text-ink text-[2rem] mb-2 text-center">Veja seu e-mail</h1>
              <p className="text-[14px] text-mid mb-8 leading-relaxed text-center">
                Enviamos um link para <strong className="text-ink">{email}</strong>. Abra o e-mail e clique no botão{' '}
                <strong className="text-ink">&ldquo;Confirmar meu e-mail&rdquo;</strong> para continuar — sem precisar digitar nada aqui.
              </p>

              {error && <ErrorBox msg={error} />}

              <div className="bg-warm border border-mist px-4 py-3.5 mb-6">
                <p className="text-xs text-mid leading-relaxed">
                  Assim que você confirmar pelo e-mail, esta aba pode ser fechada — o link já leva direto para o próximo passo.
                </p>
              </div>

              <div className="text-center">
                <p className="text-sm text-mid mb-2">Não recebeu o e-mail?</p>
                <button
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || loading}
                  className="text-sm text-clay font-medium hover:underline disabled:text-faint disabled:no-underline transition-colors"
                >
                  {loading ? 'Enviando…' : resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : 'Enviar novamente'}
                </button>
                {resent && <p className="text-xs text-green-600 mt-2">✓ E-mail reenviado.</p>}
                <p className="text-xs text-faint mt-2">Verifique também a caixa de spam.</p>
                <button onClick={() => { setStep('email'); setError(''); }}
                  className="block mx-auto mt-4 text-xs text-faint hover:text-mid underline underline-offset-2">
                  Usar outro e-mail
                </button>
              </div>
            </>
          )}

          {/* ── ETAPA 3: senha e dados extras ── */}
          {step === 'password' && (
            <>
              <div className="flex items-center gap-3 mb-6 p-3 bg-green-50 border border-green-200">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-500 shrink-0">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <p className="text-sm text-green-700 font-medium">E-mail confirmado! Agora crie sua senha.</p>
              </div>

              <h1 className="font-display font-normal text-ink text-[2rem] mb-6">Crie sua senha</h1>

              {error && <ErrorBox msg={error} />}

              <form onSubmit={handleRegister} className="flex flex-col gap-5">
                <div>
                  <label className="label">Senha</label>
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
                  <label className="label">Repita a senha</label>
                  <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                    className="input text-base" placeholder="Digite a senha novamente"
                    autoComplete="new-password" />
                  {confirm && password === confirm && (
                    <p className="mt-1.5 text-xs text-green-500 flex items-center gap-1"><span>✓</span> Senhas iguais</p>
                  )}
                </div>

                {/* Dados opcionais em accordeon */}
                <details className="border border-mist">
                  <summary className="px-4 py-3 text-sm text-mid cursor-pointer select-none hover:text-ink transition-colors">
                    + Adicionar telefone e CPF (opcional)
                  </summary>
                  <div className="px-4 pb-4 pt-3 flex flex-col gap-4">
                    <div>
                      <label className="label">Telefone / WhatsApp</label>
                      <input type="tel" value={phone} onChange={e => setPhone(maskPhone(e.target.value))}
                        className="input" placeholder="(47) 99999-0000" autoComplete="tel" />
                    </div>
                    <div>
                      <label className="label">CPF</label>
                      <input type="text" inputMode="numeric" value={cpf}
                        onChange={e => setCpf(maskCpf(e.target.value))}
                        className="input" placeholder="000.000.000-00" autoComplete="off" />
                    </div>
                  </div>
                </details>

                <label className="flex items-start gap-3 cursor-pointer group">
                  <div
                    onClick={() => setLgpd(p => !p)}
                    className={`mt-0.5 w-5 h-5 rounded-sm border flex-shrink-0 flex items-center justify-center transition-colors
                      ${lgpd ? 'bg-clay border-clay' : 'border-mist group-hover:border-clay/60'}`}
                  >
                    {lgpd && <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5"><polyline points="2 6 5 9 10 3"/></svg>}
                  </div>
                  <input type="checkbox" className="sr-only" checked={lgpd} onChange={e => setLgpd(e.target.checked)} />
                  <span className="text-[13px] text-mid leading-relaxed">
                    Li e aceito os{' '}
                    <Link href="/termos" className="text-clay underline underline-offset-2" target="_blank">Termos de Uso</Link>
                    {' '}e a{' '}
                    <Link href="/privacidade" className="text-clay underline underline-offset-2" target="_blank">Política de Privacidade</Link>
                  </span>
                </label>

                <button type="submit" disabled={loading}
                  className="btn-primary w-full h-13 text-[14px] font-semibold tracking-wide flex items-center justify-center gap-2">
                  {loading ? <><span className="spinner" /> Criando conta…</> : 'Criar minha conta'}
                </button>
              </form>
            </>
          )}

          {/* ── DONE ── */}
          {step === 'done' && (
            <div className="text-center py-10">
              <div className="w-20 h-20 bg-green-50 border border-green-100 flex items-center justify-center mx-auto mb-6">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-green-500">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
              <h2 className="font-display text-2xl text-ink mb-2">Conta criada!</h2>
              <p className="text-mid text-[14px]">Bem-vinda{name ? `, ${name.split(' ')[0]}` : ''}! Redirecionando…</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper flex items-center justify-center"><span className="spinner-dark" /></div>}>
      <RegisterContent />
    </Suspense>
  );
}
