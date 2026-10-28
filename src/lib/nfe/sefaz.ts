import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import type { NfeEnvironment } from './config';

/**
 * Conversa com a SEFAZ pela nfewizard-io (gratuita, código aberto): assina a
 * nota com o certificado A1 e chama os webservices oficiais. Nenhum serviço
 * pago no meio. Cada função devolve um resultado já classificado, para o
 * service.ts decidir sem adivinhar.
 */

export interface SefazCert { pfx: Buffer; password: string }

export type AuthorizeResult =
  | { kind: 'autorizada'; nProt: string; dhRecbto?: string; xml?: string; proc: unknown }
  | { kind: 'rejeitada'; cStat: string; motivo: string }
  | { kind: 'denegada'; cStat: string; motivo: string }
  | { kind: 'duplicada' } // a SEFAZ já tem esta chave: consultar
  | { kind: 'incerta'; motivo: string }; // pode ter chegado: consultar antes de reenviar

export type ConsultResult =
  | { kind: 'autorizada'; nProt: string; dhRecbto?: string; protNFe: unknown }
  | { kind: 'cancelada' }
  | { kind: 'denegada'; motivo: string }
  | { kind: 'inexistente' }
  | { kind: 'erro'; motivo: string };

const DENEGADA = new Set(['110', '205', '301', '302', '303']);

type Wizard = {
  NFE_LoadEnvironment(args: { config: unknown }): Promise<void>;
  NFE_Autorizacao(data: unknown): Promise<unknown>;
  NFE_ConsultaProtocolo(chave: string): Promise<Record<string, unknown>>;
  NFE_Cancelamento(data: unknown): Promise<unknown>;
  NFE_Inutilizacao(data: unknown): Promise<unknown>;
};

