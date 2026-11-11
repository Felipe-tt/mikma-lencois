import { test, expect, type APIRequestContext, type Browser, type Locator, type Page } from '@playwright/test';
import { addToCart, charges, goToPayment, login, payPix, prepare, staffLogin } from './helpers';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { db, emptyCart, forgetPasskeys, readOrder } from './db';

/**
 * Venda pelos Correios do começo ao fim, com o contrato e o Melhor Envio
 * simulados (e2e/mocks): o cliente vê o frete do contrato, paga, o pedido
 * guarda o serviço e o valor certos, a loja separa, gera a etiqueta, pede a
 * coleta e confirma o despacho com o código de rastreio, e o cliente
 * acompanha e confirma que recebeu.
 *
 * Preços dos simuladores: contrato PAC R$ 21,90 (5 dias) e SEDEX R$ 31,27
 * (1 dia); Melhor Envio PAC R$ 27,50, SEDEX R$ 41,80 e Jadlog R$ 29,90.
 */
const SENHA = 'senha-e2e-123';

// Cada teste entra no painel com uma conta de equipe própria (e2e/seed.mjs):
// o login cria uma passkey, e o limite é 10 por conta a cada 10 minutos.
let equipe = 0;
async function staffPanel(browser: Browser) {
  const email = `equipe${(equipe++ % 6) + 1}@e2e.mikma`;
  await forgetPasskeys(email);
  const staff = await browser.newContext();
  await prepare(staff);
  const panel = await staff.newPage();
  await staffLogin(panel, email, SENHA);
  return { staff, panel };
}
const JOGO_KING = { id: 'p3', cents: 39990 };
const reais = (cents: number) => new RegExp(`R\\$\\s?${(cents / 100).toFixed(2).replace('.', ',')}`);

/** Gera o PIX e devolve o pedido e a cobrança criada na AbacatePay simulada. */
async function payWithPix(page: Page, payPixButton: Locator) {
  await page.getByRole('radio', { name: /PIX/ }).first().check();
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/payment/create-pix') && r.request().method() === 'POST'),
    payPixButton.click(),
  ]);
  expect(response.status(), 'resposta do servidor ao gerar o PIX').toBe(200);
  const { orderId } = await response.json() as { orderId: string };
  await expect(page.getByText('Pague com PIX').first()).toBeVisible();
  // Pela referência do pedido, não "a última cobrança": numa segunda tentativa
  // do teste a loja devolve o mesmo PIX, sem criar outra cobrança.
  await expect.poll(async () => (await charges()).some(c => c.externalId === orderId)).toBe(true);
  return { orderId, charge: (await charges()).find(c => c.externalId === orderId)! };
}

/** Muda o objeto no rastreio simulado dos Correios. */
function setRastreio(code: string, situacao: 'postado' | 'entregue') {
  const file = process.env.E2E_CORREIOS_STATE!;
  const state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8') || '{}') : {};
  writeFileSync(file, JSON.stringify({ ...state, [code]: situacao }));
}

/** Roda a rotina que acompanha o rastreio (o Worker chama a cada 30 min). */
async function runRastreio(request: APIRequestContext) {
  const res = await request.get('/api/cron/correios-rastreio', { headers: { 'x-cron-secret': 'e2e_cron_secret_0123456789' } });
  expect(res.status()).toBe(200);
  return res.json() as Promise<{ checked: number; shipped: number; delivered: number; errors: number }>;
}

/** Pré-postagens que a loja mandou aos Correios simulados (e2e/mocks/correios.mjs). */
function correiosLog(): Array<{ id?: string; codigoObjeto?: string; body?: Record<string, unknown>; cancelada?: string }> {
  const file = process.env.E2E_CORREIOS_LOG;
  if (!file || !existsSync(file)) return [];
  return readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
}

/**
 * Loja: separa o pedido, gera a etiqueta pelo contrato (com coleta, ou sem e
 * depois de cancelar uma), imprime e confirma o despacho com o código que a
 * etiqueta trouxe. Devolve o código de rastreio.
 */
