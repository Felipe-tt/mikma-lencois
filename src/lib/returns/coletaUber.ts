import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { notifySeller } from '@/lib/push/notifySeller';
import { avisarCliente } from './avisarCliente';

/**
 * Status da Uber na coleta de uma troca (o entregador busca na casa do
 * cliente e traz para a loja). Pura: diz o que gravar e quem avisar.
 */
export function efeitoDaColeta(uberStatus: string, coleta: { coletadoEm?: string; entregueEm?: string; status?: string }, agora: string):
  | { tipo: 'nada' }
  | { tipo: 'atualiza'; campos: Record<string, string>; aviso?: 'chegou'; push?: string }
  | { tipo: 'cancelada'; push: string } {
  if (coleta.status === uberStatus || coleta.entregueEm) return { tipo: 'nada' };
  if (uberStatus === 'pickup_complete' || uberStatus === 'dropoff') {
    return coleta.coletadoEm
      ? { tipo: 'atualiza', campos: { status: uberStatus } }
      : { tipo: 'atualiza', campos: { status: uberStatus, coletadoEm: agora }, push: 'O entregador pegou o pacote da troca e está vindo para a loja.' };
  }
  if (uberStatus === 'delivered') {
    return { tipo: 'atualiza', campos: { status: uberStatus, entregueEm: agora, ...(coleta.coletadoEm ? {} : { coletadoEm: agora }) }, aviso: 'chegou', push: 'O pacote da troca chegou na loja. Confira as peças e conclua.' };
  }
  if (uberStatus === 'canceled' || uberStatus === 'returned') {
    return { tipo: 'cancelada', push: 'A Uber cancelou a coleta da troca. Combine com o cliente e chame outro entregador.' };
  }
  return { tipo: 'atualiza', campos: { status: uberStatus } };
}

/**
 * Aplica o status numa troca, se a corrida for de coleta. Devolve false
 * quando a corrida não é de nenhuma troca (o webhook segue para pedidos).
 */
export async function aplicarStatusColeta(deliveryId: string, uberStatus: string, trackingUrl?: string): Promise<boolean> {
  const snap = await adminDb.collection('returns').where('coletaUber.deliveryId', '==', deliveryId).limit(1).get();
  if (snap.empty) return false;
  const ref = snap.docs[0].ref;
  const efeito = await adminDb.runTransaction(async tx => {
    const cur = (await tx.get(ref)).data();
    const coleta = cur?.coletaUber as { deliveryId?: string; coletadoEm?: string; entregueEm?: string; status?: string } | undefined;
    if (!coleta || coleta.deliveryId !== deliveryId) return { tipo: 'nada' as const };
    const e = efeitoDaColeta(uberStatus, coleta, new Date().toISOString());
    if (e.tipo === 'atualiza') {
      const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      for (const [k, v] of Object.entries(e.campos)) update[`coletaUber.${k}`] = v;
      if (trackingUrl) update['coletaUber.trackingUrl'] = trackingUrl;
      tx.update(ref, update);
    } else if (e.tipo === 'cancelada') {
      tx.update(ref, { coletaUber: FieldValue.delete(), 'avisos.coleta': FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
    }
    return e;
  });
  if (efeito.tipo !== 'nada') {
    if (efeito.tipo === 'atualiza' && efeito.aviso) await avisarCliente(ref.id, efeito.aviso);
    if (efeito.push) {
      const orderId = String(snap.docs[0].get('orderId') ?? '');
      await notifySeller({ title: `Troca #${orderId.slice(-8).toUpperCase()}`, body: efeito.push, url: '/painel/trocas', data: { orderId, event: 'return_pickup' } });
    }
  }
  return true;
}
