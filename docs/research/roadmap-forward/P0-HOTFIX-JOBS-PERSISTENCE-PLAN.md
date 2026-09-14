# P0 HOTFIX — AUDITORIA TÉCNICA E PLANO ARQUITETURAL: PERSISTÊNCIA DE JOBS & LEASES TRANACIONAIS

**Data:** 14/09/2026  
**Trilha:** P0 Hotfix / Estabilidade de Impressão e Concorrência  
**Status:** Auditado / Confirmado / STOP antes de Implementação Ampla  

---

## 1. Confirmação do P0 — Item 3: Perda de Jobs e Lotes em Restart do Backend

### 1.1 Evidência no Código Atual
No arquivo `apps/backend/src/routes/printJobs.ts`:
- **Linha 86:**
  ```ts
  const printJobsStore = new Map<string, PrintJobDTO>();
  ```
- **Linha 416:**
  ```ts
  export const printJobBatchesStore = new Map<string, PrintJobBatchDTO>();
  ```

### 1.2 Análise de Risco e Impacto Real
Apesar de existir a migração `004_create_print_job_batches_tables.sql` definindo tabelas no PostgreSQL para lotes (`print_job_batches` e `print_job_batch_items`), o arquivo de rotas `printJobs.ts` opera **100% sobre memória volátil** (`Map` em JavaScript do processo Node.js).

**Consequências Confirmadas:**
1. Qualquer reinício do backend (deploy, crash de runtime, reciclagem de container, reinício de PM2) limpa imediatamente todos os jobs pendentes, lotes em execução e histórico.
2. Agentes locais executando uma impressão física no momento do restart tentarão reportar o status da entrega via `PATCH /api/print-jobs/:id/status`. Como o job foi apagado da memória, a requisição receberá **404 Not Found**, deixando o Agente em estado zumbi/inconsistente e perdendo a telemetria do trabalho.

---

## 2. Confirmação do P0 — Item 4: Risco Real de Duplicate Physical Delivery

### 2.1 Evidência no Código Atual
No arquivo `apps/backend/src/routes/printJobs.ts`:
- Função `claimPendingJobsForAgent` (linhas 211–270):
  ```ts
  job.status = 'CLAIMED';
  job.claimedByAgentId = agent.id;
  job.leaseId = leaseId;
  job.attemptId = attemptId;
  job.attempts = attemptNumber;
  job.leaseExpiresAt = new Date(Date.now() + 60000).toISOString(); // 60s
  ```
- Verificação de expiração no `PATCH /:id/status` (linhas 337–341):
  ```ts
  if (job.leaseExpiresAt && new Date(job.leaseExpiresAt).getTime() < Date.now()) {
    return res.status(409).json({
      error: `Lease expirado em ${job.leaseExpiresAt}. O job não pode mais ser atualizado sob este lease.`,
    });
  }
  ```

### 2.2 Cenário de Duplicação Física em Produção
1. **Agente 1** reivindica o job `job-01` (`leaseId: L1`, `leaseExpiresAt = T + 60s`).
2. O Agente 1 conecta ao socket RAW TCP da impressora térmica. A impressora demora para responder (ou a rede sofre congestionamento temporário de 65s, ou o buffer do spooler enfileira).
3. O lease expira no backend (`T + 60s`).
4. O backend ou um operador/rotina reencaminha o job para `PENDING`.
5. **Agente 2** (ou o próprio Agente 1 em novo ciclo de poll) executa `GET /api/print-jobs/pending` e reivindica novamente `job-01` (`leaseId: L2`).
6. Enquanto isso, os bytes enviados pelo Agente 1 **chegam fisicamente à impressora e a etiqueta é impressa**.
7. O Agente 1 envia `PATCH /:id/status` com status `DELIVERED_TO_TRANSPORT` / `PRINTED`, mas o backend rejeita com **409 Conflict** ("Lease expirado").
8. O Agente 2 agora envia o payload para a impressora pela segunda vez.
9. **A impressora térmica cospe uma segunda etiqueta física idêntica**.

