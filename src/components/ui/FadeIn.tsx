'use client';
import { useLayoutEffect, useRef, useState } from 'react';

interface Props {
  children: React.ReactNode;
  className?: string;
  delay?: number; // ms
}

// 'idle': como veio do servidor, visível e sem animação.
// 'hidden': abaixo da dobra, esperando entrar na tela.
// 'shown': entrou na tela, anima até o estado normal.
type Phase = 'idle' | 'hidden' | 'shown';

/**
 * Revela o conteúdo ao rolar. Começa VISÍVEL (no HTML do servidor e sem JS
 * o texto aparece normalmente) e só esconde, antes da pintura, o que está
 * abaixo da dobra. Antes começava com opacity 0 sempre: com JS lento o
 * conteúdo ficava invisível, e o translate/will-change ficavam aplicados
 * pra sempre depois da animação.
 */
export function FadeIn({ children, className = '', delay = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return; // já na tela
    setPhase('hidden');
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setPhase('shown'); obs.disconnect(); } },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const motion =
    phase === 'hidden' ? 'opacity-0 translate-y-4'
    : phase === 'shown' ? 'transition-[opacity,translate] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]'
    : '';

  return (
    <div
      ref={ref}
      className={`${motion} ${className}`}
      style={phase === 'shown' && delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
