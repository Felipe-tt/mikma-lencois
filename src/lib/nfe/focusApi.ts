import type { NfeEnvironment } from './config';
import { getFocusToken } from './tokens';

/**
 * Cliente da API v2 da Focus NFe (https://focusnfe.com.br). Autenticação
 * HTTP Basic com o token como usuário. Cada nota é identificada por uma
 * referência nossa (`ref`), o que torna o envio idempotente.
 */

export const FOCUS_BASE: Record<NfeEnvironment, string> = {
  producao: 'https://api.focusnfe.com.br',
  homologacao: 'https://homologacao.focusnfe.com.br',
};

export interface FocusNfe {
  status?: string; // processando_autorizacao | autorizado | erro_autorizacao | denegado | cancelado
  status_sefaz?: string;
  mensagem_sefaz?: string;
  numero?: string;
  serie?: string;
  chave_nfe?: string;
  caminho_danfe?: string;
  caminho_xml_nota_fiscal?: string;
  caminho_xml_cancelamento?: string;
  codigo?: string;
  mensagem?: string;
  erros?: Array<{ codigo?: string; mensagem?: string; campo?: string }>;
}

export type FocusResult =
  | { ok: true; status: number; data: FocusNfe }
  | { ok: false; status: number; data: FocusNfe; error: string };

export class FocusConfigError extends Error {}

async function call(env: NfeEnvironment, method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<FocusResult> {
  const token = await getFocusToken(env);
  if (!token) throw new FocusConfigError(`Token da Focus NFe (${env === 'producao' ? 'produção' : 'homologação'}) não cadastrado`);
  let res: Response;
  try {
    // FOCUS_NFE_MOCK_URL: só para teste local com um simulador da Focus.
    res = await fetch(`${process.env.FOCUS_NFE_MOCK_URL || FOCUS_BASE[env]}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${token}:`).toString('base64')}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
  } catch (err) {
    // Sem resposta: a nota pode ou não ter chegado. Quem chama consulta pela ref.
    return { ok: false, status: 0, data: {}, error: err instanceof Error ? err.message : String(err) };
  }
  const data = (await res.json().catch(() => ({}))) as FocusNfe;
  if (res.ok) return { ok: true, status: res.status, data };
  return { ok: false, status: res.status, data, error: focusErrorMessage(data) || `HTTP ${res.status}` };
}

export function focusErrorMessage(data: FocusNfe): string {
  const list = (data.erros ?? []).map(e => [e.campo, e.mensagem].filter(Boolean).join(': ')).filter(Boolean);
  return [data.mensagem_sefaz, data.mensagem, ...list].filter(Boolean).join(' · ').slice(0, 1000);
}

const refPath = (ref: string) => `/v2/nfe/${encodeURIComponent(ref)}`;

export const focusEmit = (env: NfeEnvironment, ref: string, payload: unknown) =>
  call(env, 'POST', `/v2/nfe?ref=${encodeURIComponent(ref)}`, payload);

export const focusGet = (env: NfeEnvironment, ref: string) => call(env, 'GET', `${refPath(ref)}?completa=0`);

export const focusCancel = (env: NfeEnvironment, ref: string, justificativa: string) =>
  call(env, 'DELETE', refPath(ref), { justificativa });

/** Link absoluto para um arquivo devolvido pela Focus (caminho relativo ou URL). */
export function focusFileUrl(env: NfeEnvironment, path: string | undefined): string | undefined {
  if (!path) return undefined;
  return /^https?:\/\//.test(path) ? path : `${FOCUS_BASE[env]}${path.startsWith('/') ? '' : '/'}${path}`;
}
