# WITIQUETAS — PACOTE 5.7.1: PLANO DE HOMOLOGAÇÃO NÃO FÍSICA E DEPLOY SEGURO
## FILA PERSISTENTE DE IMPRESSÃO, LEASE SAFETY E RECUPERAÇÃO TRANSACIONAL

> **Documento Canônico de Operações, Auditoria e Governança DCC**  
> **Status DCC:** `READY_FOR_RELEASE_REVIEW`  
> **Branch de Validação:** `validation/package-5.7.1-postgres-gate`  
> **Commit Validado:** `b86f64173b0505ad647e0eb3f45e1db8cf352e0a`  
> **CI Runs Homologados:** GitHub Actions Runs `#38666388916` (K/L Gate) & `#38666388948` (PostgreSQL 14 Gate) — **100% SUCCESS**  
> **Banco de Dados:** PostgreSQL 14 (Testado em container real de serviço e cluster efêmero no GitHub Actions)  
> **Data:** 14 de Outubro de 2026  
> **Regra Suprema:** *PUSH != DEPLOY | BUILD VERDE != PRODUÇÃO | DEPLOY FÍSICO PROIBIDO NESTA ETAPA*.

---

## 1. ETAPA 1 — AUDITORIA DO CÓDIGO VALIDADO

A auditoria cobriu o commit `904caa1b8036393d558dc4d15645de8b6f60f2fa` em relação à baseline funcional de produção (`main`), verificando cada mecanismo implementado para a fila persistente:

| Item Auditado | Mecanismo Implementado | Arquivo / Linha | Evidência / Status |
| :--- | :--- | :--- | :--- |
| **1. Persistência de Jobs** | Gravação física em tabela `print_jobs` com status inicial `PENDING`, hash SHA-256 e payload Base64. | `apps/backend/src/repositories/printJobRepository.ts` | **CONFORME** (Gate B PASS no CI) |
| **2. Auditoria Append-Only** | Gravação imutável de todo evento de transição na tabela `print_job_events`. Proibido UPDATE/DELETE. | `printJobRepository.ts` (`INSERT INTO print_job_events`) | **CONFORME** (Gate G PASS: 5 eventos sequenciais) |
| **3. Atomicidade Transacional** | Blocos `BEGIN ... COMMIT` com rollback automático em caso de exceção. Nenhuma mutação parcial. | `printJobRepository.ts` | **CONFORME** (Gate F PASS: Rollback em erro) |
| **4. Idempotência por Tenant** | Índice parcial único `(company_id, idempotency_key)` e validação estrita de fingerprint físico de 6 parâmetros. | `printJobRepository.ts` (`checkIdempotencyMatch`) | **CONFORME** (Gates H & I PASS: Replay e 409) |
| **5. Multi-Tenancy Estrito** | Toda consulta, claim, auditoria e lock exige cláusula `WHERE company_id = $1`. Chaves não colidem entre tenants. | `printJobRepository.ts` | **CONFORME** (Gate L PASS: Alpha e Beta isolados) |
| **6. Concorrência Segura** | Claim concorrente via `FOR UPDATE OF j SKIP LOCKED` com ordenação determinística por `created_at ASC`. | `printJobRepository.ts` (`claimPendingJobsForAgent`) | **CONFORME** (Gates C & D PASS: 5 workers simultâneos, zero duplicação) |
| **7. Ownership e Leases** | Validação tripla obrigatória em mutações: `agentId` (403), `leaseId` (409) e `attemptId` (409). | `printJobRepository.ts` (`updateJobStatus`) | **CONFORME** (Gate F PASS: Agente 999 rejeitado) |
| **8. Lease Sweeper e Reaper** | Expiração automática de leases em background: `CLAIMED` vira `EXPIRED_LEASE`; `DELIVERING` vira `UNKNOWN_RESULT`. | `printJobRepository.ts` (`reapExpiredLeases`) | **CONFORME** (Gates J & K PASS) |
| **9. Fail-Closed sem Fallback** | Indisponibilidade do PostgreSQL interrompe operações imediatamente; proibido fallback silencioso em memória. | `printJobRepository.ts` (`if (pgPool) ... else throw`) | **CONFORME** (Gate M PASS: Fail-closed verificado) |
| **10. Compatibilidade Agent v0.2.0** | Agent Windows x64 em Rust consome envelopes JSON, envia `lease_id`/`attempt_id` e trata 403/409. | `apps/agent-core/src/runtime.rs` | **CONFORME** (Build PE x64 aprovado no CI) |

