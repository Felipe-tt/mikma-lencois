import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/client'
import type { User } from '@/types'

const googleProvider = new GoogleAuthProvider()

// NOTA: login por e-mail/senha não passa mais por uma função helper aqui.
// O fluxo real é: POST /api/auth/login só para rate limiting, seguido de
// signInWithEmailAndPassword(auth, email, password) direto nos componentes
// (Firebase Auth é a fonte da verdade da senha) — ver src/app/(auth)/entrar,
// AuthModal, cadastro e redefinir-senha. Uma versão antiga desta função
// (loginWithEmail) documentava um fluxo com customToken que não existe
// mais e nunca era chamada por nenhum componente; foi removida.

export async function loginWithGoogle() {
  return signInWithPopup(auth, googleProvider)
}

export async function logout() {
  return signOut(auth)
}

export async function getCurrentUserProfile(uid: string): Promise<User | null> {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? (snap.data() as User) : null
}

export function onAuthChange(callback: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, callback)
}
