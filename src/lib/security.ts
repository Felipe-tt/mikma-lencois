import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { z, type ZodType, type ZodError } from 'zod';

/** Extrai o IP real do cliente, respeitando proxies confiáveis (Cloud Run / Vercel).
 *
 * IMPORTANTE: usa o ÚLTIMO valor de X-Forwarded-For, não o primeiro.
 * O proxy confiável (Cloud Run) ANEXA o IP real do cliente no final da
 * lista — qualquer valor antes disso veio da própria requisição e pode
 * ser forjado por quem está mandando (ex: "X-Forwarded-For: 1.2.3.4").
 * Pegar o primeiro item permitia burlar rate limit de login/cadastro/
 * reset de senha só trocando esse header a cada tentativa.
 */
export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const parts = fwd.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return req.headers.get('x-real-ip') ?? req.headers.get('x-nf-client-connection-ip') ?? 'unknown';
}

interface SafeJsonOk<T = unknown> { ok: true; data: T }
interface SafeJsonErr { ok: false; response: NextResponse }
type SafeJsonResult<T = unknown> = SafeJsonOk<T> | SafeJsonErr;

/**
 * Lê e parseia o body JSON com limite de tamanho.
 * Retorna { ok: true, data } ou { ok: false, response } com 400/413.
 */
export async function safeJson<T = unknown>(
  req: NextRequest,
  maxBytes = 8192
): Promise<SafeJsonResult<T>> {
  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Payload muito grande' }, { status: 413 }),
    };
  }
  try {
    const text = await req.text();
    if (text.length > maxBytes) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Payload muito grande' }, { status: 413 }),
      };
    }
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'JSON inválido' }, { status: 400 }),
    };
  }
}

/** Endereço de entrega — mesmo shape usado no checkout e no pedido salvo no Firestore. */
export const addressSchema = z.object({
  cep: z.string().trim().regex(/^\d{5}-?\d{3}$/, 'CEP inválido'),
  street: z.string().trim().min(1).max(150),
  number: z.string().trim().min(1).max(20),
  complement: z.string().trim().max(100).optional(),
  neighborhood: z.string().trim().min(1).max(100),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().length(2),
});

interface ValidateBodyOk<T> { ok: true; data: T }
interface ValidateBodyErr { ok: false; response: NextResponse }

function formatZodError(err: ZodError): string {
  const first = err.issues[0];
  if (!first) return 'Dados inválidos';
  const path = first.path.join('.');
  return path ? `${path}: ${first.message}` : first.message;
}

/**
 * Lê o body JSON (com limite de tamanho) e valida contra um schema zod.
 * Retorna { ok: true, data } tipado pelo schema, ou { ok: false, response }
 * já pronto pra dar `return` direto na rota — 400 (JSON/schema inválido) ou 413 (payload grande).
 */
export async function validateBody<S extends ZodType>(
  req: NextRequest,
  schema: S,
  maxBytes = 8192
): Promise<ValidateBodyOk<z.output<S>> | ValidateBodyErr> {
  const raw = await safeJson<unknown>(req, maxBytes);
  if (!raw.ok) return raw;

  const parsed = schema.safeParse(raw.data);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 }),
    };
  }
  return { ok: true, data: parsed.data as z.output<S> };
}

/**
 * Verifica Authorization Bearer e retorna o token ou NextResponse 401.
 */
export function extractBearer(req: NextRequest): { token: string } | { response: NextResponse } {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return { response: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) };
  }
  return { token: auth.slice(7) };
}

/** Retorna uma resposta 429 com Retry-After. */
export function tooManyRequests(retryAfterMs: number): NextResponse {
  return NextResponse.json(
    { error: 'Muitas tentativas. Tente novamente em alguns minutos.' },
    { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
  );
}



export type AuthResult =
  | { ok: true; decoded: DecodedIdToken }
  | { ok: false; response: NextResponse };

/** Verifica Bearer token e opcionalmente checa roles. checkRevoked=true por padrão. */
export async function verifyAuth(
  req: NextRequest,
  options: { roles?: string[]; checkRevoked?: boolean } = {}
): Promise<AuthResult> {
  const { roles, checkRevoked = true } = options;
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) {
    return { ok: false, response: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) };
  }
  const token = header.slice(7);
  if (token.length > 4096) {
    return { ok: false, response: NextResponse.json({ error: 'Token inválido' }, { status: 401 }) };
  }
  try {
    const decoded = await adminAuth.verifyIdToken(token, checkRevoked);
    if (roles?.length) {
      const role = (decoded as DecodedIdToken & { role?: string }).role ?? '';
      if (!roles.includes(role)) {
        return { ok: false, response: NextResponse.json({ error: 'Acesso negado' }, { status: 403 }) };
      }
    }
    return { ok: true, decoded };
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Token inválido' }, { status: 401 }) };
  }
}

/**
 * Valida que uma URL de imagem realmente aponta pro bucket/pasta esperados
 * do Firebase Storage, em vez de aceitar qualquer URL válida.
 *
 * Por quê: várias rotas de produto/rascunho apagam do Storage o arquivo
 * cujo caminho é extraído de uma URL salva anteriormente pelo próprio
 * cliente (campo "images"). Se qualquer URL fosse aceita, um seller/admin
 * mal-intencionado (ou com a conta comprometida) poderia salvar a URL de
 * QUALQUER outro objeto do bucket e fazer o servidor apagá-lo de verdade
 * na hora de excluir o produto/rascunho — o delete usa o Admin SDK, que
 * ignora storage.rules.
 */
export function isValidProductImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.hostname !== 'firebasestorage.googleapis.com') return false;
    const m = u.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (!m) return false;
    const [, bucket, encodedPath] = m;
    if (bucket !== (process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '')) return false;
    return decodeURIComponent(encodedPath).startsWith('products/');
  } catch {
    return false;
  }
}

export const productImageUrlSchema = z
  .string()
  .url()
  .max(500)
  .refine(isValidProductImageUrl, 'URL de imagem inválida');
