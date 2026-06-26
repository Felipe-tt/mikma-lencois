# Configuração do Melhor Envio

## Variáveis de ambiente necessárias (.env.local)

```env
# Melhor Envio — obrigatório para todas as operações de frete
MELHOR_ENVIO_TOKEN=seu_token_aqui
MELHOR_ENVIO_SANDBOX=false  # true para testes no sandbox
```

## Como gerar o token

1. Acesse https://melhorenvio.com.br/painel/gerenciar/tokens
2. Clique em **Gerar token de acesso**
3. Selecione os seguintes escopos:
   - `cart-read` — verificar itens no carrinho ME
   - `cart-write` — adicionar envios ao carrinho ME
   - `shipping-calculate` — cotar fretes
   - `shipping-checkout` — comprar etiquetas (debita saldo)
   - `shipping-generate` — gerar etiquetas PDF
   - `shipping-print` — obter URL de impressão
   - `shipping-tracking` — consultar status de rastreio
   - `shipping-cancel` — cancelar etiquetas
   - `notifications-read` — necessário para receber webhooks
4. Copie o token e cole em `MELHOR_ENVIO_TOKEN` no `.env.local`

> ⚠️ O mesmo token é usado para assinar os webhooks via HMAC-SHA256.
> Não é necessária nenhuma variável extra para o webhook.

## Configurar webhook de rastreio automático

O webhook faz o status do pedido se atualizar automaticamente quando a
transportadora registra eventos (postado, em trânsito, entregue etc.).

### Passo a passo:

1. No painel do Melhor Envio → **Gerenciar → Webhooks** → **Novo Webhook**
2. Preencha:
   - **URL**: `https://mikma.com.br/api/shipping/webhook`
   - **Eventos**: marque todos os eventos de `order.*` disponíveis
3. Salve — o Melhor Envio vai fazer um ping de teste na URL (vai responder 200 ✅)
4. **Pronto!** A partir de agora, cada evento de rastreio atualiza o pedido automaticamente

> ⚠️ **Importante**: os webhooks só disparam para etiquetas geradas pelo
> mesmo aplicativo/token onde o webhook está cadastrado. Etiquetas criadas
> manualmente no site do ME ou com outro token não chegam aqui.

## Saldo no Melhor Envio

O sistema **debita saldo** ao gerar cada etiqueta (no checkout do carrinho ME).
Mantenha saldo suficiente: https://melhorenvio.com.br/painel/saldo

## Jadlog não aparece na cotação?

Jadlog geralmente **não vem habilitado por padrão** — diferente dos Correios.
Para ativar:

1. Acesse o painel do Melhor Envio → **Gerenciar → Transportadoras**
2. Localize Jadlog e clique em **Contratar** / **Ativar**
3. Após ativar, a próxima cotação já vai incluir os serviços Jadlog

Se Jadlog aparecer como contratado mas ainda não aparecer na cotação,
verifique os logs do servidor — o sistema registra o motivo exato do erro
que o Melhor Envio retornou por serviço.

## Fluxo completo de despacho

```
1. Pedido chega como "paid"
   ↓
2. Seller clica "Comecei a separar" → status: preparing
   ↓
3. Seller escolhe transportadora + clica "Gerar etiqueta"
   → Sistema: adiciona ao carrinho ME → checkout → gera etiqueta → abre PDF
   → Status: shipped
   ↓
4. Seller imprime, embala e leva nos Correios ou ponto Jadlog
   ↓
5. Melhor Envio envia webhooks conforme a entrega evolui
   → Timeline do pedido atualiza automaticamente: postado → em trânsito → entregue
```
