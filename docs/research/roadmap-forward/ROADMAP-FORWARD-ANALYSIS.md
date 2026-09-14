# WITIQUETAS — ROADMAP FORWARD ANALYSIS
**Documento Canônico de Pesquisa e Auditoria de Roadmap**  
**Trilha Paralela:** ROADMAP FORWARD PREPARATION  
**Data:** 14/09/2026  
**Status:** PESQUISA PREPARATÓRIA / NÃO-EXECUTÁVEL (Sem impacto em runtime)  
**Conformidade:** Alinhado a `AGENTS.md`, `CONTEXT.md`, `ROADMAP.md`, `docs/development-control/*` e `skills/*`.

---

## 1. INTRODUÇÃO E ESCOPO

Este documento consolida a auditoria do estado atual do Witiquetas e estabelece o planejamento estratégico para os pacotes subsequentes à estabilização administrativa (Pacotes 5.7, 5.8, Descongelamento da Fase 4, Fase 6, Fase 7 e Fase 8).

Esta trilha opera em **estrito desacoplamento do Pacote 5.6 (Integration Foundation)**, que se encontra em andamento em outra sessão. Nenhuma capability foi promovida para `IMPLEMENTED`, nenhuma linha de código de runtime foi alterada, nenhum schema foi modificado e nenhuma dependência bloqueante foi criada.

---

## 2. AUDITORIA DO ESTADO ATUAL DO WITIQUETAS

### 2.1 Alinhamento e Diagnóstico de Governança
A auditoria cruzada entre `docs/development-control/project.json`, `roadmap.json` e `checkpoints.json` identifica:
- O cabeçalho de `project.json` lista `"currentPhase": "4"` por conservadorismo histórico.
- **A Fase 4 (Central de Impressão Universal e Perfis Multi-Nicho)** teve seu baseline funcional e visual formalmente congelado e pausado sob o marco `PRINT_CENTER_BASELINE_FREEZE` (Pacote 4.5.6-governance, commit `ec6434f`). Todos os 11 nichos, 66 tamanhos e 112 relações de templates, bem como os elementos visuais do Editor (Price único, Line com redimensionamento/rotação, manual text precedence, datas tipadas), estão homologados e protegidos contra regressão.
- **A Fase 5 (Administração e Governança da Aplicação)** é a fase de desenvolvimento ativo:
  - **Pacote 5.1 (Fundação Multi-Tenant & RBAC Relacional):** HOMOLOGATED.
  - **Pacote 5.2 (Autenticação, Sessão Segura e Contexto Efetivo):** HOMOLOGATED.
  - **Pacote 5.3 + Hotfixes 5.3.1 a 5.3.5 (Admin Shell, Empresa, Usuários, Perfis, Permissões e Autenticação Dev com TOTP):** HOMOLOGATED (commit `6809838`).
  - **Pacote 5.4 (Administração de Nichos, Elementos Visuais e Campos Canônicos):** IMPLEMENTED (30/30 testes verdes, aguardando validação manual).
  - **Pacote 5.5 + Hotfixes 5.5.1 a 5.5.1.3 (Effective Configuration no Editor, Toolbox dinâmica, FieldPicker governado, sincronização multi-aba e guards de entrada/saída):** IMPLEMENTED (suíte automatizada aprovada, aguardando homologação manual dos cenários B1/C1/D1).
  - **Patch Governance (commit `673064c`):** HOMOLOGATED (`AGENTS.md`, `CONTEXT.md`, `DESIGN.md`, `docs/governance/`, `skills/`).
  - **Pacote 5.6 (Admin de Impressoras e Agentes Locais):** IN_PROGRESS em trilha paralela.

---

### 2.2 Inventário Consolidado de Capabilities

