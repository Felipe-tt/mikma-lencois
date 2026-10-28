import { createHash, randomBytes } from 'crypto';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { sendEmail } from '@/lib/email';
import { emailLayout, emailParagraph, emailSection } from '@/lib/email/layout';
import { escapeHtml } from '@/lib/html';
import { deviceLabel } from '@/lib/passkeys';
import { hasSecondFactor, type MfaClaims } from '@/lib/staffMfa';

/**
 * Alerta de acesso da equipe: na primeira vez que uma conta de vendedor ou
 * admin entra no painel por um aparelho, chega um e-mail para a própria
 * pessoa e para os admins. Quem roubou uma senha não entra em silêncio.
 *
 * O aparelho é um id aleatório num cookie HttpOnly de 1 ano; no Firestore
 * fica só o hash (staffDevices/{uid}), no máximo 20 por conta.
 */
export const DEVICE_COOKIE = 'mikma_dev';
export const DEVICE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
const MAX_DEVICES = 20;

export const newDeviceId = () => randomBytes(18).toString('base64url');
const hashId = (id: string) => createHash('sha256').update(id).digest('hex').slice(0, 32);

interface Access {
  uid: string;
  email?: string;
  role: string;
  claims: MfaClaims;
  deviceId: string;
  ip: string;
  userAgent: string | null;
  city?: string | null;
  country?: string | null;
}

/** Registra o aparelho; devolve true se era novo e o alerta foi enviado. */
export async function noteStaffDevice(a: Access): Promise<boolean> {
  const ref = adminDb.collection('staffDevices').doc(a.uid);
  const hash = hashId(a.deviceId);
  const label = deviceLabel(a.userAgent);
  const { isNew, firstEver } = await adminDb.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const devices: Array<{ id: string; label: string; firstSeen: string }> = snap.exists ? snap.data()!.devices ?? [] : [];
    if (devices.some(d => d.id === hash)) return { isNew: false, firstEver: false };
    const next = [...devices, { id: hash, label, firstSeen: new Date().toISOString() }].slice(-MAX_DEVICES);
    tx.set(ref, { devices: next, updatedAt: new Date().toISOString() });
    return { isNew: true, firstEver: !snap.exists };
  });
  // Primeiro registro da conta (quando o alerta foi ligado): só guarda.
  if (!isNew || firstEver) return false;

  const when = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  const place = [a.city, a.country].filter(Boolean).join(', ') || 'local desconhecido';
  const mfa = hasSecondFactor(a.claims) ? 'com verificação em duas etapas' : 'só com senha ou Google, sem verificação em duas etapas';
  const html = emailLayout(emailSection({
    eyebrow: 'Segurança da equipe',
    title: 'Novo acesso ao painel',
    html: [
      emailParagraph(`A conta <strong>${escapeHtml(a.email ?? a.uid)}</strong> (${a.role === 'admin' ? 'admin' : 'vendedor'}) entrou no painel por um aparelho que ainda não tinha usado.`),
      emailParagraph(`<strong>Quando:</strong> ${escapeHtml(when)}<br><strong>Aparelho:</strong> ${escapeHtml(label)}<br><strong>De onde:</strong> ${escapeHtml(place)} (IP ${escapeHtml(a.ip)})<br><strong>Como:</strong> ${mfa}`),
      emailParagraph('<strong>Não reconhece?</strong> Troque a senha dessa conta agora e confira em Painel → Segurança se o app autenticador e as passkeys são seus.', { muted: true }),
    ].join(''),
  }), { replyHint: false, footerNote: 'E-mail automático de segurança da equipe.', preheader: `Novo acesso de ${a.email ?? 'uma conta da equipe'} ao painel` });

  const to = new Set<string>();
  if (a.email) to.add(a.email.toLowerCase());
  try {
    const { users } = await adminAuth.listUsers(1000);
    for (const u of users) if (u.customClaims?.role === 'admin' && u.email && !u.disabled) to.add(u.email.toLowerCase());
  } catch { /* sem a lista, avisa ao menos a própria pessoa */ }
  if (to.size === 0) return false;
  const text = `Novo acesso ao painel: ${a.email ?? a.uid} em ${when}, ${label}, ${place} (IP ${a.ip}), ${mfa}. Não reconhece? Troque a senha dessa conta agora.`;
  // Um e-mail por pessoa: ninguém vê o endereço dos outros.
  await Promise.allSettled([...to].map(addr => sendEmail({ to: addr, subject: 'Novo acesso ao painel da Mikma', text, html })));
  return true;
}
