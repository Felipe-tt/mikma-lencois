'use client';

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { loadFirestore, watchDoc } from '@/lib/firebase/lazyDb';
import { useAuth } from '@/lib/auth/AuthContext';
import type { Wishlist } from '@/types';

type WishlistValue = {
  productIds: string[];
  isFavorite: (productId: string) => boolean;
  toggle: (productId: string) => Promise<boolean>;
  loading: boolean;
  loggedIn: boolean;
};

const WishlistContext = createContext<WishlistValue | null>(null);

/**
 * Estado em tempo real da wishlist do usuário logado (wishlists/{uid}),
 * numa assinatura só pro site inteiro. Antes cada ProductCard abria o
 * próprio onSnapshot: uma listagem com 24 cards eram 24 assinaturas.
 */
export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [productIds, setProductIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // toggle lê usuário e lista atuais por ref: a ação guardada pelo
  // requireAuth (favoritar sem estar logado) roda depois do login, com
  // uma closure de antes dele, e antes disso não fazia nada.
  const userRef = useRef(user);
  const idsRef = useRef(productIds);
  useEffect(() => { userRef.current = user; idsRef.current = productIds; });

  useEffect(() => {
    if (!user) {
      setProductIds([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return watchDoc<Wishlist>(['wishlists', user.uid], data => {
      setProductIds(data?.productIds ?? []);
      setLoading(false);
    }, () => setLoading(false));
  }, [user]);

  const isFavorite = useCallback((productId: string) => productIds.includes(productId), [productIds]);

  const toggle = useCallback(async (productId: string) => {
    const current = userRef.current;
    if (!current) return false; // caller decide o que fazer (ex: abrir o login)
    const favoriting = !idsRef.current.includes(productId);
    // Otimista: o coração muda na hora, o snapshot confirma depois.
    setProductIds(ids => favoriting ? [...ids, productId] : ids.filter(id => id !== productId));
    try {
      const { db, doc, setDoc, arrayUnion, arrayRemove } = await loadFirestore();
      await setDoc(doc(db, 'wishlists', current.uid), {
        productIds: favoriting ? arrayUnion(productId) : arrayRemove(productId),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch {
      setProductIds(ids => favoriting ? ids.filter(id => id !== productId) : [...ids, productId]);
      return !favoriting;
    }
    return favoriting;
  }, []);

  const value = useMemo(
    () => ({ productIds, isFavorite, toggle, loading, loggedIn: !!user }),
    [productIds, isFavorite, toggle, loading, user],
  );
  return createElement(WishlistContext.Provider, { value }, children);
}

// Fora do provider (ex.: preview do painel, testes): sem favoritos.
const EMPTY: WishlistValue = {
  productIds: [], isFavorite: () => false, toggle: async () => false, loading: false, loggedIn: false,
};

export function useWishlist(): WishlistValue {
  return useContext(WishlistContext) ?? EMPTY;
}
