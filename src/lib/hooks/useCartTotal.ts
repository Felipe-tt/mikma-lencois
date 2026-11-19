'use client';

import { useEffect, useState } from 'react';
import { watchDoc } from '@/lib/firebase/lazyDb';
import { useAuth } from '@/lib/auth/AuthContext';
import type { Cart } from '@/types';

/**
 * Soma dos produtos do carrinho e se há cupom salvo nele. Com cupom, o frete
 * grátis conta os produtos menos o desconto (regra do pagamento), que só o
 * carrinho calcula: quem mostra a barra de frete grátis precisa saber.
 */
export function useCartTotal(): { total: number; hasCoupon: boolean } {
  const { buyer: user } = useAuth();
  const [state, setState] = useState({ total: 0, hasCoupon: false });

  useEffect(() => {
    if (!user) { setState({ total: 0, hasCoupon: false }); return; }
    return watchDoc<Cart>(['carts', user.uid], cart => {
      setState({
        total: cart?.items?.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0) ?? 0,
        hasCoupon: !!cart?.couponCode,
      });
    });
  }, [user]);

  return state;
}
