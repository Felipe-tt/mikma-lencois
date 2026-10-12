/**
 * Troca e-mails de funcionários por rótulos em inventory/{sku}.history[].by.
 *
 * Contexto: inventory é de leitura pública (o carrinho consulta o estoque sem
 * login) e o histórico guardava o e-mail de quem mexeu no estoque. O código
 * novo grava só o nome de exibição (ou "Equipe"); este script limpa o legado:
 * onde `by` parece e-mail, vira o displayName da conta (se existir) ou "Equipe".
 *
 * Uso (rode uma vez, depois do deploy):
 *   node scripts/scrub-inventory-history.mjs /caminho/service-account.json           # só conta
 *   node scripts/scrub-inventory-history.mjs /caminho/service-account.json --apply   # grava
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const [keyPath, flag] = process.argv.slice(2);
const apply = flag === '--apply';
if (!keyPath) {
  console.error('[scrub-inventory-history] Uso: node scripts/scrub-inventory-history.mjs <service-account.json> [--apply]');
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
const db = getFirestore();
const auth = getAuth();

const nameCache = new Map();
async function labelFor(email) {
  if (nameCache.has(email)) return nameCache.get(email);
  let label = 'Equipe';
  try {
    const u = await auth.getUserByEmail(email);
    const n = (u.displayName ?? '').replace(/[<>@]/g, '').trim().slice(0, 40);
    if (n) label = n;
  } catch { /* conta não existe mais: mantém "Equipe" */ }
  nameCache.set(email, label);
  return label;
}

const looksLikeEmail = (v) => typeof v === 'string' && v.includes('@');

const snap = await db.collection('inventory').get();
let docsToFix = 0;
let entriesFixed = 0;

for (const d of snap.docs) {
  const history = d.get('history');
  if (!Array.isArray(history) || !history.some((m) => looksLikeEmail(m?.by))) continue;
  docsToFix++;
  const cleaned = [];
  for (const m of history) {
    if (looksLikeEmail(m?.by)) {
      entriesFixed++;
      cleaned.push({ ...m, by: await labelFor(m.by) });
    } else {
      cleaned.push(m);
    }
  }
  if (apply) await d.ref.update({ history: cleaned });
}

console.log(`[scrub-inventory-history] ${docsToFix} documento(s), ${entriesFixed} entrada(s) com e-mail.`);
console.log(apply ? '[scrub-inventory-history] concluído.' : '[scrub-inventory-history] dry-run: nada foi alterado. Rode com --apply.');
