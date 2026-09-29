# WITIQUETAS — PROJECT RESUME AUDIT

**Data da Auditoria:** 2026-09-21  
**Responsável:** Antigravity AI Assistant  
**Modo Operacional:** 100% READ-ONLY (Auditoria factual de retomada; zero alterações funcionais, zero correções, zero migrations, zero deploys)  
**Repositório:** `C:/Users/start/OneDrive/Área de Trabalho/Aprendendo/Witiquetas/witiquetas`

---

## 1. Executive Status

O projeto **WITIQUETAS** encontra-se na **Fase 5 — Administração e Governança da Aplicação**, operando com branch `main` limpa e alinhada ao commit `c6b18c14572b628c646d4db8d74422dc15255147` (tanto local quanto remotamente em `origin/main` e no cluster de produção).

A baseline do produto possui todas as fases anteriores congeladas ou homologadas:
- **Fase 0 a 3.5:** Fundação, Compiladores PPLA/PPLB e Agente Local Rust (`HOMOLOGATED` / `FROZEN`).
- **Fase 4 (Editor Visual e Central de Impressão):** Baseline congelado (`FROZEN / PAUSED`) aguardando a finalização da governança administrativa.
- **Fase 5:** Pacotes 5.1 a 5.3 homologados; Pacotes 5.4 e 5.5 implementados aguardando revalidação; Pacotes 5.6 (Integration Foundation) e 5.6.1 (Integration Administration UX & Editing) **formalmente HOMOLOGADOS com sucesso pelo usuário** (Baseline homologada: `643698450f5c9fa0f5020ddcc0c85e9c217c99c6`).

A auditoria identificou **5 riscos P0 críticos** (destaque para a fila de impressão volátil em memória `Map`, a ausência de concorrência transacional no lease de jobs com risco real de duplicação física, e a omissão de `npm test` no CI do GitHub Actions) e **10 débitos P1**.

---

## 2. Git / Repository State

- **Branch Atual:** `main`
- **HEAD:** `c6b18c14572b628c646d4db8d74422dc15255147` (`chore(workflow): adopt harness and OpenSpec workflow`)
- **origin/main:** `c6b18c14572b628c646d4db8d74422dc15255147` (em sincronia perfeita)
- **Working Tree:** `clean` (zero alterações não commitadas, zero arquivos não rastreados)
- **Worktrees:** Apenas 1 worktree ativo (`witiquetas`)
- **Tags Existentes:** Apenas tags legadas da Fase 3 (`backup/pre-patch-3.2.x`, `recovery-baseline-2026-08-21`). Nenhuma tag criada para as releases da Fase 5.
- **Último Commit Funcional:** `643698450f5c9fa0f5020ddcc0c85e9c217c99c6` (`feat(package-5.6.1): integration administration ux fixes, landscape modal and editing`)
- **Último Checkpoint Documental em DCC:** `checkpoints.json` registra o patch `5.6.1` com SHA `e78288019e07fb6a0cb5d9189b6c00d41e7f6e02` (amendado no repositório como `643698450f5c9fa0f5020ddcc0c85e9c217c99c6`).

### 2.1 Verificação de Commits Históricos Relevantes
Todos os commits históricos consultados estão preservados no histórico do Git:
1. `c6b18c14572b628c646d4db8d74422dc15255147` — chore(workflow): adopt harness and OpenSpec workflow
2. `643698450f5c9fa0f5020ddcc0c85e9c217c99c6` — feat(package-5.6.1): integration administration ux fixes, landscape modal and editing
3. `b362ae76cd971d931ff3900d4756f5809a27cd74` — fix(db): strip UTF-8 BOM from migration 009 and defensively sanitize SQL migrations
4. `e3718e2cbb9473271ee04935be446c125385d579` — fix(build): break circular dependency between label-schema and contracts
5. `b9e733031510405c896265b8e81ee93a96d53e38` — feat(package-5.6): implement integration foundation and field mapping
6. `0cbb932ebde07d194760c96d9a65ebf6bfbbd7dd` — fix(p0-hotfix): templates duplicate authorization and printers multi-tenant isolation
7. `21c295e78143394519cdb45fd99b4b55f308f681` — docs(research): prepare forward roadmap and printer knowledge research
8. `95031e4b5cb7b427c41c0ffd07a43d7dcf6efa72` — docs(governance): add agent skills and progressive context architecture
9. `7f07ae9864c92121a79c0b19588b31efde507311` — fix(editor): read-only model navigation and exit guard
10. `3515ed2991b74e127eaffe928f77b0443ac4a6b6` — fix(hotfix-5.5.1.2): bloquear entrada no editor em modo de criacao
11. `9a98fc97db4f1160a9b77f12091f5d9351b4a909` — fix(hotfix-5.5.1.1): restore field availability runtime resolution
12. `99615a75f592f3bf10ea9ae1b3c1a15f85267346` — feat(admin): implement Pacote 5.4 - niches, visual elements and canonical fields

