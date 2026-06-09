'use client';
import { useNavigation } from '@/lib/NavigationContext';

export function PageTransition({ children }: { children: React.ReactNode }) {
  const { navigating } = useNavigation();

  return (
    <div
      style={{
        opacity: navigating ? 0 : 1,
        transition: navigating
          ? 'opacity 0.15s ease'        // fade out fast when navigating away
          : 'opacity 0.25s ease 0.05s', // fade in slightly delayed on arrival
        willChange: 'opacity',
      }}
    >
      {children}
    </div>
  );
}
