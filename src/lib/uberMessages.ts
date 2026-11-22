/**
 * Aviso para a equipe quando a corrida da Uber Direct muda de status. Nem
 * todo status vira notificação, só os que pedem atenção ou ação (chegou para
 * coletar, terminou, ou deu problema): "pickup_complete" e "dropoff" ficam
 * só no histórico, para não empilhar push no celular a cada passo da corrida.
 *
 * Um switch, e não uma tabela de funções consultada pelo status: o status
 * vem do webhook da Uber, e chamar uma função escolhida por um texto de fora
 * é o que o CodeQL acusa (chamada dinâmica sem validação). Status que não
 * está aqui não vira aviso, nem nome herdado como "constructor".
 */
export function uberPushMessage(status: string, itemsSummary: string): { title: string; body: string } | null {
  switch (status) {
    case 'pickup':
      return { title: 'Motoboy a caminho da loja 🛵', body: `Uber Direct já está indo buscar: ${itemsSummary}. Deixa separado!` };
    case 'delivered':
      return { title: 'Entrega concluída ✅', body: `${itemsSummary} foi entregue pelo Uber Direct.` };
    case 'canceled':
      return { title: 'Entrega Uber Direct cancelada ⚠️', body: `Precisa despachar de novo: ${itemsSummary}` };
    case 'returned':
      return { title: 'Pacote devolvido pelo Uber Direct ⚠️', body: `${itemsSummary} voltou pra loja, confira o pedido.` };
    default:
      return null;
  }
}
