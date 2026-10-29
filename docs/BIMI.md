# Logo no avatar do remetente (BIMI), status e próximos passos

## O que já está pronto neste repositório
- `public/brand/logo-bimi.svg`, logo da Mikma (lua + ovelhinha) no formato exigido pelo
  padrão BIMI: SVG, 96×96px, fundo sólido preto, sem transparência, ~18KB (limite é 32KB).
  Gerado a partir de `public/apple-touch-icon.png`.
  Acessível publicamente em `https://mikma.com.br/brand/logo-bimi.svg` após o deploy.

## DNS (na Cloudflare)
O DNS do domínio fica na Cloudflare desde a migração da borda.

1. **DMARC endurecido** (pré-requisito do BIMI): o workflow
   **Domínio · DNSSEC, CAA, e-mail e HSTS** (`dominio-seguranca.yml`, opção "aplicar")
   passa o `_dmarc.mikma.com.br` de `p=none` para `p=quarantine`, com o DKIM da Resend.
   Seguro porque o domínio só envia e-mail pela Resend (SPF e DKIM verificados).

2. **Registro BIMI**: na Cloudflare → DNS, um TXT `default._bimi` com o valor
   `v=BIMI1; l=https://mikma.com.br/brand/logo-bimi.svg;`

   Isso já basta para o logo aparecer no **Apple Mail e no Yahoo/AOL**, sem custo,
   enquanto o Gmail (abaixo) ainda não está disponível.

## Gmail, bloqueado até completar 12 meses de uso público do logo
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
https://resend.com/docs/dashboard/domains/bimi, eles recomendam a DigiCert para emitir
o certificado.
