/**
 * Rastreio pelo contrato dos Correios (SRO, api.correios.com.br/srorastro).
 * Só devolve objetos do próprio contrato, sem serviço de terceiros.
 * A API exige o idioma no cabeçalho (sem ele responde SRO-018).
 *
 * Testado no contrato real: etiqueta recém-gerada já aparece com o evento
 * "FC 82 Etiqueta emitida", que NÃO é postagem. Por isso "postado" só conta
 * com evento de manuseio físico.
 */
import { correiosBearer, dropCorreiosToken } from '@/lib/correiosContrato';

const API = 'https://api.correios.com.br/srorastro/v1/objetos';

export interface SroEvento {
  codigo: string;
  tipo: string;
  dtHrCriado?: string;
  descricao?: string;
  detalhe?: string;
  unidade?: { nome?: string; endereco?: { cidade?: string; uf?: string } };
  unidadeDestino?: { nome?: string; endereco?: { cidade?: string; uf?: string } };
}

export interface SroObjeto {
  codObjeto: string;
  mensagem?: string;
  eventos?: SroEvento[];
}

// Eventos de quem já pegou o pacote: postagem, coleta, trânsito, entrega.
const MANUSEIO = new Set(['PO', 'CO', 'RO', 'DO', 'OEC', 'LDI', 'LDE', 'BDE', 'BDI', 'BDR', 'PAR', 'TRI', 'CMT']);
// Entregue ao destinatário (BDE/BDI/BDR tipo 01). Outros tipos desses
// códigos são tentativa, ausência ou devolução.
const ENTREGUE = new Set(['BDE', 'BDI', 'BDR']);

/** Data dos Correios: vem no horário de Brasília, sem fuso. */
export function sroDate(v: string | undefined): Date | null {
  if (!v) return null;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${v}-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Os Correios já estão com o pacote? Devolve a data do primeiro manuseio. */
export function postedAt(o: SroObjeto | undefined): string | null {
  const evs = (o?.eventos ?? []).filter(e => MANUSEIO.has(e.codigo));
  if (!evs.length) return null;
  const first = evs.map(e => e.dtHrCriado ?? '').filter(Boolean).sort()[0];
  return (sroDate(first) ?? new Date()).toISOString();
}

/** Entregue ao destinatário? Devolve a data da entrega. */
export function deliveredAt(o: SroObjeto | undefined): string | null {
  const e = (o?.eventos ?? []).find(ev => ENTREGUE.has(ev.codigo) && ev.tipo === '01');
  return e ? (sroDate(e.dtHrCriado) ?? new Date()).toISOString() : null;
}

/** Até 50 códigos por chamada. Objetos não encontrados vêm com `mensagem`. */
export async function trackObjects(codes: string[]): Promise<Map<string, SroObjeto>> {
  const out = new Map<string, SroObjeto>();
  const unique = [...new Set(codes.map(c => c.trim().toUpperCase()).filter(c => /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(c)))];
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const q = new URLSearchParams(chunk.map(c => ['codigosObjetos', c]));
    q.set('resultado', 'T');
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await correiosBearer();
      if (!token) return out;
      const res = await fetch(`${API}?${q}`, {
        headers: { Authorization: `Bearer ${token}`, 'Accept-Language': 'pt-BR' },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 401 && attempt === 0) { dropCorreiosToken(); continue; }
      if (!res.ok) throw new Error(`rastreio dos Correios: HTTP ${res.status}`);
      const data = await res.json() as { objetos?: SroObjeto[] };
      for (const o of data.objetos ?? []) if (o.codObjeto) out.set(o.codObjeto, o);
      break;
    }
  }
  return out;
}

/** Eventos no formato da linha do tempo do site, do mais novo pro mais antigo. */
export function timelineEvents(o: SroObjeto | undefined) {
  return [...(o?.eventos ?? [])]
    .filter(e => !(e.codigo === 'FC' && e.tipo === '82'))
    .sort((a, b) => (b.dtHrCriado ?? '').localeCompare(a.dtHrCriado ?? ''))
    .map(e => {
      const d = sroDate(e.dtHrCriado);
      const ok = !!d;
      const lugar = (u?: SroEvento['unidade']) => [u?.endereco?.cidade, u?.endereco?.uf].filter(Boolean).join(' - ') || u?.nome || '';
      const destino = lugar(e.unidadeDestino);
      return {
        date: ok ? d!.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '',
        time: ok ? d!.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }) : '',
        location: lugar(e.unidade),
        status: e.descricao ?? '',
        subStatus: [e.detalhe, destino ? `Para ${destino}` : ''].filter(Boolean) as string[],
      };
    });
}
