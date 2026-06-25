# Configuração do Melhor Envio

## Variáveis de ambiente necessárias (.env.local)

```env
# Melhor Envio — obrigatório para gerar etiquetas
MELHOR_ENVIO_TOKEN=seu_token_aqui
MELHOR_ENVIO_SANDBOX=false  # true para testes

# Segredo do webhook (qualquer string aleatória)
MELHOR_ENVIO_WEBHOOK_SECRET=string_aleatoria_segura
```

## Como obter o token

1. Acesse https://melhorenvio.com.br/painel/gerenciar/tokens
2. Clique em "Gerar token de acesso"
3. Selecione os escopos: `cart-read`, `cart-write`, `shipping-calculate`, `shipping-checkout`, `shipping-generate`, `shipping-print`, `shipping-tracking`
4. Copie o token e cole em `MELHOR_ENVIO_TOKEN`

## Configurar webhook de rastreio

1. No painel do Melhor Envio → Webhooks
2. URL: `https://mikma.com.br/api/shipping/webhook`
3. Método: POST
4. Header: `x-melhor-envio-secret: sua_string_do_env`

## Saldo no Melhor Envio

O sistema **debita saldo** da sua conta ME ao gerar cada etiqueta.
Mantenha saldo suficiente: https://melhorenvio.com.br/painel/saldo

## Fluxo de despacho

1. Pedido chega como `paid` → vendor clica "Comecei a separar" → vira `preparing`
2. Vendor escolhe transportadora (PAC, SEDEX, Jadlog Package, Jadlog Expresso)
3. Vendor clica "Gerar etiqueta e despachar" → sistema:
   - Cria envio no Melhor Envio
   - Debita saldo da conta ME
   - Gera etiqueta PDF
   - Abre PDF para impressão
   - Atualiza pedido para `shipped`
4. Vendor imprime etiqueta, cola na caixa e leva nos Correios/Jadlog
5. Melhor Envio envia webhooks conforme rastreio evolui → atualiza timeline automaticamente
