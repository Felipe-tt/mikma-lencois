import { readFileSync } from 'fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, getDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';

// Testa as regras publicadas em firestore.rules contra o emulador local.
// Precisa do emulador rodando: `npm run test:rules` (sobe o emulador,
// roda este arquivo, derruba o emulador). Rodar `npm test` sozinho NÃO
// executa este arquivo (vitest.config.ts só inclui src/**/*.test.ts).
//
// Objetivo destes testes: travar as propriedades de segurança que mais
// importam (deny-by-default, sem auto-promoção de role, isolamento entre
// usuários) num teste automatizado, pra uma mudança futura na regra não
// abrir uma brecha silenciosa sem que o CI acuse.

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'mikma-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('users/{uid}', () => {
  it('dono lê o próprio documento', async () => {
    const buyer = testEnv.authenticatedContext('buyer1', { role: 'buyer' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/buyer1'), { name: 'Ana', role: 'buyer' });
    });
    await assertSucceeds(getDoc(doc(buyer.firestore(), 'users/buyer1')));
  });

  it('outro comprador não lê o documento alheio', async () => {
    const other = testEnv.authenticatedContext('buyer2', { role: 'buyer' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/buyer1'), { name: 'Ana', role: 'buyer' });
    });
    await assertFails(getDoc(doc(other.firestore(), 'users/buyer1')));
  });

  it('seller lê o documento de um comprador (precisa pra ver pedido)', async () => {
    const seller = testEnv.authenticatedContext('seller1', { role: 'seller' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/buyer1'), { name: 'Ana', role: 'buyer' });
    });
    await assertSucceeds(getDoc(doc(seller.firestore(), 'users/buyer1')));
  });

  it('CRÍTICO: comprador não consegue se auto-promover a admin', async () => {
    const buyer = testEnv.authenticatedContext('buyer1', { role: 'buyer' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/buyer1'), { name: 'Ana', role: 'buyer' });
    });
    await assertFails(
      updateDoc(doc(buyer.firestore(), 'users/buyer1'), { role: 'admin' })
    );
  });

  it('comprador consegue atualizar o próprio endereço (sem mexer em role)', async () => {
    const buyer = testEnv.authenticatedContext('buyer1', { role: 'buyer' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/buyer1'), { name: 'Ana', role: 'buyer' });
    });
    await assertSucceeds(
      updateDoc(doc(buyer.firestore(), 'users/buyer1'), { address: 'Rua X, 123' })
    );
  });

  it('admin consegue promover outro usuário', async () => {
    const admin = testEnv.authenticatedContext('admin1', { role: 'admin' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/buyer1'), { name: 'Ana', role: 'buyer' });
    });
    await assertSucceeds(
      updateDoc(doc(admin.firestore(), 'users/buyer1'), { role: 'seller' })
    );
  });
});

describe('orders/{orderId}', () => {
  it('dono do pedido consegue ler', async () => {
    const buyer = testEnv.authenticatedContext('buyer1', { role: 'buyer' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders/order1'), { userId: 'buyer1', status: 'paid' });
    });
    await assertSucceeds(getDoc(doc(buyer.firestore(), 'orders/order1')));
  });

  it('CRÍTICO: outro comprador não lê pedido alheio', async () => {
    const other = testEnv.authenticatedContext('buyer2', { role: 'buyer' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders/order1'), { userId: 'buyer1', status: 'paid' });
    });
    await assertFails(getDoc(doc(other.firestore(), 'orders/order1')));
  });

  it('CRÍTICO: cliente não consegue criar pedido direto pelo client SDK', async () => {
    const buyer = testEnv.authenticatedContext('buyer1', { role: 'buyer' });
    await assertFails(
      setDoc(doc(buyer.firestore(), 'orders/order2'), { userId: 'buyer1', status: 'pending' })
    );
  });

  it('seller só apaga pedido cancelado, não um pedido pago', async () => {
    const seller = testEnv.authenticatedContext('seller1', { role: 'seller' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders/order1'), { userId: 'buyer1', status: 'paid' });
    });
    await assertFails(deleteDoc(doc(seller.firestore(), 'orders/order1')));
  });
});

describe('products/{productId}', () => {
  it('leitura pública, sem precisar de login', async () => {
    const anon = testEnv.unauthenticatedContext();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'products/p1'), { name: 'Lençol', active: true });
    });
    await assertSucceeds(getDoc(doc(anon.firestore(), 'products/p1')));
  });

  it('CRÍTICO: comprador não consegue editar produto/preço', async () => {
    const buyer = testEnv.authenticatedContext('buyer1', { role: 'buyer' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'products/p1'), { name: 'Lençol', price: 10000 });
    });
    await assertFails(
      updateDoc(doc(buyer.firestore(), 'products/p1'), { price: 1 })
    );
  });

  it('seller consegue editar produto', async () => {
    const seller = testEnv.authenticatedContext('seller1', { role: 'seller' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'products/p1'), { name: 'Lençol', price: 10000 });
    });
    await assertSucceeds(
      updateDoc(doc(seller.firestore(), 'products/p1'), { price: 9000 })
    );
  });
});

describe('team/{uid} e pushTokens/{id} — acesso exclusivo Admin SDK', () => {
  it('CRÍTICO: nem admin autenticado lê /team pelo client SDK', async () => {
    const admin = testEnv.authenticatedContext('admin1', { role: 'admin' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'team/admin1'), { role: 'admin' });
    });
    await assertFails(getDoc(doc(admin.firestore(), 'team/admin1')));
  });

  it('CRÍTICO: ninguém lê pushTokens pelo client SDK', async () => {
    const admin = testEnv.authenticatedContext('admin1', { role: 'admin' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'pushTokens/tok1'), { uid: 'admin1' });
    });
    await assertFails(getDoc(doc(admin.firestore(), 'pushTokens/tok1')));
  });
});

describe('deny-by-default: coleção não listada em nenhuma regra', () => {
  it('CRÍTICO: qualquer coleção desconhecida é bloqueada mesmo pra admin', async () => {
    const admin = testEnv.authenticatedContext('admin1', { role: 'admin' });
    await assertFails(
      setDoc(doc(admin.firestore(), 'algumaColecaoNovaNaoMapeada/doc1'), { x: 1 })
    );
  });
});
