import { test, expect, type Page } from '@playwright/test';
import { charges, login, payPix, prepare, staffLogin } from './helpers';

/**
 * Compra pelos Correios do começo ao fim, com a API do contrato simulada
 * (e2e/mocks/correios.mjs): o cliente vê o preço do contrato, paga, o pedido
 * guarda o serviço e o frete certos, a loja separa e confirma o despacho com
 * o código de rastreio, e o cliente vê o código no pedido.
 */

const FIRESTORE = `http://${process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'}/v1/projects/demo-mikma/databases/(default)/documents`;

/** Lê um pedido direto do emulador (o "owner" ignora as regras). */
async function readOrder(id: string) {
  const res = await fetch(`${FIRESTORE}/orders/${id}`, { headers: { Authorization: 'Bearer owner' } });
  const doc = await res.json();
  const f = doc.fields ?? {};
  const map = (v?: { mapValue?: { fields?: Record<string, { stringValue?: string; integerValue?: string }> } }) =>
    Object.fromEntries(Object.entries(v?.mapValue?.fields ?? {}).map(([k, x]) => [k, x.stringValue ?? (x.integerValue !== undefined ? Number(x.integerValue) : undefined)]));
  return { status: f.status?.stringValue, selectedShipping: map(f.selectedShipping), delivery: map(f.delivery) };
}

async function goToPayment(page: Page) {
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: 'Finalizar compra' })).toBeVisible();
  const payPixButton = page.getByRole('button', { name: /Pagar .* com PIX/ }).first();
  for (let i = 0; i < 40 && !(await payPixButton.isVisible()); i++) {
    const next = page.getByRole('button', { name: /^Continuar para/ }).first();
    if (await next.isVisible()) await next.click({ timeout: 1_500 }).catch(() => {});
    else await page.waitForTimeout(500);
  }
  await expect(payPixButton).toBeVisible();
  return payPixButton;
}

const CASOS = [
  { nome: 'PAC', user: 'pac@e2e.mikma', carrier: 'correios_pac', label: /Correios PAC/, cents: 2190, preco: 'R$ 21,90', dias: 5, codigo: 'AB123456789BR' },
  { nome: 'SEDEX', user: 'sedex@e2e.mikma', carrier: 'correios_sedex', label: /Correios SEDEX/, cents: 3127, preco: 'R$ 31,27', dias: 1, codigo: 'SX987654321BR' },
] as const;

test.beforeEach(async ({ context }) => { await prepare(context); });

for (const c of CASOS) {
  test(`compra por ${c.nome}: preço do contrato, pagamento, despacho com rastreio`, async ({ page, browser, baseURL }) => {
    test.setTimeout(240_000);
    await login(page, c.user, 'senha-e2e-123');

    // Página do produto: a cotação já mostra o preço e o prazo do contrato.
    await page.goto('/produtos/p3');
    await page.getByRole('button', { name: /^Adicionar ao carrinho$/ }).first().click();
    await expect(page.getByText(/adicionado|no carrinho/i).first()).toBeVisible();

    // Checkout: escolhe o serviço e confere preço e prazo na opção.
    const payPixButton = await goToPayment(page);
    const option = page.getByRole('radio', { name: c.label }).first();
    await expect(option).toBeVisible();
    await expect(option).toContainText(c.preco);
    await option.click();
    await expect(option).toHaveAttribute('aria-checked', 'true');
    // Sem retirada na loja para São Paulo.
    await expect(page.getByRole('radio', { name: /Retirar na loja/ })).toHaveCount(0);

    await page.getByRole('radio', { name: /PIX/ }).first().check();
    const before = (await charges()).length;
    await payPixButton.click();
    await expect(page.getByText('Pague com PIX').first()).toBeVisible();
    await expect.poll(async () => (await charges()).length).toBeGreaterThan(before);
    const charge = (await charges()).at(-1)!;
    const orderId = charge.externalId!;

    // O servidor recalculou o frete pelo contrato e guardou o serviço certo.
    const created = await readOrder(orderId);
    expect(created.selectedShipping).toMatchObject({ carrier: c.carrier, priceCents: c.cents, estimatedDays: c.dias });
    expect(created.delivery).toMatchObject({ carrier: c.carrier, priceCents: c.cents });
    expect(charge.amount).toBe(39990 + c.cents);

    const paid = await payPix(baseURL!, charge.id, orderId, charge.amount);
    expect(paid.status).toBe(200);
    await expect(page.getByText('Pagamento confirmado').first()).toBeVisible();

    // Loja: separa, gera a etiqueta, pede a coleta e confirma com o código.
    const staff = await browser.newContext();
    await prepare(staff);
    const panel = await staff.newPage();
    await staffLogin(panel, 'admin@e2e.mikma', 'senha-e2e-123');
    await panel.goto(`/painel/pedidos/${orderId}`);
    await panel.getByRole('button', { name: 'Comecei a separar o pedido' }).click();
    await expect(panel.getByText('Pedido sendo separado')).toBeVisible();
    await expect(panel.getByText(`Correios ${c.nome}`, { exact: true })).toBeVisible();

    const code = panel.getByRole('textbox', { name: 'Código de rastreio' });
    const confirm = panel.getByRole('button', { name: 'Confirmar despacho' });
    await code.fill('123');
    await expect(confirm).toBeDisabled();
    await code.fill(c.codigo.toLowerCase());
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await panel.getByRole('button', { name: 'Já postei, confirmar' }).click();
    await expect.poll(async () => (await readOrder(orderId)).status, { timeout: 20_000 }).toBe('shipped');
    expect((await readOrder(orderId)).delivery.trackingCode).toBe(c.codigo);
    await staff.close();

    // Cliente: vê o código de rastreio no pedido.
    await page.goto(`/pedidos/${orderId}`);
    await expect(page.getByText(c.codigo).first()).toBeVisible();
  });
}
