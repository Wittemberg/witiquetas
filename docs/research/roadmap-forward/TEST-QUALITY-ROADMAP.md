# WITIQUETAS — TEST & QUALITY ROADMAP
**Auditoria da Suíte de Testes e Estratégia de Qualidade Industrial**  
**Trilha Paralela:** ROADMAP FORWARD PREPARATION  
**Data:** 14/09/2026  
**Status:** AUDITORIA TÉCNICA / PLANO ESTRATÉGICO DE QUALIDADE  
**Conformidade:** Alinhado a `AGENTS.md`, `CONTEXT.md`, `docs/operations/RELEASE-SAFETY.md`, `tests/*` e `.github/workflows/docker.yml`.

---

## 1. INVENTÁRIO E DIAGNÓSTICO DO ESTADO ATUAL

Foi realizada uma auditoria nos **67 arquivos da pasta `tests/`**, na suíte Rust em `apps/agent-core/tests/` e no pipeline de integração contínua:

### 1.1 Distribuição Quantitativa por Tipologia
| Categoria | Arquivos Representativos | Casos / Asserções Estimadas | Foco Operacional |
| :--- | :--- | :--- | :--- |
| **Golden & Round-Trip Diff Zero** | `goldenE2E.test.ts`, `pplaImporter.test.ts`, `importers.test.ts`, `modelsRoundtrip.test.ts` | ~45 cenários | Preservação exata de comandos legados não alterados no editor. |
| **Domain & Effective Config** | `package55EffectiveConfigEditor.test.ts`, `homologationPackage55.test.ts`, `package54NichesElementsFields.test.ts`, `hotfix551SessionSyncAndAuthorization.test.ts` | ~160 cenários | Herança hierárquica Platform $\rightarrow$ Company $\rightarrow$ Niche $\rightarrow$ Role $\rightarrow$ User $\rightarrow$ Model. |
| **Segurança & RBAC Multi-Tenant** | `adminRbacFoundation.test.ts`, `authSessionRbac.test.ts`, `adminManagement.test.ts`, `hotfix533PermissionMatrix.test.ts`, `migration007.test.ts` | ~180 cenários | 25 permissões canônicas, isolamento cross-tenant, expiração e tokens CSRF. |
| **Geometria & Algoritmos de Layout** | `boundsEngine.test.ts`, `elementRotation.test.ts`, `barcodePplb.test.ts`, `textPplb.test.ts`, `physicalUnits.test.ts` | ~75 cenários | Conversão mm/dots (203/300 DPI), rotação ortogonal, clamping nos limites da etiqueta. |
| **E2E & Subprocesso (Local Agent)** | `agentCoreE2E.test.ts`, `resident_service_tests.rs` (Rust), `backendAgentProtocol.test.ts`, `agentPairingFlow.test.ts` | ~55 cenários | Binário x64 real, polling HTTP, handshake, socket RAW TCP, status `DELIVERED_TO_TRANSPORT`. |
| **Central de Impressão & Frontend** | `printCenter.test.ts`, `printCenterPreviewHotfix.test.ts`, `printCenterVisual.test.ts`, `layersMultiselect.test.ts` | ~40 cenários | Bindings dinâmicos, grade de batches, renderização estática e preview. |
| **Safety Gates & Invariantes DCC** | `safetyGates.test.ts`, `devControlInvariants.test.ts`, `bundleSmoke.test.ts`, `cssSmoke.test.ts` | ~25 cenários | Regras de congelamento, pesos do roadmap (354 total / 211 MVP), guards de CSS. |
| **TOTAL GERAL** | **61 arquivos de teste + 7 shims** | **~580 cenários** | Cobertura abrangente com execução rápida via `node:test` e `cargo test`. |

---

### 1.2 Áreas de Alta Confiabilidade
1. **PPLB Golden Tests & Round-Trip Diff Zero:** Validação milimétrica sobre modelos legados reais (`legacy_gondola_100x30.prn`).
2. **RBAC Multi-Tenant e Autenticação:** Isolamento relacional comprovado contra acessos cruzados entre empresas vizinhas e hashing de senhas.
3. **Effective Configuration:** Resolução dinâmica de elementos e campos no Editor sem mutação de templates legados (`EXISTING_DISABLED_ELEMENT`).
4. **Agente Local Rust:** Daemon nativo validado como subprocesso real, garantindo a invariante `DELIVERED_TO_TRANSPORT` $\neq$ `PRINTED`.