---

## 3. Production State

Auditoria direta via requisições HTTPS contra o cluster de produção (`https://witiquetas.wrtec.com.br`):

- **`/version.json` (Frontend):**
  - `commit`: `c6b18c14572b628c646d4db8d74422dc15255147`
  - `candidateSha` / `runningSha`: `c6b18c14572b628c646d4db8d74422dc15255147`
  - `status`: `IMPLEMENTED_AWAITING_MANUAL_REVALIDATION`
  - *Drift de Texto:* O campo `version` informa `5.5.1.1-candidate` e o campo `package` informa `P0 HOTFIX 5.5.1.1` (metadados estáticos defasados no injetor de build).
- **`/api/version` (Backend):**
  - `commit`: `c6b18c14572b628c646d4db8d74422dc15255147`
  - `candidateSha` / `runningSha`: `c6b18c14572b628c646d4db8d74422dc15255147`
  - `status`: `IMPLEMENTED_AWAITING_HOMOLOGATION`
  - *Drift de Texto:* O campo `version` informa `5.3.5-candidate` e `package` informa `PACOTE 5.3.5`.
- **`/api/health` (Serviços):**
  - `status`: `HEALTHY`
  - `services.postgres`: `OK` (latência ~13ms; PostgreSQL 14.24)
  - `services.minio`: `OK` (latência ~4ms; bucket `witiquetas` OK)
- **Convergência:**
  - `repository HEAD` = `origin/main` = `runningSha` = `c6b18c14572b628c646d4db8d74422dc15255147`.
  - O código físico rodando em produção é idêntico ao HEAD do repositório.

---

## 4. Current Architecture

### 4.1 Mapa Linear de Fluxo Real vs Planejado
```
[Frontend Web (SPA React / Vite)]
   ↓ (REST API + Cookie HttpOnly + CSRF)
[Backend Express API (Node.js)]
   ↓                                ↘
[PostgreSQL 14 / MinIO S3]     [In-Memory Stores (Map / Set)]
 (Tenants, Users, Roles,        (Printers Store, Print Jobs Store,
  Niches, Elements, Fields,      Batches Store, Pairing Codes,
  Integrations, Mappings)        QR Codes Store)
   ↓                                ↓
[Effective Configuration Service] [printJobs.ts / printers.ts]
   ↓                                ↓ (Polling HTTP: GET /pending)
[Integration Foundation]        [Local Agent (Rust Daemon / Windows SCM)]
 (6 Capabilities Canônicas)         ↓ (RAW TCP Socket: porta 9100)
                                [Impressora Térmica Física]
                                (Zebra / Elgin / Argox)
```

**Diagnóstico Arquitetural do Mapa:**
- O pipeline a montante (`Frontend → Backend → PostgreSQL → Effective Configuration → Integration Foundation`) é **100% relacional e multi-tenant**.
- O pipeline a jusante (`Printing → Print Jobs Queue → Printers Management`) opera atualmente sobre **Mapas Voláteis em memória RAM** do processo Node.js.

