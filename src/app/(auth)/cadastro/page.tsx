'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import Link from 'next/link';
import Image from 'next/image';
import { GoogleSignInButton } from '@/components/ui/GoogleSignInButton';
import { maskPhone, maskCpf, isValidCpf, isValidPhone } from '@/lib/masks';

declare global {
  interface Window {
    grecaptcha?: { execute: (key: string, opts: { action: string }) => Promise<string> };
  }
}

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: 'Mínimo 8 caracteres', ok: password.length >= 8 },
    { label: 'Letra maiúscula', ok: /[A-Z]/.test(password) },
    { label: 'Número', ok: /[0-9]/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  const colors = ['bg-red-500', 'bg-yellow-400', 'bg-green-500'];
  const labels = ['Fraca', 'Média', 'Forte'];

  if (!password) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[0, 1, 2].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < score ? colors[score - 1] : 'bg-mist/30'}`} />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          {checks.map(c => (
            <span key={c.label} className={`text-xs flex items-center gap-1 ${c.ok ? 'text-green-500' : 'text-faint'}`}>
              <span>{c.ok ? '✓' : '·'}</span>{c.label}
            </span>
          ))}
        </div>
        <span className={`text-xs font-medium ${score === 3 ? 'text-green-500' : score === 2 ? 'text-yellow-400' : 'text-red-400'}`}>
          {labels[score - 1] ?? ''}
        </span>
      </div>
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

export default function RegisterPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [name, setName]           = useState('');
  const [email, setEmail]         = useState('');
  const [phone, setPhone]         = useState('');
  const [cpf, setCpf]             = useState('');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [lgpd, setLgpd]           = useState(false);
  const [error, setError]         = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading]     = useState(false);
  const [step, setStep]           = useState<'form' | 'success'>('form');

  useEffect(() => { if (user) router.push('/'); }, [user, router]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
    if (!key || document.getElementById('recaptcha-script')) return;
    const script = document.createElement('script');
    script.id = 'recaptcha-script';
    script.src = `https://www.google.com/recaptcha/api.js?render=${key}`;
    script.async = true;
    document.head.appendChild(script);
  }, []);

  const validate = useCallback(() => {
    const errs: Record<string, string> = {};
    if (name.trim().length < 2) errs.name = 'Nome muito curto';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'E-mail inválido';
    if (phone && !isValidPhone(phone)) errs.phone = 'Telefone inválido';
    if (cpf && !isValidCpf(cpf)) errs.cpf = 'CPF inválido';
    if (password.length < 8) errs.password = 'Mínimo 8 caracteres';
    if (password !== confirm) errs.confirm = 'Senhas não conferem';
    if (!lgpd) errs.lgpd = 'Aceite os termos para continuar';
    return errs;
  }, [name, email, phone, cpf, password, confirm, lgpd]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
      let recaptchaToken: string | undefined;
      if (siteKey && window.grecaptcha) {
        recaptchaToken = await window.grecaptcha.execute(siteKey, { action: 'register' });
      }
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          phone: phone || undefined,
          cpf: cpf.replace(/\D/g, '') || undefined,
          recaptchaToken,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error);
      }
      await signInWithEmailAndPassword(auth, email, password);
      setStep('success');
      setTimeout(() => router.push('/'), 1800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar');
    } finally {
      setLoading(false);
    }
  }

  const Field = ({ id, label, error: ferr, children }: { id: string; label: string; error?: string; children: React.ReactNode }) => (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {children}
      {ferr && <p className="mt-1 text-xs text-red-400">{ferr}</p>}
    </div>
  );

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-warm flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-500">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2 className="font-display text-2xl text-ink">Conta criada!</h2>
          <p className="text-mid text-sm">Redirecionando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper flex">
      {/* Painel esquerdo — editorial */}
      <div className="hidden lg:flex w-[45%] xl:w-1/2 relative flex-col justify-between p-12 xl:p-16 overflow-hidden">
        <div className="absolute inset-0 bg-ink" />
        <div className="absolute inset-0 flex items-end justify-start pointer-events-none overflow-hidden pb-8 pl-8">
          <p className="font-display text-[22rem] leading-none text-paper/[0.03] font-normal select-none tracking-[-0.05em]">M</p>
        </div>

        <Link href="/" className="relative z-10">
          <Image src="/logo-white.png" alt="Mikma" width={120} height={48} className="h-8 w-auto object-contain" />
        </Link>

        <div className="relative z-10">
          <p className="font-display text-paper font-normal leading-[1.05] mb-5 text-[clamp(2.4rem,3.5vw,3.8rem)]">
            Crie sua<br /><em className="text-clay not-italic">conta.</em>
          </p>
          <p className="text-[14px] text-paper/40 leading-relaxed max-w-[28ch]">
            Cadastre-se e receba seus lençóis em até 1h em Blumenau ou onde estiver no Brasil.
          </p>
        </div>

        <p className="relative z-10 text-[10px] text-paper/20 tracking-[0.2em] uppercase">Blumenau · SC · Brasil</p>
      </div>

      {/* Formulário */}
      <div className="flex-1 flex flex-col justify-center p-6 sm:p-12 min-h-screen overflow-y-auto bg-paper">
        <div className="w-full max-w-[400px] mx-auto py-10">
          <Link href="/" className="flex mb-10 lg:hidden">
            <Image src="/logo-dark.png" alt="Mikma" width={120} height={60} className="h-9 w-auto object-contain" />
          </Link>

          <h1 className="font-display font-normal text-ink text-[2.2rem] mb-2 leading-tight">Criar conta</h1>
          <p className="text-[14px] text-mid mb-8">Já tem conta? <Link href="/entrar" className="text-clay font-medium hover:text-clay-d transition-colors">Entrar</Link></p>

          {error && (
            <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2 rounded-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>

            <Field id="name" label="Nome completo" error={fieldErrors.name}>
              <input id="name" type="text" value={name} onChange={e => setName(e.target.value)}
                className={`input ${fieldErrors.name ? 'border-red-400' : ''}`} placeholder="Seu nome completo" autoComplete="name" />
            </Field>

            <Field id="email" label="E-mail" error={fieldErrors.email}>
              <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                className={`input ${fieldErrors.email ? 'border-red-400' : ''}`} placeholder="seu@email.com" autoComplete="email" />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field id="phone" label="Telefone (opcional)" error={fieldErrors.phone}>
                <input id="phone" type="tel" value={phone}
                  onChange={e => setPhone(maskPhone(e.target.value))}
                  className={`input ${fieldErrors.phone ? 'border-red-400' : ''}`}
                  placeholder="(47) 99999-9999" autoComplete="tel" />
              </Field>
              <Field id="cpf" label="CPF (opcional)" error={fieldErrors.cpf}>
                <input id="cpf" type="text" inputMode="numeric" value={cpf}
                  onChange={e => setCpf(maskCpf(e.target.value))}
                  className={`input ${fieldErrors.cpf ? 'border-red-400' : ''}`}
                  placeholder="000.000.000-00" autoComplete="off" />
              </Field>
            </div>

            <Field id="password" label="Senha" error={fieldErrors.password}>
              <div className="relative">
                <input id="password" type={showPass ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  className={`input pr-10 ${fieldErrors.password ? 'border-red-400' : ''}`}
                  placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
                <button type="button" onClick={() => setShowPass(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-mist hover:text-mid transition-colors">
                  <EyeIcon open={showPass} />
                </button>
              </div>
              <PasswordStrength password={password} />
            </Field>

            <Field id="confirm" label="Confirmar senha" error={fieldErrors.confirm}>
              <div className="relative">
                <input id="confirm" type={showConfirm ? 'text' : 'password'} value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  className={`input pr-10 ${fieldErrors.confirm ? 'border-red-400' : ''}`}
                  placeholder="Repita a senha" autoComplete="new-password" />
                <button type="button" onClick={() => setShowConfirm(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-mist hover:text-mid transition-colors">
                  <EyeIcon open={showConfirm} />
                </button>
              </div>
              {confirm && password === confirm && (
                <p className="mt-1 text-xs text-green-500 flex items-center gap-1"><span>✓</span> Senhas conferem</p>
              )}
            </Field>

            <div>
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className={`mt-0.5 w-4 h-4 rounded-sm border flex-shrink-0 flex items-center justify-center transition-colors
                  ${lgpd ? 'bg-clay border-clay' : 'border-mist group-hover:border-clay/60'}`}
                  onClick={() => setLgpd(p => !p)}>
                  {lgpd && <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2"><polyline points="2 6 5 9 10 3"/></svg>}
                </div>
                <input type="checkbox" className="sr-only" checked={lgpd} onChange={e => setLgpd(e.target.checked)} />
                <span className="text-xs text-mid leading-relaxed">
                  Li e aceito os{' '}
                  <Link href="/termos" className="text-clay underline underline-offset-2 hover:text-clay-d" target="_blank">Termos de Uso</Link>
                  {' '}e a{' '}
                  <Link href="/privacidade" className="text-clay underline underline-offset-2 hover:text-clay-d" target="_blank">Política de Privacidade</Link>
                  {' '}(LGPD)
                </span>
              </label>
              {fieldErrors.lgpd && <p className="mt-1 text-xs text-red-400 ml-7">{fieldErrors.lgpd}</p>}
            </div>

            <button type="submit" disabled={loading}
              className="btn-primary w-full h-12 text-[13px] font-semibold tracking-wide flex items-center justify-center gap-2">
              {loading ? <><span className="spinner" /><span>Criando conta...</span></> : 'Criar minha conta'}
            </button>
          </form>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 divider" />
            <span className="text-xs text-faint uppercase tracking-wider">ou</span>
            <div className="flex-1 divider" />
          </div>

          <GoogleSignInButton onError={setError} />

          <p className="text-xs text-faint text-center mt-6 leading-relaxed">
            Protegido por reCAPTCHA v3 ·{' '}
            <Link href="/privacidade" className="underline underline-offset-2 hover:text-mid">Privacidade</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
