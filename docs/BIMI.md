# Logo no avatar do remetente (BIMI) — status e próximos passos

## O que já está pronto neste repositório
- `public/brand/logo-bimi.svg` — logo da Mikma (lua + ovelhinha) no formato exigido pelo
  padrão BIMI: SVG, 96×96px, fundo sólido preto, sem transparência, ~18KB (limite é 32KB).
  Gerado a partir de `public/apple-touch-icon.png`.
  Acessível publicamente em `https://mikma.com.br/brand/logo-bimi.svg` após o deploy.

## Pendências de DNS (Registro.br) — fazer agora
Endurecer o DMARC é pré-requisito tanto para o registro BIMI "self-asserted" (grátis,
Apple Mail/Yahoo) quanto para o CMC/VMC (Gmail) no futuro.

1. **Atualizar o registro TXT `_dmarc.mikma.com.br`** de:
   `v=DMARC1; p=none;`
   para:
   `v=DMARC1; p=quarantine; pct=100;`

   Seguro fazer agora porque o domínio só envia e-mail via Resend (SPF/DKIM já
   verificados — "Domain verified" no painel do Resend).

2. **Adicionar o registro TXT `default._bimi.mikma.com.br`** com o valor:
   `v=BIMI1; l=https://mikma.com.br/brand/logo-bimi.svg;`

   Isso já é suficiente para o logo aparecer no **Apple Mail e Yahoo/AOL**, sem custo,
   enquanto o Gmail (abaixo) ainda não está disponível.

## Gmail — bloqueado até completar 12 meses de uso público do logo
O Gmail só exibe o logo do remetente com um certificado:
- **VMC** (Verified Mark Certificate): exige marca registrada, ~US$1.200–1.500/ano.
- **CMC** (Common Mark Certificate): não exige marca registrada, mas exige comprovar
  uso público do logo por **12 meses**, incluindo estar arquivado no archive.org
  por esse período.

Decisão tomada (23/06/2026): esperar os 12 meses e pedir o CMC, sem custo de VMC/trademark.

**Data estimada para revisitar**: a partir de **23/06/2027** (12 meses após o domínio
ter sido verificado e o site posto no ar com o logo atual visível publicamente).
Antes de comprar o CMC, confirmar manualmente que `https://mikma.com.br` aparece no
archive.org com histórico de pelo menos 12 meses.

Quando chegar a hora: ver o guia oficial do Resend em
https://resend.com/docs/dashboard/domains/bimi — eles recomendam a DigiCert para emitir
o certificado.