### 4.2 Hierarquia de Domínio
```
Platform
  └── Company (Tenant Isolado)
        ├── Niche (11 nichos com ativação e default)
        │     ├── Visual Elements (text, price, barcode, qrcode, line, rectangle, image)
        │     └── Canonical Fields (produto.*, logistica.*, etc.)
        ├── Integration (Conectores: REST, SQL, CSV, Webhook, MCP)
        │     └── Field Mappings (De-Para para campos canônicos; system.* proibido)
        ├── Role (ADMIN, OPERATOR, DESIGNER, VIEWER, Custom)
        │     └── Role Permissions (25 canônicas) & Role Niches
        ├── User (Associação de usuário a perfis do tenant)
        └── Model / LabelTemplate (Templates de etiqueta versionados)
```
- **Onde está realmente implementada:**
  - `Company`, `Role`, `User`, `Niche`, `Element`, `Field`, `Integration`, `Mapping` e `Model` estão **100% implementados no PostgreSQL** (migrations 001..009) e autorizados no backend (`apps/backend/src/repositories/adminRepositories.ts`).
- **Onde ainda é apenas arquitetura planejada:**
  - `Printer` e `PrintJob` vinculados à `Company` no banco relacional (atualmente são entidades em `Map` volátil).
  - Execução física de sincronização ERP com conectores reais (atualmente é fundação declarativa).

---

## 5. Packages & Phases

| Package | Estado Documentado | Estado Real no Código | Homologado? | Observações Críticas |
| :--- | :--- | :--- | :--- | :--- |
| **0 a 3.5** | `HOMOLOGATED / FROZEN` | `HOMOLOGATED / FROZEN` | **SIM** | Core, compiladores e agente daemon estáveis. |
| **4.x** | `FROZEN / PAUSED` | `FROZEN / PAUSED` | **SIM** | Editor e Central de Impressão congelados contra regressão. |
| **5.1 - 5.3**| `HOMOLOGATED` | `HOMOLOGATED` | **SIM** | Estrutura de Tenant, Users, Roles e RBAC básico. |
| **5.4** | `IMPLEMENTED` | `IMPLEMENTED` | **NÃO** | Governança de Nichos, Elementos e Campos Canônicos. |
| **5.5** | `IMPLEMENTED` | `IMPLEMENTED` | **NÃO** | Configuração Efetiva dinâmica entregue ao Editor. |
| **5.5.1.x**| `IMPLEMENTED` | `IMPLEMENTED` | **NÃO** | Hotfixes de navegação read-only e guards de criação. |
| **5.6** | `HOMOLOGATED` | `HOMOLOGATED` | **SIM** | Integration Foundation (6 capabilities, Opção A, DDL 009). Homologado pelo usuário. |
| **5.6.1** | `HOMOLOGATED` | `HOMOLOGATED` | **SIM** | UX de Integrações (Modal landscape, edição, anti-IDOR). Homologado pelo usuário. |
| **5.7** | `PLANNED` | `NÃO INICIADO` | **NÃO** | Governança de Impressoras e Agentes Locais no DB. |
| **5.7.1** | `PLANNED (Candidato)`| `NÃO INICIADO` | **NÃO** | Persistência Relacional da Fila de Impressão e Lease Safety. |

---

## 6. Frontend State

- **ApplicationShell & Sidebar:**
  - Item redundante `integrations` foi **100% removido** da `BASE_NAV_ITEMS` e de `getEffectiveNavigation()` em `apps/frontend/src/shell/navigation.ts`.
  - A rota `/integrations` resolve canonicamente para `AdminPage` com `initialTab="integrations"`.
  - O item `admin` na Sidebar é destacado como ativo quando o usuário acessa `/integrations`.
  - O cabeçalho global exibe rigorosamente o título `Administração — Integrações`.
- **IntegrationsAdminView (`apps/frontend/src/modules/admin/IntegrationsAdminView.tsx`):**
  - Modal landscape de 2 colunas (`max-height: 90vh`, rolagem interna) implementado tanto para Adicionar Fonte de Dados quanto para Editar Integração.
  - Ação "Editar Integração" presente no cabeçalho com ícone `Pencil`, estritamente condicionada a `canManage`.
  - Terminologia canônica consolidada: "Salvar Integração", "Adicionar Fonte de Dados", "Adicionar Primeira Fonte de Dados", "Nenhuma integração cadastrada".
  - Grid master-detail configurado com `minmax(260px, 300px) minmax(0, 1fr)` e `minWidth: 0`, prevenindo qualquer overflow horizontal.
