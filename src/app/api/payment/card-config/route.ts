import { NextResponse, connection } from 'next/server';
import { getSettings } from '@/lib/settings';

// Chave pública (pk_) do abacatepay.js, do mesmo ambiente da chave de API
// que o servidor usa para cobrar: token de um ambiente não vale no outro.
// Sem ela, o checkout segue com a página de pagamento da AbacatePay.
export async function GET() {
  await connection(); // na hora, não no build (o build não lê o banco)
  const settings = await getSettings();
  const sandbox = !!settings.abacatePaySandboxMode;
  const key = (sandbox ? process.env.ABACATEPAY_SANDBOX_PUBLIC_KEY : process.env.ABACATEPAY_PUBLIC_KEY) ?? '';
  return NextResponse.json(
    { publicKey: key.startsWith('pk_') ? key : null },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
