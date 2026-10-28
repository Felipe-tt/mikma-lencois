/**
 * MTA-STS (RFC 8461): diz aos servidores de e-mail que entregar para
 * @mikma.com.br exige TLS com certificado válido do MX da Amazon SES.
 * Sem isso, alguém no meio do caminho pode rebaixar a conexão para texto
 * puro e ler ou trocar o e-mail. Servido em mta-sts.mikma.com.br.
 * O id em _mta-sts.mikma.com.br (DNS) muda quando esta política muda.
 */
export const POLICY = [
  'version: STSv1',
  'mode: enforce',
  'mx: inbound-smtp.sa-east-1.amazonaws.com',
  'max_age: 604800',
  '',
].join('\r\n');

const worker = {
  async fetch(req) {
    const { pathname } = new URL(req.url);
    if (pathname !== '/.well-known/mta-sts.txt') return new Response('Not found', { status: 404 });
    return new Response(POLICY, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
    });
  },
};

export default worker;