async function dispatch(browser: Browser, orderId: string, servico: string, opts: { cancelarAntes: boolean; confirmar: boolean }) {
  const { staff, panel } = await staffPanel(browser);
  await panel.goto(`/painel/pedidos/${orderId}`);
  await panel.getByRole('button', { name: 'Comecei a separar o pedido' }).click();
  await expect(panel.getByText('Pedido sendo separado')).toBeVisible();
  await expect(panel.getByText('Envio escolhido pelo cliente').locator('xpath=..')).toContainText(servico);

  const code = panel.getByRole('textbox', { name: 'Código de rastreio' });
  const confirm = panel.getByRole('button', { name: 'Confirmar despacho' });
  // Sem etiqueta ainda, nada para confirmar.
  await expect(code).toHaveValue('');
  await expect(confirm).toBeDisabled();

  await panel.getByRole('button', { name: 'Gerar etiqueta e pedir coleta' }).click();
  await expect(panel.getByText('Coleta pedida: os Correios passam na loja para buscar.')).toBeVisible();
  let pre = (await readOrder(orderId)).delivery?.prePostagem;
  expect(pre).toMatchObject({ coleta: true });

  if (opts.cancelarAntes) {
    // Cancela e gera de novo, agora sem coleta (levar à agência).
    await panel.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await panel.getByRole('button', { name: 'Cancelar etiqueta' }).click();
    await expect(panel.getByRole('button', { name: 'Gerar etiqueta e pedir coleta' })).toBeVisible();
    await expect(code).toHaveValue('');
    expect(correiosLog().some(e => e.cancelada === pre!.id)).toBe(true);
    await panel.getByRole('button', { name: /Só gerar a etiqueta/ }).click();
    await expect(panel.getByText('Sem coleta: leve o pacote a uma agência.')).toBeVisible();
    pre = (await readOrder(orderId)).delivery?.prePostagem;
    expect(pre).toMatchObject({ coleta: false });
  }

  // O código da etiqueta já entra no campo do despacho.
  await expect(code).toHaveValue(pre!.codigoObjeto!);
  const sent = correiosLog().find(e => e.id === pre!.id)?.body;
  expect(sent).toMatchObject({
    remetente: { cpfCnpj: '05338341000195', endereco: { cep: '89010100', logradouro: 'Rua da Fábrica', numero: '100', cidade: 'Blumenau', uf: 'SC' } },
    destinatario: { endereco: { cep: '01310100', cidade: 'São Paulo', uf: 'SP' } },
    solicitarColeta: opts.cancelarAntes ? 'N' : 'S',
    itensDeclaracaoConteudo: [{ conteudo: 'Jogo de Cama King Malha Cinza', quantidade: '1', valor: '399.90' }],
  });

  // Imprimir baixa o PDF da etiqueta (e abre numa aba nova; o navegador
  // sem tela do CI não mostra PDF, então confere a resposta no caminho).
  let label = { status: 0, type: '', start: '' };
  await panel.route(`**/api/painel/pedidos/${orderId}/etiqueta`, async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const response = await route.fetch();
    const body = await response.body();
    label = { status: response.status(), type: response.headers()['content-type'] ?? '', start: body.subarray(0, 5).toString() };
    await route.fulfill({ response, body });
  });
  await panel.getByRole('button', { name: 'Imprimir etiqueta' }).click();
  await expect.poll(() => label.status).toBe(200);
  expect(label).toEqual({ status: 200, type: 'application/pdf', start: '%PDF-' });
  await expect(panel.getByText(/Não foi possível|Sem conexão|Os Correios recusaram/)).toHaveCount(0);
  for (const p of staff.pages()) if (p !== panel) await p.close();

  await expect(confirm).toBeEnabled();
  if (opts.confirmar) {
    await confirm.click();
    await panel.getByRole('button', { name: 'Já postei, confirmar' }).click();
    await expect.poll(async () => (await readOrder(orderId)).status).toBe('shipped');
  }
  await staff.close();
  return pre!.codigoObjeto!;
}

