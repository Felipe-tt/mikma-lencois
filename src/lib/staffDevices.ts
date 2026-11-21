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
      emailParagraph('<strong>Não reconhece?</strong> Troque a senha dessa conta agora e confira no Painel, em Segurança, se o app autenticador e as passkeys são seus.', { muted: true }),
    ].join(''),
  }), { replyHint: false, footerNote: 'E-mail automático de segurança da equipe.', preheader: `Novo acesso de ${a.email ?? 'uma conta da equipe'} ao painel` });

  const to = await securityRecipients(a.email, true);
  if (to.length === 0) return false;
  const text = `Novo acesso ao painel: ${a.email ?? a.uid} em ${when}, ${label}, ${place} (IP ${a.ip}), ${mfa}. Não reconhece? Troque a senha dessa conta agora.`;
  // Um e-mail por pessoa: ninguém vê o endereço dos outros.
  await Promise.allSettled(to.map(addr => sendEmail({ to: addr, subject: 'Novo acesso ao painel da Mikma', text, html })));
  return true;
}

/** A própria pessoa e, se for da equipe, os admins. */
async function securityRecipients(email: string | undefined, staff: boolean): Promise<string[]> {
  const to = new Set<string>();
  if (email) to.add(email.toLowerCase());
  if (staff) {
    try {
      const { users } = await adminAuth.listUsers(1000);
      for (const u of users) if (u.customClaims?.role === 'admin' && u.email && !u.disabled) to.add(u.email.toLowerCase());
    } catch { /* sem a lista, avisa ao menos a própria pessoa */ }
  }
  return [...to];
}

interface PasskeyAdded {
  uid: string;
  email?: string;
  role?: string;
  claims: MfaClaims;
  ip: string;
  userAgent: string | null;
  city?: string | null;
  country?: string | null;
}

/**
 * Passkey nova numa conta: avisa a pessoa e, se for da equipe, os admins.
 * Quem roubasse a senha de uma conta da equipe ainda sem verificação em duas
 * etapas podia cadastrar a própria passkey direto pela API (sem abrir o
 * painel, que é onde sai o alerta de aparelho novo) e ganhar a segunda etapa
 * em silêncio.
 */
export async function notifyPasskeyAdded(a: PasskeyAdded): Promise<void> {
  const staff = a.role === 'seller' || a.role === 'admin';
  const to = await securityRecipients(a.email, staff);
  if (to.length === 0) return;
  const when = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  const place = [a.city, a.country].filter(Boolean).join(', ') || 'local desconhecido';
  const label = deviceLabel(a.userAgent);
  const how = hasSecondFactor(a.claims) ? 'entrando com a verificação em duas etapas' : 'entrando só com a senha ou o Google';
  const account = `${a.email ?? a.uid}${staff ? ` (${a.role === 'admin' ? 'admin' : 'vendedor'})` : ''}`;
  const where = staff ? 'no Painel, em Segurança' : 'em Meus dados';
  const html = emailLayout(emailSection({
    eyebrow: 'Segurança da conta',
    title: 'Nova passkey cadastrada',
    html: [
      emailParagraph(`Uma passkey nova foi cadastrada na conta <strong>${escapeHtml(account)}</strong>. Com ela dá para entrar sem senha.`),
      emailParagraph(`<strong>Quando:</strong> ${escapeHtml(when)}<br><strong>Aparelho:</strong> ${escapeHtml(label)}<br><strong>De onde:</strong> ${escapeHtml(place)} (IP ${escapeHtml(a.ip)})<br><strong>Como:</strong> ${how}`),
      emailParagraph(`<strong>Não foi você?</strong> Troque a senha agora e apague essa passkey ${where}.`, { muted: true }),
    ].join(''),
  }), { replyHint: false, footerNote: 'E-mail automático de segurança.', preheader: `Passkey nova na conta ${a.email ?? ''}`.trim() });
  const text = `Nova passkey cadastrada na conta ${account} em ${when}, ${label}, ${place} (IP ${a.ip}), ${how}. Não foi você? Troque a senha agora e apague essa passkey ${where}.`;
  await Promise.allSettled(to.map(addr => sendEmail({ to: addr, subject: 'Nova passkey na conta da Mikma', text, html })));
}

/**
 * Conta da equipe passou do teto de CPF e telefone abertos por hora: avisa
 * os admins e a própria pessoa (se a conta foi invadida, ela fica sabendo).
 */
export async function notifyPiiScan(a: { uid: string; email?: string; ip: string; perHour: number }): Promise<void> {
  const to = await securityRecipients(a.email, true);
  if (to.length === 0) return;
  const when = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  const who = a.email ?? a.uid;
  const html = emailLayout(emailSection({
    eyebrow: 'Segurança da equipe',
    title: 'Muitos CPFs abertos em pouco tempo',
    html: [
      emailParagraph(`A conta <strong>${escapeHtml(who)}</strong> abriu o CPF e o telefone de mais de ${a.perHour} clientes na última hora, mais do que um atendimento normal. As próximas consultas ficam bloqueadas por até uma hora.`),
      emailParagraph(`<strong>Quando:</strong> ${escapeHtml(when)}<br><strong>IP:</strong> ${escapeHtml(a.ip)}`),
      emailParagraph('<strong>Não reconhece?</strong> Tire essa pessoa da equipe em Configurações e troque a senha da conta.', { muted: true }),
    ].join(''),
  }), { replyHint: false, footerNote: 'E-mail automático de segurança da equipe.', preheader: `Muitos CPFs abertos por ${who}` });
  const text = `A conta ${who} abriu o CPF e o telefone de mais de ${a.perHour} clientes na última hora (${when}, IP ${a.ip}). As próximas consultas ficam bloqueadas por até uma hora. Não reconhece? Tire essa pessoa da equipe e troque a senha.`;
  await Promise.allSettled(to.map(addr => sendEmail({ to: addr, subject: 'Alerta: muitos CPFs abertos no painel da Mikma', text, html })));
}