#### A. Capabilities HOMOLOGATED
| ID | Nome | Módulo / Fase | Evidências no Repositório |
| :--- | :--- | :--- | :--- |
| `cap-monorepo-setup` | Monorepo Node/TypeScript | Foundation (Fase 0) | `packages/contracts`, `packages/label-schema`, `packages/printer-core` |
| `cap-docker-cicd` | CI/CD GitHub Actions & Portainer | Deployment (Fase 0) | `.github/workflows/docker.yml`, Dockerfiles |
| `cap-infra-storage-db` | PostgreSQL & MinIO S3 Fail-Closed | Foundation (Fase 0) | `apps/backend/src/db.ts`, rotas de health |
| `cap-canvas-core` | Canvas Interativo, Zoom, Bounds | Editor (Fase 1) | `apps/frontend/src/editor/CanvasArea.tsx`, `bounds.ts` |
| `cap-visual-elements` | Elementos Visuais Canônicos | Elements (Fase 1) | Componentes do Editor com renderização vetorial |
| `cap-undo-redo-state` | Store Reativa e Undo/Redo | Editor (Fase 1) | `useEditorStore.ts` |
| `cap-pplb-compiler` | Compilador PPLB Nativo e Métricas | Compilers (Fase 2) | `packages/printer-pplb` (61 Golden Tests 100% OK) |
| `cap-ppla-compiler` | Compilador PPLA Base | Compilers (Fase 2) | `packages/printer-ppla`, homologação física em bancada |
| `cap-legacy-importer` | Importador PPLB com Round-Trip Zero | Importers (Fase 2) | `packages/printer-pplb/src/importer.ts`, Golden Model 16 |
| `cap-agent-core-rust` | Daemon Rust Headless x64 | Agent (Fase 3) | `apps/agent-core`, CI build, download endpoint |
| `cap-agent-pairing` | Pareamento de Agentes e Heartbeat | Agent (Fase 3) | `PairAgentModal.tsx`, `routes/agents.ts` |
| `cap-app-shell-ux` | Application Shell e Sidebar | App Shell (Fase 3.5) | `ApplicationShell.tsx`, `Sidebar.tsx` |
| `cap-model-lifecycle-db` | CRUD de Modelos em PostgreSQL | Lifecycle (Fase 3.5) | `templateRepository.ts`, `ModelsPage.tsx` |
| `cap-concurrency-presence` | Lock Otimista 409 e Presença | Concurrency (Fase 3.5)| `presenceRepository.ts`, PATCH 3.2.8.3 |
| `cap-toolbar-geometry-stabilization`| Container 140px Toolbar | App Shell (Fase 3.5) | `EditorLayout.tsx`, zero layout shift |
| `cap-multiniche-profiles` | Catálogo de 11 Nichos e Tamanhos | Multi-Nicho (Fase 4) | 11 nichos, 66 tamanhos, 112 relações homologadas |
| `cap-logo-element` | Elemento Imagem com Fail-Closed | Elements (Fase 4) | `shapeAndImage.test.ts`, bloqueio estrito em compilador |
| `cap-element-transformations` | Rotações 0/90/180/270° Canônicas | Editor (Fase 4) | `elementRotation.test.ts`, snap magnético e AABB |
| `cap-shape-element` | Unificação Linha/Retângulo/Shape | Elements (Fase 4) | Popover Forma compacto com retrocompatibilidade |
| `cap-layers-multiselect` | Multiseleção em Camadas (Ctrl/Cmd) | Editor (Fase 4) | Sincronização 100% com canvas |
| `cap-editor-toolbar-compactness`| Compactação de Toolbar | App Shell (Fase 4) | Fluxo vertical na sidebar |
| `cap-single-price-element` | Elemento Preço Único | Elements (Fase 4) | Eliminação de duplicidade promocional |
| `cap-line-resize-restored` | Resize de Linha Restaurado | Elements (Fase 4) | Preservação do tipo canônico `line` |
| `cap-line-rotation-restored`| Rotação de Linha Restaurada | Elements (Fase 4) | Bounding box geométrico exato |
| `cap-manual-text-precedence`| Precedência de Texto Manual | Elements (Fase 4) | Precedência estrita sobre dados de binding |
| `cap-typed-expiration-date`| Validade Tipada DD/MM/AAAA | Elements (Fase 4) | Máscara e formatação canônica |
| `cap-system-print-date` | Campo Data de Impressão Sistema | Elements (Fase 4) | `_sistema.dataImpressao` resolvido em runtime |
| `cap-company-settings` | Configurações Multi-Tenant | Admin (Fase 5) | `companyRepository.ts`, `adminRbacFoundation.test.ts` |
| `cap-enabled-niches` | Habilitação de Nichos por Empresa | Admin (Fase 5) | Associação relacional `company_niches` |
| `cap-enabled-elements` | Elementos Habilitados por Nicho | Admin (Fase 5) | Associação relacional `company_elements` |
| `cap-enabled-fields` | Campos Habilitados por Empresa | Admin (Fase 5) | Governança relacional de campos canônicos |
| `cap-login` | Login Seguro com Rate Limiting | Auth/RBAC (Fase 5) | Bcrypt, cookies HttpOnly, CSRF tokens |
| `cap-session` / `cap-logout`| Ciclo de Sessão e Revogação | Auth/RBAC (Fase 5) | Tokens SHA-256 de 256 bits, invalidação imediata |
| `cap-session-context` | Endpoint Contexto Efetivo | Auth/RBAC (Fase 5) | `/api/session/context` unificado |
| `cap-user-management` | Gestão de Usuários Corporativos | Auth/RBAC (Fase 5) | CRUD completo com isolamento por `company_id` |
| `cap-user-status` | Status do Usuário (Ativo/Bloqueado)| Auth/RBAC (Fase 5) | Fail-closed para usuários inativos |
| `cap-user-company-assignment`| Vínculo Usuário-Empresa | Auth/RBAC (Fase 5) | Suporte a filiais e redes |
| `cap-role-management` | Gestão de Perfis de Acesso | Auth/RBAC (Fase 5) | Papéis canônicos e customizados |
| `cap-permission-catalog` | Catálogo de 25 Permissões | Auth/RBAC (Fase 5) | Dicionário estrito `CANONICAL_PERMISSIONS` |
| `cap-role-permissions` | Mapeamento Papel-Permissões | Auth/RBAC (Fase 5) | Granularidade por perfil |
| `cap-user-role-assignment`| Atribuição Usuário-Papel | Auth/RBAC (Fase 5) | Tabela `user_roles` com FK composta |
| `cap-niche-access-control`| Acesso a Nichos por Perfil | Auth/RBAC (Fase 5) | Segurança setorial (ex: Farmácia vs Depósito) |
| `cap-admin-shell` | Shell da Área Administrativa | Admin (Fase 5) | Layout unificado com navegação modular |
| `cap-admin-company` | UI de Gestão de Empresa | Admin (Fase 5) | Edição de dados cadastrais e parâmetros |
| `cap-admin-users` | UI de Gestão de Usuários | Admin (Fase 5) | Listagem, busca, convite e papéis |
| `cap-admin-roles` | UI de Perfis e Permissões | Admin (Fase 5) | Matriz em coluna única com alinhamento flexbox |
| `cap-authz-enforcement` | Middleware Fail-Closed | Admin (Fase 5) | Interceptador global em todas as rotas da API |
| `gov-agent-skills-architecture`| Arquitetura de Skills e Governança| Governance | `AGENTS.md`, `CONTEXT.md`, `skills/*` |