test.beforeEach(async ({ context }) => { await prepare(context); });

test('página do produto: frete e prazo do contrato dos Correios', async ({ page }) => {
  await page.goto(`/produtos/${JOGO_KING.id}`);
  await page.getByRole('textbox', { name: 'CEP para calcular o frete' }).fill('01310-100');
  await page.getByRole('button', { name: 'Calcular', exact: true }).click();
  const row = (label: string) => page.getByText(label, { exact: false }).locator('xpath=ancestor::div[2]').first();
  await expect(row('Correios PAC')).toContainText(reais(2190));
  await expect(row('Correios PAC')).toContainText('5 dias úteis');
  await expect(row('Correios SEDEX')).toContainText(reais(3127));
  await expect(row('Correios SEDEX')).toContainText('1 dia útil');
  // Com a data: "chega até sex., 14/11".
  await expect(row('Correios PAC')).toContainText(/chega até \S+ \d{2}\/\d{2}/);
});

test('rotina do rastreio só roda com o segredo', async ({ request }) => {
  expect((await request.get('/api/cron/correios-rastreio')).status()).toBe(401);
});

test('monitor: o servidor informa se consegue cotar pelo contrato', async ({ request }) => {
  // É o que a rotina correios-cws.yml confere no site publicado depois de cada deploy.
  const headers = { 'x-cron-secret': 'e2e_cron_secret_0123456789' };
  const checked = await (await request.get('/api/cron/health?correios=1', { headers })).json();
  expect(checked.correios).toMatchObject({ configured: true, token: true, pacCents: 2190, sedexCents: 3127, etiqueta: [] });
  expect(checked.correios).toHaveProperty('rastreioAt');
  // O monitor de saúde (de 10 em 10 minutos) não passa o parâmetro e não consulta os Correios.
  const plain = await (await request.get('/api/cron/health', { headers })).json();
  expect(plain.ok).toBe(true);
  expect(plain.correios).toBeUndefined();
  expect((await request.get('/api/cron/health?correios=1')).status()).toBe(401);
});

const CASOS = [
  { nome: 'PAC', email: 'pac@e2e.mikma', carrier: 'correios_pac', cents: 2190, dias: 5, adulterar: false },
  { nome: 'SEDEX', email: 'sedex@e2e.mikma', carrier: 'correios_sedex', cents: 3127, dias: 1, adulterar: true },
] as const;

