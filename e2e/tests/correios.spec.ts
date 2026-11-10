import { test, expect, type Browser, type Locator, type Page } from '@playwright/test';
import { addToCart, charges, goToPayment, login, payPix, prepare, staffLogin } from './helpers';
import { emptyCart, forgetPasskeys, readOrder } from './db';

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

/** Loja: separa o pedido e confirma o despacho com o código de rastreio. */
async function dispatch(browser: Browser, orderId: string, servico: string, codigo: string) {
  await forgetPasskeys('admin@e2e.mikma');
  const staff = await browser.newContext();
  await prepare(staff);
  const panel = await staff.newPage();
  await staffLogin(panel, 'admin@e2e.mikma', SENHA);
  await panel.goto(`/painel/pedidos/${orderId}`);
  await panel.getByRole('button', { name: 'Comecei a separar o pedido' }).click();
  await expect(panel.getByText('Pedido sendo separado')).toBeVisible();
  await expect(panel.getByText('Envio escolhido pelo cliente').locator('xpath=..')).toContainText(servico);

  // Código fora do formato dos Correios não deixa confirmar.
  const code = panel.getByRole('textbox', { name: 'Código de rastreio' });
  const confirm = panel.getByRole('button', { name: 'Confirmar despacho' });
  await code.fill('123');
  await expect(confirm).toBeDisabled();
  await code.fill(codigo.toLowerCase());
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await panel.getByRole('button', { name: 'Já postei, confirmar' }).click();
  await expect.poll(async () => (await readOrder(orderId)).status).toBe('shipped');
  await staff.close();
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
});

test('monitor: o servidor informa se consegue cotar pelo contrato', async ({ request }) => {
  // É o que a rotina correios-cws.yml confere no site publicado depois de cada deploy.
  const headers = { 'x-cron-secret': 'e2e_cron_secret_0123456789' };
  const checked = await (await request.get('/api/cron/health?correios=1', { headers })).json();
  expect(checked.correios).toEqual({ configured: true, token: true, pacCents: 2190, sedexCents: 3127 });
  // O monitor de saúde (de 10 em 10 minutos) não passa o parâmetro e não consulta os Correios.
  const plain = await (await request.get('/api/cron/health', { headers })).json();
  expect(plain.ok).toBe(true);
  expect(plain.correios).toBeUndefined();
  expect((await request.get('/api/cron/health?correios=1')).status()).toBe(401);
});

const CASOS = [
  { nome: 'PAC', email: 'pac@e2e.mikma', carrier: 'correios_pac', cents: 2190, dias: 5, codigo: 'AB123456789BR', adulterar: false },
  { nome: 'SEDEX', email: 'sedex@e2e.mikma', carrier: 'correios_sedex', cents: 3127, dias: 1, codigo: 'SX987654321BR', adulterar: true },
] as const;

for (const c of CASOS) {
  test(`compra por ${c.nome}: frete do contrato, pagamento, despacho com rastreio e entrega`, async ({ page, browser, baseURL }) => {
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

    await test.step('loja separa e confirma o despacho com o código de rastreio', async () => {
      await dispatch(browser, orderId, `Correios ${c.nome}`, c.codigo);
      const order = await readOrder(orderId);
      expect(order.delivery?.trackingCode).toBe(c.codigo);
      // O custo do envio entra no caixa de frete pelo valor do contrato.
      expect(order.delivery?.shippingCostCents).toBe(c.cents);
    });

    await test.step('cliente vê o rastreio e confirma que recebeu', async () => {
      await page.goto(`/pedidos/${orderId}`);
      await expect(page.getByText(c.codigo).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'Rastrear' }).first()).toHaveAttribute('href', new RegExp(`rastreamento\\.correios\\.com\\.br.*${c.codigo}`));
      page.once('dialog', d => d.accept());
      await page.getByRole('button', { name: 'Já recebi meu pedido' }).click();
      await expect.poll(async () => (await readOrder(orderId)).status).toBe('delivered');
    });
  });
}

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
