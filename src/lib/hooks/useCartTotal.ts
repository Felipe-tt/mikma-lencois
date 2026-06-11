'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import type { Cart } from '@/types';

export function useCartTotal(): number {
  const { user } = useAuth();
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!user) { setTotal(0); return; }
    return onSnapshot(doc(db, 'carts', user.uid), snap => {
      if (!snap.exists()) { setTotal(0); return; }
      const cart = snap.data() as Cart;
      setTotal(cart.items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0));
    });
  }, [user]);

  return total;
}
