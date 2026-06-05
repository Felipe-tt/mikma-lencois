'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

export function TopProgress() {
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const prevPathname = useRef(pathname);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (prevPathname.current === pathname) return;
    prevPathname.current = pathname;

    // Start
    setVisible(true);
    setWidth(0);
    clearTimeout(timer.current);

    // Animate to 90% quickly, then complete
    requestAnimationFrame(() => {
      setWidth(15);
      setTimeout(() => setWidth(60), 100);
      setTimeout(() => setWidth(85), 400);
      setTimeout(() => {
        setWidth(100);
        timer.current = setTimeout(() => {
          setVisible(false);
          setWidth(0);
        }, 400);
      }, 800);
    });

    return () => clearTimeout(timer.current);
  }, [pathname]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10000,
        height: 2,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${width}%`,
          background: '#C4714A',
          transition: width === 100
            ? 'width 0.3s ease'
            : 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: '0 0 8px rgba(196, 113, 74, 0.6)',
        }}
      />
    </div>
  );
}
