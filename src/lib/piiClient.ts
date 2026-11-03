
/**
 * CPF e telefone ficam criptografados no banco (ver lib/piiCrypto.ts): o
 * navegador lê e grava pela API, nunca direto no Firestore.
 */
export interface Pii { cpf: string; phone: string }

/** Qualquer usuário logado (Firebase ou o do AuthContext). */
type Signed = { getIdToken(): Promise<string> };

async function call(user: Signed, path: string, init: RequestInit = {}): Promise<Response> {
  const token = await user.getIdToken();
  return fetch(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
}

/** CPF e telefone do próprio perfil (vazios se não houver). */
export async function fetchMyPii(user: Signed): Promise<Pii> {
  const res = await call(user, '/api/user/pii');
  if (!res.ok) throw new Error('pii');
  return res.json();
}

/** Grava CPF e/ou telefone do próprio perfil. Lança com a mensagem do servidor. */
export async function saveMyPii(user: Signed, values: Partial<Pii>): Promise<void> {
  const res = await call(user, '/api/user/pii', { method: 'PUT', body: JSON.stringify(values) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Não foi possível salvar.');
}

/** CPF e telefone de um cliente (só equipe). */
export async function fetchCustomerPii(user: Signed, uid: string): Promise<Pii> {
  const res = await call(user, `/api/painel/clientes/${encodeURIComponent(uid)}/pii`);
  if (!res.ok) throw new Error('pii');
  return res.json();
}
