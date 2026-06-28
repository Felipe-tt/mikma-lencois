// src/lib/whatsapp/catalogClient.ts
//
// Conecta ao WhatsApp (via Baileys + sessão no Firestore) e normaliza os
// produtos retornados por sock.getCatalog(). Usado pelas rotas em
// src/app/api/painel/whatsapp-catalog/*.
//
// O QR code (quando necessário) é publicado em tempo real no documento
// whatsappCatalogStatus/current, que o painel escuta direto via Firestore
// (onSnapshot) — não precisa de WebSocket/SSE próprio.

import makeWASocket, { DisconnectReason } from 'baileys';
import type { WASocket } from 'baileys';
import { loadFirestoreAuthState, clearFirestoreAuthState } from './firestoreAuthState';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

const STATUS_COLLECTION = 'whatsappCatalogStatus';
const STATUS_DOC_ID = 'current';

type StatusPayload =
  | { status: 'connecting' }
  | { status: 'qr'; qr: string }
  | { status: 'connected' }
  | { status: 'timeout' }
  | { status: 'logged_out' }
  | { status: 'error'; message: string };

export async function setCatalogStatus(payload: StatusPayload): Promise<void> {
  await adminDb
    .collection(STATUS_COLLECTION)
    .doc(STATUS_DOC_ID)
    .set({ ...payload, updatedAt: FieldValue.serverTimestamp() });
}

export function buildJid(rawNumber: string): string {
  const digits = rawNumber.replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}

class ConnectError extends Error {
  reason: 'timeout' | 'logged_out' | 'error';
  constructor(message: string, reason: 'timeout' | 'logged_out' | 'error') {
    super(message);
    this.reason = reason;
  }
}

/**
 * Conecta ao WhatsApp usando a sessão salva no Firestore (Admin SDK).
 * - Se já existir sessão válida: deve abrir em poucos segundos, sem QR.
 * - Se não existir (primeira vez) ou tiver expirado: emite um QR code,
 *   publicado em whatsappCatalogStatus/current, e espera até `timeoutMs`
 *   pela leitura.
 *
 * Quem chama é responsável por encerrar o socket (`sock.end(undefined)`)
 * depois de usar.
 */
export async function connectAndWait(timeoutMs = 50_000): Promise<WASocket> {
  const { state, saveCreds } = await loadFirestoreAuthState();
  await setCatalogStatus({ status: 'connecting' });

  return new Promise<WASocket>((resolve, reject) => {
    let settled = false;
    const sock = makeWASocket({ auth: state, printQRInTerminal: false });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      setCatalogStatus({ status: 'timeout' }).catch(() => {});
      try {
        sock.end(undefined);
      } catch {
        /* ignora */
      }
      reject(new ConnectError('Tempo esgotado esperando a leitura do QR code.', 'timeout'));
    }, timeoutMs);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && !settled) {
        setCatalogStatus({ status: 'qr', qr }).catch(() => {});
      }

      if (connection === 'open' && !settled) {
        settled = true;
        clearTimeout(timer);
        setCatalogStatus({ status: 'connected' }).catch(() => {});
        resolve(sock);
        return;
      }

      if (connection === 'close' && !settled) {
        const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output
          ?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          settled = true;
          clearTimeout(timer);
          clearFirestoreAuthState()
            .catch(() => {})
            .finally(() => {
              setCatalogStatus({ status: 'logged_out' }).catch(() => {});
              reject(new ConnectError('Sessão do WhatsApp desconectada. Conecte de novo.', 'logged_out'));
            });
        }
        // Outros motivos de fechar antes de abrir: deixa o timeout decidir,
        // evita reconectar em loop dentro de uma única requisição HTTP.
      }
    });
  });
}

// ── Normalização dos produtos do catálogo ──────────────────────────────────
// Baseado no tipo `Product` realmente exportado pelo pacote `baileys`
// instalado (node_modules/baileys/lib/Types/Product.d.ts):
//   { id, name, description, price: number, currency, retailerId?,
//     isHidden?, imageUrls: { [chave: string]: string }, availability }
// `imageUrls` é um MAPA (não array) — geralmente chaveado por resolução.

export interface RawCatalogProduct {
  id: string;
  retailerId?: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  isHidden?: boolean;
  imageUrls?: Record<string, string>;
}

export interface NormalizedCatalogProduct {
  id: string;
  retailerId: string;
  name: string;
  description: string;
  priceBRL: number | null;
  currency: string;
  available: boolean;
  imageUrls: string[];
}

export function extractImageUrls(p: RawCatalogProduct): string[] {
  if (!p.imageUrls) return [];
  return [...new Set(Object.values(p.imageUrls).filter((u): u is string => !!u))];
}

// ATENÇÃO: a unidade exata do campo "price" não é documentada
// oficialmente (protocolo não-oficial) — a convenção mais comum em
// catálogos do WhatsApp Business é centavos (ex.: 12990 = R$129,90), e é
// essa a conversão usada aqui. Por isso o preço SEMPRE aparece como campo
// editável na tela de revisão — confirme contra o app do WhatsApp antes
// de importar.
export function extractPriceBRL(p: RawCatalogProduct): number | null {
  if (typeof p.price !== 'number' || Number.isNaN(p.price)) return null;
  return p.price / 100;
}

export function normalizeProduct(p: RawCatalogProduct, idx: number): NormalizedCatalogProduct {
  return {
    id: p.id || p.retailerId || `item_${idx}`,
    retailerId: p.retailerId || '',
    name: p.name || '',
    description: (p.description || '').replace(/\r?\n/g, ' '),
    priceBRL: extractPriceBRL(p),
    currency: p.currency || 'BRL',
    available: p.isHidden !== true,
    imageUrls: extractImageUrls(p),
  };
}