for (const c of CASOS) {
  test(`compra por ${c.nome}: frete do contrato, pagamento, despacho com rastreio e entrega`, async ({ page, browser, baseURL, request }) => {
    test.setTimeout(240_000);
    await emptyCart(c.email);
    await login(page, c.email, SENHA);
    await addToCart(page, JOGO_KING.id);
    const payPixButton = await goToPayment(page);

    await test.step('checkout mostra PAC e SEDEX com o preço do contrato', async () => {
      const options = page.getByRole('radiogroup', { name: 'Opção de entrega' });
      await expect(options.getByRole('radio', { name: /Correios PAC/ })).toContainText(reais(2190));
      await expect(options.getByRole('radio', { name: /Correios SEDEX/ })).toContainText(reais(3127));
      // A Jadlog segue vindo do Melhor Envio; São Paulo não tem retirada na loja.
      await expect(options.getByRole('radio', { name: /Jadlog Package/ })).toContainText(reais(2990));
      await expect(options.getByRole('radio', { name: /Retirar na loja/ })).toHaveCount(0);
      const chosen = options.getByRole('radio', { name: new RegExp(`Correios ${c.nome}`) });
      await chosen.click();
      await expect(chosen).toHaveAttribute('aria-checked', 'true');
      await expect(payPixButton).toContainText(reais(JOGO_KING.cents + c.cents));
    });

    if (c.adulterar) {
      // O navegador manda o frete por 1 centavo: o servidor recalcula e ignora.
      await page.route('**/api/payment/create-pix', async route => {
        const body = route.request().postDataJSON();
        body.shipping.priceCents = 1;
        await route.continue({ postData: JSON.stringify(body) });
      });
    }

    const { orderId, charge } = await payWithPix(page, payPixButton);

    await test.step('pedido guarda o serviço e o frete do contrato', async () => {
      expect(charge.amount, 'valor cobrado no PIX').toBe(JOGO_KING.cents + c.cents);
      const order = await readOrder(orderId);
      expect(order.selectedShipping).toMatchObject({ carrier: c.carrier, priceCents: c.cents, estimatedDays: c.dias });
      expect(order.delivery).toMatchObject({ carrier: c.carrier, priceCents: c.cents, realPriceCents: c.cents });
    });

    await test.step('pagamento confirmado', async () => {
      const paid = await payPix(baseURL!, charge.id, orderId, charge.amount);
      expect(paid.status).toBe(200);
      await expect(page.getByText('Pagamento confirmado').first()).toBeVisible();
      expect((await readOrder(orderId)).status).toBe('paid');
    });

    let codigo = '';
    if (!c.adulterar) {
      await test.step('loja gera a etiqueta com coleta; os Correios coletam e o pedido vira Enviado sozinho', async () => {
        codigo = await dispatch(browser, orderId, `Correios ${c.nome}`, { cancelarAntes: false, confirmar: false });
        // Etiqueta só emitida: a rotina não mexe no pedido.
        expect(await runRastreio(request)).toMatchObject({ shipped: 0, errors: 0 });
        expect((await readOrder(orderId)).status).toBe('preparing');
        setRastreio(codigo, 'postado');
        expect(await runRastreio(request)).toMatchObject({ shipped: 1, errors: 0 });
        const order = await readOrder(orderId);
        expect(order.status).toBe('shipped');
        expect(order.delivery?.trackingCode).toBe(codigo);
        expect(order.delivery?.shippingCostCents).toBe(c.cents);
        expect(order.timeline?.some(t => t.status === 'shipped' && t.note === 'Recebido pelos Correios')).toBe(true);
      });

      await test.step('cliente acompanha o rastreio dos Correios; entregue, o pedido fecha sozinho', async () => {
        await page.goto(`/pedidos/${orderId}`);
        await expect(page.getByText(codigo).first()).toBeVisible();
        await expect(page.getByText('Objeto em transferência - por favor aguarde').first()).toBeVisible();
        await expect(page.getByText('Etiqueta emitida')).toHaveCount(0);
        await expect(page.getByText(/Previsão de entrega:/).first()).toBeVisible();
        setRastreio(codigo, 'entregue');
        expect(await runRastreio(request)).toMatchObject({ delivered: 1, errors: 0 });
        expect((await readOrder(orderId)).status).toBe('delivered');
        // Rodar de novo não mexe em nada.
        expect(await runRastreio(request)).toMatchObject({ shipped: 0, delivered: 0, errors: 0 });
        // A rodada fica registrada para a checagem diária ver que a rotina está viva.
        const health = await (await request.get('/api/cron/health?correios=1', { headers: { 'x-cron-secret': 'e2e_cron_secret_0123456789' } })).json();
        expect(Date.now() - Date.parse(health.correios.rastreioAt)).toBeLessThan(60_000);
      });
      return;
    }

    await test.step('loja troca a etiqueta, leva à agência e confirma o despacho no painel', async () => {
      codigo = await dispatch(browser, orderId, `Correios ${c.nome}`, { cancelarAntes: true, confirmar: true });
      const order = await readOrder(orderId);
      expect(order.delivery?.trackingCode).toBe(codigo);
      // O custo do envio entra no caixa de frete pelo valor do contrato.
      expect(order.delivery?.shippingCostCents).toBe(c.cents);
    });

    await test.step('cliente vê o rastreio e confirma que recebeu', async () => {
      await page.goto(`/pedidos/${orderId}`);
      await expect(page.getByText(codigo).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'Rastrear' }).first()).toHaveAttribute('href', new RegExp(`rastreamento\\.correios\\.com\\.br.*${codigo}`));
      page.once('dialog', d => d.accept());
      await page.getByRole('button', { name: 'Já recebi meu pedido' }).click();
      await expect.poll(async () => (await readOrder(orderId)).status).toBe('delivered');
    });
  });
}

