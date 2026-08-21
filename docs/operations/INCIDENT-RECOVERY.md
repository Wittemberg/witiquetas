# GUIA DE RECUPERAÇÃO DE INCIDENTES — WITIQUETAS

> **Manual Operacional para Engenheiros e Operadores de Infraestrutura**  
> *Objetivo:* Restaurar a operação do Witiquetas em menos de 5 minutos sem perdas de dados.

---

## 1. Identificar a Release Ativa e Anterior

Para consultar o estado atual das releases implantadas em produção:

1. Acesse o histórico de releases em `docs/releases/release-manifest.json` ou consulte a API de Health:
   ```bash
   curl -s https://witiquetas.wrtec.com.br/api/health
   ```
2. Inspecione o manifesto da release ativa:
   ```json
   {
     "commitSha": "aafd195be9ce9bc6049612db09189cc1e6516653",
     "previousStableSha": "eb3e046065f521ab7f56b23cbfc08d18d0675182",
     "createdAt": "2026-08-21T08:26:00Z"
   }
   ```

---

## 2. Procedimento de Rollback Instantâneo (Sem Rebuild)

Caso ocorra regressão visual, erro de JavaScript (`ReferenceError`, `TypeError`) ou falha em containers:

### Passo 1: Executar o Script de Rollback

**No Windows (PowerShell):**
```powershell
.\scripts\release\rollback-production.ps1 -TargetSHA "previous"
```

**No Linux / macOS (Bash):**
```bash
./scripts/release/rollback-production.sh previous
```

Se desejar retornar a um commit específico testado no passado:
```bash
./scripts/release/rollback-production.sh eb3e046065f521ab7f56b23cbfc08d18d0675182
```

### Passo 2: O que o Script Executa Automaticamente?
1. Valida que a imagem `ghcr.io/wittemberg/witiquetas-frontend:production-<TARGET_SHA>` existe no repositório.
2. Reaponta a tag mutável `stable` no GHCR para a imagem do `<TARGET_SHA>`.
3. Dispara o Webhook do Portainer / Docker Swarm para forçar o redeploy das tarefas da stack.
4. Executa healthcheck e smoke test em produção para confirmar a restauração.

---

## 3. Restauração de Banco de Dados (PostgreSQL Dump)

Caso o incidente envolva corrupção de schema por migração incompatível:

1. Listar os backups disponíveis no MinIO/S3 no bucket `witiquetas-backups`:
   ```bash
   aws s3 ls s3://witiquetas-backups/database/
   ```
2. Baixar o dump pré-deploy associado ao commit:
   ```bash
   aws s3 cp s3://witiquetas-backups/database/witiquetas-predeploy-20260821-082600-aafd195.dump ./restore.dump
   ```
3. Restaurar no PostgreSQL do Swarm:
   ```bash
   pg_restore -h localhost -U witiquetas -d witiquetas_db --clean --if-exists ./restore.dump
   ```

---

## 4. Validação Pós-Recuperação

Após o rollback ou restauração, valide obrigatoriamente:

1. **Backend Health:** `GET /api/health` ➔ `200 OK` (`status: "healthy"`).
2. **Frontend Dashboard:** Navegador ➔ Abrir Dashboard ➔ Confirmar cards e Design System intactos.
3. **Wizard ➔ Editor:** Dashboard ➔ Assistente ➔ Criar Etiqueta ➔ Confirmar abertura do Editor com 203 DPI.
