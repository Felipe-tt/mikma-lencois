// Substitui eyebrow + h1 genérico — mais variado que sempre usar eyebrow
import type { ReactNode } from 'react';

interface Props {
  label?: string;
  title: string | ReactNode;
  subtitle?: string;
  className?: string;
}

export function PageTitle({ label, title, subtitle, className = '' }: Props) {
  return (
    <div className={className}>
      {label && (
        <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-faint mb-4 flex items-center gap-3">
          <span className="w-4 h-px bg-mist" />
          {label}
        </p>
      )}
      <h1 className="font-display font-normal text-ink leading-[1.05] text-4xl sm:text-5xl">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-3 text-[14px] text-mid leading-relaxed">{subtitle}</p>
      )}
    </div>
  );
}
