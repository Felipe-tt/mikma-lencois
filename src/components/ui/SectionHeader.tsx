import Link from 'next/link';
import type { ReactNode } from 'react';

interface Props {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  cta?: { label: string; href: string };
  align?: 'left' | 'center';
  className?: string;
  children?: ReactNode;
}

export function SectionHeader({ eyebrow, title, subtitle, cta, align = 'left', className = '', children }: Props) {
  return (
    <div className={`flex items-end justify-between gap-6 ${className}`}>
      <div className={align === 'center' ? 'mx-auto text-center' : ''}>
        {eyebrow && <span className="eyebrow mb-4 block">{eyebrow}</span>}
        <h2 className="font-display font-normal text-ink text-balance text-3xl sm:text-4xl leading-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-3 text-[14px] text-mid leading-relaxed max-w-prose">{subtitle}</p>
        )}
        {children}
      </div>
      {cta && (
        <Link
          href={cta.href}
          className="hidden sm:inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-mid hover:text-ink transition-colors group pb-0.5"
        >
          {cta.label}
          
        </Link>
      )}
    </div>
  );
}
