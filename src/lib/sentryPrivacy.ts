// O que o Sentry pode coletar além do erro em si (stack trace e contexto):
// nada. A partir do Sentry 11 o padrão é coletar cabeçalhos, cookies, corpo
// das requisições, query string e usuário, que aqui podem ter dados de
// pagamento, endereço e CPF. Antes era o sendDefaultPii: false.
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
};
