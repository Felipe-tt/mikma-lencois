# Mapeamento — Migração para Firebase App Hosting

> Levantamento do que precisa mudar neste projeto especificamente para sair do `frameworksBackend` (atual, congelado) para o Firebase App Hosting (sucessor oficial, com o novo Adapter API estabilizado a partir do Next.js 16.2).

## Status: já concluído

- Backend de teste criado: `mikma-lencois-test` (região `us-east4` — `southamerica-east1` não está disponível pro App Hosting ainda).
- Deploy contínuo conectado ao GitHub, branch `main`.
- `apphosting.yaml` com runtime config + variáveis mapeadas (2 removidas por não serem usadas de fato: `ANTHROPIC_API_KEY` e `ORS_API_KEY`, nenhuma delas tinha valor real configurado).
- Secrets migrados pro Cloud Secret Manager, com acesso concedido ao backend.
- **Next.js 16.2.12 testado com sucesso no App Hosting** (com Sentry ativo no servidor — o mesmo cenário que quebrou 4 vezes no `frameworksBackend` antigo). Confirmado visualmente por captura de tela: home, header, dark mode, carrinho, tudo renderizando certo.
- `deploy.yml`: removido o deploy pro hosting clássico (`--only hosting`). Firestore rules/indexes e Storage rules continuam sendo deployados por ali, já que são serviços independentes do hosting.

## O que só você consegue fazer a partir daqui

**Corte de domínio — o único passo que falta:**
1. No **Firebase Console → Hosting → App Hosting → mikma-lencois-test → Custom domains**, adicionar `mikma.com.br` e seguir as instruções pra apontar o DNS (a Firebase mostra os registros TXT/A/CNAME exatos a adicionar no seu registrador).
2. A propagação de DNS pode levar de minutos a algumas horas, dependendo do TTL atual.
3. **Recomendo manter os dois no ar em paralelo por um tempo**: o hosting clássico continua respondendo em `mikma-lencois.web.app` (ou domínio parecido) até você decidir desativar de vez — não precisa desligar nada às pressas.
4. Depois de confirmar que `mikma.com.br` está respondendo pelo App Hosting: os workflows `keep-warm.yml`, `expire-orders.yml`, `low-stock.yml` (que batem direto em `https://mikma.com.br/...`) continuam funcionando sem nenhuma mudança, já que só dependem da URL, não de qual sistema está atrás dela.

---

## 1. Configuração de hosting

**Hoje** (`firebase.json`):
```json
"hosting": {
  "source": ".",
  "frameworksBackend": {
    "region": "southamerica-east1",
    "memory": "512MiB", "cpu": 1, "concurrency": 40,
    "minInstances": 0, "maxInstances": 2, "timeoutSeconds": 120
  }
}
```

**App Hosting** usa um arquivo novo, `apphosting.yaml`, na raiz do projeto:
```yaml
runConfig:
  minInstances: 0
  maxInstances: 2
  concurrency: 40
  cpu: 1
  memoryMiB: 512
  # timeoutSeconds equivalente precisa ser confirmado no schema atual do apphosting.yaml
```
**Pendência:** confirmar se a região `southamerica-east1` é suportada pelo App Hosting (ele roda sobre Cloud Run, então provavelmente sim, mas isso é configurado na criação do *backend* pelo console/CLI, não no YAML — precisa verificar no momento de criar o backend).

---

## 2. Variáveis de ambiente e segredos — a mudança mais trabalhosa

**Hoje:** todas as ~35 variáveis (chaves de API, credenciais, etc.) vivem como **Secrets do GitHub Actions**, injetadas via `env:` no `deploy.yml` e escritas num `.env.production` gerado na hora do build.

**App Hosting:** não usa GitHub Secrets — variáveis vivem em:
- **Console do Firebase** (visível a qualquer um com acesso ao projeto — bom só para valores não-sensíveis, ex.: `NEXT_PUBLIC_APP_URL`), ou
- **`apphosting.yaml`** com referência ao **Cloud Secret Manager** para valores sensíveis (chaves de API, `FIREBASE_PRIVATE_KEY`, tokens):
  ```yaml
  env:
    - variable: RESEND_API_KEY
      secret: RESEND_API_KEY
    - variable: FIREBASE_PRIVATE_KEY
      secret: FIREBASE_PRIVATE_KEY
  ```

**Trabalho necessário:** recriar as ~35 secrets no Cloud Secret Manager (`firebase apphosting:secrets:set NOME`) e reescrever o bloco `env` do `apphosting.yaml` referenciando cada uma. É trabalho mecânico, mas seguro (cada secret precisa ser colada de novo — isso significa reunir os valores atuais, que hoje só existem dentro do GitHub Actions Secrets, ilegíveis depois de criados).

**Ponto de atenção específico deste projeto:** o passo atual do `deploy.yml` escapa `FIREBASE_PRIVATE_KEY` manualmente (troca quebra de linha real por `\n` literal, por causa de como `.env` é parseado linha a linha). Precisa confirmar como o Secret Manager armazena/entrega esse valor multi-linha — pode não precisar mais desse workaround, ou pode precisar de um equivalente.

---

## 3. Fluxo de CI/CD

