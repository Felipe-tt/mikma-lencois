// Define a custom claim "role" de um usuário já cadastrado.
// Rodado só via GitHub Actions (workflow_dispatch), nunca em produção
// automaticamente — é o mecanismo de bootstrap pra criar o primeiro admin,
// já que o app não tem (por design) nenhuma forma de auto-promoção.
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const email = process.env.TARGET_EMAIL;
const role = process.env.TARGET_ROLE;
const VALID_ROLES = new Set(['admin', 'seller', 'buyer']);

if (!email || !role) {
  console.error('TARGET_EMAIL e TARGET_ROLE são obrigatórios.');
  process.exit(1);
}
if (!VALID_ROLES.has(role)) {
  console.error(`Role inválida: "${role}". Use admin, seller ou buyer.`);
  process.exit(1);
}

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});
const auth = getAuth(app);

const user = await auth.getUserByEmail(email);
const existingClaims = user.customClaims ?? {};
await auth.setCustomUserClaims(user.uid, { ...existingClaims, role });
await auth.revokeRefreshTokens(user.uid);

console.log(`OK: ${email} (uid ${user.uid}) agora tem role="${role}".`);
console.log('O usuário precisa deslogar e logar de novo (ou esperar o token expirar) pra role valer.');
