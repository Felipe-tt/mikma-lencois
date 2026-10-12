/**
 * Rótulo de "quem fez" para registros que ficam em coleções de leitura pública
 * (ex.: inventory.history, lido pelo storefront para mostrar estoque).
 *
 * NUNCA usar o e-mail aqui: o histórico é legível por qualquer visitante, e o
 * e-mail da equipe viraria alvo de phishing. Usa o nome de exibição, ou
 * "Equipe" se não houver.
 */
export function staffActor(user: { displayName?: string | null } | null | undefined): string {
  const name = (user?.displayName ?? '').replace(/[<>@]/g, '').trim().slice(0, 40);
  return name || 'Equipe';
}