test('pedido cancelado com etiqueta: a etiqueta é cancelada nos Correios', async ({ page, browser, baseURL }) => {
  test.setTimeout(240_000);
  const email = 'cancela@e2e.mikma';
  await emptyCart(email);
  await login(page, email, SENHA);
  await addToCart(page, JOGO_KING.id);
  const payPixButton = await goToPayment(page);
  await page.getByRole('radiogroup', { name: 'Opção de entrega' }).getByRole('radio', { name: /Correios PAC/ }).click();
  const { orderId, charge } = await payWithPix(page, payPixButton);
  expect((await payPix(baseURL!, charge.id, orderId, charge.amount)).status).toBe(200);

  const { staff, panel } = await staffPanel(browser);
  await panel.goto(`/painel/pedidos/${orderId}`);
  await panel.getByRole('button', { name: 'Comecei a separar o pedido' }).click();
  await panel.getByRole('button', { name: 'Gerar etiqueta e pedir coleta' }).click();
  await expect(panel.getByText('Coleta pedida: os Correios passam na loja para buscar.')).toBeVisible();
  const pre = (await readOrder(orderId)).delivery!.prePostagem!;

  // Nota de separação: com a etiqueta oficial, não imprime uma segunda
  // etiqueta caseira e explica o próximo passo.
  await panel.goto(`/painel/pedidos/${orderId}/etiqueta`);
  await expect(panel.getByText('Antes de despachar')).toBeVisible();
  await expect(panel.getByText(new RegExp(`etiqueta dos Correios \\(${pre.codigoObjeto}\\)`))).toBeVisible();
  await expect(panel.getByText(/recorte a caixa abaixo/)).toHaveCount(0);
  await expect(panel.getByText('Declaração de Conteúdo', { exact: true }).first()).toBeVisible();
  await panel.goto(`/painel/pedidos/${orderId}`);

  await panel.getByRole('button', { name: 'Cancelar este pedido' }).click();
  await panel.getByRole('button', { name: 'Cancelar pedido' }).click();
  await expect.poll(async () => (await readOrder(orderId)).status).toBe('cancelled');
  // A etiqueta é cancelada logo depois de o pedido virar cancelado.
  await expect.poll(() => correiosLog().some(e => e.cancelada === pre.id)).toBe(true);
  await expect(panel.getByText(/os Correios não cancelaram a etiqueta/)).toHaveCount(0);
  await staff.close();
});

