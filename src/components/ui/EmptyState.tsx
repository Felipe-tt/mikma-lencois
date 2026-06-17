import Link from 'next/link';
import type { ReactNode } from 'react';

interface Action {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: 'primary' | 'outline';
}

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  actions?: Action[];
  className?: string;
}

export function EmptyState({ icon, title, description, actions, className = '' }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center py-20 sm:py-28 px-6 text-center border border-mist ${className}`}>
      {icon && (
        <div className="text-faint mb-5 opacity-40">
          {icon}
        </div>
      )}
      <p className="font-display font-normal text-ink text-2xl mb-2">{title}</p>
      {description && (
        <p className="text-[14px] text-mid leading-relaxed max-w-[32ch] mb-6">{description}</p>
      )}
      {!description && actions && <div className="mb-6" />}
      {actions && actions.length > 0 && (
        <div className="flex flex-wrap gap-3 justify-center">
          {actions.map((action, i) => {
            const cls = action.variant === 'outline'
              ? 'btn-outline text-[13px]'
              : i === 0 ? 'btn-primary text-[13px]' : 'btn-outline text-[13px]';
            if (action.href) {
              return <Link key={i} href={action.href} className={cls}>{action.label}</Link>;
            }
            return (
              <button key={i} onClick={action.onClick} className={cls}>{action.label}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}