---

### 1.3 Vulnerabilidades Críticas Identificadas (Alerta Vermelho)

1. **Vulnerabilidade do `zod-shim.js` (Falso Positivo Generalizado):**
   - O loader de testes (`tests/ts-loader.js`) intercepta o módulo `zod` e redireciona para `tests/zod-shim.js`.
   - O método `safeParse()` deste shim retorna sempre `{ success: true, data }` sem validar tipos ou propriedades obrigatórias.
   - **Risco:** Testes de schema (`schema.test.ts`) não estão validando nada. Um erro de tipagem no schema passa despercebido.
2. **Dependência de Memória com `pg-shim.js`:**
   - O banco PostgreSQL é substituído por um stub em memória (`pg-shim.js`). Restrições relacionais reais (foreign keys compostas, transações ACID e triggers) não são testadas pelo banco real na suíte do Node.
3. **Ausência de `npm test` no Pipeline do GitHub Actions (`docker.yml`):**
   - O workflow CI compila o Rust e executa `cargo test`, mas **NUNCA executa a suíte de testes TypeScript (`npm test`)** antes do build Docker e deploy. Falhas de regressão no backend/frontend não cancelam o deploy em produção.
4. **Ausência de Testes em Browser Real (Canvas Konva):**
   - Os testes de frontend usam `renderToStaticMarkup` com `konva-shim.js`, sem validar Context2D, arraste de elementos com mouse ou regressão visual pixel a pixel.

---

## 2. LACUNAS DE TESTES PARA OS PRÓXIMOS PACOTES

1. **Round-Trip com Fixtures Heterogêneos:** Faltam fixtures de etiquetas em 2 e 3 colunas, gráficos bitmap legados (`GW` em PPLB, `~DG` em ZPL) e acentuação no charset Windows-1252.
2. **Compiladores e Novas Linguagens:** Ausência de suíte de testes para ZPL avançado (Code 128 `^BC`, QR Code `^BQ`), e ausência total de testes para EPL, TSPL e DPL.
3. **Importers com Arquivos Corrompidos:** Faltam testes defensivos de parsing com quebras de linha mistas (`\r\n` / `\n`), aspas desbalanceadas e caracteres nulos.
4. **Effective Configuration em Cadeia:** Faltam testes de borda para partição de cache e conflito de múltiplas roles ("deny vs allow").
5. **Segurança Multi-Tenant (IDOR Fuzzing):** Falta teste automatizado de injeção de `company_id` nos corpos de requisição para garantir rejeição server-side.
6. **Agente Local sob Caos:** Faltam testes simulando queda de rede no meio da transmissão (> 0 bytes enviados) para verificar se o status fica em `UNKNOWN_RESULT` e não duplica a etiqueta.
7. **Central de Impressão sob Falha de Hardware:** Falta teste de lote de 1.000 etiquetas onde a impressora fica sem papel na etiqueta 350 (retomada a partir do item 351).
8. **Regressão Visual de Canvas:** Falta comparação visual automatizada (Playwright + Pixelmatch com threshold de 0.1%) para o Canvas Konva.

---

## 3. MATRIZ DE GATES DE QUALIDADE (GATES 1 A 7)

Para assegurar confiabilidade industrial, propõe-se a esteira formal de **7 Gates de Qualidade**:

