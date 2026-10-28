/**
 * Agenda das rotinas, avaliada a cada 5 minutos pelo Cron Trigger da
 * Cloudflare (o agendamento do GitHub Actions atrasa horas ou pula
 * execuções). Recebe o horário UTC agendado e devolve o que roda agora.
 */
export const JOBS = {
  expirarPedidos: '/api/cron/expire-orders', // a cada 15 min
  notasFiscais: '/api/cron/nfe',             // a cada 10 min
  avisoReposicao: '/api/cron/restock-requests', // de hora em hora
  estoqueBaixo: '/api/cron/low-stock',       // a cada 6 h
};

export function dueJobs(date) {
  const m = date.getUTCMinutes();
  const h = date.getUTCHours();
  const due = [];
  if (m % 15 === 0) due.push(JOBS.expirarPedidos);
  if (m % 10 === 0) due.push(JOBS.notasFiscais);
  if (m === 20) due.push(JOBS.avisoReposicao);
  if (m === 0 && h % 6 === 0) due.push(JOBS.estoqueBaixo);
  return due;
}

/** Saúde do site a cada 10 min, defasada das rotinas (minutos 5, 15, 25...). */
export const healthDue = date => date.getUTCMinutes() % 10 === 5;