- **Editor Visual (`apps/frontend/src/editor/`):**
  - Baseline congelado intacto. Invariantes de geometria (toolbar de 140px fixos para status) e consumo estrito de configuração efetiva preservados sem qualquer drift.
- **Central de Impressão (`apps/frontend/src/modules/printcenter/`):**
  - Baseline congelado intacto (`PrintCenterPage.tsx` preservado).
- **Módulos em Desenvolvimento:**
  - Rotas `#printers` e `#agents` renderizam o componente padrão `PlaceholderModulePage` com badge "EM DESENVOLVIMENTO".
- **DCC (`apps/frontend/src/modules/devcontrol/`):**
  - Totalmente inacessível para tenants normais; protegido por TOTP, `canAccessDcc` e `isDeveloper`.

---

## 7. Backend / Database State

- **Migrations (001 a 009):**
  - Todas as 9 migrations em `apps/backend/src/migrations/` estão íntegras, com remoção defensiva de UTF-8 BOM via `db.ts`.
  - **Fragilidade:** Não há tabela `schema_migrations`; o boot do backend reexecuta todos os scripts SQL cegamente em cada inicialização.
- **Tabelas Ausentes no PostgreSQL:**
  - Tabela `printers`: **Inexistente no PostgreSQL** (armazenamento 100% em memória em `printers.ts`).
  - Tabela `print_jobs`: **Inexistente no PostgreSQL** (armazenamento 100% em memória em `printJobs.ts`).
  - Tabela `qrcodes`: **Inexistente no PostgreSQL** (armazenamento 100% em memória em `qrcodes.ts`).
- **Segurança e RBAC:**
  - Autenticação por bcrypt (custo 12), sessões com token de 256 bits, hash SHA-256 no banco, cookies HttpOnly e expiração de 8h.
  - RBAC com 25 permissões canônicas aplicadas fail-closed via `requirePermission()`.
  - Anti-IDOR estrito em todas as rotas administrativas via `req.principal.company.id`.
- **Vulnerabilidades de Segurança Ativas:**
  - **`qrcodes.ts:1-125`:** Rotas totalmente abertas e anônimas (sem auth, sem RBAC, sem CSRF).
  - **`printJobs.ts:89, 444`:** Rotas de criação de jobs sem middleware `requireCsrf`.
  - **`agents.ts:191-198`:** Bypass pré-RBAC que injeta privilégios de `ADMIN` de `'comp-matriz-01'` se flags de ambiente não estiverem ativas.
  - **Conflito de Tenant Padrão:** O backend de admin cria `'comp-default'`, enquanto rotas voláteis de impressoras e qrcodes usam `'comp-matriz-01'`.

---

## 8. Integration Foundation State

Auditada rigorosamente contra os contratos dos Pacotes 5.6 e 5.6.1:
- **Exatamente 6 Capabilities Canônicas:** `products.read`, `prices.read`, `inventory.read`, `logistics.read`, `healthcare.read`, `customers.read`.
- **Ausência Total de `orders.read`:** Rejeitada estritamente no schema Zod (`IntegrationManifestSchema`).
- **Segurança de Credenciais:** Coluna `credential_ref VARCHAR(128)` armazena unicamente referências opacas (Vault/Env). Zero credenciais ou segredos em texto puro.
- **Regra Opção A:** Empresas novas iniciam com **zero integrações ativas**. Campos canônicos iniciam com `availableForIntegration = false` até que haja conector ativo e mapeamento explícito.
- **Mapeamentos:** Mapeamentos multi-tenant relacionais na tabela `integration_field_mappings`. Mapeamentos direcionados ao namespace `system.*` são terminantemente bloqueados no backend (`code: SYSTEM_NAMESPACE_RESERVED`).
- **Presets Declarativos:** Os presets em `@witiquetas/contracts` são 100% estáticos/metadados. Não existe execução física de SQL externo, chamadas REST para ERPs, ingestão de CSV ou MCP no runtime.

