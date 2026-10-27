// Ponto de entrada enxuto do Sentry pro navegador: importar só o que é
// usado deixa o empacotador cortar o resto do SDK (o import dinâmico do
// pacote inteiro trazia ~460 KB).
export { init, captureException } from '@sentry/nextjs';
