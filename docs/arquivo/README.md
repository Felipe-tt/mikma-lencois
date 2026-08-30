# Arquivo

Documentos e scripts de migrações/tarefas ja concluidas, guardados
so como referencia historica. Nada aqui e usado pelo app em producao
nem pelo CI.

- `migracao-app-hosting.md` - migracao do Firebase Hosting classico
  para o App Hosting (concluida, dominio mikma.com.br confirmado
  funcionando).
- `backup-apphosting.sh` - script usado antes de apagar o backend de
  teste durante a migracao acima.
- `migrate-secrets-to-secretmanager.sh` - script usado pra migrar as
  variaveis de ambiente pro Secret Manager na mesma migracao.
