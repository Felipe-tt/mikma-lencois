'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import type { Cart } from '@/types';

export function useCartCount(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }

    const cartRef = doc(db, 'carts', user.uid);
    const unsub = onSnapshot(cartRef, (snap) => {
      if (!snap.exists()) {
        setCount(0);
        return;
      }
      const cart = snap.data() as Cart;
      const total = cart.items.reduce((acc, item) => acc + item.quantity, 0);
      setCount(total);
    });

    return unsub;
  }, [user]);

  return count;
}
