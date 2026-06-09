'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

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

interface GooglePayload {
  name?: string;
  email?: string;
  picture?: string;
}

function parseJwtPayload(token: string): GooglePayload {
  try {
    return JSON.parse(atob(token.split('.')[1])) as GooglePayload;
  } catch {
    return {};
  }
}

interface Props {
  onError?: (msg: string) => void;
}

export function GoogleSignInButton({ onError }: Props) {
  const { loginWithGoogleToken } = useAuth();
  const router = useRouter();
  const btnRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [userInfo, setUserInfo] = useState<GooglePayload | null>(null);
  const [gisReady, setGisReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.google?.accounts) { setGisReady(true); return; }
    const existing = document.getElementById('gsi-script');
    if (existing) { return; }
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
        const info = parseJwtPayload(credential);
        setUserInfo(info);
        setLoading(true);
        try {
          await loginWithGoogleToken(credential);
          router.push('/');
        } catch (e) {
          setLoading(false);
          setUserInfo(null);
          onError?.(e instanceof Error ? e.message : 'Erro ao entrar com Google');
        }
      },
    });

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

  if (loading && userInfo) {
    return (
      <div className="w-full rounded-sm overflow-hidden border border-paper/10 bg-[#1a1a1a]">
        <div
          className="h-0.5 bg-clay origin-left animate-progress-bar"
          style={{ animation: 'progress-bar 2.5s ease-in-out infinite' }}
        />
        <div className="flex items-center gap-3 px-4 py-3">
          {userInfo.picture ? (
            <Image
              src={userInfo.picture}
              alt={userInfo.name ?? ''}
              width={32}
              height={32}
              className="rounded-full ring-2 ring-clay/40"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-clay/20 flex items-center justify-center text-clay text-sm font-medium">
              {userInfo.name?.[0]?.toUpperCase() ?? 'G'}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-paper truncate">{userInfo.name}</p>
            <p className="text-xs text-mist truncate">{userInfo.email}</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-mist">
            <span className="spinner-sm" />
            <span>Entrando</span>
          </div>
        </div>
      </div>
    );
  }

  return <div ref={btnRef} className="w-full" />;
}
