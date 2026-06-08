'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useRouter } from 'next/navigation';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: {
            client_id: string;
            callback: (r: { credential: string }) => void;
            use_fedcm_for_prompt?: boolean;
            ux_mode?: string;
          }) => void;
          renderButton: (el: HTMLElement, opts: object) => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

interface Props {
  onError?: (msg: string) => void;
}

export function GoogleSignInButton({ onError }: Props) {
  const { loginWithGoogleToken } = useAuth();
  const router = useRouter();
  const btnRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [gisReady, setGisReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.google?.accounts) { setGisReady(true); return; }
    const existing = document.getElementById('gsi-script');
    if (existing) return;
    const script = document.createElement('script');
    script.id = 'gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setGisReady(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!gisReady || !window.google?.accounts || !GOOGLE_CLIENT_ID || !btnRef.current) return;

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      ux_mode: 'popup',
      use_fedcm_for_prompt: false,
      callback: async ({ credential }) => {
        setLoading(true);
        try {
          await loginWithGoogleToken(credential);
          router.push('/');
        } catch (e) {
          onError?.(e instanceof Error ? e.message : 'Erro ao entrar com Google');
        } finally {
          setLoading(false);
        }
      },
    });

    // Renderiza o botão oficial do Google diretamente — mais confiável que o One Tap
    window.google.accounts.id.renderButton(btnRef.current, {
      type: 'standard',
      theme: 'filled_black',
      size: 'large',
      width: btnRef.current.offsetWidth || 400,
      text: 'signin_with',
      shape: 'rectangular',
      logo_alignment: 'left',
    });
  }, [gisReady, loginWithGoogleToken, router, onError]);

  if (loading) {
    return (
      <div className="btn-outline w-full py-3.5 flex items-center justify-center gap-3">
        <span className="spinner" />
        <span className="text-sm font-medium">Entrando...</span>
      </div>
    );
  }

  return <div ref={btnRef} className="w-full" />;
}