### 1.1 Diferenças entre a Branch de Validação e a Produção (`main`)
O `git diff main..HEAD` comprova alterações restritas a:
1. `.github/workflows/docker.yml`: Inclusão do container PostgreSQL 14 de serviço e execução do Gate dedicado.
2. `apps/backend/src/repositories/printJobRepository.ts`: Correção do SQLSTATE 42703 (`p.ip as printer_host`), sanitização de `copies` na checagem de idempotência e método seguro `cleanMemory/setPgPool`.
3. `tests/package571PostgresRealIntegration.test.ts` e adapters de teste (`tests/pg-adapter.js`, `tests/ts-loader.js`): Suíte de testes automatizados reais contra PostgreSQL 14.

**Conclusão da Auditoria:** Zero alterações em `@witiquetas/label-schema`, zero alterações no Frontend Editor, zero alterações no protocolo do Agent, zero alterações na Fase 6. O código está estritamente contido no escopo do Package 5.7.1.

---

## 2. ETAPA 2 — MIGRATION 011: PLANEJAMENTO E PROCEDIMENTO

### 2.1 Análise do Arquivo DDL (`011_create_persistent_print_queue_tables.sql`)
- **Tabelas Criadas:** `print_jobs` e `print_job_events`. Ambas são tabelas novas; nenhuma tabela de produção pré-existente (`companies`, `users`, `agents`, `printers`, `label_templates`) sofre alteração estrutural ou de colunas.
- **Constraints de Integridade:**
  - `print_jobs.company_id REFERENCES companies(id) ON DELETE CASCADE`
  - `print_jobs.printer_id REFERENCES printers(id) ON DELETE RESTRICT`
  - `print_jobs.claimed_by_agent_id REFERENCES agents(id) ON DELETE SET NULL`
  - `print_job_events.job_id REFERENCES print_jobs(id) ON DELETE CASCADE`
- **Índices Parciais:**
  - `idx_print_jobs_claim_queue`: Indexa apenas `WHERE status = 'PENDING'`. Não cresce com o histórico de impressões concluídas.
  - `idx_print_jobs_lease_sweeper`: Indexa apenas `WHERE status IN ('CLAIMED', 'DOWNLOADED', 'DELIVERING')`.
  - `idx_print_jobs_company_idempotency`: Garante unicidade `(company_id, idempotency_key) WHERE idempotency_key IS NOT NULL`.
- **Segurança de Reexecução:** Todas as instruções DDL utilizam `CREATE TABLE IF NOT EXISTS` e `CREATE INDEX IF NOT EXISTS`. A migration é 100% idempotente.
- **Impacto e Locks:** Como são tabelas novas (`print_jobs` e `print_job_events`), o DDL não reescreve dados das tabelas existentes. A criação de chaves estrangeiras referenciando tabelas existentes (`companies`, `printers`, `agents`, `print_job_batches`) adquire lock do tipo `SHARE ROW EXCLUSIVE` sobre as tabelas referenciadas durante a validação da constraint. Em tabelas com baixa concorrência DDL o overhead é mínimo, mas a migração deve ser aplicada fora de transações concorrentes longas para prevenir fila de locks.

### 2.2 Checklist Pré-Migration
- [ ] Verificar integridade do cluster PostgreSQL de produção (`SELECT version();`).
- [ ] Executar backup completo via `pg_dump` antes de qualquer alteração:
  ```bash
  pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME -F c -b -v -f "/backups/pre-5.7.1-$(date +%Y%m%d%H%M%S).dump"
  ```
- [ ] Confirmar que o usuário da aplicação possui permissões de DDL (`CREATE TABLE`, `CREATE INDEX`) no schema `public`.
- [ ] Confirmar que as tabelas de referência existem: `companies`, `printers`, `agents`, `print_job_batches`.

### 2.3 Procedimento de Aplicação (Somente quando autorizado)
```bash
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f apps/backend/src/migrations/011_create_persistent_print_queue_tables.sql
```

### 2.4 Consultas SQL de Verificação Pós-Migration
```sql
-- 1. Verificar existência das tabelas
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name IN ('print_jobs', 'print_job_events');
-- Esperado: 2 linhas

-- 2. Verificar índices parciais obrigatórios
SELECT indexname, indexdef FROM pg_indexes 
WHERE tablename = 'print_jobs' AND indexname IN (
  'idx_print_jobs_claim_queue',
  'idx_print_jobs_lease_sweeper',
  'idx_print_jobs_company_idempotency',
  'idx_print_jobs_company_created'
);
-- Esperado: 4 linhas

-- 3. Verificar integridade de foreign keys
SELECT conname, confrelid::regclass FROM pg_constraint 
WHERE conrelid = 'print_jobs'::regclass;
-- Esperado: FKs para companies, printers, agents, print_job_batches
```

### 2.5 Procedimento de Contingência (Sem DROP TABLE)
- Em caso de interrupção ou necessidade de rollback do backend:
  - **NÃO EXECUTAR DROP TABLE**. As tabelas vazias ou com jobs criados não causam conflito com versões anteriores do backend, pois versões anteriores não realizavam queries em `print_jobs`.
  - Manter as tabelas preservadas para posterior investigação forense.