test('lote: etiquetas do dia geradas de uma vez e impressas num PDF só', async ({ page, browser, baseURL }) => {
  test.setTimeout(300_000);
  const email = 'lote@e2e.mikma';
  await login(page, email, SENHA);
  const orderIds: string[] = [];
  for (const servico of ['PAC', 'SEDEX']) {
    await emptyCart(email);
    await addToCart(page, JOGO_KING.id);
    const payPixButton = await goToPayment(page);
    await page.getByRole('radiogroup', { name: 'Opção de entrega' }).getByRole('radio', { name: new RegExp(`Correios ${servico}`) }).click();
    const { orderId, charge } = await payWithPix(page, payPixButton);
    expect((await payPix(baseURL!, charge.id, orderId, charge.amount)).status).toBe(200);
    orderIds.push(orderId);
  }

  const { staff, panel } = await staffPanel(browser);
  for (const id of orderIds) {
    await panel.goto(`/painel/pedidos/${id}`);
    await panel.getByRole('button', { name: 'Comecei a separar o pedido' }).click();
    await expect(panel.getByText('Pedido sendo separado')).toBeVisible();
  }

  await panel.goto('/painel/pedidos');
  const bar = panel.getByRole('region', { name: 'Etiquetas dos Correios' });
  await expect(bar).toContainText('sem etiqueta');
  await bar.getByRole('button', { name: /^Gerar \d+ etiquetas? e pedir coleta$/ }).click();
  await expect(bar.getByRole('status')).toContainText('e coleta pedida aos Correios');
  const pres = await Promise.all(orderIds.map(async id => (await readOrder(id)).delivery?.prePostagem));
  expect(pres.every(p => p?.codigoObjeto && p.coleta)).toBe(true);
  const sent = correiosLog().filter(e => pres.some(p => p?.id === e.id));
  expect(sent.map(e => e.body?.codigoServico).sort()).toEqual(['03220', '03298']);

  let label = { status: 0, type: '' };
  await panel.route('**/api/painel/etiquetas?pedidos=*', async route => {
    const response = await route.fetch();
    label = { status: response.status(), type: response.headers()['content-type'] ?? '' };
    expect(new URL(route.request().url()).searchParams.get('pedidos')?.split(',')).toEqual(expect.arrayContaining(orderIds));
    await route.fulfill({ response });
  });
  await expect(bar).toContainText('todos com etiqueta');
  await bar.getByRole('button', { name: /^Imprimir \d+ etiquetas?$/ }).click();
  await expect.poll(() => label.status).toBe(200);
  expect(label.type).toBe('application/pdf');
  await staff.close();
});

test('troca: o cliente pede pelo pedido, a loja aprova e gera o código dos Correios, o pacote volta', async ({ page, browser, request }) => {
  test.setTimeout(240_000);
  // Pedido entregue, direto no banco (a compra já é testada acima).
  const user = (await db().collection('users').where('email', '==', 'devolve@e2e.mikma').limit(1).get()).docs[0];
  const orderRef = await db().collection('orders').add({
    userId: user.id, status: 'delivered', customerName: 'Gabriela Torres', customerEmail: 'devolve@e2e.mikma',
    items: [{ productId: 'p3', productName: 'Jogo de Cama King Malha Cinza', sku: 'p3_v1', variant: { id: 'v1', size: 'king', fabric: 'Malha', colorName: 'Cinza' }, quantity: 1, unitPrice: 39990 }],
    address: user.get('address'), totalCents: 42180, delivery: { carrier: 'correios_pac', priceCents: 2190, deliveredAt: new Date().toISOString() },
    payment: { method: 'pix', txId: 't', paidAt: new Date().toISOString() }, createdAt: new Date().toISOString(),
  });

  // Cliente pede a troca no próprio pedido.
  await login(page, 'devolve@e2e.mikma', SENHA);
  await page.goto(`/pedidos/${orderRef.id}`);
  const pedir = page.getByRole('button', { name: /Pedir troca ou devolução/ });
  await expect(pedir).toContainText('Desistiu? Sem custo até');
  await pedir.click();
  const form = page.getByRole('region', { name: 'Pedir troca ou devolução' });
  await form.getByRole('button', { name: 'Enviar pedido' }).click();
  await expect(form.getByRole('alert')).toContainText('Conte em poucas palavras');
  await form.getByRole('textbox').fill('O tamanho king ficou grande, quero o queen.');
  await form.getByRole('button', { name: 'Enviar pedido' }).click();
  await expect(page.getByText('Recebemos seu pedido. A loja responde em até 1 dia útil.')).toBeVisible();
  const ret = (await db().collection('returns').where('orderId', '==', orderRef.id).get()).docs[0];
  expect(ret.data()).toMatchObject({ status: 'solicitada', type: 'troca', createdBy: 'cliente', userId: user.id, items: [{ sku: 'p3_v1', quantity: 1 }] });

  // Loja aprova e gera o código de devolução.
  const { staff, panel } = await staffPanel(browser);
  await panel.goto('/painel/trocas');
  await panel.getByRole('button', { name: 'Aprovar' }).first().click();
  await panel.getByRole('button', { name: 'Gerar código de devolução (Correios)' }).click();
  await expect(panel.getByText('Código de devolução dos Correios')).toBeVisible();
  const reversa = (await ret.ref.get()).get('reversa') as { id: string; codigoObjeto: string; validade: string };
  expect(reversa.codigoObjeto).toMatch(/^LR\d{9}BR$/);
  const sent = correiosLog().find(e => e.id === reversa.id)?.body;
  expect(sent).toMatchObject({
    codigoServico: '03301', logisticaReversa: 'S',
    remetente: { cpfCnpj: '93541134780', email: 'devolve@e2e.mikma', endereco: { cep: '01310100' } },
    destinatario: { cpfCnpj: '05338341000195', endereco: { cep: '89010100' } },
    itensDeclaracaoConteudo: [{ conteudo: 'Jogo de Cama King Malha Cinza', quantidade: '1', valor: '399.90' }],
  });

  // O cliente vê o código no pedido, na hora.
  await expect(page.getByText(reversa.codigoObjeto)).toBeVisible();
  await expect(page.getByText(/Leve o pacote a qualquer agência dos Correios até/)).toBeVisible();

  // O cliente posta e o pacote chega na loja: a rotina do rastreio avisa.
  setRastreio(reversa.codigoObjeto, 'entregue');
  expect(await runRastreio(request)).toMatchObject({ returned: 1, errors: 0 });
  await expect(panel.getByText(/O pacote chegou na loja em/)).toBeVisible();
  await expect(page.getByText('O pacote chegou na loja. Estamos conferindo e já te avisamos.')).toBeVisible();
  await staff.close();
});

