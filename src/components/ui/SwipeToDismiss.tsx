'use client';

import { useRef, useState } from 'react';

/**
 * Aviso que sai arrastando para a esquerda ou para a direita, como as
 * notificações do celular. Toque curto continua chegando nos botões.
 */
export function SwipeToDismiss({ onDismiss, className = '', children }: { onDismiss: () => void; className?: string; children: React.ReactNode }) {
  const start = useRef<{ x: number; id: number } | null>(null);
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<0 | 1 | -1>(0);
  const [dragging, setDragging] = useState(false);

  function end() {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    if (Math.abs(dx) > 70) {
      setLeaving(dx > 0 ? 1 : -1);
      setTimeout(onDismiss, 180);
    } else {
      setDx(0);
    }
  }

  const offset = leaving ? leaving * 480 : dx;
  return (
    <div
      className={`touch-pan-y select-none ${className}`}
      style={{
        transform: `translateX(${offset}px)`,
        opacity: leaving ? 0 : 1 - Math.min(Math.abs(dx) / 260, 0.6),
        transition: dragging ? 'none' : 'transform 200ms ease-out, opacity 200ms ease-out',
      }}
      onPointerDown={e => {
        // Só o gesto em cima do aviso; o botão "Desfazer" continua clicável.
        start.current = { x: e.clientX, id: e.pointerId };
        setDragging(true);
      }}
      onPointerMove={e => {
        if (!start.current || start.current.id !== e.pointerId) return;
        const d = e.clientX - start.current.x;
        if (Math.abs(d) > 6 && !(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }
        setDx(d);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {children}
    </div>
  );
}
