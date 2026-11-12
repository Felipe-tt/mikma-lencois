import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { sendEmail } from '@/lib/email';
import { buildTrocaEmail, type AvisoTroca } from '@/lib/email/returnEmails';
import { CONTACT_EMAIL } from '@/lib/email/layout';
import { getSettings } from '@/lib/settings';
import type { ReturnRequest } from '@/types';

type Devolucao = ReturnRequest & {
  reversa?: { codigoObjeto: string; validade: string };
  devolverPor?: 'correios' | 'uber' | 'loja';
  coletaUber?: { trackingUrl?: string };
  motivoRecusa?: string;
  avisos?: Partial<Record<AvisoTroca, string>>;
};

/** Qual aviso o status atual da troca pede (null = nenhum). */
export function avisoDoStatus(d: Pick<Devolucao, 'status'> & { recebidaEm?: string }): AvisoTroca | null {
  // Entregue no balcão: a equipe marca no painel e o cliente recebe o "chegou".
  if (d.status === 'aprovada' && d.recebidaEm) return 'chegou';
  return d.status === 'aprovada' || d.status === 'recusada' || d.status === 'concluida' ? d.status : null;
}

/**
 * Manda ao cliente o e-mail da troca (aprovada, código dos Correios,
 * entregador da Uber a caminho, chegou, recusada, concluída). Uma vez por tipo: marca `avisos.<tipo>` numa
 * transação antes de enviar, então clique duplo ou duas abas não mandam
 * dois e-mails. Nunca lança; devolve o que aconteceu.
 */
export async function avisarCliente(returnId: string, kind: AvisoTroca): Promise<'enviado' | 'ja-avisado' | 'sem-email' | 'erro'> {
  const ref = adminDb.collection('returns').doc(returnId);
  let marcado = false;
  try {
    const d = await adminDb.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const cur = { id: snap.id, ...snap.data() } as Devolucao;
      if (cur.avisos?.[kind]) return null;
      tx.update(ref, { [`avisos.${kind}`]: new Date().toISOString() });
      return cur;
    });
    if (!d) return 'ja-avisado';
    marcado = true;
    const user = (await adminDb.collection('users').doc(d.userId).get()).data() as { email?: string; name?: string } | undefined;
    const order = (await adminDb.collection('orders').doc(d.orderId).get()).data() as { customerEmail?: string; customerName?: string } | undefined;
    const to = user?.email || order?.customerEmail;
    if (!to) return 'sem-email';
    const name = (user?.name || order?.customerName || d.customerName || '').split(' ')[0] || 'cliente';
    let enderecoLoja: string | undefined;
    if (d.devolverPor === 'loja') {
      const s = await getSettings().catch(() => null);
      enderecoLoja = s ? [`${s.storeAddress ?? ''}${s.storeNumber ? `, ${s.storeNumber}` : ''}`, s.storeNeighborhood, s.storeCity].filter(Boolean).join(', ') : undefined;
    }
    const mail = buildTrocaEmail({
      kind, type: d.type, orderId: d.orderId, name, reversa: d.reversa,
      devolverPor: d.devolverPor, enderecoLoja, coletaUrl: d.coletaUber?.trackingUrl, motivoRecusa: d.motivoRecusa,
    });
    await sendEmail({ to, ...mail, from: 'noreply', replyTo: CONTACT_EMAIL });
    return 'enviado';
  } catch (err) {
    console.error('[trocas] aviso ao cliente falhou', kind, err instanceof Error ? err.message : err);
    // Libera para tentar de novo no próximo clique.
    if (marcado) await ref.update({ [`avisos.${kind}`]: FieldValue.delete() }).catch(() => {});
    return 'erro';
  }
}
