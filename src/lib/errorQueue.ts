// Fila de erros do navegador até o Sentry carregar (ver
// instrumentation-client.ts). Não importa o SDK, então pode ser usada em
// qualquer lugar sem trazer o Sentry pro carregamento da página.
let send: ((err: unknown) => void) | null = null;
const queue: unknown[] = [];

export function reportError(err: unknown) {
  if (send) send(err);
  else if (queue.length < 20) queue.push(err);
}

/** Chamado quando o Sentry inicia: manda o que estava na fila. */
export function flushErrors(to: (err: unknown) => void) {
  send = to;
  for (const err of queue.splice(0)) to(err);
}