#### B. Capabilities IMPLEMENTED (Aguardando Homologação Manual ou Congeladas)
| ID | Nome | Situação Atual | Próximo Passo para Homologação |
| :--- | :--- | :--- | :--- |
| `cap-universal-print-center` | Central de Impressão Universal | Baseline implementado e congelado (`PRINT_CENTER_BASELINE_FREEZE`) | Descongelamento pós-5.6 e 5.7 com impressoras e campos persistidos. |
| `cap-admin-niches-elements` | UI de Nichos, Elementos e Campos | Implementado no Pacote 5.4 (30/30 testes verdes) | Homologação manual em tela das alterações contextuais. |
| `cap-effective-configuration` | Configuração Efetiva no Editor | Implementado no Pacote 5.5 + Hotfixes 5.5.1 a 5.5.1.3 | Revalidação manual dos cenários de teste B1, C1 e D1. |
| `cap-development-control-center-backend` | DCC Backend API | Operacional restrito a `PLATFORM_DEVELOPER` | Validação contínua interna. |
| `cap-development-control-center-frontend`| DCC Frontend UI | Operacional restrito a `PLATFORM_DEVELOPER` | Validação contínua interna. |

#### C. Capabilities IN_PROGRESS
- `cap-admin-printers-agents`: Gestão administrativa de impressoras de rede e agentes locais no Pacote 5.6 (em andamento na trilha principal).

#### D. Capabilities PLANNED (Fase 5 restante, Fase 6, Fase 7 e Fase 8)
- **Fase 5 (Pacotes 5.7 e 5.8):** `cap-integration-registry`, `cap-canonical-field-registry`, `cap-integration-field-mapping`, `cap-integration-capability-matrix`, `cap-integration-contract-export`, `cap-admin-integrations`, `cap-pricing-policy-model`, `cap-price-rule-types`, `cap-price-validity`, `cap-price-resolution`, `cap-admin-audit`, `cap-admin-audit-log`, `cap-config-change-audit`, `cap-maintenance-center`, `cap-licensing-billing`, `cap-rbac-multi-tenant`.
- **Fase 6 (Novas Linguagens):** `cap-zpl-compiler`, `cap-printer-kb`.
- **Fase 7 (Integrações ERP Nativas):** `cap-erp-integration-sdk`.
- **Fase 8 (Manutenção Assistida por IA):** Diagnóstico sanitizado e suporte inteligente.