**Hoje:** GitHub Actions próprio (`deploy.yml`) — `npm ci` → `npm test` → build → `firebase deploy`, com o deploy de fato restrito a push/dispatch na `main`.

**App Hosting tem dois modos:**
1. **Integração nativa com GitHub** (App do Firebase instalado no repo): todo push na branch configurada dispara rollout automático — **não passa pelos nossos testes automatizados nem pelo gate de mensagens de commit** a menos que a gente desenhe isso com cuidado.
2. **CLI/API manual**: `firebase deploy --only apphosting` (ou `apphosting:rollouts:create`) pode ser chamado de dentro do nosso próprio GitHub Actions, do jeito que já fazemos hoje.

**Recomendação:** usar a opção 2 — manter nosso `deploy.yml` como está (testes primeiro, deploy só se passar), trocando só os passos finais (`firebase deploy --only hosting` vira `firebase deploy --only apphosting`, ou o comando de rollout equivalente). Isso preserva o gate de qualidade que já existe, em vez de deixar o Firebase auto-deployar sem testar.

---

## 4. Pontos de atenção específicos do Next.js no App Hosting

- **Otimização de imagem vem desabilitada por padrão** (`images.unoptimized` precisa ser `false` explicitamente, ou usar loader customizado). O projeto já usa `next/image` com `remotePatterns` configurado em `next.config.mjs` — **precisa testar se as imagens de produto (Firebase Storage) continuam otimizadas** ou se algo precisa mudar aqui.
- **Cache de rotas com middleware é limitado hoje no App Hosting** ("deve melhorar com o tempo", segundo a doc). Isso importa bastante pra este projeto: o middleware roda em **toda rota não isenta** (checagem de manutenção). Precisa validar se o ISR das páginas de produto/home continua com bom cache-hit depois da migração, ou se isso piora.
- **Paths de URL com caracteres percent-encoded são decodificados pelo Cloud Run**, o que pode afetar parallel routes do Next — não identifiquei uso de parallel routes neste projeto, então risco baixo aqui.
- **Sentry:** o problema original (`require-in-the-middle` quebrando no empacotamento) era do *bundling antigo* via esbuild do `frameworksBackend`. O novo Adapter API foi feito justamente pra evitar esse tipo de bundling frágil — **vale reativar o Sentry no servidor como parte do teste da migração**, já que a causa raiz pode estar resolvida.

---

## 5. Domínio customizado

`mikma.com.br` está hoje conectado ao Firebase Hosting clássico. App Hosting tem seu próprio fluxo de conexão de domínio customizado — a migração precisa de um plano de corte:
1. Criar o backend do App Hosting com a URL padrão dele (`*.web.app` ou similar) primeiro.
2. Testar tudo nessa URL temporária.
3. Só depois reapontar `mikma.com.br` pro novo backend (janela de corte, idealmente em horário de baixo tráfego).

---

## 6. Cron jobs e workflows que dependem da URL do site

`.github/workflows/keep-warm.yml`, `expire-orders.yml`, `low-stock.yml` fazem requisições HTTP direto pra `https://mikma.com.br/...`. Enquanto o domínio não for reapontado (passo 5), esses continuam funcionando normalmente contra o site atual — só precisam ser revalidados depois do corte de domínio, não antes.

Separadamente: **`keep-warm.yml` existe pra mitigar cold start** — vale reavaliar se ainda faz sentido do jeito que está depois da migração (App Hosting pode ter característica de cold start diferente do `frameworksBackend`).

---

## 7. O que **não** deveria mudar

- Firestore, Storage, Auth — são serviços Firebase independentes de onde o Next.js roda; nenhuma regra (`firestore.rules`, `storage.rules`) precisa mudar.
- Toda a lógica de aplicação (rotas de API, middleware, componentes) — o Adapter API do Next.js foi desenhado exatamente pra não exigir mudança de código de aplicação, só de infraestrutura/deploy.
- O gate de mensagens de commit (`ci-checks.yml` / `repo-checks.sh`) — roda independente de onde o hosting está.

---

## Resumo do esforço

| Item | Esforço estimado |
|---|---|
| Recriar ~35 secrets no Secret Manager + `apphosting.yaml` | Alto (mecânico, mas trabalhoso e sensível — nenhum valor pode vazar/errar) |
| Adaptar `deploy.yml` pro comando de deploy do App Hosting | Baixo |
| Testar otimização de imagem | Médio (precisa validar visualmente) |
| Testar comportamento de cache com middleware | Médio-alto (é o ponto mais incerto — documentação já avisa limitação) |
| Reativar e validar Sentry server-side | Baixo (só testar se o bug sumiu) |
| Corte de domínio customizado | Médio (janela de corte, checklist de rollback) |

**Sugestão de sequência:** criar o backend do App Hosting em paralelo ao site atual (URL temporária, sem mexer no domínio), migrar as secrets, rodar o site inteiro nessa URL temporária por alguns dias validando cache/imagens/Sentry, e só então cortar o domínio. Isso permite abortar a qualquer momento sem downtime, já que o site atual continua no ar até o corte final.

---

*Nenhuma mudança foi aplicada ao projeto nesta etapa — este documento é só o levantamento pedido, para decisão e planejamento antes de qualquer execução.*
