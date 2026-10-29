import { readFileSync } from 'fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';
import { beforeAll, afterAll, describe, it } from 'vitest';

// Equipe entra com verificação em duas etapas (as regras exigem, ver
// hasSecondFactor em firestore.rules); aqui, código do app autenticador.
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'totp' } } as const;

// Regras de storage.rules contra o emulador (npm run test:rules): fotos de
// produto são públicas para ler, mas só vendedor/admin envia e apaga, só
// imagem raster e até 8 MB. Fora de products/ nada passa.

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'mikma-rules-test',
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  });
  // Foto já existente para os testes de leitura e exclusão.
  await testEnv.withSecurityRulesDisabled(async ctx => {
    await uploadBytes(ref(ctx.storage(), 'products/p1/foto.webp'), new Uint8Array([1, 2, 3]), { contentType: 'image/webp' });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

const png = new Uint8Array([137, 80, 78, 71]);
const seller = () => testEnv.authenticatedContext('vendedor', { role: 'seller', ...MFA }).storage();
const admin = () => testEnv.authenticatedContext('admin', { role: 'admin', ...MFA }).storage();
const customer = () => testEnv.authenticatedContext('cliente', { role: 'customer' }).storage();
const anon = () => testEnv.unauthenticatedContext().storage();

describe('products/', () => {
  it('qualquer um lê foto de produto', async () => {
    await assertSucceeds(getBytes(ref(anon(), 'products/p1/foto.webp')));
  });

  it('vendedor e admin enviam imagem', async () => {
    await assertSucceeds(uploadBytes(ref(seller(), 'products/p2/a.png'), png, { contentType: 'image/png' }));
    await assertSucceeds(uploadBytes(ref(admin(), 'products/p2/b.jpg'), png, { contentType: 'image/jpeg' }));
  });

  it('cliente e visitante não enviam', async () => {
    await assertFails(uploadBytes(ref(customer(), 'products/p2/c.png'), png, { contentType: 'image/png' }));
    await assertFails(uploadBytes(ref(anon(), 'products/p2/d.png'), png, { contentType: 'image/png' }));
  });

  it('SVG e outros tipos são recusados (SVG pode ter script)', async () => {
    await assertFails(uploadBytes(ref(seller(), 'products/p2/x.svg'), png, { contentType: 'image/svg+xml' }));
    await assertFails(uploadBytes(ref(seller(), 'products/p2/x.html'), png, { contentType: 'text/html' }));
  });

  it('arquivo de 8 MB ou mais é recusado', async () => {
    const big = new Uint8Array(8 * 1024 * 1024);
    await assertFails(uploadBytes(ref(seller(), 'products/p2/grande.png'), big, { contentType: 'image/png' }));
  });

  it('só vendedor/admin apaga', async () => {
    await assertFails(deleteObject(ref(customer(), 'products/p1/foto.webp')));
    await assertSucceeds(deleteObject(ref(seller(), 'products/p1/foto.webp')));
  });
});

describe('fora de products/', () => {
  it('ninguém lê nem grava, nem admin', async () => {
    await assertFails(uploadBytes(ref(admin(), 'outros/a.png'), png, { contentType: 'image/png' }));
    await assertFails(getBytes(ref(admin(), 'outros/a.png')));
    await assertFails(uploadBytes(ref(anon(), 'a.png'), png, { contentType: 'image/png' }));
  });
});
