# ADR-005 — PostgreSQL para dados e MinIO/S3 para objetos

- Status: Aceito
- Data: 13/08/2026

## Contexto

O sistema precisa armazenar dados relacionais/transacionais e também logos, imagens, exports e anexos.

## Decisão

Utilizar:

```text
PostgreSQL
→ dados relacionais

MinIO/S3
→ objetos/arquivos
```

Na infraestrutura inicial serão reutilizadas as stacks existentes, com database, usuário, bucket e credenciais dedicadas ao Witiquetas.

## Consequências

- backend deve ser stateless quanto a arquivos;
- nenhum arquivo persistente depende do filesystem efêmero do container;
- volume Docker não é considerado backup;
- secrets root não serão usados pela aplicação;
- backups de PostgreSQL e MinIO devem possuir estratégia independente.