test('troca recusada: o cliente pode pedir de novo pelo pedido', async ({ page }) => {
  test.setTimeout(120_000);
  const user = (await db().collection('users').where('email', '==', 'devolve@e2e.mikma').limit(1).get()).docs[0];
  const item = { productId: 'p3', productName: 'Jogo de Cama King Malha Cinza', sku: 'p3_v1', variant: { id: 'v1', size: 'king', fabric: 'Malha', colorName: 'Cinza' }, quantity: 1, unitPrice: 39990 };
  const orderRef = await db().collection('orders').add({
    userId: user.id, status: 'delivered', customerName: 'Gabriela Torres', customerEmail: 'devolve@e2e.mikma',
    items: [item], address: user.get('address'), totalCents: 42180, delivery: { carrier: 'correios_pac', priceCents: 2190, deliveredAt: new Date(Date.now() - 20 * 86_400_000).toISOString() },
    payment: { method: 'pix', txId: 't', paidAt: new Date().toISOString() }, createdAt: new Date().toISOString(),
  });
  await db().collection('returns').add({
    orderId: orderRef.id, userId: user.id, type: 'troca', reason: 'Primeiro pedido, sem foto.', items: [item],
    status: 'recusada', restocked: false, createdAt: new Date(Date.now() - 86_400_000).toISOString(), createdBy: 'cliente',
  });

  await login(page, 'devolve@e2e.mikma', SENHA);
  await page.goto(`/pedidos/${orderRef.id}`);
  await expect(page.getByText('Não foi aprovado. Se tiver dúvida, fale com a loja.')).toBeVisible();
  await page.getByRole('button', { name: 'Fazer um novo pedido' }).click();
  const form = page.getByRole('region', { name: 'Pedir troca ou devolução' });
  // Entregue há 20 dias: devolução só até 7, então só sobra a troca.
  await expect(form.getByRole('radio', { name: 'Devolver' })).toHaveCount(0);
  await expect(form.getByText(/A devolução vale até 7 dias depois da entrega/)).toBeVisible();
  await form.getByRole('textbox').fill('Mando foto da costura aberta pelo WhatsApp.');
  await form.getByRole('button', { name: 'Enviar pedido' }).click();
  await expect(page.getByText('Recebemos seu pedido. A loja responde em até 1 dia útil.')).toBeVisible();
  const status = (await db().collection('returns').where('orderId', '==', orderRef.id).get()).docs.map(d => d.get('status')).sort();
  expect(status).toEqual(['recusada', 'solicitada']);
});

