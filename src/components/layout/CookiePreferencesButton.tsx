'use client';

import type { ReactNode } from 'react';
import { HAS_OPTIONAL_COOKIES, OPEN_PREFERENCES_EVENT } from '@/lib/cookie-consent';

/** Reabre o aviso de cookies para o visitante rever ou mudar a escolha. */
export function CookiePreferencesButton({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  if (!HAS_OPTIONAL_COOKIES) return null;
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new Event(OPEN_PREFERENCES_EVENT))}
    >
      {children ?? 'Preferências de cookies'}
    </button>
  );
}