---

## 9. Printing / Local Agent State

- **Impressoras:** CRUD presente no backend, mas 100% volátil em `printersStore = new Map()`.
- **Agentes Locais:**
  - Pareamento via código descartável de 8 dígitos (`WIT-XXXX-XXXX`).
  - Tokens de máquina com hash SHA-256 persistidos na tabela `agents`.
  - Agente local compilado em **Rust nativo** (`apps/agent-core`) como serviço Windows headless (`windows-service`).
  - *Fragilidade:* O agente grava seu token de máquina em JSON plano (`%ProgramData%\Witiquetas\Agent\identity.json`) sem proteção por DPAPI.
- **Fila de Impressão:**
  - 100% volátil em `printJobsStore = new Map()`. Reiniciar o backend apaga todos os jobs.
  - O claim é executado como efeito colateral no `GET /pending` sem transação ou lock pessismista.
  - Não há reaper para leases expirados.
- **Compiladores Térmicos:**
  - PPLA (`packages/printer-ppla`), PPLB (`packages/printer-pplb`) e ZPL (`packages/printer-core`): Suportam texto, preço, código de barras EAN-13, linha e retângulo. Rejeitam imagens com erro e ignoram QR Code no switch.
- **Transporte e Invariante:**
  - `RAW_TCP` (porta 9100) totalmente funcional no daemon Rust.
  - `WINDOWS_SPOOLER` e `SERIAL` tipados no contrato, mas rejeitados em runtime no agente.
  - **Invariante Respeitado:** O agente reporta estritamente `DELIVERED_TO_TRANSPORT` ao final da transmissão socket, **nunca** reportando `PRINTED` de forma simulada.

---

## 10. Multi-Niche State

Verificado diretamente contra `@witiquetas/label-schema`:
- **Número Real de Nichos:** Exatamente **11 nichos históricos** (`NICHES.length === 11`).
- **Tamanhos Físicos Únicos:** Exatamente **66 tamanhos cadastrados** (`LABEL_SIZES_CATALOG.length === 66`).
- **Associações Niche $\times$ Size:** Exatamente **112 relações registradas** (`NICHE_SIZE_RELATIONS.length === 112`).
- **Zero Drift:** O baseline de nichos e dimensões físicas está 100% alinhado aos invariantes históricos validados pela suíte `tests/nicheCatalogAndToolbox.test.ts`.
- **Governança de Elementos por Nicho:** Totalmente operacional via `getNicheToolboxConfig()` e refletida dinamicamente no `EffectiveConfigurationService`.

---

## 11. Tests / CI / Deployment

- **Inventário de Testes:**
  - 63 arquivos de teste em `tests/`.
  - 14 arquivos em `apps/frontend/src/editor/__tests__/` (órfãos).
  - 1 arquivo em `apps/backend/src/__tests__/` (órfão).
- **Vulnerabilidade Primária do Pipeline CI (`.github/workflows/docker.yml`):**
  - O workflow de CI **NÃO EXECUTA `npm test`**.
  - Apenas o `cargo test` do agente Rust é executado.
  - Todos os 63 testes em TypeScript rodam apenas localmente e estão desconectados do pipeline automatizado do GitHub Actions.
- **Testes com Falhas ou Defasagens Conhecidas:**
  - `tests/migration007.test.ts`: Falha com `assert.equal(files.length, 7)` pois existem 9 migrations no backend.
  - `tests/devControlInvariants.test.ts`: Divergência na asserção de soma de pesos (354 vs 356 real do `roadmap.json`).
- **Esteira de Deploy:**
  - Imutável e segura (`candidate-${SHA}` $\rightarrow$ Smoke test em Postgres isolado $\rightarrow$ Promoção para `:stable` via Docker manifest sem recompilação $\rightarrow$ Webhook Portainer $\rightarrow$ Verificação de `/api/version` e `/version.json`).