---

## 3. MAPEAMENTO DE DEPENDÊNCIAS ENTRE PRÓXIMOS PACOTES

```
┌──────────────────────────────────────────────┐
│  Pacotes 5.4 / 5.5 / 5.5.1.x                 │
│  (Niches, Elements, Effective Config Editor) │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│  Pacote 5.6 (IN_PROGRESS)                    │
│  Admin de Impressoras e Agentes Locais       │
└──────────────────────┬───────────────────────┘
                       │
       ┌───────────────┴───────────────┐
       ▼                               ▼
┌──────────────────────────────┐ ┌──────────────────────────────┐
│ Pacote 5.7A                  │ │ Pacote 5.7B                  │
│ Mapeamento de Integrações e  │ │ Fundação do Domínio de       │
│ Contrato OpenAPI Público     │ │ Políticas de Preço (PriceRule)│
└──────────────┬───────────────┘ └──────────────┬───────────────┘
               │                                │
               └───────────────┬────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ DESCONGELAMENTO DA CENTRAL DE IMPRESSÃO (Fase 4 Unfreeze)    │
│ Integração com Impressoras Reais, Agentes e Dados de ERP     │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ MVP COMERCIAL COMPLETO E HOMOLOGADO EM BANCADA               │
└──────────────────────────────┬───────────────────────────────┘
                               │
       ┌───────────────────────┴───────────────────────┐
       ▼                                               ▼
┌──────────────────────────────┐       ┌──────────────────────────────┐
│ Pacote 5.8                   │       │ FASE 6                       │
│ Auditoria Imutável,          │       │ Compilador Zebra ZPL II      │
│ Maintenance Center e Licenças│       │ e Expansão de Hardware       │
└──────────────────────────────┘       └──────────────────────────────┘
```

---

## 4. CAMINHO CRÍTICO (CRITICAL PATH) DO PROJETO

O Caminho Crítico para atingir o MVP Operacional Comercial segue estritamente 6 marcos sequenciais bloqueantes:

1. **Marco 1 — Homologação Formal de 5.4 e 5.5.1.x:** Validação visual do usuário para registrar checkpoints como `HOMOLOGATED`.
2. **Marco 2 — Conclusão do Pacote 5.6 (Admin Impressoras & Agentes):** Migração das impressoras de rede e agentes pareados para tabelas relacionais com `company_id`.
3. **Marco 3 — Pacote 5.7A (Integration Field Mapping & Canonical Dictionary):** Dicionário de campos canônicos e interface de de-para para consumo de dados externos sem mutação de schema.
4. **Marco 4 — Descongelamento Controlado da Central de Impressão (Fase 4 Unfreeze):** Substituição de dados mocados por impressoras reais (5.6) e campos dinâmicos mapeados (5.7A).
5. **Marco 5 — Validação Física Ponta a Ponta:**
   $$\text{ERP / Dados} \longrightarrow \text{LabelDocument} \longrightarrow \text{Compilador PPLB} \longrightarrow \text{PrintJob} \longrightarrow \text{Agent Local} \longrightarrow \text{Impressora Física}$$
6. **Marco 6 — Lançamento do MVP Comercial e Expansão para Fase 6 (ZPL II).**

---

## 5. TAREFAS QUE PODEM OCORRER EM PARALELO (ZERO CONFLITO)

Para maximizar a produtividade da equipe sem riscos de merge conflict no monorepo, foram mapeadas 4 trilhas independentes:

