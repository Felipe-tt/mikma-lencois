// src/lib/whatsapp/firestoreAuthState.ts
//
// Equivalente ao useMultiFileAuthState() do Baileys, mas guardando o estado
// no Firestore em vez de arquivos locais.
//
// Por quê: o site roda em Cloud Functions/Cloud Run via Firebase Hosting
// (frameworksBackend), que é serverless — não tem garantia de disco
// persistente entre uma requisição e outra (minInstances: 0, a instância
// pode reciclar). A sessão do WhatsApp (equivalente a estar "logado") por
// isso precisa ficar em algum lugar durável: usamos o Firestore.
//
// A lógica de serialização (BufferJSON, o caso especial de
// 'app-state-sync-key') é copiada fielmente da implementação oficial em
// baileys/src/Utils/use-multi-file-auth-state.ts — só troca fs por Firestore.
//
// IMPORTANTE: as credenciais guardadas aqui equivalem a uma sessão logada
// do WhatsApp. As coleções usadas (ver firestore.rules) NÃO são acessíveis
// pelo client — só pelo Admin SDK, que é o que este arquivo usa.

import { proto, BufferJSON, initAuthCreds } from 'baileys';
import type { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from 'baileys';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

const CREDS_COLLECTION = 'whatsappAuth';
const CREDS_DOC_ID = 'creds';
const KEYS_COLLECTION = 'whatsappAuthKeys';

// Mesma ideia do fixFileName original: deixa o id seguro para usar como
// nome de documento do Firestore (sem "/", sem o padrão reservado __..__).
function sanitizeId(file: string): string {
  const safe = file.replace(/\//g, '__').replace(/:/g, '-');
  return `k_${safe}`;
}

async function writeDoc(data: unknown, docId: string) {
  await adminDb.collection(KEYS_COLLECTION).doc(docId).set({
    data: JSON.stringify(data, BufferJSON.replacer),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

async function readDoc(docId: string): Promise<any | null> {
  try {
    const snap = await adminDb.collection(KEYS_COLLECTION).doc(docId).get();
    if (!snap.exists) return null;
    const raw = snap.data()?.data;
    if (typeof raw !== 'string') return null;
    return JSON.parse(raw, BufferJSON.reviver);
  } catch {
    return null;
  }
}

async function removeDoc(docId: string) {
  try {
    await adminDb.collection(KEYS_COLLECTION).doc(docId).delete();
  } catch {
    /* ignora */
  }
}

/**
 * Carrega (ou inicializa) o estado de autenticação do WhatsApp a partir do
 * Firestore. Use exatamente como useMultiFileAuthState:
 *
 *   const { state, saveCreds } = await loadFirestoreAuthState();
 *   const sock = makeWASocket({ auth: state });
 *   sock.ev.on('creds.update', saveCreds);
 */
export async function loadFirestoreAuthState(): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const credsSnap = await adminDb.collection(CREDS_COLLECTION).doc(CREDS_DOC_ID).get();
  const storedCreds = credsSnap.exists ? credsSnap.data()?.data : null;
  const creds: AuthenticationCreds =
    (typeof storedCreds === 'string' ? JSON.parse(storedCreds, BufferJSON.reviver) : null) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [_: string]: SignalDataTypeMap[typeof type] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readDoc(sanitizeId(`${type}-${id}`));
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks: Promise<void>[] = [];
          for (const category in data) {
            const entries = data[category as keyof SignalDataTypeMap] as Record<string, unknown> | undefined;
            if (!entries) continue;
            for (const id in entries) {
              const value = entries[id];
              const docId = sanitizeId(`${category}-${id}`);
              tasks.push(value ? writeDoc(value, docId) : removeDoc(docId));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      await adminDb.collection(CREDS_COLLECTION).doc(CREDS_DOC_ID).set({
        data: JSON.stringify(creds, BufferJSON.replacer),
        updatedAt: FieldValue.serverTimestamp(),
      });
    },
  };
}

/**
 * Apaga toda a sessão salva (creds + chaves). Use quando o WhatsApp
 * desconectar com "logged out" — força reconectar com QR code novo.
 */
export async function clearFirestoreAuthState(): Promise<void> {
  await adminDb.collection(CREDS_COLLECTION).doc(CREDS_DOC_ID).delete().catch(() => {});
  const snap = await adminDb.collection(KEYS_COLLECTION).limit(500).get();
  const batch = adminDb.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  if (!snap.empty) await batch.commit();
}
