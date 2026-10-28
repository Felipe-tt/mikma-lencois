/**
 * AbacatePay simulada para os testes ponta a ponta. Responde as rotas da
 * API v2 que a loja usa, guarda as cobranças em memória e expõe /__e2e/*
 * para o teste marcar uma cobrança como paga e listar o que foi criado.
 */
import http from 'node:http';
import { randomBytes } from 'node:crypto';

const charges = new Map();
const ok = (res, data) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ data, error: null, success: true })); };
const fail = (res, code, error) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify({ data: null, error, success: false })); };
const id = prefix => `${prefix}${randomBytes(6).toString('hex')}`;

export function startAbacatePayMock(port = 4010) {
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const body = raw ? JSON.parse(raw) : {};
      const p = url.pathname.replace(/^\/v2/, '');

      if (p === '/__e2e/charges') return ok(res, [...charges.values()]);
      if (p === '/__e2e/pay') {
        const c = charges.get(url.searchParams.get('id'));
        if (!c) return fail(res, 404, 'not found');
        c.status = 'PAID';
        return ok(res, c);
      }
      if (!String(req.headers.authorization ?? '').startsWith('Bearer ')) return fail(res, 401, 'missing key');

      if (p === '/transparents/create') {
        const d = body.data ?? {};
        if (body.method === 'CARD') {
          const c = { id: id('card_'), status: 'APPROVED', amount: d.amount, metadata: d.metadata ?? {}, brand: 'VISA', lastFour: '4242' };
          charges.set(c.id, c);
          return ok(res, c);
        }
        const c = {
          id: id('pix_char_'), status: 'PENDING', amount: d.amount, externalId: d.externalId,
          brCode: '00020126580014BR.GOV.BCB.PIX0136e2e-mikma-teste5204000053039865802BR5913MIKMA TESTE6008BLUMENAU62070503***6304E2E0',
          brCodeBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
          expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        };
        charges.set(c.id, c);
        return ok(res, c);
      }
      if (p === '/transparents/check' || p === '/transparents/get') {
        const c = charges.get(url.searchParams.get('id'));
        return c ? ok(res, c) : fail(res, 404, 'not found');
      }
      if (p === '/transparents/simulate-payment') {
        const c = charges.get(url.searchParams.get('id') ?? body.id);
        if (!c) return fail(res, 404, 'not found');
        c.status = 'PAID';
        return ok(res, c);
      }
      if (p === '/products/create') return ok(res, { id: id('prod_'), ...body });
      if (p === '/checkouts/create') {
        const c = { id: id('bill_'), status: 'PENDING', url: 'https://abacatepay.example/pay', externalId: body.externalId };
        charges.set(c.id, c);
        return ok(res, c);
      }
      if (p === '/checkouts/get') {
        const c = charges.get(url.searchParams.get('id'));
        return c ? ok(res, c) : fail(res, 404, 'not found');
      }
      if (p === '/customers/create') return ok(res, { id: id('cust_') });
      return fail(res, 404, `rota simulada inexistente: ${p}`);
    });
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}
