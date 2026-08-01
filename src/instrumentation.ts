// Sentry temporariamente desativado no runtime Node/servidor: a
// auto-instrumentacao de OpenTelemetry do @sentry/nextjs (acionada so
// por este arquivo importar o pacote, independente de config em
// next.config.mjs) nao carrega corretamente sob Turbopack no Next 16,
// derrubando o boot do Cloud Run com "Cannot find module
// 'require-in-the-middle-<hash>'". Reintegrar com calma depois de
// investigar a fundo (possivelmente aguardando correcao oficial do
// Sentry/Next para Turbopack, ou trocando para webpack no build).
export async function register() {
  // no-op por enquanto
}

export async function onRequestError() {
  // no-op por enquanto — erros de servidor nao serao reportados ao
  // Sentry ate reativarmos a integracao
}
