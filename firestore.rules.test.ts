import { readFileSync } from 'fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, getDoc, getDocs, updateDoc, deleteDoc, deleteField, doc, collection } from 'firebase/firestore';
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

  it('ninguém lista a coleção de clientes inteira (CPF e endereço de todos)', async () => {
    const seller = testEnv.authenticatedContext('seller1', { role: 'seller' });
    const admin = testEnv.authenticatedContext('admin1', { role: 'admin' });
    await assertFails(getDocs(collection(seller.firestore(), 'users')));
    await assertFails(getDocs(collection(admin.firestore(), 'users')));
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


// ─────────────────────────────────────────────────────────────────────────────
// Correções da auditoria de segurança
// ─────────────────────────────────────────────────────────────────────────────

const seedUser = (extra: Record<string, unknown> = {}) =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/buyer1'), {
      uid: 'buyer1', name: 'Ana', role: 'buyer', emailVerified: true, ...extra,
    });
  });

describe('users/{uid}: whitelist de campos graváveis pelo próprio usuário', () => {
  it('CRÍTICO: comprador não grava campos do servidor (emailVerified, lgpdConsent, uid, email)', async () => {
    const buyer = testEnv.authenticatedContext('buyer1', { role: 'buyer' });
    await seedUser();
    const ref = doc(buyer.firestore(), 'users/buyer1');
    await assertFails(updateDoc(ref, { emailVerified: false }));
    await assertFails(updateDoc(ref, { lgpdConsent: { version: 'x' } }));
    await assertFails(updateDoc(ref, { email: 'outro@x.com' }));
    await assertFails(updateDoc(ref, { uid: 'buyer2' }));
  });

  it('comprador atualiza nome, telefone, CPF e endereço (mapa), como o checkout faz', async () => {
    const buyer = testEnv.authenticatedContext('buyer1', { role: 'buyer' });
    await seedUser();
    await assertSucceeds(
      setDoc(doc(buyer.firestore(), 'users/buyer1'), {
        name: 'Ana Souza', cpf: '12345678901', phone: '47999999999',
        address: { cep: '89010000', street: 'Rua X', number: '1' },
      }, { merge: true })
    );
  });

  it('nome com < ou > é recusado (higiene contra injeção)', async () => {
    const buyer = testEnv.authenticatedContext('buyer1', { role: 'buyer' });
    await seedUser();
    await assertFails(updateDoc(doc(buyer.firestore(), 'users/buyer1'), { name: '<b>Ana</b>' }));
    await assertFails(updateDoc(doc(buyer.firestore(), 'users/buyer1'), { name: 'a'.repeat(101) }));
  });

  it('um update que não toca no nome passa mesmo se o nome legado tiver < (não trava o usuário)', async () => {
    const buyer = testEnv.authenticatedContext('buyer1', { role: 'buyer' });
    await seedUser({ name: '<legado>' });
    await assertSucceeds(updateDoc(doc(buyer.firestore(), 'users/buyer1'), { phone: '47999999999' }));
  });

  it('preferências do painel (staffPrefs) continuam graváveis', async () => {
    const seller = testEnv.authenticatedContext('seller1', { role: 'seller' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/seller1'), { uid: 'seller1', role: 'seller' });
    });
    await assertSucceeds(
      setDoc(doc(seller.firestore(), 'users/seller1'), { 'staffPrefs.lastSize': 'Queen' }, { merge: true })
    );
  });

  it('create: dono cria o próprio documento só com campos da whitelist', async () => {
    const buyer = testEnv.authenticatedContext('buyer1', { role: 'buyer' });
    await assertSucceeds(setDoc(doc(buyer.firestore(), 'users/buyer1'), { name: 'Ana', phone: '47999999999' }));
  });

  it('CRÍTICO: create com role/admin ou em documento de outro usuário é recusado', async () => {
    const buyer = testEnv.authenticatedContext('buyer1', { role: 'buyer' });
    await assertFails(setDoc(doc(buyer.firestore(), 'users/buyer1'), { name: 'Ana', role: 'admin' }));
    await assertFails(setDoc(doc(buyer.firestore(), 'users/buyer2'), { name: 'Ana' }));
  });
});