---

## 12. Documentation Drift

| Item Documentado | Fonte Canônica | Realidade no Código | Impacto / Drift |
| :--- | :--- | :--- | :--- |
| **Status da Fase 5** | `roadmap.json:717` e `ROADMAP.md:188` | Listada como `PLANNED` / `NOT_STARTED` | Código já implementou 29 capabilities da Fase 5. |
| **Versão em Produção** | `/version.json` e `/api/version` | Exibem textos `5.5.1.1` e `5.3.5` | Containers rodam commit `c6b18c1` (5.6.1 + harness). |
| **Soma de Pesos Roadmap**| `tests/devControlInvariants.test.ts:75` | Testa peso 354 | Soma real em `roadmap.json` é 356 (devido a `cap-maintenance-center`). |
| **Quantidade de Migrations**| `tests/migration007.test.ts:89` | Testa exatamente 7 arquivos | Existem 9 arquivos SQL em `apps/backend/src/migrations/`. |
| **Armazenamento do Agente**| `DOCUMENTACAO-AGENTE-LOCAL.md` | Previa DPAPI e SQLite | Agente grava em JSON plano e não referencia SQLite. |
| **Persistência de Impressoras**| Documentações da Fase 5 | Sugeriam repositório relacional | Implementado exclusivamente em `Map` em memória. |

---

## 13. Technical Debt

### Classificação P0 — Bloqueia Confiabilidade / Segurança / Risco de Duplicação Física
1. **`P0-1` — Fila de Print Jobs 100% em Memória RAM (`apps/backend/src/routes/printJobs.ts:86, 416`)**
   - *Evidência:* `printJobsStore = new Map()`, `printJobBatchesStore = new Map()`. Não existe tabela `print_jobs` no Postgres.
   - *Impacto:* Reiniciar o backend destrói todos os jobs e lotes pendentes ou em processamento.
   - *Pacote Sugerido:* **Package 5.7.1**.
2. **`P0-2` — Claim Concorrente sem Transação e Risco de Duplicação Física de Etiquetas (`apps/backend/src/routes/printJobs.ts:204-270`)**
   - *Evidência:* Claim é side-effect de `GET /pending` sobre loop JavaScript sem `FOR UPDATE SKIP LOCKED`. Impressoras compartilhadas sofrem claim por múltiplos agentes; lease de 60s sem renovação provoca re-claim de lotes longos já em impressão.
   - *Impacto:* Impressão duplicada de etiquetas fiscais/industriais no cliente.
   - *Pacote Sugerido:* **Package 5.7.1**.
3. **`P0-3` — Omissão Completa de `npm test` no Pipeline CI (`.github/workflows/docker.yml:25-27`)**
   - *Evidência:* O CI executa apenas `cargo test`. Nenhum teste TypeScript é executado no GitHub Actions.
   - *Impacto:* Código quebrado em TypeScript pode passar no CI e entrar direto em produção.
   - *Pacote Sugerido:* **Ajuste de CI / Qualidade**.
4. **`P0-4` — Rota de QR Codes Desprotegida (`apps/backend/src/routes/qrcodes.ts:1-125`)**
   - *Evidência:* Rotas sem `requireAuthenticatedUser`, sem `requirePermission` e sem `requireCsrf`.
   - *Impacto:* Vulnerabilidade pública permitindo manipulação anônima de QR codes.
   - *Pacote Sugerido:* **Hotfix de Segurança**.
5. **`P0-5` — Bypass Pré-RBAC com Privilégios de Administrador (`apps/backend/src/routes/agents.ts:191-198`)**
   - *Evidência:* Injeção automática de `role: 'ADMIN'` e `companyId: 'comp-matriz-01'` caso flags de RBAC não estejam ativas.
   - *Impacto:* Risco de bypass de autorização em ambientes mal configurados.
   - *Pacote Sugerido:* **Hotfix de Segurança**.

