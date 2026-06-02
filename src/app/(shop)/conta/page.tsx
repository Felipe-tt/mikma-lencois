import { redirect } from 'next/navigation';

// /conta redireciona para /conta/pedidos
export default function ContaPage() {
  redirect('/conta/pedidos');
}
