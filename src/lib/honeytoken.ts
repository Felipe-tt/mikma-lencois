import { createHash, createHmac, timingSafeEqual } from 'crypto';
import * as Sentry from '@sentry/nextjs';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { sendEmail } from '@/lib/email';
import { emailLayout, emailParagraph, emailSection } from '@/lib/email/layout';
import { escapeHtml } from '@/lib/html';

/**
 * Armadilhas (honeytokens): coisas que ninguém legítimo usa. Se alguém usa,
 * é sinal de invasor (ou de vazamento), e a equipe recebe alerta na hora.
 *
 * - E-mails de login que não existem (admin@, root@...): quem tenta entrar
 *   com eles está chutando contas de administrador.
 * - Uma "chave de API de parceiros" falsa, guardada no Firestore numa
 *   coleção que só o servidor lê. Só aparece para quem conseguiu ler o banco
 *   (backup vazado, conta de admin comprometida); usá-la em /api/v1 dispara
 *   o alerta.
 */

export const HONEY_LOGIN_EMAILS = new Set([
  'admin@mikma.com.br',
  'administrador@mikma.com.br',
  'root@mikma.com.br',
  'suporte.admin@mikma.com.br',
]);

/** Documento com a chave falsa (coleção sem acesso pelas regras do Firestore). */
export const HONEY_DOC = { collection: 'integracoes', id: 'parceiros' } as const;

/** Chave falsa derivada do segredo da equipe: estável, sem segredo novo. */
export function honeyApiKey(secret: string): string {
  return 'mk_live_' + createHmac('sha256', secret).update('honeytoken-api-v1').digest('hex').slice(0, 40);
}

export function isHoneyApiKey(value: string | null | undefined, secret: string | undefined): boolean {
  if (!value || !secret) return false;
  const expected = Buffer.from(honeyApiKey(secret));
  const got = Buffer.from(value.trim());
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Planta (uma vez) o documento com a chave falsa. Chamado por uma rotina. */
export async function ensureHoneyDoc(secret: string | undefined): Promise<void> {
  if (!secret) return;
  const ref = adminDb.collection(HONEY_DOC.collection).doc(HONEY_DOC.id);
  if ((await ref.get()).exists) return;
  await ref.set({
    descricao: 'Chave da API de parceiros (integração legada de catálogo e pedidos)',
    baseUrl: 'https://mikma.com.br/api/v1',
    apiKey: honeyApiKey(secret),
    escopos: ['pedidos:ler', 'pedidos:escrever', 'clientes:ler'],
    criadoEm: '2025-11-03',
  });
}

export interface HoneyHit {
  kind: 'login-isca' | 'chave-api';
  ip: string;
  userAgent?: string | null;
  detail?: string;
  country?: string | null;
}

/**
 * Registra o disparo: Sentry (nível fatal) e e-mail para os admins. O
 * e-mail sai no máximo uma vez por hora por tipo e IP, para um robô
 * insistente não lotar a caixa de entrada.
 */
export async function triggerHoneytoken(hit: HoneyHit): Promise<void> {
  console.error('[armadilha]', hit.kind, hit.ip, hit.detail ?? '');
  Sentry.captureMessage(`Armadilha acionada: ${hit.kind}`, {
    level: 'fatal',
    tags: { honeytoken: hit.kind },
    extra: { ip: hit.ip, userAgent: hit.userAgent, detail: hit.detail, country: hit.country },
  });

  try {
    const key = createHash('sha256').update(`${hit.kind}:${hit.ip}`).digest('hex').slice(0, 32);
    const ref = adminDb.collection('honeytokenAlerts').doc(key);
    const fresh = await adminDb.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const last = snap.exists ? Number(snap.get('at')) : 0;
      if (Date.now() - last < 60 * 60 * 1000) return false;
      tx.set(ref, { at: Date.now(), kind: hit.kind, expireAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
      return true;
    });
    if (!fresh) return;

    const what = hit.kind === 'login-isca'
      ? 'Alguém tentou entrar com um e-mail de administrador que não existe (isca).'
      : 'Alguém usou a chave de API falsa que só existe dentro do banco de dados. Isso indica que o banco (ou um backup) pode ter sido lido por alguém de fora.';
    const html = emailLayout(emailSection({
      eyebrow: 'Segurança',
      title: 'Armadilha acionada',
      html: [
        emailParagraph(what),
        emailParagraph(`<strong>IP:</strong> ${escapeHtml(hit.ip)}${hit.country ? ` (${escapeHtml(hit.country)})` : ''}<br><strong>Detalhe:</strong> ${escapeHtml(hit.detail ?? '-')}<br><strong>Navegador:</strong> ${escapeHtml(hit.userAgent ?? '-')}`),
        emailParagraph(hit.kind === 'chave-api'
          ? '<strong>O que fazer:</strong> troque as senhas da equipe, confira no Painel, em Segurança, os aparelhos e passkeys, e revise quem tem acesso ao Google Cloud.'
          : 'Na maioria das vezes é um robô chutando senhas. Se repetir muito, vale olhar o IP no Sentry.', { muted: true }),
      ].join(''),
    }), { replyHint: false, footerNote: 'E-mail automático de segurança.', preheader: 'Armadilha de segurança acionada' });
    const text = `Armadilha acionada (${hit.kind}): ${what} IP ${hit.ip}. Detalhe: ${hit.detail ?? '-'}.`;

    const { users } = await adminAuth.listUsers(1000);
    const to = users.filter(u => u.customClaims?.role === 'admin' && u.email && !u.disabled).map(u => u.email!.toLowerCase());
    await Promise.allSettled(to.map(addr => sendEmail({ to: addr, subject: 'Alerta de segurança: armadilha acionada', text, html })));
  } catch (err) {
    console.error('[armadilha] falha ao avisar:', err);
  }
}