### Classificação P1 — Importante, mas Não Bloqueia Imediatamente
1. **`P1-1`:** Impressoras mantidas em `Map` volátil sem tabela PostgreSQL (`apps/backend/src/routes/printers.ts:94`).
2. **`P1-2`:** Conflito de identificador de tenant padrão (`comp-default` no admin vs `comp-matriz-01` nas impressoras/qrcodes).
3. **`P1-3`:** Ausência de tabela de controle de migrations (`schema_migrations`) em `apps/backend/src/db.ts`.
4. **`P1-4`:** Ausência de CSRF em `POST /api/print-jobs` e `POST /api/print-jobs/batch` (`printJobs.ts:89, 444`).
5. **`P1-5`:** Quebra estática de `tests/migration007.test.ts` (espera 7 migrations, existem 9).
6. **`P1-6`:** 15 arquivos de testes órfãos dentro de `apps/frontend/src/editor/__tests__/` e `apps/backend/src/__tests__/`.
7. **`P1-7`:** Token de máquina do Agente Local gravado em JSON plano sem DPAPI (`apps/agent-core/src/pairing.rs:54-76`).
8. **`P1-8`:** Senha padrão de bootstrap hardcoded `'Admin@123456'` em `adminBootstrapService.ts:159`.
9. **`P1-9`:** Defeito de renderização de retângulo no PPLB (`LO` em vez de `X`) em `packages/printer-pplb/src/index.ts:84`.
10. **`P1-10`:** Compiladores PPLA, PPLB e ZPL rejeitam elementos `image` e omitem `qrcode` no switch de renderização.

### Classificação P2 — Melhoria Futura
1. **`P2-1`:** Discrepância na soma de pesos do roadmap (356 no JSON vs 354 no teste de invariantes).
2. **`P2-2`:** Drift de strings de versão em `/version.json` e `/api/version`.
3. **`P2-3`:** `ROADMAP.md` e status da Fase 5 em `roadmap.json` desatualizados em relação aos pacotes já implementados.
4. **`P2-4`:** Arquivo legado duplicado em `infrastructure/github-actions/docker.yml`.
5. **`P2-5`:** Script de build raiz `"build": "echo 'Build OK'"` não compila monorepo.
6. **`P2-6`:** Transportes `WINDOWS_SPOOLER` e `SERIAL` tipados no contrato, mas sem implementação no daemon Rust.
7. **`P2-7`:** Uso de shims in-memory em testes locais mascarando tipagem real do Zod e do PostgreSQL.

---

## 14. Open Risks

1. **Risco de Duplicação Física de Impressão:** Se um cliente imprimir um lote grande de etiquetas, a expiração do lease de 60s sem renovação causará reenvio duplicado para a impressora térmica.
2. **Risco de Perda Total de Filas em Produção:** Qualquer reinício do container backend em Portainer limpa instantaneamente todos os print jobs e impressoras cadastradas em memória.
3. **Risco de Débito de Homologação nos Pacotes Anteriores:** Os Pacotes 5.4 e 5.5 continuam com status `IMPLEMENTED` aguardando revalidação, enquanto os Pacotes 5.6 e 5.6.1 foram formalmente homologados com sucesso pelo usuário (Baseline 6436984).

---

## 15. Package 5.7 Readiness

### Status Objetivo: **READY (Pronto para Execução)**

### Condições e Pré-Requisitos:
1. **Homologação Manual dos Pacotes 5.6 e 5.6.1 CONCLUÍDA:**  
   A homologação manual foi realizada com sucesso pelo usuário e devidamente registrada no DCC (`checkpoints.json` e `roadmap.json`). O principal bloqueador de governança foi superado.
2. **Arquitetura de Transição Relacional Desenhada:**  
   O Package 5.7 é a fundação relacional mandatória que cria a tabela `printers` no PostgreSQL, o repositório `printersRepository`, a tipagem de hardware (instância física vs profile) e elimina o conflito de tenant (`comp-matriz-01` vs `comp-default`), preparando o terreno para a fila persistente do 5.7.1.

---

## 16. Package 5.7.1 Assessment

### Avaliação: **REQUIRED (Absolutamente Mandatório)**

