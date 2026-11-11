/**
 * Cotação de PAC e SEDEX pelo contrato da loja com os Correios (API CWS,
 * api.correios.com.br). As postagens são feitas na agência com esse
 * contrato, então este é o custo real do envio.
 *
 * Credencial: secret CORREIOS_CWS no formato "login:codigo" (o código de
 * acesso de 40 caracteres gerado no CWS) e CORREIOS_CARTAO, o número do
 * cartão de postagem. O token dura cerca de 24 h e fica guardado em memória.
 */
import type { PackageDimensions, ShippingOption } from '@/lib/shipping-pricing';

const API = 'https://api.correios.com.br';

const SERVICOS = [
  { codigo: '03298', carrier: 'correios_pac', label: 'Correios PAC' },
  { codigo: '03220', carrier: 'correios_sedex', label: 'Correios SEDEX' },
] as const;

interface Token { token: string; contrato: string; dr: string; expiresAt: number }
let cached: Token | null = null;
let pending: Promise<Token | null> | null = null;

/** Só para os testes. */
export function resetCorreiosToken() { cached = null; pending = null; }

export function correiosContratoConfigured(): boolean {
  return !!process.env.CORREIOS_CWS?.includes(':') && !!process.env.CORREIOS_CARTAO;
}

async function fetchToken(): Promise<Token | null> {
  const raw = process.env.CORREIOS_CWS ?? '';
  const cartao = (process.env.CORREIOS_CARTAO ?? '').trim();
  const i = raw.indexOf(':');
  if (i < 1 || !cartao) return null;
  const basic = Buffer.from(`${raw.slice(0, i).trim()}:${raw.slice(i + 1).trim()}`).toString('base64');
  try {
    const res = await fetch(`${API}/token/v1/autentica/cartaopostagem`, {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${basic}` },
      body: JSON.stringify({ numero: cartao }),
    });
    if (!res.ok) { console.warn('[correios] token recusado:', res.status); return null; }
    const d = await res.json();
    const contrato = String(d.cartaoPostagem?.contrato ?? process.env.CORREIOS_CONTRATO ?? '');
    const dr = String(d.cartaoPostagem?.dr ?? d.dr ?? '');
    if (!d.token || !contrato || !dr) return null;
    // expiraEm vem no horário de Brasília sem fuso ("2026-11-11T10:41:39").
    const exp = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(d.expiraEm ?? '') ? d.expiraEm : `${d.expiraEm}-03:00`);
    const expiresAt = Number.isFinite(exp) ? exp : Date.now() + 60 * 60_000;
    return { token: d.token, contrato, dr, expiresAt };
  } catch (e) {
    console.warn('[correios] token falhou:', e instanceof Error ? e.message : e);
    return null;
  }
}

async function getToken(): Promise<Token | null> {
  // Renova 10 minutos antes de vencer.
  if (cached && cached.expiresAt - Date.now() > 10 * 60_000) return cached;
  pending ??= fetchToken().then(t => { cached = t; return t; }).finally(() => { pending = null; });
  return pending;
}

/** Token do contrato para as outras APIs dos Correios (pré-postagem). */
export async function correiosBearer(): Promise<string | null> {
  if (!correiosContratoConfigured()) return null;
  return (await getToken())?.token ?? null;
}

/** Descarta o token guardado (os Correios recusaram com 401). */
export function dropCorreiosToken() { cached = null; }

/** "24,07" ou "1.024,07" para centavos. */
export function parseReais(v: unknown): number {
  if (typeof v === 'number') return Math.round(v * 100);
  const s = String(v ?? '').trim();
  if (!s) return 0;
  const n = parseFloat(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export async function quoteCorreiosContrato(fromCep: string, toCep: string, pkg: PackageDimensions): Promise<ShippingOption[]> {
  if (!correiosContratoConfigured()) return [];
  const tk = await getToken();
  if (!tk) return [];
  const headers = { Authorization: `Bearer ${tk.token}` };
  const cepOrigem = fromCep.replace(/\D/g, '');
  const cepDestino = toCep.replace(/\D/g, '');
  const preco = new URLSearchParams({
    cepOrigem, cepDestino,
    psObjeto: String(Math.max(300, Math.round(pkg.weightKg * 1000))),
    tpObjeto: '2',
    comprimento: String(Math.round(pkg.lengthCm)),
    largura: String(Math.round(pkg.widthCm)),
    altura: String(Math.round(pkg.heightCm)),
    nuContrato: tk.contrato,
    nuDR: tk.dr,
  });
  const prazo = new URLSearchParams({ cepOrigem, cepDestino });

  const get = async (url: string) => {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (res.status === 401) cached = null;
    return res.ok ? res.json() : null;
  };

  const results = await Promise.all(SERVICOS.map(async s => {
    try {
      const [p, d] = await Promise.all([
        get(`${API}/preco/v1/nacional/${s.codigo}?${preco}`),
        get(`${API}/prazo/v1/nacional/${s.codigo}?${prazo}`).catch(() => null),
      ]);
      const cents = parseReais(p?.pcFinal);
      if (cents <= 0) return null;
      const days = Number(d?.prazoEntrega);
      return {
        carrier: s.carrier,
        label: s.label,
        priceCents: cents,
        estimatedDays: Number.isFinite(days) && days > 0 ? days : s.carrier === 'correios_pac' ? 10 : 3,
        available: true,
      } satisfies ShippingOption;
    } catch (e) {
      console.warn(`[correios] cotação ${s.codigo} falhou:`, e instanceof Error ? e.message : e);
      return null;
    }
  }));
  return results.filter(o => o !== null);
}

/**
 * Para o monitor (/api/cron/health?correios=1): o servidor publicado consegue
 * gerar token e cotar PAC e SEDEX pelo contrato? Gera um token novo (prova
 * que a credencial vale agora) sem descartar o que está em uso se falhar.
 */
export async function checkCorreiosContrato(fromCep: string, toCep: string, pkg: PackageDimensions): Promise<{ configured: boolean; token: boolean; pacCents: number; sedexCents: number }> {
  if (!correiosContratoConfigured()) return { configured: false, token: false, pacCents: 0, sedexCents: 0 };
  const fresh = await fetchToken();
  if (!fresh) return { configured: true, token: false, pacCents: 0, sedexCents: 0 };
  cached = fresh;
  const options = await quoteCorreiosContrato(fromCep, toCep, pkg);
  const cents = (carrier: string) => options.find(o => o.carrier === carrier)?.priceCents ?? 0;
  return { configured: true, token: true, pacCents: cents('correios_pac'), sedexCents: cents('correios_sedex') };
}
