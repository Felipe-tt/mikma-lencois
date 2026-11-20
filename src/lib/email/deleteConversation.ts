import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import type { StoredFiles } from '@/lib/storageFiles';

const PAGE = 400;

/**
 * Apaga uma conversa do atendimento inteira: as mensagens e os anexos que o
 * cliente mandou (email-attachments/<id do e-mail>/ no Storage). Antes os
 * anexos ficavam no Storage depois de a conversa sumir do painel.
 * Devolve quantas mensagens foram apagadas.
 */
export async function deleteConversation(db: Firestore, files: StoredFiles, convRef: DocumentReference): Promise<number> {
  let deleted = 0;
  for (;;) {
    const msgs = await convRef.collection('messages').limit(PAGE).get();
    if (msgs.empty) break;
    await Promise.all(msgs.docs
      .filter(d => ((d.data().attachments as unknown[] | undefined) ?? []).length > 0)
      .map(d => files.deletePrefix(`email-attachments/${d.id}/`)));
    const batch = db.batch();
    msgs.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    deleted += msgs.size;
    if (msgs.size < PAGE) break;
  }
  await convRef.delete();
  return deleted;
}
