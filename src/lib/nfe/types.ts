import type { NfeEnvironment } from './config';

/** Nota fiscal guardada no pedido (`order.nfe` produção, `order.nfeTeste` homologação). */
export type NfeStatus = 'processando' | 'autorizada' | 'erro' | 'cancelada' | 'pendente_dados';

export interface NfeRecord {
  ref: string;
  environment: NfeEnvironment;
  status: NfeStatus;
  attempt: number;
  numero?: string;
  serie?: string;
  chave?: string;
  danfeUrl?: string;
  xmlUrl?: string;
  mensagem?: string | null;
  requestedAt: string;
  updatedAt: string;
  authorizedAt?: string;
  cancelledAt?: string;
  by?: string;
}
