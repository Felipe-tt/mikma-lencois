/**
 * Dados dos testes ponta a ponta (emuladores do Firebase). Idempotente.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

export const USERS = {
  cliente: { email: 'cliente@e2e.mikma', password: 'senha-e2e-123', name: 'Maria Souza', role: 'customer' },
  admin: { email: 'admin@e2e.mikma', password: 'senha-e2e-123', name: 'Felipe Admin', role: 'admin' },
  // Clientes de São Paulo, um por teste dos Correios (sem retirada na loja,
  // o frete sai do contrato). CPF próprio: o detector de golpe soma pontos
  // quando o mesmo CPF aparece em várias contas.
  pac: { email: 'pac@e2e.mikma', password: 'senha-e2e-123', name: 'Ana Prado', role: 'customer', cpf: '11144477735', address: { cep: '01310100', street: 'Avenida Paulista', number: '1000', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' } },
  sedex: { email: 'sedex@e2e.mikma', password: 'senha-e2e-123', name: 'Bruno Lima', role: 'customer', cpf: '39053344705', address: { cep: '01310100', street: 'Avenida Paulista', number: '2000', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' } },
  cartao: { email: 'cartao@e2e.mikma', password: 'senha-e2e-123', name: 'Davi Nunes', role: 'customer', cpf: '12345678909', address: { cep: '01310100', street: 'Avenida Paulista', number: '3000', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' } },
  // Para este CEP a API dos Correios simulada responde "fora do ar".
  semCorreios: { email: 'sem-correios@e2e.mikma', password: 'senha-e2e-123', name: 'Carla Reis', role: 'customer', cpf: '93541134780', address: { cep: '04538133', street: 'Avenida Brigadeiro Faria Lima', number: '3477', neighborhood: 'Itaim Bibi', city: 'São Paulo', state: 'SP' } },
};

export async function seed() {
  const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-mikma' }, `seed-${Date.now()}`);
  const db = getFirestore(app);
  const auth = getAuth(app);

  const products = [
    ['Lençol Casal Malha Branco', 'Lençóis', 'casal', '#F5F1EA', 'Branco', 18990],
    ['Lençol Queen Malha Areia', 'Lençóis', 'queen', '#D9C7A8', 'Areia', 25990],
    ['Jogo de Cama King Malha Cinza', 'Jogos de cama', 'king', '#B8B8B4', 'Cinza', 39990],
    ['Fronha Avulsa Malha Azul', 'Fronhas', 'unico', '#9DB0C2', 'Azul', 3990],
  ];
  for (const [i, [name, category, size, color, colorName, price]] of products.entries()) {
    const id = `p${i + 1}`;
    await db.collection('products').doc(id).set({
      name, category, price, tags: [], active: true, weightKg: 1,
      description: `${name}. Malha 100% algodão, feita em Blumenau.`,
      images: ['/hero-mikma.jpg', '/og-mikma.jpg'],
      variants: [{ id: 'v1', size, fabric: 'Malha', color, colorName }],
      createdAt: new Date(Date.now() - i * 3_600_000).toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await db.collection('inventory').doc(`${id}_v1`).set({
      sku: `${id}_v1`, productId: id, variant: { id: 'v1', size, fabric: 'Malha', color },
      quantity: 20, reserved: 0, lowStockThreshold: 3, history: [],
    });
  }
  await db.collection('maintenance').doc('status').set({ active: false });
  await db.collection('settings').doc('store').set({
    storeName: 'Mikma Lençóis', storeCity: 'Blumenau', storeState: 'SC', storeCep: '89010100', storePhone: '47999990000', originCep: '89042300',
    storeCnpj: '05.338.341/0001-95', storeAddress: 'Rua da Fábrica', storeNumber: '100', storeNeighborhood: 'Itoupava Central', storeEmail: 'contato@e2e.mikma',
    abacatePaySandboxMode: false, pixDiscountThresholdCents: 0,
  }, { merge: true });

  // Coordenadas dos CEPs dos testes já no cache: a distância até a loja sai
  // daqui, sem consultar ViaCEP e Nominatim de verdade.
  const coords = { '89042300': [-26.8778, -49.0889], '89010000': [-26.9194, -49.0661], '01310100': [-23.5647, -46.6527], '04538133': [-23.5868, -46.6822] };
  for (const [cep, [lat, lng]] of Object.entries(coords)) {
    await db.collection('geocache').doc(cep).set({ cep, lat, lng, cachedAt: new Date().toISOString(), expireAt: new Date(Date.now() + 30 * 86_400_000) });
  }

  const uids = {};
  for (const [key, u] of Object.entries(USERS)) {
    let user;
    try { user = await auth.getUserByEmail(u.email); } catch { user = await auth.createUser({ email: u.email, password: u.password, displayName: u.name, emailVerified: true }); }
    await auth.setCustomUserClaims(user.uid, { role: u.role });
    await db.collection('users').doc(user.uid).set({
      uid: user.uid, name: u.name, email: u.email, role: u.role, cpf: u.cpf ?? '52998224725', phone: '47999990000',
      lgpdConsent: { date: new Date().toISOString(), version: '1' }, createdAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
      address: u.address ?? { cep: '89010000', street: 'Rua XV de Novembro', number: '100', neighborhood: 'Centro', city: 'Blumenau', state: 'SC' },
    }, { merge: true });
    await db.collection('carts').doc(user.uid).set({ items: [], couponCode: null, updatedAt: new Date().toISOString() });
    uids[key] = user.uid;
  }
  return uids;
}
