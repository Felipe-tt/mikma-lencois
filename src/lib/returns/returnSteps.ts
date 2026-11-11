/**
 * Etapas da troca ou devolução que o cliente vê na página da troca. Pura,
 * sem Firestore: recebe a troca como está no banco.
 */
export type EtapaId = 'solicitada' | 'aprovada' | 'postada' | 'chegou' | 'concluida';
export type DevolverPor = 'correios' | 'uber' | 'loja';

export interface ColetaUber {
  deliveryId: string;
  trackingUrl?: string;
  createdAt: string;
  coletadoEm?: string;
  entregueEm?: string;
}

export interface TrocaParaEtapas {
  status: 'solicitada' | 'aprovada' | 'recusada' | 'concluida';
  createdAt: string;
  updatedAt?: string;
  /** Sem o campo (trocas antigas): Correios. */
  devolverPor?: DevolverPor;
  reversa?: { codigoObjeto: string; validade: string; createdAt?: string; postadoEm?: string; entregueEm?: string };
  coletaUber?: ColetaUber;
  /** Loja: quando a equipe marcou que recebeu as peças no balcão. */
  recebidaEm?: string;
}

export interface Etapa { id: EtapaId; label: string; feita: boolean; quando?: string }

export function etapasDaTroca(t: TrocaParaEtapas): { etapas: Etapa[]; atual: EtapaId | 'recusada' } {
  const por = t.devolverPor ?? 'correios';
  const r = t.reversa;
  const u = t.coletaUber;
  const concluida = t.status === 'concluida';
  const chegouEm = por === 'uber' ? u?.entregueEm : por === 'loja' ? t.recebidaEm : r?.entregueEm;
  const saiuEm = por === 'uber' ? u?.coletadoEm : r?.postadoEm;
  const chegou = concluida || !!chegouEm;
  const postada = chegou || !!saiuEm;
  const aprovada = postada || t.status === 'aprovada';
  const etapas: Etapa[] = [
    { id: 'solicitada', label: 'Pedido enviado', feita: true, quando: t.createdAt },
    { id: 'aprovada', label: 'Aprovada', feita: aprovada, quando: por === 'uber' ? undefined : r?.createdAt },
    ...(por === 'loja' ? [] : [{ id: 'postada' as const, label: por === 'uber' ? 'Coletada' : 'Postada nos Correios', feita: postada, quando: saiuEm }]),
    { id: 'chegou', label: por === 'loja' ? 'Entregue na loja' : 'Chegou na loja', feita: chegou, quando: chegouEm },
    { id: 'concluida', label: 'Concluída', feita: concluida, quando: concluida ? t.updatedAt : undefined },
  ];
  if (t.status === 'recusada') return { etapas: etapas.slice(0, 1), atual: 'recusada' };
  const atual = [...etapas].reverse().find(e => e.feita)!.id;
  return { etapas, atual };
}

/** Dias inteiros até o fim do prazo de postagem (0 = hoje é o último dia). */
export function diasParaPostar(validade: string, agora = new Date()): number {
  const fim = new Date(`${validade.slice(0, 10)}T23:59:59-03:00`).getTime();
  return Math.max(0, Math.floor((fim - agora.getTime()) / 86_400_000));
}
