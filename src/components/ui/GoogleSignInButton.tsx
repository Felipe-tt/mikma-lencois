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
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (el: HTMLElement, opts: object) => void;
          disableAutoPrompt: () => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

interface Props { onError?: (msg: string) => void }

export function GoogleSignInButton({ onError }: Props) {
  const { loginWithGoogleToken } = useAuth();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading]   = useState(false);
  const [gisReady, setGisReady] = useState(false);

  // Carrega o script GIS uma única vez
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.google?.accounts) { setGisReady(true); return; }
    const existing = document.getElementById('gsi-script');
    if (existing) {
      existing.addEventListener('load', () => setGisReady(true));
      return;
    }
    const script = document.createElement('script');
    script.id  = 'gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setGisReady(true);
    document.head.appendChild(script);
  }, []);

  // Quando GIS carregar, inicializa e renderiza o botão oficial do Google
  useEffect(() => {
    if (!gisReady || !containerRef.current || !GOOGLE_CLIENT_ID) return;
    if (!window.google?.accounts) return;

    window.google.accounts.id.initialize({
      client_id:             GOOGLE_CLIENT_ID,
      auto_select:           false,    // nunca disparar One Tap automático
      cancel_on_tap_outside: false,
      use_fedcm_for_prompt:  false,
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

    // Suprime qualquer One Tap automático que o browser possa disparar
    window.google.accounts.id.disableAutoPrompt();

    // Renderiza o botão oficial dentro do nosso container (centralizado e responsivo)
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(containerRef.current, {
        type:   'standard',
        theme:  'outline',
        size:   'large',
        text:   'continue_with',
        shape:  'square',
        locale: 'pt-BR',
        width:  containerRef.current.offsetWidth || 480,
      });
    }
  }, [gisReady, loginWithGoogleToken, router, onError]);

  return (
    <div className="w-full flex flex-col items-center gap-3">
      {loading && (
        <div className="flex items-center gap-2 text-sm text-mid py-2">
          <span className="spinner-dark" />
          <span>Autenticando…</span>
        </div>
      )}
      {/* Container do botão oficial do Google — ele se autoexpande */}
      <div
        ref={containerRef}
        className="w-full flex justify-center"
        style={{ minHeight: 44 }}
      />
      {!gisReady && (
        <div className="flex items-center justify-center gap-2 w-full py-3 border border-mist text-sm text-faint">
          <span className="spinner-dark" />
          Carregando…
        </div>
      )}
    </div>
  );
}