---

## 3. ETAPA 3 — SEGURANÇA CONTRA IMPRESSÃO DUPLICADA

### 3.1 Máquina de Estados Persistente e Regras de Transição

```mermaid
stateDiagram-v2
    [*] --> PENDING: POST /api/print-jobs
    PENDING --> CLAIMED: claimPendingJobsForAgent (SKIP LOCKED)
    CLAIMED --> DOWNLOADED: updateJobStatus (DOWNLOADED)
    DOWNLOADED --> DELIVERING: updateJobStatus (DELIVERING)
    DELIVERING --> DELIVERED_TO_TRANSPORT: updateJobStatus (DELIVERED_TO_TRANSPORT)
    DELIVERED_TO_TRANSPORT --> PRINTED: Confirmação de hardware (se suportado)
    DELIVERED_TO_TRANSPORT --> FAILED: Erro de transmissão socket
    
    CLAIMED --> EXPIRED_LEASE: reapExpiredLeases (Lease expirado)
    DOWNLOADED --> EXPIRED_LEASE: reapExpiredLeases (Lease expirado)
    EXPIRED_LEASE --> PENDING: recover-pending (Exige prova objetiva zero bytes)
    
    DELIVERING --> UNKNOWN_RESULT: reapExpiredLeases (Lease expirado em entrega)
    UNKNOWN_RESULT --> FAILED: resolve-ambiguous (Operador humano)
    FAILED --> PENDING: Novo Job com novo ID (se CONFIRM_FAILED_AND_RETRY)
```

### 3.2 Invariantes Físicas Obrigatórias (P0 Safety Rules)
1. **DELIVERING Antes dos Bytes:** O status `DELIVERING` precisa ser gravado no PostgreSQL e confirmado com HTTP 200 pelo backend antes de o Agent abrir a conexão TCP (`std::net::TcpStream::connect`) com a impressora.
2. **Timeout no Reporte Bloqueia Envio:** Se a requisição de atualização para `DELIVERING` sofrer timeout ou retornar erro, o Agent aborta a operação e NÃO transmite bytes à impressora.
3. **Lease Expirado em DELIVERING = UNKNOWN_RESULT:** Se um job em `DELIVERING` tiver seu lease expirado sem que o Agent tenha reportado o resultado, o lease sweeper o move compulsoriamente para `UNKNOWN_RESULT`.
4. **Proibido Retorno Automático:** Um job em `UNKNOWN_RESULT` **JAMAIS** retorna automaticamente para `PENDING`.
5. **Decisão Manual Explícita e Auditável:** Para resolver um `UNKNOWN_RESULT`, um operador humano autenticado deve inspecionar fisicamente a impressora e acionar `POST /api/print-jobs/:id/resolve-ambiguous` fornecendo justificativa mínima de 10 caracteres.
6. **Retry Gera Novo Job:** Quando a decisão for `CONFIRM_FAILED_AND_RETRY`, o job original é marcado imutavelmente como `FAILED`, e um novo registro independente com novo ID é inserido em `PENDING`.
7. **Semântica de DELIVERED_TO_TRANSPORT:** `DELIVERED_TO_TRANSPORT` certifica apenas que os bytes foram aceitos pelo socket TCP do dispositivo ou spooler local; não comprova saída de mídia física.
8. **Impossibilidade de Reimpressão por Sweeper:** O sweeper em background apenas transiciona jobs para `EXPIRED_LEASE` ou `UNKNOWN_RESULT`. Ele nunca cria novas tentativas e nunca reexecuta jobs.

---

## 4. ETAPA 4 — PLANO DE HOMOLOGAÇÃO NÃO FÍSICA

### 4.1 Protocolo de Isolamento de Rede e Hardware (Prevenção Total de Transmissão Física)
Para assegurar risco zero de emissão acidental de etiquetas térmicas em impressoras físicas reais durante a homologação:
1. **Ausência de Rotas para Impressoras Físicas:** Todas as impressoras de teste cadastradas no ambiente isolado possuem o campo `ip` configurado como `NULL` ou associado a endereços de loopback (`127.0.0.1`) ou blocos reservados não roteáveis conforme RFC 5737 (`192.0.2.1` / TEST-NET-1). O tráfego de rede para a porta padrão RAW TCP (9100) é estritamente bloqueado ou redirecionado para um receptor mock em memória.
2. **Ausência de Agents de Produção:** A homologação é executada exclusivamente sob tenants de teste isolados (`comp-pg-alpha`, `comp-pg-beta` ou `comp-test-homolog`). Nenhum token de agente físico em produção possui vínculo com estes tenants.
3. **Agentes Virtuais e Emulados:** Os testes de consumo, claim, lease e reporte utilizam chamadas REST sintéticas ou agentes virtuais de teste, garantindo que nenhum daemon ativo em estações de trabalho de produção processe os envelopes gerados.
4. **Verificação de Zero Bytes:** Nenhum job transiciona para `DELIVERED_TO_TRANSPORT` a menos que seja explicitamente comandado pelo roteiro não físico para aferir a máquina de estados.

