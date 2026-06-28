'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(true);
  const prevPath = useRef(pathname);

  useEffect(() => {
    if (prevPath.current === pathname) return;
    prevPath.current = pathname;
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, [pathname]);

  return (
    <div
      data-visible={visible}
      className="transition-[opacity,transform] duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)]
        data-[visible=false]:opacity-0 data-[visible=false]:translate-y-1.5
        data-[visible=true]:opacity-100 data-[visible=true]:translate-y-0"
    >
      {children}
    </div>
  );
}
