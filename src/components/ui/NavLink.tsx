'use client';
import Link, { LinkProps } from 'next/link';
import { useNavigation } from '@/lib/NavigationContext';
import { usePathname } from 'next/navigation';
import React from 'react';

type NavLinkProps = LinkProps & {
  children: React.ReactNode;
  className?: string;
  'aria-label'?: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  onMouseEnter?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
};

export function NavLink({ children, onClick, ...props }: NavLinkProps) {
  const { startNavigation } = useNavigation();
  const pathname = usePathname();

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // Only trigger if navigating to a different page
    const href = typeof props.href === 'string' ? props.href : props.href?.pathname ?? '';
    const targetPath = href.split('?')[0];
    if (targetPath !== pathname) {
      startNavigation();
    }
    onClick?.(e);
  }

  return (
    <Link {...props} onClick={handleClick}>
      {children}
    </Link>
  );
}
