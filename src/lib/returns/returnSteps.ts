/**
 * Etapas da troca ou devolução que o cliente vê na página da troca. Pura,
 * sem Firestore: recebe a troca como está no banco.
 */
export type EtapaId = 'solicitada' | 'aprovada' | 'postada' | 'chegou' | 'concluida';

export interface TrocaParaEtapas {
  status: 'solicitada' | 'aprovada' | 'recusada' | 'concluida';
  createdAt: string;
  updatedAt?: string;
  reversa?: { codigoObjeto: string; validade: string; createdAt?: string; postadoEm?: string; entregueEm?: string };
}

export interface Etapa { id: EtapaId; label: string; feita: boolean; quando?: string }

export function etapasDaTroca(t: TrocaParaEtapas): { etapas: Etapa[]; atual: EtapaId | 'recusada' } {
  const r = t.reversa;
  const concluida = t.status === 'concluida';
  const chegou = concluida || !!r?.entregueEm;
  const postada = chegou || !!r?.postadoEm;
  const aprovada = postada || t.status === 'aprovada';
  const etapas: Etapa[] = [
    { id: 'solicitada', label: 'Pedido enviado', feita: true, quando: t.createdAt },
    { id: 'aprovada', label: 'Aprovada', feita: aprovada, quando: r?.createdAt },
    { id: 'postada', label: 'Postada nos Correios', feita: postada, quando: r?.postadoEm },
    { id: 'chegou', label: 'Chegou na loja', feita: chegou, quando: r?.entregueEm },
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