describe('orders/{orderId}: sem update pelo client SDK', () => {
  it('CRÍTICO: nem seller nem admin reescrevem pedido direto (ex.: marcar como pago)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders/order1'), { userId: 'buyer1', status: 'pending_payment' });
    });
    const seller = testEnv.authenticatedContext('seller1', { role: 'seller' });
    const admin = testEnv.authenticatedContext('admin1', { role: 'admin' });
    await assertFails(updateDoc(doc(seller.firestore(), 'orders/order1'), { status: 'paid' }));
    await assertFails(updateDoc(doc(admin.firestore(), 'orders/order1'), { status: 'paid' }));
  });

  it('comprador também não altera o próprio pedido', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders/order1'), { userId: 'buyer1', status: 'pending_payment' });
    });
    const buyer = testEnv.authenticatedContext('buyer1', { role: 'buyer' });
    await assertFails(updateDoc(doc(buyer.firestore(), 'orders/order1'), { status: 'paid' }));
  });

  it('seller ainda apaga pedido cancelado (fluxo do painel)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders/order1'), { userId: 'buyer1', status: 'cancelled' });
    });
    const seller = testEnv.authenticatedContext('seller1', { role: 'seller' });
    await assertSucceeds(deleteDoc(doc(seller.firestore(), 'orders/order1')));
  });

  it('seller não apaga pedido cancelado que já foi pago', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders/order1'), { userId: 'buyer1', status: 'cancelled', payment: { method: 'pix', paidAt: new Date() } });
      await setDoc(doc(ctx.firestore(), 'orders/order2'), { userId: 'buyer1', status: 'cancelled', payment: { method: 'card', lateCaptureTxId: 'tx1' } });
    });
    const seller = testEnv.authenticatedContext('seller1', { role: 'seller' });
    await assertFails(deleteDoc(doc(seller.firestore(), 'orders/order1')));
    await assertFails(deleteDoc(doc(seller.firestore(), 'orders/order2')));
  });

  it('seller não apaga pedido ativo nem entregue', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders/order1'), { userId: 'buyer1', status: 'paid' });
      await setDoc(doc(ctx.firestore(), 'orders/order2'), { userId: 'buyer1', status: 'delivered' });
    });
    const seller = testEnv.authenticatedContext('seller1', { role: 'seller' });
    await assertFails(deleteDoc(doc(seller.firestore(), 'orders/order1')));
    await assertFails(deleteDoc(doc(seller.firestore(), 'orders/order2')));
  });

  it('admin apaga direto só o que não tem nada a desfazer; ativo passa pela API', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders/order1'), { userId: 'buyer1', status: 'cancelled', payment: { method: 'pix', paidAt: new Date() } });
      await setDoc(doc(ctx.firestore(), 'orders/order2'), { userId: 'buyer1', status: 'delivered' });
      await setDoc(doc(ctx.firestore(), 'orders/order3'), { userId: 'buyer1', status: 'preparing' });
    });
    const admin = testEnv.authenticatedContext('admin1', { role: 'admin' });
    await assertSucceeds(deleteDoc(doc(admin.firestore(), 'orders/order1')));
    await assertSucceeds(deleteDoc(doc(admin.firestore(), 'orders/order2')));
    await assertFails(deleteDoc(doc(admin.firestore(), 'orders/order3')));
  });
});

describe('coupons/{code}: só a equipe lê', () => {
  const seed = () =>
    testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'coupons/VIP50'), { code: 'VIP50', type: 'percent', value: 50, active: true });
    });

  it('CRÍTICO: cliente logado não lê nem lista cupons', async () => {
    await seed();
    const buyer = testEnv.authenticatedContext('buyer1', { role: 'buyer' });
    await assertFails(getDoc(doc(buyer.firestore(), 'coupons/VIP50')));
    await assertFails(getDocs(collection(buyer.firestore(), 'coupons')));
  });

  it('visitante anônimo também não', async () => {
    await seed();
    const anon = testEnv.unauthenticatedContext();
    await assertFails(getDocs(collection(anon.firestore(), 'coupons')));
  });

  it('seller lê e lista (painel de cupons)', async () => {
    await seed();
    const seller = testEnv.authenticatedContext('seller1', { role: 'seller' });
    await assertSucceeds(getDocs(collection(seller.firestore(), 'coupons')));
  });
});

