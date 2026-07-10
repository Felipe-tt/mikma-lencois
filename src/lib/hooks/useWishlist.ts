'use client';

import { useEffect, useState, useCallback } from 'react';
import { doc, onSnapshot, setDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import type { Wishlist } from '@/types';

/**
 * Estado em tempo real da wishlist do usuário logado + função pra
 * favoritar/desfavoritar um produto. Documento único por usuário
 * (wishlists/{uid}), no mesmo padrão do carrinho (carts/{uid}).
 */
export function useWishlist() {
  const { user } = useAuth();
  const [productIds, setProductIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setProductIds([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db, 'wishlists', user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data() as Wishlist | undefined;
      setProductIds(data?.productIds ?? []);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const isFavorite = useCallback((productId: string) => productIds.includes(productId), [productIds]);

  const toggle = useCallback(async (productId: string) => {
    if (!user) return false; // caller decide o que fazer (ex: redirecionar pra login)
    const ref = doc(db, 'wishlists', user.uid);
    const favoriting = !productIds.includes(productId);
    await setDoc(ref, {
      productIds: favoriting ? arrayUnion(productId) : arrayRemove(productId),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return favoriting;
  }, [user, productIds]);

  return { productIds, isFavorite, toggle, loading, loggedIn: !!user };
}
