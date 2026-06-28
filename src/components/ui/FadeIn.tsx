'use client';
import { useEffect, useRef, useState } from 'react';

interface Props {
  children: React.ReactNode;
  className?: string;
  delay?: number; // ms
}

export function FadeIn({ children, className = '', delay = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-visible={visible}
      data-delay={delay}
      className={`will-change-[opacity,transform] transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]
        data-[visible=false]:opacity-0 data-[visible=false]:translate-y-4
        data-[visible=true]:opacity-100 data-[visible=true]:translate-y-0
        ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
