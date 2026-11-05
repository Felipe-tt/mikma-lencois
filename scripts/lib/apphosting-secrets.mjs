// Regras para um secret do apphosting.yaml funcionar no App Hosting. Sem
// elas o rollout falha com "Secret configurado incorretamente" depois do
// merge, como aconteceu com ABACATEPAY_SANDBOX_API_KEY no #377.

const COMPUTE = 'serviceAccount:firebase-app-hosting-compute@mikma-lencois.iam.gserviceaccount.com';
const AGENT = 'serviceAccount:service-915579306587@gcp-sa-firebaseapphosting.iam.gserviceaccount.com';

/** Permissões que os secrets que funcionam têm (conferidas no Secret Manager). */
export const REQUIRED_BINDINGS = [
  { role: 'roles/secretmanager.secretAccessor', member: COMPUTE },
  { role: 'roles/secretmanager.viewer', member: COMPUTE },
  { role: 'roles/secretmanager.secretVersionManager', member: AGENT },
];

/** Nomes dos secrets citados no apphosting.yaml (sem a versão, se houver "@"). */
export function secretNames(yamlText) {
  const names = new Set();
  for (const m of yamlText.matchAll(/^\s*secret:\s*["']?([A-Za-z0-9_-]+)(?:@[^\s"']+)?["']?\s*(?:#.*)?$/gm)) {
    names.add(m[1]);
  }
  return [...names];
}

/** Quais permissões obrigatórias faltam na política de IAM de um secret. */
export function missingBindings(policy) {
  const have = new Set();
  for (const b of policy?.bindings ?? []) for (const m of b.members ?? []) have.add(`${b.role} ${m}`);
  return REQUIRED_BINDINGS.filter(r => !have.has(`${r.role} ${r.member}`));
}
