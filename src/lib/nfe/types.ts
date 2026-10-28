import type { NfeEnvironment } from './config';

/** Situação da nota guardada no pedido (`order.nfe` produção, `order.nfeTeste` homologação). */
export type NfeStatus =
  | 'processando'    // enviada, aguardando a SEFAZ (ou sem resposta: o cron consulta)
  | 'autorizada'
  | 'erro'           // rejeitada pela SEFAZ; corrige e emite de novo (mesmo número)
  | 'denegada'
  | 'cancelada'
  | 'inutilizada'    // número inutilizado (rejeitada e pedido cancelado)
  | 'pendente_dados'; // faltam dados; nenhum número foi usado

export interface NfeRecord {
  environment: NfeEnvironment;
  status: NfeStatus;
  attempt: number;
  numero?: number;
  serie?: number;
  chave?: string;
  cNF?: string;
  dhEmi?: string;
  cMunDest?: string;
  nProt?: string;
  mensagem?: string | null;
  requestedAt: string;
  updatedAt: string;
  authorizedAt?: string;
  cancelledAt?: string;
  /** Assinatura do link público da DANFE/XML (o cliente abre sem login). */
  docToken?: string;
  /** Autorizada só pela consulta (resposta do envio se perdeu): sem o XML assinado aqui. */
  xmlPendente?: boolean;
  by?: string;
}
