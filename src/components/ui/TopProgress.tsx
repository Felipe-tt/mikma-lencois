'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

function Bar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const prevKey = useRef(`${pathname}${searchParams}`);
  const rafRef = useRef<number | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const key = `${pathname}${searchParams}`;
    if (prevKey.current === key) return;
    prevKey.current = key;

    cancelAnimationFrame(rafRef.current!);
    clearTimeout(timerRef.current);
    setProgress(0);
    setVisible(true);

    rafRef.current = requestAnimationFrame(() => {
      setProgress(20);
      timerRef.current = setTimeout(() => setProgress(70), 120);
    });

    timerRef.current = setTimeout(() => {
      setProgress(100);
      timerRef.current = setTimeout(() => { setVisible(false); setProgress(0); }, 300);
    }, 350);

    return () => { cancelAnimationFrame(rafRef.current!); clearTimeout(timerRef.current); };
  }, [pathname, searchParams]);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[10000] h-[2px] pointer-events-none">
      <div
        className="h-full bg-clay shadow-[0_0_6px_rgba(196,113,74,0.5)]"
        style={{
          width: `${progress}%`,
          transition: progress === 100 ? 'width 0.25s ease' : progress === 0 ? 'none' : 'width 0.4s cubic-bezier(0.4,0,0.2,1)',
        }}
      />
    </div>
  );
}

// Suspense embutido — não precisa de Suspense no ponto de uso
export function TopProgress() {
  return <Suspense fallback={null}><Bar /></Suspense>;
}