async function withWizard<T>(env: NfeEnvironment, cert: SefazCert, uf: string, cnpj: string, fn: (w: Wizard, dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), 'nfe-'));
  try {
    const mod = await import('nfewizard-io');
    const NFeWizard = (mod.default ?? mod) as unknown as new () => Wizard;
    const w = new NFeWizard();
    await silenceLibLogs();
    await w.NFE_LoadEnvironment({
      config: {
        dfe: {
          baixarXMLDistribuicao: false,
          armazenarXMLAutorizacao: false,
          pathXMLAutorizacao: dir,
          armazenarXMLRetorno: false,
          armazenarXMLConsulta: false,
          armazenarRetornoEmJSON: false,
          pathCertificado: cert.pfx,
          senhaCertificado: cert.password,
          UF: uf,
          CPFCNPJ: cnpj,
        },
        nfe: { ambiente: env === 'producao' ? 1 : 2, versaoDF: '4.00' },
        lib: {
          connection: { timeout: 30_000 },
          log: { exibirLogNoConsole: false, armazenarLogs: false },
          useOpenSSL: false,
          useForSchemaValidation: 'validateSchemaJsBased',
        },
      },
    });
    await silenceLibLogs();
    return await fn(w, dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const first = <T,>(v: T | T[] | undefined): T | undefined => (Array.isArray(v) ? v[0] : v);
const text = (v: unknown) => (v == null ? undefined : String(first(v as unknown[]) ?? ''));

/**
 * Falha de comunicação (a requisição pode ou não ter sido processada) x
 * rejeição da SEFAZ. A SEFAZ responde rejeições com HTTP 200 e um cStat;
 * qualquer erro HTTP (403, 500, 503...) ou de rede é comunicação. A
 * biblioteca embrulha o erro do axios num Error comum, então vale a mensagem.
 */
function isNetworkError(err: unknown): boolean {
  const e = err as { isAxiosError?: boolean; code?: string; message?: string };
  if (e?.isAxiosError) return true;
  return /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ECONNABORTED|ENOTFOUND|EAI_AGAIN|EPROTO|CERT_|certificate|socket hang up|timeout of \d+ms exceeded|Network Error|Request failed with status code|status code \d{3}/i
    .test(String(e?.code ?? '') + ' ' + String(e?.message ?? ''));
}

/**
 * O logger da biblioteca jogaria no log do servidor a configuração (com o
 * certificado e a senha) e o XML (CPF, endereço). Ele é inicializado uma vez
 * por processo: inicializamos antes da biblioteca, sem destino, e calado.
 */
async function silenceLibLogs() {
  try {
    const shared = await import('@nfewizard/shared') as unknown as {
      logger?: { isInitialized?: boolean; initialize?: (c: unknown) => void; logger?: { silent?: boolean } };
    };
    const lg = shared.logger;
    if (!lg) return;
    if (!lg.isInitialized) lg.initialize?.({ exibirLogNoConsole: false, armazenarLogs: false });
    if (lg.logger) lg.logger.silent = true;
  } catch { /* sem o logger, nada a silenciar */ }
}

function rejectionCode(message: string): string | null {
  return message.match(/(?:c[óo]digo|cStat)\D{0,5}(\d{3})/i)?.[1] ?? message.match(/\b(\d{3})\b/)?.[1] ?? null;
}

export async function authorize(env: NfeEnvironment, cert: SefazCert, uf: string, cnpj: string, nfe: unknown, chave: string): Promise<AuthorizeResult> {
  try {
    return await withWizard(env, cert, uf, cnpj, async w => {
      // A biblioteca altera o objeto recebido: sempre uma cópia (reenvios idênticos).
      const res = await w.NFE_Autorizacao(structuredClone(nfe));
      // 1.1.x devolve uma lista de { NFe, protNFe, xml, xmlAssinado }.
      const item = (Array.isArray(res) ? res[0] : res) as Record<string, unknown> | undefined;
      const infProt = first((first(item?.protNFe as unknown[]) as Record<string, unknown> | undefined)?.infProt as unknown[]) as Record<string, unknown> | undefined;
      const cStat = text(infProt?.cStat) ?? '';
      const motivo = text(infProt?.xMotivo) ?? '';
      if (cStat === '100' || cStat === '150') {
        if (text(infProt?.chNFe) && text(infProt?.chNFe) !== chave) return { kind: 'incerta', motivo: 'protocolo de outra chave' };
        const xml = typeof item?.xml === 'string' ? item.xml : undefined;
        return { kind: 'autorizada', nProt: text(infProt?.nProt) ?? '', dhRecbto: text(infProt?.dhRecbto), xml, proc: item };
      }
      if (DENEGADA.has(cStat)) return { kind: 'denegada', cStat, motivo };
      if (cStat === '204') return { kind: 'duplicada' };
      if (!cStat) return { kind: 'incerta', motivo: 'resposta da SEFAZ sem protocolo' };
      return { kind: 'rejeitada', cStat, motivo: motivo || 'sem motivo informado' };
    });
  } catch (err) {
    if (isNetworkError(err)) return { kind: 'incerta', motivo: (err as Error).message };
    const message = String((err as Error)?.message ?? err);
    const code = rejectionCode(message);
    if (code === '204' || /duplicidade de nf-e(?! com diferen)/i.test(message)) return { kind: 'duplicada' };
    if ((code && DENEGADA.has(code)) || /uso denegado|denegad/i.test(message)) return { kind: 'denegada', cStat: code && DENEGADA.has(code) ? code : '110', motivo: message.slice(0, 500) };
    return { kind: 'rejeitada', cStat: code ?? '?', motivo: message.slice(0, 500) };
  }
}

export async function consult(env: NfeEnvironment, cert: SefazCert, uf: string, cnpj: string, chave: string): Promise<ConsultResult> {
  try {
    return await withWizard(env, cert, uf, cnpj, async w => {
      const res = await w.NFE_ConsultaProtocolo(chave);
      const cStat = text(res.cStat) ?? '';
      if (cStat === '217') return { kind: 'inexistente' };
      if (cStat === '101' || cStat === '151' || cStat === '155') return { kind: 'cancelada' };
      const protNFe = first(res.protNFe as unknown[]) as Record<string, unknown> | undefined;
      const infProt = first(protNFe?.infProt as unknown[]) as Record<string, unknown> | undefined;
      const protStat = text(infProt?.cStat) ?? cStat;
      if (protStat === '100' || protStat === '150') return { kind: 'autorizada', nProt: text(infProt?.nProt) ?? '', dhRecbto: text(infProt?.dhRecbto), protNFe };
      if (DENEGADA.has(protStat)) return { kind: 'denegada', motivo: text(infProt?.xMotivo) ?? text(res.xMotivo) ?? '' };
      return { kind: 'erro', motivo: `${cStat} ${text(res.xMotivo) ?? ''}`.trim() };
    });
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    if (/217|n[ãa]o consta/i.test(message)) return { kind: 'inexistente' };
    return { kind: 'erro', motivo: message.slice(0, 500) };
  }
}

export async function cancel(
  env: NfeEnvironment, cert: SefazCert, uf: string, cnpj: string,
  args: { chave: string; nProt: string; justificativa: string; dhEvento: string; ufCode: number },
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  try {
    await withWizard(env, cert, uf, cnpj, w => w.NFE_Cancelamento({
      idLote: Date.now() % 1e15,
      modelo: '55',
      evento: [{
        cOrgao: args.ufCode,
        tpAmb: env === 'producao' ? 1 : 2,
        CNPJ: cnpj,
        chNFe: args.chave,
        dhEvento: args.dhEvento,
        tpEvento: '110111',
        nSeqEvento: 1,
        verEvento: '1.00',
        detEvento: { descEvento: 'Cancelamento', nProt: args.nProt, xJust: args.justificativa },
      }],
    }));
    return { ok: true };
  } catch (err) {
    return { ok: false, motivo: String((err as Error)?.message ?? err).slice(0, 500) };
  }
}

/** Inutiliza um número que ficou sem nota (rejeitada e o pedido cancelado). */
export async function inutilizar(
  env: NfeEnvironment, cert: SefazCert, uf: string, cnpj: string,
  args: { serie: number; numero: number; ano: string; justificativa: string; ufCode: number },
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  try {
    await withWizard(env, cert, uf, cnpj, w => w.NFE_Inutilizacao({
      cUF: args.ufCode,
      ano: args.ano, // dois dígitos (AA)
      CNPJ: cnpj,
      mod: '55',
      serie: String(args.serie),
      nNFIni: String(args.numero),
      nNFFin: String(args.numero),
      xJust: args.justificativa,
    }));
    return { ok: true };
  } catch (err) {
    return { ok: false, motivo: String((err as Error)?.message ?? err).slice(0, 500) };
  }
}

/** PDF da DANFE a partir do XML autorizado (nfeProc) ou do objeto NFe + protocolo. */
export async function danfePdf(proc: unknown, chave: string): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), 'danfe-'));
  try {
    const { NFE_GerarDanfe } = await import('@nfewizard/danfe') as unknown as { NFE_GerarDanfe: (a: { data: unknown; chave: string; outputPath: string }) => Promise<{ success?: boolean; message?: string }> };
    const outputPath = path.join(dir, `${chave}.pdf`);
    const res = await NFE_GerarDanfe({ data: proc, chave, outputPath });
    if (res && res.success === false) throw new Error(res.message ?? 'falha ao gerar DANFE');
    // A biblioteca devolve antes de terminar de gravar: espera o PDF fechar (%%EOF).
    for (let i = 0; i < 200; i++) {
      const pdf = await readFile(outputPath).catch(() => null);
      if (pdf && pdf.length > 0 && pdf.subarray(-1024).toString('latin1').includes('%%EOF')) return pdf;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error('DANFE não terminou de ser gerada');
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
