'use client';
import { useEffect } from 'react';
import { trackViewItem } from '@/lib/analytics';

export function TrackViewItem({ id, name, priceCents, category }: { id: string; name: string; priceCents: number; category: string }) {
  useEffect(() => {
    trackViewItem({ id, name, priceCents, category });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return null;
}