describe('settings/store: parâmetros de dinheiro e sandbox só o admin altera', () => {
  const seed = () =>
    testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'settings/store'), {
        storeName: 'Mikma', pixDiscountPct: 10, abacatePaySandboxMode: false,
        uberDirectSandboxMode: false, freeShippingThresholdCents: 0, creditMinOrderCents: 0,
      });
    });

  it('leitura continua pública', async () => {
    await seed();
    await assertSucceeds(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'settings/store')));
  });

  it('seller edita configuração comum (merge sem mudar os campos sensíveis)', async () => {
    await seed();
    const seller = testEnv.authenticatedContext('seller1', { role: 'seller' });
    await assertSucceeds(
      setDoc(doc(seller.firestore(), 'settings/store'),
        { storeName: 'Mikma Lençóis', pixDiscountPct: 10, abacatePaySandboxMode: false }, { merge: true })
    );
  });

  it('CRÍTICO: seller não muda desconto PIX, frete grátis, cartão nem modos sandbox', async () => {
    await seed();
    const ref = doc(testEnv.authenticatedContext('seller1', { role: 'seller' }).firestore(), 'settings/store');
    await assertFails(updateDoc(ref, { pixDiscountPct: 99 }));
    await assertFails(updateDoc(ref, { abacatePaySandboxMode: true }));
    await assertFails(updateDoc(ref, { uberDirectSandboxMode: true }));
    await assertFails(updateDoc(ref, { freeShippingThresholdCents: 1 }));
    await assertFails(updateDoc(ref, { creditMinOrderCents: 100 }));
  });

  it('admin altera tudo, inclusive os campos sensíveis', async () => {
    await seed();
    const ref = doc(testEnv.authenticatedContext('admin1', { role: 'admin' }).firestore(), 'settings/store');
    await assertSucceeds(updateDoc(ref, { pixDiscountPct: 12, abacatePaySandboxMode: true }));
  });

  it('comprador não escreve configurações', async () => {
    await seed();
    const buyer = testEnv.authenticatedContext('buyer1', { role: 'buyer' });
    await assertFails(updateDoc(doc(buyer.firestore(), 'settings/store'), { storeName: 'x' }));
  });
});

describe('maintenance_queue: leitura por ID, listagem só da equipe, criação restrita', () => {
  const ID = 'a'.repeat(64);
  const validEntry = () => ({
    ip: '189.1.2.3', released: false, enteredAt: new Date().toISOString(),
    userAgent: 'Mozilla/5.0', isBot: false, referer: '', acceptLanguage: 'pt-BR',
    requestedPath: '/', platform: 'Windows', isMobile: '?0',
  });
  const seed = () =>
    testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `maintenance_queue/${ID}`), { ...validEntry(), requestedPath: '/produtos' });
    });

  it('o proxy (anônimo) lê UM documento pelo ID (checa se o IP está liberado)', async () => {
    await seed();
    await assertSucceeds(getDoc(doc(testEnv.unauthenticatedContext().firestore(), `maintenance_queue/${ID}`)));
  });

  it('CRÍTICO: ninguém anônimo (nem comprador logado) lista a coleção', async () => {
    await seed();
    await assertFails(getDocs(collection(testEnv.unauthenticatedContext().firestore(), 'maintenance_queue')));
    await assertFails(
      getDocs(collection(testEnv.authenticatedContext('buyer1', { role: 'buyer' }).firestore(), 'maintenance_queue'))
    );
  });

  it('seller lista (painel de manutenção)', async () => {
    await seed();
    await assertSucceeds(
      getDocs(collection(testEnv.authenticatedContext('seller1', { role: 'seller' }).firestore(), 'maintenance_queue'))
    );
  });

  it('CRÍTICO: ninguém cria pelo cliente, nem no formato certo (só o servidor grava)', async () => {
    const anon = testEnv.unauthenticatedContext();
    await assertFails(setDoc(doc(anon.firestore(), `maintenance_queue/${'b'.repeat(64)}`), validEntry()));
  });

  it('CRÍTICO: criação fora do formato é recusada (ID, campo extra, released=true, tamanho)', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, 'maintenance_queue/189_1_2_3'), validEntry())); // ID antigo (IP)
    await assertFails(setDoc(doc(db, `maintenance_queue/${'c'.repeat(64)}`), { ...validEntry(), extra: 'x' }));
    await assertFails(setDoc(doc(db, `maintenance_queue/${'d'.repeat(64)}`), { ...validEntry(), released: true }));
    await assertFails(setDoc(doc(db, `maintenance_queue/${'e'.repeat(64)}`), { ...validEntry(), userAgent: 'a'.repeat(301) }));
    await assertFails(setDoc(doc(db, `maintenance_queue/${'f'.repeat(64)}`), { ...validEntry(), requestedPath: 'a'.repeat(201) }));
  });

  it('anônimo não sobrescreve nem se auto-libera num registro existente', async () => {
    await seed();
    const ref = doc(testEnv.unauthenticatedContext().firestore(), `maintenance_queue/${ID}`);
    await assertFails(setDoc(ref, { ...validEntry(), requestedPath: '/outro' }));
    await assertFails(updateDoc(ref, { released: true }));
  });

  it('seller libera (released=true) e apaga', async () => {
    await seed();
    const ref = doc(testEnv.authenticatedContext('seller1', { role: 'seller' }).firestore(), `maintenance_queue/${ID}`);
    await assertSucceeds(updateDoc(ref, { released: true }));
    await assertSucceeds(deleteDoc(ref));
  });
});

