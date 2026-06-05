'use client';
import { useEffect, useState } from 'react';

export function PageLoader() {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Simula progresso realista: rápido no início, desacelera no meio
    const steps = [
      { target: 30, delay: 80 },
      { target: 60, delay: 200 },
      { target: 80, delay: 400 },
      { target: 92, delay: 700 },
    ];

    let timeout: ReturnType<typeof setTimeout>;
    steps.forEach(({ target, delay }) => {
      timeout = setTimeout(() => setProgress(target), delay);
    });

    return () => clearTimeout(timeout);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-paper"
      style={{ animation: 'none' }}
    >
      {/* Logo */}
      <div
        style={{
          opacity: 0,
          animation: 'mikmaFadeUp 0.5s ease 0.05s forwards',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-dark.png"
          alt="Mikma Lençóis"
          style={{ height: 48, width: 'auto', objectFit: 'contain' }}
        />
      </div>

      {/* Barra de progresso */}
      <div
        style={{
          marginTop: 48,
          width: 120,
          height: 2,
          background: '#E8E4DC',
          borderRadius: 999,
          overflow: 'hidden',
          opacity: 0,
          animation: 'mikmaFadeUp 0.5s ease 0.2s forwards',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            background: '#C4714A',
            borderRadius: 999,
            transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </div>

      <style>{`
        @keyframes mikmaFadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