### 4.2 Matriz de Cobertura: CI Automated vs. Homologação Adicional

| Cenário | Descrição | Status no CI (PostgreSQL 14 Real) | Homologação Adicional Necessária? |
| :---: | :--- | :--- | :--- |
| **A** | Criação de Job e Persistência | **100% PASS** (Gate PG.A - Run #198) | Opcional (reprodução assistida via curl). |
| **B** | Restart / Reconexão sem Corrupção | **100% PASS** (Gate PG.B - Run #198) | Opcional (reprodução assistida via container restart). |
| **C** | Concorrência de Claim (5 workers) | **100% PASS** (Gates PG.C e PG.D - Run #198) | Totalmente coberto por teste automatizado real. |
| **D** | Falha de Banco e Fail-Closed | **100% PASS** (Gate PG.M - Run #198) | Totalmente coberto por teste automatizado real. |
| **E** | Rollback Transacional e Guarda 403 | **100% PASS** (Gate PG.F - Run #198) | Totalmente coberto por teste automatizado real. |
| **F** | Expiração de Lease em CLAIMED | **100% PASS** (Gate PG.J - Run #198) | Totalmente coberto por teste automatizado real. |
| **G** | Resultado Ambíguo em DELIVERING | **100% PASS** (Gate PG.K - Run #198) | Totalmente coberto por teste automatizado real. |
| **H** | Idempotência por Chave e Fingerprint | **100% PASS** (Gates PG.H e PG.I - Run #198) | Totalmente coberto por teste automatizado real. |
| **I** | Isolamento Multi-Tenant Estrito | **100% PASS** (Gate PG.L - Run #198) | Totalmente coberto por teste automatizado real. |
| **J** | Auditoria Append-Only Imutável | **100% PASS** (Gate PG.G - Run #198) | Totalmente coberto por teste automatizado real. |
| **K** | Resolução Manual de UNKNOWN_RESULT | **100% PASS** (Gate PG.N - Run #198) | **SIM (Validação Interativa):** Testar validação de operador autenticado e rejeição de justificativa curta (< 10 caracteres). |
| **L** | Compatibilidade Agent PE x64 (Rust) | **100% PASS** (Build x64 PE no runner Windows) | **SIM (Validação Assistida):** Execução do executável PE gerado em ambiente Windows isolado com backend local. |

### 4.3 Roteiro Operacional e Evidências Executáveis (Cenários A–L)

```bash
# -------------------------------------------------------------------------
# CENÁRIO A: CRIAÇÃO E PERSISTÊNCIA RELACIONAL DE JOB
# -------------------------------------------------------------------------
curl -s -X POST "http://localhost:3000/api/print-jobs" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TEST_USER_TOKEN" \
  -d '{
    "companyId": "comp-pg-alpha",
    "printerId": "prn-pg-alpha-1",
    "language": "PPLB",
    "encoding": "windows-1252",
    "copies": 1,
    "payload": "N\nq800\nQ600,24\nB50,50,0,1,2,4,80,B,\"123456789\"\nP1\n"
  }'
# SQL de Verificação:
# SELECT id, status, company_id, printer_id, checksum_sha256 FROM print_jobs WHERE id = '$JOB_ID';
# Critério PASS: HTTP 201; status == 'PENDING'; 1 linha em print_jobs; 1 evento em print_job_events.

# -------------------------------------------------------------------------
# CENÁRIO B: REINICIALIZAÇÃO DO BACKEND E POOL
# -------------------------------------------------------------------------
# Ação: Reiniciar serviço backend isolado (docker restart backend_isolated)
curl -s "http://localhost:3000/api/print-jobs/$JOB_ID" \
  -H "Authorization: Bearer $TEST_USER_TOKEN"
# Critério PASS: HTTP 200; job permanece intacto com status 'PENDING' e dados inalterados.

# -------------------------------------------------------------------------
# CENÁRIO C: CONCORRÊNCIA DE CLAIM (FOR UPDATE SKIP LOCKED)
# -------------------------------------------------------------------------
# Disparo concorrente por 5 workers sintéticos (agt-worker-1 a 5) solicitando 2 jobs cada:
curl -s -X POST "http://localhost:3000/api/print-jobs/claim" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -d '{"agentId": "agt-worker-1", "printerIds": ["prn-pg-alpha-1"], "limit": 2}'
# SQL de Verificação:
# SELECT claimed_by_agent_id, COUNT(*) FROM print_jobs WHERE status = 'CLAIMED' GROUP BY claimed_by_agent_id;
# Critério PASS: Zero colisão ou sobreposição de IDs entre workers; claims distribuídos de forma estritamente disjunta.

# -------------------------------------------------------------------------
# CENÁRIO D: FAIL-CLOSED SEM FALLBACK EM MEMÓRIA
# -------------------------------------------------------------------------
# Ação: Parar o banco temporariamente ou apontar DATABASE_URL para porta fechada.
curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:3000/api/print-jobs" \
  -H "Content-Type: application/json" -d '{"companyId":"comp-pg-alpha", ...}'
# Critério PASS: Código HTTP 500/503 imediato. Zero fallback silencioso para memória.

# -------------------------------------------------------------------------
# CENÁRIO E: ROLLBACK TRANSACTION EM CONFLITO DE OWNERSHIP
# -------------------------------------------------------------------------
curl -s -X PATCH "http://localhost:3000/api/print-jobs/$JOB_ID/status" \
  -H "Authorization: Bearer $AGENT_2_TOKEN" \
  -d '{"agentId": "agt-worker-2", "status": "DOWNLOADED", "leaseId": "lease-invalido"}'
# Critério PASS: HTTP 403 (NOT_CLAIM_HOLDER) ou 409; Rollback executado; banco mantém status e agentId original.

# -------------------------------------------------------------------------
# CENÁRIO F: EXPIRAÇÃO DE LEASE EM CLAIMED
# -------------------------------------------------------------------------
# Simulação no banco: UPDATE print_jobs SET lease_expires_at = NOW() - INTERVAL '10s' WHERE id = '$JOB_ID';
# Disparo do Reaper: Acionamento de reapExpiredLeases()
# Critério PASS: Job transiciona para EXPIRED_LEASE; evento correspondente registrado.

# -------------------------------------------------------------------------
# CENÁRIO G: RESULTADO AMBÍGUO EM DELIVERING (PROIBIDO RETORNO AUTOMÁTICO)
# -------------------------------------------------------------------------
# Simulação: Job em DELIVERING com lease_expires_at expirado.
# Disparo do Reaper: reapExpiredLeases()
# Critério PASS: Status transiciona compulsoriamente para UNKNOWN_RESULT. Proibido retornar para PENDING.

# -------------------------------------------------------------------------
# CENÁRIO H: IDEMPOTÊNCIA POR FINGERPRINT DE 6 PARÂMETROS
# -------------------------------------------------------------------------
# 1ª Chamada: POST com Idempotency-Key: 'idem-test-alpha' -> HTTP 201 Created (Novo Job).
# 2ª Chamada: POST com mesma chave e mesmo payload -> HTTP 200 OK (Retorna mesmo jobId / Replay).
# 3ª Chamada: POST com mesma chave MAS copies divergente -> HTTP 409 Conflict (IDEMPOTENCY_PAYLOAD_MISMATCH).
# Critério PASS: Replay idempotente seguro e bloqueio 409 imediato em caso de divergência de fingerprint.

# -------------------------------------------------------------------------
# CENÁRIO I: ISOLAMENTO MULTI-TENANT ESTRITO
# -------------------------------------------------------------------------
# Tenant Alpha cria job com chave 'chave-global-1'.
# Tenant Beta cria job com mesma chave 'chave-global-1'.
# Critério PASS: Ambos os jobs criados com sucesso e IDs distintos. Agent de Beta não visualiza jobs de Alpha.

# -------------------------------------------------------------------------
# CENÁRIO J: TRILHA DE AUDITORIA APPEND-ONLY IMUTÁVEL
# -------------------------------------------------------------------------
curl -s "http://localhost:3000/api/print-jobs/$JOB_ID/events" \
  -H "Authorization: Bearer $TEST_USER_TOKEN"
# SQL de Verificação:
# SELECT from_status, to_status, created_at FROM print_job_events WHERE job_id = '$JOB_ID' ORDER BY created_at ASC;
# Critério PASS: Trilha imutável em ordem sequencial estrita (PENDING -> CLAIMED -> DOWNLOADED -> DELIVERING -> DELIVERED).

# -------------------------------------------------------------------------
# CENÁRIO K: RESOLUÇÃO MANUAL DE UNKNOWN_RESULT
# -------------------------------------------------------------------------
curl -s -X POST "http://localhost:3000/api/print-jobs/$JOB_ID/resolve-ambiguous" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "decision": "CONFIRM_FAILED_AND_RETRY",
    "operatorNotes": "Verificação física realizada; bobina presa e zero etiquetas emitidas."
  }'
# Critério PASS: Job original vira FAILED; novo job independente é criado em PENDING com attempts = 0.
# Teste de Borda: Requisição com operatorNotes < 10 chars rejeita com HTTP 400.

# -------------------------------------------------------------------------
# CENÁRIO L: COMPATIBILIDADE AGENT WINDOWS X64 (PE RUST)
# -------------------------------------------------------------------------
# Executar binário compilado no runner Windows:
./bin/agents/witiquetas-agent-windows-x64.exe --version
./bin/agents/witiquetas-agent-windows-x64.exe --help
# Critério PASS: Exit code 0, saída padronizada v0.2.0, binário PE válido (> 1 MB, SHA-256 verificado).
```

---

## 5. ETAPA 5 — PLANO DE DEPLOY CONTROLADO

> [!IMPORTANT]
> **ESTE PLANO NÃO DEVE SER EXECUTADO NESTA SESSÃO.**  
> A execução requer aprovação formal prévia da governança.

### 5.1 Sequência Operacional Controlada (13 Passos)
1. **Confirmação do Commit:** Validar que o commit em staging corresponde a `904caa1b8036393d558dc4d15645de8b6f60f2fa`.
2. **Backup Pré-Deploy:** Executar `pg_dump` no banco de produção e armazenar o arquivo em local seguro.
3. **Verificação de Variáveis:** Confirmar que `DATABASE_URL` aponta para o cluster PostgreSQL de produção com credenciais válidas.
4. **Verificação de Permissões:** Validar permissão de DDL para o usuário da aplicação.
5. **Conferência de Migrations:** Verificar que as migrations 001 a 010 estão aplicadas no banco.
6. **Aplicação da Migration 011:** Executar o script `011_create_persistent_print_queue_tables.sql`.
7. **Validação do Schema:** Executar queries de verificação da Etapa 2.4.
8. **Promoção de Imagem:** Promover imagem imutável `ghcr.io/wittemberg/witiquetas-backend:candidate-904caa1` para `:production-904caa1` e atualizar a tag `:stable`.
9. **Disparo do Redeploy Portainer:** Acionar webhook do Portainer para atualizar o serviço `witiquetas_backend`.
10. **Validação de Healthcheck:** Consultar `GET https://witiquetas.wrtec.com.br/api/health` até obter `200 OK`.
11. **Validação de Versão em Produção:** Confirmar em `/api/version` que o commit em execução é exatamente `904caa1`.
12. **Smoke Tests Não Físicos:** Executar teste sintético de criação de job com tenant de teste, confirmando inserção relacional.
13. **Homologação Final:** Assinar o encerramento do deploy na governança DCC.

### 5.2 Critérios Objetivos de GO / NO-GO
- **Critérios para GO (Prosseguir):**
  - Backup do banco concluído com sucesso e verificado.
  - Migration 011 executada com sucesso, sem erros de syntax/constraints e sem bloqueios de lock prolongados.
  - Endpoint `/api/health` retornando status HEALTHY (código HTTP 200) com validação estável de PostgreSQL e MinIO após a estabilização do container.
  - Zero erros 500 no log do backend durante inicialização do pool PostgreSQL e ativação do Lease Reaper.
- **Critérios para NO-GO (Abortar Imediatamente e Conter):**
  - Falha de conexão com PostgreSQL na inicialização.
  - Divergência no commit reportado por `/api/version`.
  - Falha em qualquer das queries de validação de schema.
  - Crash ou reinicialização em loop do container Portainer.

---

## 6. ETAPA 6 — CONTINGÊNCIA E ROLLBACK NÃO DESTRUTIVO

| Cenário de Contingência | Ação Imediata de Contenção | Procedimento de Rollback | Preservação de Dados |
| :--- | :--- | :--- | :--- |
| **1. Migration Parcial** | Interromper aplicação; inspecionar `pg_stat_activity`. | Resolver lock pendente; reexecutar script (é idempotente). | Tabelas parciais mantidas; zero DROP. |
| **2. Backend Incompatível** | Reapontar tag `:stable` para a imagem real em execução comprovada em produção: commit `8505ca5f76756da15d536241409ed4604496fc50` (governanceSha `5d2c2a236244cc333a5394b1af684bd43a84ab64`, imagem `ghcr.io/wittemberg/witiquetas-backend:candidate-8505ca5f76756da15d536241409ed4604496fc50`). | Acionar webhook do Portainer para subir a versão anterior homologada. | Tabelas `print_jobs` e `print_job_events` permanecem intactas no banco. |
| **3. Falha de Conexão DB** | Verificar credenciais e conectividade de rede do container. | Se indisponibilidade do banco for persistente, parar backend para evitar estados inconsistentes (Fail-Closed). | Sem corrupção; dados preservados. |
| **4. Erro de Inicialização** | Capturar logs do container (`docker service logs witiquetas_backend`). | Rollback para imagem anterior via script de rollback. | Logs preservados para análise forense. |
| **5. Sweeper Anômalo** | Desativar temporariamente o job agendado via flag de configuração. | Inspecionar queries de sweep com `EXPLAIN ANALYZE`. | Zero perda de registros; auditoria preservada. |
| **6. Jobs Pendentes no Deploy** | Jobs `PENDING` permanecem seguros no PostgreSQL. | O novo backend assume a fila e continua o atendimento ordenado. | Zero perda de jobs pendentes. |
| **7. Jobs em DELIVERING no Deploy** | Conexões cortadas pelo restart expiram o lease. | Sweeper move para `UNKNOWN_RESULT`; operador avalia sem risco de duplicação. | Zero reimpressão automática descontrolada. |
| **8. Jobs em UNKNOWN_RESULT** | Registros isolados aguardando confirmação. | Manter bloqueados até decisão explícita via `resolve-ambiguous`. | Impossível reimpressão acidental. |

### 6.1 Garantia Estrutural contra Reenvio ou Consumo de Jobs Ambíguos no Rollback
Em caso de acionamento do procedimento de rollback para a versão de produção anterior (`8505ca5` / `5d2c2a2`), a segurança física é garantida por desenho arquitetural:
1. **Armazenamento Puramente em Memória na Versão Anterior:** O código do backend na baseline anterior gerenciava jobs através de um `Map` local (`const printJobsStore = new Map<string, PrintJobDTO>()`).
2. **Inexistência de Mapeamento Relacional:** A versão anterior não possui repositório de persistência de jobs (`printJobRepository.ts` relacional), não emite consultas SQL (`SELECT`, `UPDATE` ou `claim`) sobre as tabelas `print_jobs` e `print_job_events`, e desconhece por completo a existência dessas tabelas no banco de dados.
3. **Isolamento Total dos Registros:** Qualquer job que tenha sido gravado no banco relacional pelo Package 5.7.1 — esteja em `PENDING`, `CLAIMED`, `DELIVERING`, `EXPIRED_LEASE` ou `UNKNOWN_RESULT` — permanece estático e inacessível para o backend antigo.
4. **Impossibilidade Matemática de Reenvio:** Como a versão revertida não consulta a tabela relacional, é estruturalmente impossível que ela leia, reivindique, tente despachar ou reenvie qualquer job persistido ou ambíguo para os agentes locais ou impressoras físicas.
5. **Preservação de Evidências:** Os dados em `print_jobs` e `print_job_events` mantêm-se íntegros para fins de auditoria, diagnóstico forense e reconciliação manual sem qualquer risco operacional.

---

### 4.4 Auditoria de Isolamento do Host de Desenvolvimento e Bloqueio de Execução Live (BLOCKED_ENVIRONMENT)

Em 14/10/2026, foi executada a sonda de pré-homologação no host de desenvolvimento Windows (`SUPORTE-2`), com os seguintes resultados:

1. **Auditoria de Conectividade e Serviços do Host:**
   - **Serviço Local de Produção Ativo:** O comando `--diagnostics --json` revelou que o host possui o Windows Service `WitiquetasAgent` ativo (`serviceInstalled: true, serviceState: "running"`), autenticado e pareado diretamente com o ambiente de **PRODUÇÃO** (`backendUrl: "https://witiquetas.wrtec.com.br"`, `agentId: "agent-1791229418695"`).
   - **Ausência de PostgreSQL Local:** Verificação de serviços (`Get-Service *postgres*`) e porta (`Test-NetConnection -Port 5432 -ComputerName 127.0.0.1`) confirmou `TcpTestSucceeded: False`. Não existe banco PostgreSQL isolado em execução no host local.
   - **Ausência de Docker:** O utilitário `docker` não está instalado no host, inviabilizando container de banco descartável local.
   - **Risco de Segurança Identificado:** Executar o daemon com identidade sobrescrita ou rodar testes locais de envio de rede no host `SUPORTE-2` violaria as regras P0 de isolamento ("Nenhum Agent instalado de produção conectado" e "Bloqueio comprovado de saída TCP 9100").

2. **Validação Técnica do Binário Windows PE x64 (Rust):**
   - **Compilação Release Concluída:** `cargo build --release --manifest-path apps/agent-core/Cargo.toml`
   - **Arquivo Gerado:** `apps/agent-core/target/release/witiquetas-agent-core.exe`
   - **Tamanho:** 5.224.960 bytes (~5.2 MB)
   - **SHA-256:** `BE7B22160086246A9CCA8DAEA51584571F3A63FBC58C20B0E697C7F4F2FA64C3`
   - **Suíte de Testes Rust:** 75/75 testes PASS (53 lib tests + 10 distribution foundation + 12 resident service).
   - **Comandos CLI Executados com Sucesso:**
     - `--version`: `witiquetas-agent-core v0.2.0 (commit: d2d58643, built: 2026-10-14T22:56:56Z, target: x86_64-pc-windows-msvc)` -> PASS.
     - `--help`: Retorno padronizado de operações de serviço, pareamento e flags -> PASS.
     - `--diagnostics --json`: Emissão estruturada com schemaVersion 1 e redaction de tokens -> PASS.

### 4.5 Desbloqueio da Homologação via GitHub Actions Isolated K/L Gate (`package-5.7.1-homologation-kl.yml`)

Para superar o bloqueio ambiental do host `SUPORTE-2` sem comprometer a integridade de produção nem violar o isolamento de rede, foi implantado o workflow descartável `.github/workflows/package-5.7.1-homologation-kl.yml`:

1. **Estratégia de Isolamento e Segurança:**
   - **Ambiente:** Execução em runner isolado `windows-latest` do GitHub Actions, descartado imediatamente após a conclusão.
   - **Banco de Homologação:** Instância PostgreSQL 14 isolada rodando estritamente em `127.0.0.1:5432`, criada com credenciais de teste temporárias e banco efêmero `witiquetas_homolog`.
   - **Backend Descartável:** Servidor Express inicializado em `http://127.0.0.1:3333` conectado exclusivamente ao banco efêmero.
   - **Isolamento de Identidade do Agent:** O executável PE x64 utiliza `WITIQUETAS_CONFIG_PATH` apontando para arquivo temporário, sem tocar em pastas de produção.
   - **Bloqueio de Saída TCP 9100:** Nenhuma impressora física associada; dados limitados a loopback sem roteamento externo.
   - **Zero Secrets de Produção:** Utilização estrita de tokens e chaves temporárias de teste de CI.

2. **Cobertura do Teste Automatizado (`tests/package571HomologationGateKL.test.ts`):**
   - **Cenário K (Resolução Manual UNKNOWN_RESULT):**
     * K.1: Rejeição sem autenticação (HTTP 401).
     * K.2: Rejeição operador sem permissão / tenant divergente (HTTP 403).
     * K.3: Rejeição justificativa curta < 10 chars (HTTP 400 `JUSTIFICATION_REQUIRED`).
     * K.4: Transição legítima para `UNKNOWN_RESULT` via expiração em `DELIVERING` e lease sweeper.
     * K.5: Resolução autorizada com `CONFIRM_FAILED_AND_RETRY` e justificativa técnica detalhada.
     * K.6: Confirmação relacional no PostgreSQL: job original vira `FAILED` e novo job criado em `PENDING` com `attempts = 0`.
     * K.7: Trilha de auditoria append-only imutável em `print_job_events`.
     * K.8: Garantia contra auto-reexecução descontrolada pelo sweeper.
   - **Cenário L (Agent Windows x64 PE Rust):**
     * L.1: Validação de integridade do PE x64 (Tamanho > 1 MB, cálculo de SHA-256).
     * L.2: Execução CLI real de `--version` e `--help` com exit code 0.
     * L.3: Pareamento headless exclusivo com código temporário contra `127.0.0.1:3333`.
     * L.4: Diagnóstico e handshake com backend descartável (`paired: true`, `backendReachable: true`).
     * L.5: Claim e ciclo de execução com `--single-run` propagando `lease_id` e `attempt_id`.
     * L.6: Perda e recuperação de conectividade com o backend sem crash ou looping infinito.
     * L.7: Comprovação de contenção de rede e bloqueio de porta 9100.

---

## 7. ETAPA 7 — GOVERNANÇA DCC
 
- **Pacote:** Package 5.7.1 — Persistent Print Queue & Lease Safety
- **Fase Atual:** Fase 5 — Administração e Governança da Aplicação
- **Baseline Validada:** Commit `b86f64173b0505ad647e0eb3f45e1db8cf352e0a`
- **Validação de CI:** 
  * Disposable Homologation Gate K/L (`package-5.7.1-homologation-kl.yml`, Run `#38666388916`, Job `116199198915`): **100% SUCCESS** (Cenários K e L validados com evidências reais)
  * PostgreSQL 14 Integration Gate (`docker.yml`, Run `#38666388948`): **100% SUCCESS** (11/11 subtestes PASS)
- **Regressão Global:** 260/260 testes automatizados PASS
- **Status DCC:** `READY_FOR_RELEASE_REVIEW`
- **Flag Deployed:** `false`
- **Homologação Não-Física:** 12/12 cenários homologados com evidências formais registradas.

---

### DECLARAÇÃO DE ENCERRAMENTO DA TAREFA:
**`READY_FOR_RELEASE_REVIEW`** — Validação técnica, homologação não-física e gates concluídos com êxito integral. Aguardando revisão de release e autorização para agendamento de janela de deploy. Zero impacto em produção. Zero envio para impressoras físicas.