test('Correios fora do ar: o Melhor Envio cobre PAC e SEDEX e a venda acontece', async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  const email = 'sem-correios@e2e.mikma';
  await emptyCart(email);
  await login(page, email, SENHA);
  await addToCart(page, JOGO_KING.id);
  const payPixButton = await goToPayment(page);

  const options = page.getByRole('radiogroup', { name: 'Opção de entrega' });
  const pac = options.getByRole('radio', { name: /Correios PAC/ });
  await expect(pac).toContainText(reais(2750));
  await expect(options.getByRole('radio', { name: /Correios SEDEX/ })).toContainText(reais(4180));
  await pac.click();
  await expect(pac).toHaveAttribute('aria-checked', 'true');

  const { orderId, charge } = await payWithPix(page, payPixButton);
  expect(charge.amount, 'valor cobrado no PIX').toBe(JOGO_KING.cents + 2750);
  const order = await readOrder(orderId);
  expect(order.selectedShipping).toMatchObject({ carrier: 'correios_pac', priceCents: 2750, estimatedDays: 7 });

  const paid = await payPix(baseURL!, charge.id, orderId, charge.amount);
  expect(paid.status).toBe(200);
  await expect(page.getByText('Pagamento confirmado').first()).toBeVisible();
});

test('cartão: o pedido leva o serviço e o frete do contrato', async ({ page }) => {
  test.setTimeout(180_000);
  const email = 'cartao@e2e.mikma';
  await emptyCart(email);
  await login(page, email, SENHA);
  await addToCart(page, JOGO_KING.id);
  await goToPayment(page);

  const sedex = page.getByRole('radiogroup', { name: 'Opção de entrega' }).getByRole('radio', { name: /Correios SEDEX/ });
  await expect(sedex).toContainText(reais(3127));
  await sedex.click();
  await expect(sedex).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: /Cartão de crédito/ }).click();
  const payCard = page.getByRole('button', { name: /Pagar .* com cartão/ }).first();
  await expect(payCard).toBeVisible();

  // Sem cartão no próprio site nos testes: a loja manda para a página de
  // pagamento da AbacatePay (simulada aqui por uma página em branco). A
  // resposta do servidor é lida no caminho: depois de sair da página o
  // navegador não guarda mais o corpo dela.
  await page.route('https://abacatepay.example/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>pagamento</p>' }));
  let created: { status: number; orderId?: string } = { status: 0 };
  await page.route('**/api/payment/create-checkout', async route => {
    const response = await route.fetch();
    created = { status: response.status(), ...(await response.json().catch(() => ({}))) };
    await route.fulfill({ response });
  });
  await payCard.click();
  await page.waitForURL(/abacatepay\.example/);
  expect(created.status, 'resposta do servidor ao criar o pagamento').toBe(200);
  const orderId = created.orderId!;

  const order = await readOrder(orderId);
  expect(order.selectedShipping).toMatchObject({ carrier: 'correios_sedex', priceCents: 3127, estimatedDays: 1 });
  expect(order.delivery).toMatchObject({ carrier: 'correios_sedex', priceCents: 3127, realPriceCents: 3127 });
  expect(order.shippingCents).toBe(3127);
  // Produto mais frete; a taxa do cartão, quando repassada, entra por cima.
  expect(order.totalCents).toBeGreaterThanOrEqual(JOGO_KING.cents + 3127);
});
