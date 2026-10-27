'use client';

import { useEffect, useState } from 'react';
import { watchDoc } from '@/lib/firebase/lazyDb';
import { useAuth } from '@/lib/auth/AuthContext';
import type { Cart } from '@/types';

export function useCartCount(): number {
  const { buyer: user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }

    return watchDoc<Cart>(['carts', user.uid], cart => {
      setCount(cart?.items?.reduce((acc, item) => acc + item.quantity, 0) ?? 0);
    });
  }, [user]);

  return count;
}
