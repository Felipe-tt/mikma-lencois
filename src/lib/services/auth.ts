import {
  signInWithEmailAndPassword,
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

export async function loginWithEmail(email: string, password: string) {
  // Password is verified server-side (Argon2id). Here we just get the custom token.
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) {
    const { error } = await res.json()
    throw new Error(error || 'Credenciais inválidas')
  }

  const { customToken } = await res.json()
  const { signInWithCustomToken } = await import('firebase/auth')
  return signInWithCustomToken(auth, customToken)
}

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