describe('inventory/{sku} delete', () => {
  it('seller apaga SKU sem reserva (variação removida do produto)', async () => {
    const seller = testEnv.authenticatedContext('seller1', { role: 'seller' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'inventory/p1_v1'), { productId: 'p1', quantity: 2, reserved: 0, history: [] });
    });
    await assertSucceeds(deleteDoc(doc(seller.firestore(), 'inventory/p1_v1')));
  });

  it('seller não apaga SKU com reserva de pedido pendente', async () => {
    const seller = testEnv.authenticatedContext('seller1', { role: 'seller' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'inventory/p1_v1'), { productId: 'p1', quantity: 2, reserved: 1, history: [] });
    });
    await assertFails(deleteDoc(doc(seller.firestore(), 'inventory/p1_v1')));
  });

  it('comprador não apaga SKU', async () => {
    const buyer = testEnv.authenticatedContext('buyer1', { role: 'buyer' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'inventory/p1_v1'), { productId: 'p1', quantity: 2, reserved: 0, history: [] });
    });
    await assertFails(deleteDoc(doc(buyer.firestore(), 'inventory/p1_v1')));
  });
});

describe('inventory: leitura só da equipe e revogação imediata', () => {
  it('cliente não lê o estoque (histórico tem dados da loja)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'inventory/p1_v1'), { productId: 'p1', quantity: 2, reserved: 0, history: [] });
    });
    const buyer = testEnv.authenticatedContext('buyer1', { role: 'buyer' });
    await assertFails(getDoc(doc(buyer.firestore(), 'inventory/p1_v1')));
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'inventory/p1_v1')));
    const seller = testEnv.authenticatedContext('seller1', { role: 'seller' });
    await assertSucceeds(getDoc(doc(seller.firestore(), 'inventory/p1_v1')));
  });

  it('vendedor removido perde o acesso na hora, mesmo com token antigo', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'inventory/p1_v1'), { productId: 'p1', quantity: 2, reserved: 0, history: [] });
      await setDoc(doc(ctx.firestore(), 'staffRevoked/seller1'), { at: new Date() });
    });
    const seller = testEnv.authenticatedContext('seller1', { role: 'seller' });
    await assertFails(getDoc(doc(seller.firestore(), 'inventory/p1_v1')));
  });
});

describe('users: endereço limitado', () => {
  const ok = { cep: '89032143', street: 'Rua Bernhard Koser', number: '105', complement: '', neighborhood: 'Salto', city: 'Blumenau', state: 'SC' };
  it('aceita o endereço normal e a remoção', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/u1'), { name: 'Ana', role: 'buyer' });
    });
    const u = testEnv.authenticatedContext('u1');
    await assertSucceeds(setDoc(doc(u.firestore(), 'users/u1'), { address: ok }, { merge: true }));
    await assertSucceeds(updateDoc(doc(u.firestore(), 'users/u1'), { address: deleteField() }));
  });
  it('recusa campo extra e texto gigante', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/u1'), { name: 'Ana', role: 'buyer' });
    });
    const u = testEnv.authenticatedContext('u1');
    await assertFails(setDoc(doc(u.firestore(), 'users/u1'), { address: { ...ok, lixo: 'x' } }, { merge: true }));
    await assertFails(setDoc(doc(u.firestore(), 'users/u1'), { address: { ...ok, street: 'x'.repeat(5000) } }, { merge: true }));
  });
});

describe('edge/status: fallback da Cloudflare', () => {
  it('qualquer um lê, ninguém escreve pelo client (nem admin)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'edge/status'), { bypass: false });
    });
    await assertSucceeds(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'edge/status')));
    const adminCtx = testEnv.authenticatedContext('admin1', { role: 'admin' });
    await assertFails(setDoc(doc(adminCtx.firestore(), 'edge/status'), { bypass: true }));
    await assertFails(setDoc(doc(testEnv.unauthenticatedContext().firestore(), 'edge/status'), { bypass: true }));
  });
});