**Impacto:**
Em etiquetas de gôndola, etiquetas farmacêuticas, código de barras serializado e despacho de logística, uma duplicação física causa inventário fantasma, leituras duplicadas no checkout e erros de expedição.

---

## 3. Plano Arquitetural para Resolução Definitiva (PostgreSQL + Leases Transacionais)

Para resolver definitivamente sem improvisos, o sistema deve adotar persistência relacional transacional com bloqueio pessimista a nível de linha.

### 3.1 Schema Relacional Necessário (`print_jobs`)
```sql
CREATE TABLE IF NOT EXISTS print_jobs (
  id VARCHAR(64) PRIMARY KEY,
  company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  batch_id VARCHAR(64) REFERENCES print_job_batches(id) ON DELETE SET NULL,
  printer_id VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  language VARCHAR(16) NOT NULL,
  encoding VARCHAR(32) NOT NULL DEFAULT 'windows-1252',
  payload TEXT NOT NULL,
  payload_base64 TEXT NOT NULL,
  payload_bytes_length INTEGER NOT NULL,
  checksum_sha256 VARCHAR(64) NOT NULL,
  copies INTEGER NOT NULL DEFAULT 1,
  copy_strategy VARCHAR(32) NOT NULL DEFAULT 'TRANSPORT_REPEAT',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  claimed_by_agent_id VARCHAR(64),
  lease_id VARCHAR(64),
  attempt_id VARCHAR(64),
  claimed_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  delivered_to_transport_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  execution_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_print_jobs_tenant_status ON print_jobs (company_id, status);
CREATE INDEX IF NOT EXISTS idx_print_jobs_lease_expiry ON print_jobs (status, lease_expires_at);
```

### 3.2 Padrão de Concorrência Transacional (`FOR UPDATE SKIP LOCKED`)
O claim de jobs pelo Agente passa a ser executado dentro de uma transação PostgreSQL atômica:
```sql
BEGIN;

WITH jobs_to_claim AS (
  SELECT id FROM print_jobs
  WHERE company_id = $1
    AND status = 'PENDING'
    AND attempts < max_attempts
    AND (printer_id IN (SELECT id FROM printers WHERE company_id = $1 AND (agent_id IS NULL OR agent_id = $2)))
  ORDER BY created_at ASC
  LIMIT $3
  FOR UPDATE SKIP LOCKED
)
UPDATE print_jobs
SET status = 'CLAIMED',
    claimed_by_agent_id = $2,
    lease_id = $4,
    attempt_id = $5,
    attempts = attempts + 1,
    claimed_at = NOW(),
    lease_expires_at = NOW() + INTERVAL '60 seconds',
    updated_at = NOW()
FROM jobs_to_claim
WHERE print_jobs.id = jobs_to_claim.id
RETURNING print_jobs.*;

COMMIT;
```

### 3.3 Garantia Anti-Duplicação Física
1. **Heartbeat / Lease Extension:** O Agente deve poder estender o lease (`POST /api/print-jobs/:id/lease-renew`) se o transporte físico estiver em andamento.
2. **Tratamento de Expiração Sem Reentrega Automática:** Se um lease expirar, o job não volta para `PENDING` cegamente. Ele entra em `EXPIRED_LEASE`. Um processo de conciliação pergunta ao agente ou ao operador se os bytes saíram antes de qualquer re-envio.

---

## 4. Decisão: STOP Antes de Implementação Ampla

Conforme instrução expressa da governança do projeto:
- **Itens 1 e 2 foram confirmados, corrigidos de forma isolada e cobertos por testes unitários/gates.**
- **Itens 3 e 4 exigem migrações de banco (`CREATE TABLE print_jobs`), refatoração de repositórios e alteração de schema/runtime.**
- O Pacote 5.6 está em andamento concorrente em outra trilha tocando `db.ts` e migrações.
- **PORTANTO, PARADA FORMAL (STOP) AQUI.** A implementação ampla dos itens 3 e 4 deve ser programada em pacote dedicado com sua respectiva migration e ADR.
