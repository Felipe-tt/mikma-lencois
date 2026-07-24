// Sentry temporariamente desativado (ver next.config.mjs) enquanto
// investigamos incompatibilidade com o empacotamento do Firebase
// Hosting para Cloud Run no Next 16. As chamadas Sentry.captureException
// espalhadas pelo código continuam existindo e não quebram nada — sem
// Sentry.init() rodar em algum lugar, elas apenas não fazem nada.
export async function register() {}

export function onRequestError() {}
