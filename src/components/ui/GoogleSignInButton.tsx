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
          }) => void;
          prompt: (notification?: (n: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => void) => void;
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
    const existingScript = document.getElementById('gsi-script');
    if (existingScript) {
      if (window.google?.accounts) setGisReady(true);
      return;
    }
    const script = document.createElement('script');
    script.id = 'gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setGisReady(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!gisReady || !window.google?.accounts || !GOOGLE_CLIENT_ID) return;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
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
      use_fedcm_for_prompt: false,
    });
  }, [gisReady, loginWithGoogleToken, router, onError]);

  function handleClick() {
    if (!gisReady || !window.google?.accounts) {
      onError?.('Google Sign-In não carregou. Recarregue a página.');
      return;
    }
    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        // Fallback: render Google button if One Tap is suppressed
        if (btnRef.current) {
          btnRef.current.innerHTML = '';
          window.google!.accounts.id.renderButton(btnRef.current, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            width: btnRef.current.offsetWidth,
          });
          (btnRef.current.querySelector('div[role="button"]') as HTMLElement | null)?.click();
        }
      }
    });
  }

  return (
    <div ref={btnRef} className="w-full">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || !gisReady}
        className="btn-outline w-full gap-3 py-3.5 flex items-center justify-center"
      >
        {loading ? (
          <span className="spinner" />
        ) : (
          <>
            <GoogleIcon />
            <span className="text-sm font-medium">Continuar com Google</span>
          </>
        )}
      </button>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}
