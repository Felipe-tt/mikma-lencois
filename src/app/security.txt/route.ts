import { connection } from 'next/server';
import { getStoreSettings } from '@/lib/settings';
import { SITE_URL } from '@/lib/agentCatalog';

/**
 * security.txt (RFC 9116): onde reportar uma falha de segurança. Servido em
 * /.well-known/security.txt (rewrite no next.config). O contato vem das
 * configurações da loja e a validade se renova sozinha (o RFC exige Expires).
 */
export async function GET() {
  await connection();
  const s = await getStoreSettings();
  const expires = new Date(Date.now() + 180 * 86_400_000).toISOString();
  const contacts = [
    s.storeEmail ? `Contact: mailto:${s.storeEmail}` : null,
    s.storePhone ? `Contact: https://wa.me/${s.storePhone.replace(/\D/g, '')}` : null,
    `Contact: ${SITE_URL}/sobre`,
  ].filter(Boolean);
  const body = [
    ...contacts,
    `Expires: ${expires}`,
    'Preferred-Languages: pt, en',
    `Canonical: ${SITE_URL}/.well-known/security.txt`,
    '',
  ].join('\n');
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
  });
}
