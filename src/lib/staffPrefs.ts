import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

/**
 * Preferências de UI por staff — persistidas no Firestore em
 * `users/{uid}.staffPrefs`, chaveadas pelo UID do Firebase Auth. Como o UID
 * é o mesmo independente de navegador/dispositivo (ao contrário de
 * localStorage, que é local à combinação navegador+máquina), a preferência
 * "segue" a pessoa pra qualquer lugar que ela logar.
 *
 * `users/{uid}` já existe e é gravável pelo próprio dono (isSelf) desde que
 * o campo `role` não mude — ver firestore.rules — então não precisa de
 * coleção nova nem regra nova.
 */
export interface StaffPrefs {
  lastYarnCount?: string;
}

export async function getStaffPrefs(uid: string): Promise<StaffPrefs> {
  const snap = await getDoc(doc(db, 'users', uid));
  return (snap.exists() ? snap.data().staffPrefs : undefined) ?? {};
}

export async function setStaffPref<K extends keyof StaffPrefs>(
  uid: string,
  key: K,
  value: StaffPrefs[K]
): Promise<void> {
  // Usa dot-notation no campo em vez de aninhar o objeto: com merge:true o
  // Firestore substitui mapas aninhados inteiros, então {staffPrefs:{x:1}}
  // apagaria outras chaves já salvas dentro de staffPrefs. Dot-notation faz
  // merge de verdade só naquele campo específico.
  await setDoc(doc(db, 'users', uid), { [`staffPrefs.${key}`]: value }, { merge: true });
}
