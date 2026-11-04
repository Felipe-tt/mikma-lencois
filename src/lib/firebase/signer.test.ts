import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { signRsaSha256Hex, signerEmail } from './signer';
import { generateV4SignedUploadUrl } from '../gcsSignedUrl';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

afterEach(() => {
  delete process.env.FIREBASE_PRIVATE_KEY;
  delete process.env.FIREBASE_CLIENT_EMAIL;
  vi.unstubAllGlobals();
});

describe('assinatura da conta de serviço', () => {
  it('com chave no ambiente, assina localmente (aceita \\n escapado e aspas)', async () => {
    process.env.FIREBASE_PRIVATE_KEY = `"${pem.replace(/\n/g, '\\n')}"`;
    process.env.FIREBASE_CLIENT_EMAIL = 'local@x.iam.gserviceaccount.com';
    const sig = await signRsaSha256Hex('oi');
    expect(crypto.verify('sha256', Buffer.from('oi'), publicKey, Buffer.from(sig, 'hex'))).toBe(true);
    expect(await signerEmail()).toBe('local@x.iam.gserviceaccount.com');
  });

  it('sem chave, pede a assinatura à API IAM com o token dos metadados', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(url);
      if (url.endsWith('/email')) return new Response('srv@x.iam.gserviceaccount.com');
      if (url.endsWith('/token')) return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }));
      const payload = Buffer.from(JSON.parse(String(init?.body)).payload, 'base64');
      const signedBlob = crypto.sign('sha256', payload, privateKey).toString('base64');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer t');
      return new Response(JSON.stringify({ signedBlob }));
    }));
    const url = await generateV4SignedUploadUrl({
      bucket: 'b.firebasestorage.app', objectPath: 'products/a.webp', contentType: 'image/webp',
      clientEmail: await signerEmail(),
    });
    expect(calls.some(c => c.includes('iamcredentials.googleapis.com') && c.includes('srv%40x.iam.gserviceaccount.com'))).toBe(true);
    expect(url).toContain('X-Goog-Credential=srv%40x.iam.gserviceaccount.com');
    expect(url).toMatch(/x-goog-signature=[0-9a-f]{512}$/);
  });
});
