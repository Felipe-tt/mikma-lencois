# Catálogo do WhatsApp → site

Ferramentas pra trazer o catálogo do WhatsApp Business (`wa.me/c/554799964885`)
para o site, já que o WhatsApp não tem um botão nativo de "exportar como CSV".

## Por que isso é necessário

O link `https://wa.me/c/554799964885` só funciona dentro do app/WhatsApp Web —
ele não expõe os produtos numa página estática que dê pra baixar direto. Mas o
catálogo **é público** dentro do protocolo do WhatsApp: qualquer conta consegue
consultar o catálogo de qualquer número de WhatsApp Business. É esse mecanismo
que ferramentas como 2Chat e Whapi usam por baixo dos panos pra oferecer
"exportar catálogo como CSV".

Aqui usamos a mesma ideia com a biblioteca [Baileys](https://github.com/WhiskeySockets/Baileys)
(open source), sem precisar pagar nenhuma ferramenta terceira.

## Fluxo completo

```
1) export-catalog.mjs        →  catalogo-whatsapp/catalogo.csv (+ imagens)
2) você edita o CSV no Excel →  preenche categoria/tamanho/tecido/cor/peso
3) import-to-firestore.mjs   →  cria os produtos no site (Firestore + Storage)
```

### Passo 1 — Instalar

```bash
cd scripts/whatsapp-catalog
npm install
```

### Passo 2 — Exportar o catálogo do WhatsApp

```bash
npm run export -- --number=554799964885
```

Vai aparecer um **QR code no terminal**. Escaneie com **qualquer WhatsApp**
(não precisa ser o número da loja — pode ser o seu celular pessoal) em:

> WhatsApp → Configurações → Dispositivos conectados → Conectar um dispositivo

Da segunda vez em diante não pede QR de novo (a sessão fica em `auth_info/`,
que é ignorada pelo Git de propósito — **nunca** suba essa pasta, ela equivale
a estar logado na conta).

Ao terminar, você vai ter:

```
catalogo-whatsapp/
├── catalogo.csv      ← abra no Excel/Google Sheets
├── catalogo.json     ← os mesmos dados em JSON
├── raw-debug.json    ← amostra "crua" pra debug, se algo sair estranho
└── images/           ← fotos dos produtos já baixadas
```

### Passo 3 — Revisar o CSV

O WhatsApp só sabe nome, descrição, preço e fotos. Ele **não** sabe tamanho
(solteiro/casal/queen/king), tecido, cor ou peso — essas colunas saem vazias
de propósito e você precisa preencher antes de importar:

| Coluna     | Valores aceitos                                                          |
|------------|----------------------------------------------------------------------------|
| `categoria`| `Lençóis`, `Fronhas`, `Edredons`, `Travesseiros`, `Jogos de cama`, `Outros` |
| `tamanho`  | `solteiro`, `casal`, `queen`, `king`                                       |
| `tecido`   | `Algodão`, `Malha`, `Percal 200 fios`, `Percal 300 fios`, `Cetim`           |
| `cor_hex`  | opcional, ex: `#1a1a2e`                                                   |
| `cor_nome` | opcional, ex: `Azul marinho`                                              |
| `peso_kg`  | obrigatório, ex: `0.8` (usado no cálculo de frete)                       |
| `ativo`    | `sim` ou `não` — se ficar em branco, vira `sim`                          |

Tem que ser exatamente esses valores (com acento e tudo) — são os mesmos
usados em `src/components/seller/ProductForm.tsx`.

> **Sobre variações:** o catálogo do WhatsApp não distingue "o mesmo produto
> em tamanhos diferentes" — cada item do catálogo entra como **um produto
> com uma variação**. Se a loja vende o mesmo lençol em vários tamanhos como
> itens separados no WhatsApp, dá pra juntar isso manualmente depois em
> `/painel/produtos`, editando o produto e adicionando as variações que
> faltam.

### Passo 4 — Importar pro site

Sempre rode primeiro em modo de simulação:

```bash
npm run import -- --file=./catalogo-whatsapp/catalogo.csv --dry-run
```

Isso mostra o que seria criado, sem gravar nada. Quando estiver tudo certo:

```bash
npm run import -- --file=./catalogo-whatsapp/catalogo.csv
```

O script:
- sobe as imagens da pasta `images/` pro Firebase Storage;
- cria cada produto no Firestore (coleção `products`), igual ao que
  `/painel/produtos/novo` faria;
- cria o registro de estoque (coleção `inventory`) **com quantidade 0** —
  ajuste isso em `/painel/produtos` antes de divulgar o produto;
- pula (sem travar) linhas com erro e mostra o motivo, pra você corrigir e
  reimportar só aquelas.

Precisa das mesmas variáveis de ambiente do site (lidas automaticamente do
`.env.local` na raiz do repo): `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
`FIREBASE_PRIVATE_KEY`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`.

## Avisos importantes

- **Baileys não é oficial/afiliado ao WhatsApp.** É uma biblioteca que fala o
  protocolo do WhatsApp Web por engenharia reversa. Funciona bem, mas pode
  quebrar se o WhatsApp mudar algo — se isso acontecer, normalmente uma
  atualização da lib (`npm update baileys`) resolve.
- **Não rode isso em excesso/automatize sem necessidade** — é uma ferramenta
  pra rodar manualmente quando for atualizar o catálogo, não um serviço
  contínuo. Uso abusivo pode levar a bloqueio da conta usada para conectar.
- A pasta `auth_info/` e os arquivos em `catalogo-whatsapp/` ficam de fora do
  Git (`.gitignore` já configurado) — o primeiro por segurança (é literalmente
  sua sessão logada), o segundo porque são dados do negócio, não código.
- Se `npm run export` não encontrar nenhum produto, confira se o número está
  certo (com DDI+DDD, só números) e dê uma olhada em `raw-debug.json` — os
  nomes de campo do protocolo mudam ocasionalmente entre versões da lib.