```
┌────────────────────────────────────────────────────────────────────────┐
│ GATE 1: UNIT GATE (Métricas, Matemática e Compiladores Puros)          │
├────────────────────────────────────────────────────────────────────────┤
│ GATE 2: DOMAIN GATE (Schemas Zod Reais, Effective Config e DCC)       │
├────────────────────────────────────────────────────────────────────────┤
│ GATE 3: API GATE (Rotas REST, Auth Real, Cookies e DTOs)               │
├────────────────────────────────────────────────────────────────────────┤
│ GATE 4: SECURITY GATE (Isolamento Multi-Tenant Estrito e Anti-IDOR)    │
├────────────────────────────────────────────────────────────────────────┤
│ GATE 5: RUNTIME GATE (Daemon Rust, Sockets RAW TCP e Idempotência)     │
├────────────────────────────────────────────────────────────────────────┤
│ GATE 6: BROWSER GATE (Canvas Konva Real via Playwright e Regressão)    │
├────────────────────────────────────────────────────────────────────────┤
│ GATE 7: PHYSICAL GATE (Bancada com Impressoras Térmicas Reais)         │
└────────────────────────────────────────────────────────────────────────┘
```

### Especificação Detalhada dos 7 Gates:

| Gate | Camada Auditada | Ferramenta / Executor | Condição Bloqueante (Falha Imediata) |
| :--- | :--- | :--- | :--- |
| **G1 — UNIT GATE** | Conversões de unidades (mm $\leftrightarrow$ dots), catalogação de fontes, métricas de código de barras. | `node --test` / `cargo test` | Qualquer desvio no cálculo de coordenadas ou módulos de código de barras. |
| **G2 — DOMAIN GATE** | Validação com **Zod Oficial** (sem shims), regras de herança de configuração efetiva e integridade do DCC. | `node --test` com Zod real | Falha em `LabelDocumentSchema.safeParse()`; soma de pesos de capabilities diferente de 354/211. |
| **G3 — API GATE** | Rotas HTTP, autenticação, tokens de sessão, rate limiting, proteção CSRF e serialização de DTOs. | Supertest / Node HTTP Server com DB Postgres | Código HTTP inesperado (ex: 500 em vez de 401/403); violação de contrato com `@witiquetas/contracts`. |
| **G4 — SECURITY GATE** | Isolamento multi-tenant estrito, cross-tenant leak prevention, teste contra injeção IDOR, sanitização de logs. | Suíte de segurança com FKs compostas | Qualquer leitura ou alteração de registro da Empresa B por usuário da Empresa A. |
| **G5 — RUNTIME GATE** | Binário nativo Rust x64, reconexão de socket, backoff progressivo, tratamento de escrita parcial. | Binário executável + Mock TCP Printer | Qualquer job que transite falsamente para `PRINTED` em vez de `DELIVERED_TO_TRANSPORT`; memory leak após reconexão. |
| **G6 — BROWSER GATE** | Interface Web real, Canvas Konva Context2D, PropertyInspector, Toolbox dinâmica, arrastar/redimensionar. | Playwright Headless + Pixelmatch | Desvio visual superior a 0.5% em relação ao Golden Screenshot; erro no console do browser. |
| **G7 — PHYSICAL GATE** | Saída impressa em hardware térmico real (Elgin L42 Pro, Zebra ZD220/230, Argox OS-214 Plus). | Impressoras físicas em bancada | Salto de etiqueta (gap descalibrado); código de barras ilegível em scanner óptico; caracteres corrompidos. |

---

## 4. CRITÉRIOS DE APROVAÇÃO PARA OS PRÓXIMOS PACOTES

1. **Inclusão Obrigatória de `npm test` no CI:** O arquivo `.github/workflows/docker.yml` deve executar a suíte completa de testes antes do build das imagens Docker. Falha em 1 teste cancela o workflow.
2. **Expurgo Gradual de Shims:**
   - Substituição mandatória de `zod-shim.js` pelo pacote oficial `zod` em todos os testes de contrato e schema.
   - Execução dos testes de banco de dados contra container PostgreSQL efêmero real com aplicação das migrations SQL 001 a 007.
3. **Inviolabilidade dos Módulos Congelados:** Qualquer PR que modifique o Editor ou a Central de Impressão deve ser bloqueado automaticamente, salvo P0 devidamente justificado com aprovação de ADR.
4. **Homologação Física de Bancada (Gate 7) Pré-Release:** Antes de gerar tag de release de produção, etiquetas de teste devem ser impressas e lidas com scanner óptico em hardware real.
