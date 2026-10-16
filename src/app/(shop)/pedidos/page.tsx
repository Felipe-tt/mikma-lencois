import { redirect } from 'next/navigation';

// Lista antiga de pedidos, duplicada de /conta/pedidos (que tem paginação,
// tratamento de erro e "Pagar agora"). Fica só o redirecionamento pra
// links antigos; o detalhe /pedidos/[orderId] continua aqui.
export default function PedidosRedirect() {
  redirect('/conta/pedidos');
}
