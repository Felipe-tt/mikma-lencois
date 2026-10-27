'use client';

import { useEffect, useState } from 'react';
import { watchDoc } from '@/lib/firebase/lazyDb';
import { useAuth } from '@/lib/auth/AuthContext';
import type { Cart } from '@/types';

export function useCartTotal(): number {
  const { buyer: user } = useAuth();
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!user) { setTotal(0); return; }
    return watchDoc<Cart>(['carts', user.uid], cart => {
      setTotal(cart?.items?.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0) ?? 0);
    });
  }, [user]);

  return total;
}