| Trilha | Escopo Técnico | Localização no Monorepo | Dependências / Bloqueios |
| :--- | :--- | :--- | :--- |
| **Trilha A (Admin Web Principal)** | Finalização de 5.6 e implementação de 5.7A (Field Mapping UI). | `apps/backend/src/routes/admin.ts`, `apps/frontend/src/modules/admin/` | Segue o Caminho Crítico. Não mexe em editor nem compiladores. |
| **Trilha B (Compiladores / Core)** | Desenvolvimento do pacote `packages/printer-zpl` (Fase 6). Implementação de AST ZPL, fontes nativas e Golden Tests. | `packages/printer-zpl` (novo pacote) | **100% ISOLADA.** Consome apenas `@witiquetas/label-schema`. Zero risco de conflito com 5.6. |
| **Trilha C (Agente Local / Rust)** | Hardening do daemon Rust: suporte a spooler RAW Win32, serial RS-232 com RTS/CTS e discovery mDNS. | `apps/agent-core` | **100% ISOLADA.** Baseada em Rust/Cargo. Não afeta TypeScript. |
| **Trilha D (Qualidade & CI/CD)** | Ativação de `npm test` no GitHub Actions, substituição de `zod-shim.js` e criação de testes de isolamento multi-tenant. | `.github/workflows/`, `tests/` | **100% ISOLADA.** Melhoria contínua de confiabilidade sem alterar runtime. |

---

## 6. PROPOSTA ESTRUTURADA PARA OS PRÓXIMOS PACOTES

### 6.1 Pacote 5.7 — Integration Field Mapping & Pricing Domain

#### Sub-Pacote 5.7A: Mapeamento de Integrações e Catálogo Canônico
- **Tabelas Relacionais:**
  - `canonical_fields`: Identificador universal (`produto.preco`, `lote.numero`, `validade.data`).
  - `company_integrations`: Conectores configurados por tenant (Protheus, Bling, SAP B1, Arquivo CSV).
  - `integration_field_mappings`: Regras declarativas de de-para (`external_field` $\rightarrow$ `canonical_field_id`).
- **Backend:** `IntegrationFieldMappingService` que normaliza dados brutos de entrada antes da injeção no `LabelDocument`. Exportação de especificação OpenAPI em `/api/admin/integrations/contract/openapi.json`.
- **Frontend:** Nova aba `Integrações` no Admin com assistente visual de correspondência de colunas e testador de payload.

#### Sub-Pacote 5.7B: Domínio de Políticas de Preço (`PriceRule`)
- **Regra Inviolável:** Existe **UM ÚNICO** elemento visual no Editor: `Price`. Nenhum elemento novo é criado.
- **Entidade `PriceRule`:** Tipos canônicos (`REGULAR`, `PROMOTIONAL`, `WHOLESALE`, `CLUB`, `LOYALTY`, `CLEARANCE`), vigência temporal (`validFrom`, `validTo`), quantidade mínima e prioridade.
- **Resolvedor:** Algoritmo determinístico que calcula o preço ativo prioritário com fallback para preço regular no momento da impressão.

---

### 6.2 Pacote 5.8 — Auditoria Imutável, Maintenance Center & Licenciamento

#### Sub-Pacote 5.8A: Auditoria Imutável (Audit Center)
- Tabela append-only `audit_logs` (sem permissão de `UPDATE`/`DELETE`).
- Registro com snapshot before/after de alterações críticas em configurações, usuários e permissões.
- Aba `Auditoria` no Admin com filtros por data, usuário, ação e diff visual.

#### Sub-Pacote 5.8B: Central de Manutenção (Maintenance Center)
- Módulo developer-only acessível via DCC com TOTP RFC 6238.
- Catálogo de operações tipadas: `DIAGNOSTIC` (verificações não-mutantes), `SAFE_MAINTENANCE` (limpeza de sessões e locks expirados) e `CRITICAL_MAINTENANCE` (reparo de modelos, reprocessamento de jobs com dry-run obrigatório). Proibido terminal/shell arbitrário.

#### Sub-Pacote 5.8C: Gestão de Licenças e Dispositivos
- Tabela `company_licenses` controlando limite de impressoras ativas, agentes pareados e modalidade contratual com bloqueio fail-soft.

---

### 6.3 Transição para a Fase 6 (Zebra ZPL II e Novas Linguagens)

Após a consolidação de 5.6 e 5.7:
1. **Descongelamento da Central de Impressão:** Conectar a grade aos dados do conector ERP (5.7A) e o despacho às impressoras relacionais (5.6).
2. **Kickoff da Fase 6:**
   - Criação de `packages/printer-zpl` com suporte completo a comandos nativos Zebra (`^XA`, `^XZ`, `^FO`, `^FD`, `^FS`, `^A0`, `^BE`, `^BC`, `^BQ`, `^GB`).
   - Implementação da `Printer Language Knowledge Base` com catalogação detalhada de TSC (TSPL), Datamax (DPL) e Eltron (EPL).
   - Homologação em bancada física com impressoras Zebra (ZD220/230) e Elgin (L42 Pro).