A auditoria factual confirmou linha a linha que os riscos **P0-1** e **P0-2** continuam ativos e críticos no código atual:
- A migration 004 criou tabelas de lotes, mas a tabela central `print_jobs` nunca foi criada no banco.
- Toda a fila de impressão opera sobre `Map` volátil em `apps/backend/src/routes/printJobs.ts`.
- O mecanismo de claim no `GET /pending` não oferece isolamento concorrente ACID e não possui renovação transacional de lease.
- **Conclusão:** O Package 5.7.1 (Persistência da Fila de Impressão & Lease Safety com `FOR UPDATE SKIP LOCKED`) é indispensável antes que a Central de Impressão (Fase 4) possa ser descongelada com segurança. Depende diretamente da infraestrutura de impressoras relacionais estabelecida no 5.7.

---

## 17. Recommended Next Execution

A sequência recomendada e segura de retomada é:

1. **Etapa 1 — Reconciliação Documental Concluída:**
   - Pacotes 5.6 e 5.6.1 formalmente registrados como `HOMOLOGATED` em `checkpoints.json`, `roadmap.json` e `estado-atual.md`.
2. **Etapa 2 — Execução do Package 5.7 (Printers & Local Agents Governance):**
   - Criação da migration `010_create_printers_table.sql`.
   - Criação de `apps/backend/src/repositories/printersRepository.ts` com isolamento multi-tenant real.
   - Migração de `apps/backend/src/routes/printers.ts` de `Map` em memória para persistência no PostgreSQL.
   - Resolução do conflito de tenant padrão (`comp-default`).
   - Definição formal de `Physical Printer Instance` vs `Printer Profile`.
   - Expurgo do bypass pré-rbac em `agents.ts`.
3. **Etapa 3 — Execução do Package 5.7.1 (Persistent Print Queue & Lease Safety):**
   - Criação da migration `011_create_print_jobs_table.sql`.
   - Implementação de `claimPendingJobs` transacional com `FOR UPDATE SKIP LOCKED`.
   - Endpoint de renovação de lease (`POST /api/print-jobs/:id/lease-renew`).
4. **Etapa 4 — Descongelamento Seguro da Central de Impressão (Fase 4 Unfreeze).**

---

## 18. Files / Ownership Map

Mapeamento de posse e conflitos potenciais para a execução do próximo pacote (**Package 5.7**):

| Módulo / Camada | Arquivos Envolvidos no Pacote 5.7 | Risco de Conflito Concorrente |
| :--- | :--- | :--- |
| **Banco / Migrations** | `apps/backend/src/migrations/010_create_printers_table.sql`<br>`apps/backend/src/db.ts` | **Baixo** (nova migration sequencial; append-only). |
| **Backend Repositories**| `apps/backend/src/repositories/printersRepository.ts` [NOVO]<br>`apps/backend/src/repositories/agentsRepository.ts` | **Baixo** (repositório novo isolado). |
| **Backend Routes** | `apps/backend/src/routes/printers.ts`<br>`apps/backend/src/routes/agents.ts` | **Médio** (remoção de in-memory store; requer atenção a CSRF/RBAC). |
| **Contratos & Schemas**| `packages/contracts/src/index.ts` | **Baixo** (extensão de DTOs de impressoras e profiles). |
| **Frontend Admin** | `apps/frontend/src/modules/admin/PrintersAdminView.tsx` [NOVO]<br>`apps/frontend/src/modules/admin/AgentsAdminView.tsx` [NOVO]<br>`apps/frontend/src/modules/admin/AdminPage.tsx` | **Médio** (adicionar abas Impressoras e Agentes na Administração). |
| **Frontend Shell** | `apps/frontend/src/App.tsx`<br>`apps/frontend/src/shell/navigation.ts` | **Baixo** (rotas `#printers` e `#agents` passando de placeholder para alias canônico). |
| **Testes** | `tests/package57PrintersAndAgentsGovernance.test.ts` [NOVO] | **Zero** (suíte nova isolada). |

---
*Relatório de auditoria consolidado e finalizado em modo 100% READ-ONLY.*
