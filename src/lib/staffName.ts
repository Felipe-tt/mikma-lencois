import { adminDb } from '@/lib/firebase/admin';
import { staffActor } from '@/lib/staffActor';

/**
 * Nome de quem da equipe fez a ação, para o que o cliente consegue ler (o
 * histórico do pedido, a troca) ou o que é público (o status da manutenção).
 * Nunca o e-mail (ver staffActor). Sem nome no login, usa o do perfil.
 */
export async function staffName(decoded: { uid: string; name?: unknown }): Promise<string> {
  if (typeof decoded.name === 'string' && decoded.name.trim()) return staffActor({ displayName: decoded.name });
  try {
    const name = (await adminDb.collection('users').doc(decoded.uid).get()).data()?.name;
    return staffActor({ displayName: typeof name === 'string' ? name : null });
  } catch {
    // Só um rótulo: falha ao ler o perfil não pode travar a ação.
    return staffActor(null);
  }
}
