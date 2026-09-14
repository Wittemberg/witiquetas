# WITIQUETAS — ERP & INTEGRATION LANDSCAPE
**Panorama Técnico de Integrações Corporativas e Arquitetura de Conectores**  
**Trilha Paralela:** ROADMAP FORWARD PREPARATION  
**Data:** 14/09/2026  
**Status:** PESQUISA PREPARATÓRIA / NÃO-EXECUTÁVEL (Sem impacto no Pacote 5.6)  
**Conformidade:** Alinhado a `AGENTS.md`, `CONTEXT.md`, `UNIVERSAL-DATA-ARCHITECTURE.md`, `INTEGRATION-FIELD-CATALOG.md` e `INTEGRATION-MANIFEST-SPEC.md`.

---

## 1. INTRODUÇÃO E DIRETRIZES DE NÃO-INTERFERÊNCIA

Este documento estabelece o mapeamento técnico das futuras integrações corporativas do Witiquetas para os 11 nichos de mercado atendidos pela plataforma.

Em conformidade estrita com o isolamento em relação à tarefa paralela que executa o Pacote 5.6 (Integration Foundation):
- **O Pacote 5.6 não foi implementado nem antecipado.**
- **Nenhum schema de banco ou migration foi criado.**
- **Nenhum manifesto de integração alternativo foi gerado; o contrato canônico estabelecido no 5.6 terá precedência absoluta.**
- **Nenhum conector foi simulado como funcional.** Todos os adaptadores descritos pertencem às entregas futuras da Fase 5 (pós-5.6) e Fase 7.

---

## 2. FAMÍLIAS UNIVERSAIS DE INTEGRAÇÃO

```
                               ┌──────────────────────────────────────────────┐
                               │       WITIQUETAS INTEGRATION RUNTIME        │
                               └──────────────────────┬───────────────────────┘
                                                      │
         ┌─────────────────────┬──────────────────────┼───────────────────────┐
         ▼                     ▼                      ▼                       ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐   ┌────────────────────────┐
│ 1. BANCOS DE    │   │ 2. APIS REST /  │   │ 3. ARQUIVOS     │   │ 4. MODEL CONTEXT       │
│ DADOS DIRETOS   │   │ WEBHOOKS        │   │ ESTRUTURADOS    │   │ PROTOCOL (MCP)         │
├─────────────────┤   ├─────────────────┤   ├─────────────────┤   ├────────────────────────┤
│ • SQL Server    │   │ • Push (Webhook)│   │ • Hot-Folder    │   │ • Context Provider     │
│ • PostgreSQL    │   │ • Pull (Polling)│   │ • SFTP/FTPS     │   │ • Leitura Semântica    │
│ • MySQL / Maria │   │ • HMAC Auth     │   │ • CSV / JSON    │   │ • RBAC / Tenant Lock   │
│ • Oracle DB     │   │ • Idempotency   │   │ • XML (NF-e/GS1)│   │ • Não-crítico / Aux.   │
└─────────────────┘   └─────────────────┘   └─────────────────┘   └────────────────────────┘
```

---

### 2.1 Família 1: Bancos de Dados Relacionais Diretos (Enterprise Databases)
Grandes operações industriais e atacadistas operam com ERPs corporativos (Protheus, WinThor, Senior, Sankhya, SAP B1) onde chamadas REST via internet pública podem gerar latência excessiva para linhas de embalagem e expedição.

#### Motores Alvo:
- **Microsoft SQL Server** (2012+)
- **PostgreSQL** (12+)
- **MySQL / MariaDB** (5.7 / 8.0+)
- **Oracle Database** (11g a 21c)

#### Estratégias Técnicas de Leitura:
| Estratégia | Descrição Arquitetural | Vantagens | Mitigação de Riscos |
| :--- | :--- | :--- | :--- |
| **Queries Read-Only** | Consultas `SELECT` parametrizadas com usuário técnico restrito. | Zero necessidade de desenvolvimento pelo cliente. | Uso estrito de `WITH (NOLOCK)` / snapshot isolation e timeout curto (máx 3s) para evitar locks transacionais. |
| **Views Intermediárias** | Views desnormalizadas criadas pelo DBA do cliente (`vw_witiquetas_produtos`). | Desacopla o Witiquetas de patches de schema do ERP e oculta dados confidenciais. | Manutenção e indexação gerenciadas pela TI do cliente. |
| **Outbox / Staging Tables**| Rotina no ERP popula tabela dedicada com `payload_json` e `status`. | Desacoplamento temporal e facilidade de auditoria. | Requer rotina periódica de expurgo (*purge*). |
| **Change Tracking / CDC** | Leitura de alterações incrementais via motor do banco (SQL Server CT, Postgres WAL). | Zero impacto de *table scans*; sincronização contínua de deltas de preços. | Exige permissões avançadas de infraestrutura. |

#### Topologia de Borda (Segurança de Rede):
Portas corporativas de bancos (1433, 1521, 5432) **nunca são abertas na WAN**. A consulta ao banco relacional corporativo é executada localmente pelo **Witiquetas Agent (local on-premise)** atuando como coletor seguro, remetendo ao backend em nuvem apenas os campos canônicos resolvidos sob HTTPS mTLS.

---

### 2.2 Família 2: APIs REST e Webhooks
Padrão moderno para ERPs Cloud (Bling, Tiny, Omie, Linx Core).

#### Comparativo Operacional:
- **Polling Periódico (Pull):** Scheduler busca atualizações a cada $N$ minutos. Ideal para sincronização de catálogo de produtos e tabelas de preços.
- **Webhooks em Tempo Real (Push):** Notificação imediata orientada a eventos. Ideal para faturamento de pedidos e etiquetagem na expedição.

#### Requisitos de Segurança e Resiliência para Webhooks:
1. **Assinatura HMAC Obrigatória:** Validação do header de assinatura criptográfica (`X-Signature` via SHA-256) gerado com a chave secreta da empresa (`company_id`).
2. **Janela Anti-Replay:** Validação de `X-Timestamp` com tolerância máxima de 300 segundos.
3. **Garantia de Idempotência:** Chave única de evento (`Idempotency-Key`) armazenada com TTL para retornar HTTP 200 em retentativas sem reprocessar templates.
4. **Buffer Assíncrono com Throttling:** Recepção responde `202 Accepted` em $<50$ms, enfileirando o processamento para não sobrecarregar compiladores em picos de vendas (ex: Black Friday).

---

### 2.3 Família 3: Arquivos Estruturados (Batch & Hot-Folders)
Mecanismo essencial para centrais logísticas, balanças térmicas (Toledo, Filizola) e sistemas legados de expedição.

#### Formatos:
- **CSV / TSV:** Delimitadores configuráveis, com encodings Windows-1252, ISO-8859-1 e UTF-8.
- **JSON:** Lotes de registros estruturados em arrays.
- **XML:** Padrão NF-e / NFC-e (SEFAZ Schema ProcNFe), MDF-e e GS1 XML de logística.

#### Modos de Ingestão:
- **Hot-Folder Monitorada (Agent Local):** O daemon local monitora diretório (`C:\Witiquetas\Inbound`). Para garantir integridade de gravação, o arquivo só é processado após confirmação de liberação do lock de escrita do ERP (rename atômico ou arquivo sentinela `.done`).
- **SFTP / FTPS:** Coleta automatizada agendada em servidores corporativos.
- **Upload Manual:** Operador arrasta planilha CSV na Central de Impressão (Fase 4/7) com validação de colunas antes do disparo.

---

### 2.4 Família 4: MCP (Model Context Protocol) como Provedor Contextual
- **Papel:** Provedor contextual externo e auxiliar. **NUNCA** pode ser dependência central para editor ou impressão.
- **Isolamento de Tenant:** Todas as mensagens MCP transportam contextualmente a identidade da empresa (`company_id`). Sessões de IA da Empresa A não acessam catálogos da Empresa B.
- **Fail-Closed RBAC:** O servidor MCP atua sob as mesmas permissões do usuário logado (`integrations.view`, `print.execute`).
- **Trilha de Auditoria:** Toda ação via MCP é gravada com `source = 'MCP_AGENT'`.

---

## 3. PADRÕES ARQUITETURAIS PARA ADAPTERS E CONECTORES (FASE 7)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ ERP EXTERNO (SAP, Protheus, Bling, etc.)                                                │
│ Exemplo de campo bruto: "B1_PRCVEN", "preco_venda_atacado_com_desconto", "DTA_VLD"      │
└────────────────────────────────────────┬────────────────────────────────────────────────┘
                                         │ Ingestão Externa (SQL / REST / CSV)
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ WITIQUETAS INTEGRATION ADAPTER (Anti-Corruption Layer)                                 │
│ 1. Autentica e extrai dados brutos                                                      │
│ 2. Executa De-Para declarativo e transformações tipadas puras                          │
│ 3. Valida tipos primitivos (string, currency, date, etc.)                              │
└────────────────────────────────────────┬────────────────────────────────────────────────┘
                                         │ Dados Traduzidos (Formato Canônico)
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ WITIQUETAS CANONICAL CONTRACT                                                           │
│ Campos Oficiais: "produto.preco", "lote.dataValidade", "produto.descricao"             │
└────────────────────────────────────────┬────────────────────────────────────────────────┘
                                         │ Resolução de Template
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ LabelDocument v1 & Compiladores (PPLA, PPLB, ZPL, EPL)                                  │
│ NUNCA conhecem "B1_PRCVEN" ou estruturas proprietárias do ERP                           │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Ciclo de Vida em 5 Estágios de um Conector
1. **Connect:** Validação de credenciais, certificados e healthcheck com circuit-breaker.
2. **Discover Schema:** Introspecção dinâmica de tabelas e colunas externas para apresentação no painel administrativo.
3. **Map to Canonical:** Associação de-para declarativa com aplicação de transformações determinísticas (ex: máscara `YYYYMMDD` $\rightarrow$ `DD/MM/AAAA`, divisão de centavos, trim).
4. **Extract / Ingest:** Execução da query otimizada ou consumo de webhook com paginação cursor-based.
5. **Handle Errors & Retries:** Retentativas com *Exponential Backoff with Jitter* para falhas transitórias e descarte seguro em Dead Letter Queue (DLQ) para falhas estruturais permanentes.

---

### 3.2 Inviolabilidade do Catálogo Canônico
> **REGRA DE OURO:** Campos externos do ERP **NUNCA** viram campos canônicos diretamente. A tradução é sempre explícita e declarativa via Adapter.

O Editor Visual e os compiladores conhecem exclusivamente o catálogo canônico (`packages/label-schema/src/canonicalFields.ts`). Campos externos desconhecidos só entram na etiqueta se mapeados para campos canônicos existentes ou se a empresa cadastrar formalmente uma extensão de campo com namespace próprio (`erp_custom.campoCustomizado`).

---

### 3.3 Blindagem de Segredos e Credenciais
1. **Zero-Leakage no Frontend:** Strings de conexão, senhas de banco, Client Secrets e chaves privadas **nunca trafegam para o navegador**. Rotas administrativas retornam apenas metadados mascarados.
2. **Criptografia em Repouso:** Credenciais armazenadas no PostgreSQL são cifradas com **AES-256-GCM** via chave rotativa de ambiente (`INTEGRATION_ENCRYPTION_KEY`).
3. **Isolamento de Templates:** É expressamente proibido armazenar credenciais ou queries SQL no JSON do `LabelDocument`.

---

## 4. ANÁLISE DE COMPATIBILIDADE DE ERPS BRASILEIROS

| ERP | Nichos Principais | Arquitetura / DB | Estratégia de Integração Recomendada |
| :--- | :--- | :--- | :--- |
| **TOTVS Protheus** | Indústria, Varejo, Agro | AdvPL / SQL Server / Oracle | Views somente leitura via Witiquetas Agent Local ou REST via TLPP. Datas em formato `YYYYMMDD`. |
| **TOTVS WinThor** | Atacado Distribuidor, CD | Oracle Database (PL/SQL) | Conexão Oracle nativa com queries otimizadas em réplica de leitura. Altíssima volumetria de transações. |
| **SAP Business One** | Manufatura, PMEs | SAP HANA / SQL Server | **SAP B1 Service Layer (REST/OData)** com filtros semânticos e sessão `B1SESSION`. Case-sensitive no HANA. |
| **Linx** | Varejo de Moda, Franquias | SQL Server / Cloud | Linx OpenHub REST APIs com suporte a grades bidimensionais (Cor / Tamanho / SKU). |
| **Bling (Locaweb)** | E-commerce, MPE | Cloud SaaS Multi-Tenant | REST API v3 com fluxo completo OAuth 2.0 e renovação de token. Throttling de 3 req/s. |
| **Tiny ERP (Olist)**| E-commerce, Confecção | Cloud SaaS Multi-Tenant | REST API v2/v3 baseada em tokens fixos e recepção de webhooks de faturamento/expedição. |
| **Omie** | Serviços, Atacado Leve | Cloud SaaS Multi-Tenant | API REST JSON-RPC com credenciais sanitizadas nos logs. Rate limit de 4 req/s. |
| **Senior Sistemas** | Agronegócio, Manufatura | Oracle / SQL / Senior X | APIs REST Senior X via OpenID Connect ou Views no Sapiens ERP legado. Derivações industriais complexas. |
| **Sankhya** | Atacarejo, Distribuição | Oracle / SQL / Java | **Sankhya Service Gateway (mge)** com envelopes JSON e autenticação via sessão `JSESSIONID`. |

---

## 5. RECOMENDAÇÕES PARA O ROADMAP PÓS-5.6

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ FASE 5: ADMINISTRAÇÃO E GOVERNANÇA                                          │
├───────────────────┬──────────────────────────────────┬──────────────────────┤
│ PACOTE 5.6 (Atual)│ PACOTE 5.7                       │ PACOTE 5.8           │
│ Integration       │ Field Mapping UI Studio          │ Webhook Engine &     │
│ Foundation        │ Interface visual de De-Para e    │ Credentials Vault    │
│ (Em andamento)    │ validação interativa de tipos    │ AES-256 & Idempotency│
└───────────────────┴─────────────────┬────────────────┴──────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ FASE 7: INTEGRAÇÕES NATIVAS COM ERPS E CONTRATO PÚBLICO                    │
├───────────────────┬──────────────────────────────────┬──────────────────────┤
│ PACOTE 7.1        │ PACOTE 7.2                       │ PACOTE 7.3           │
│ Conectores Cloud  │ Conectores On-Premise            │ Ingestão Hot-Folder  │
│ REST & OAuth2     │ Enterprise DB (Oracle/SQL)       │ & Arquivos (CSV/XML) │
│ (Bling, Tiny, etc)│ via Witiquetas Agent Local       │ no Agent e Central   │
├───────────────────┼──────────────────────────────────┼──────────────────────┤
│ PACOTE 7.4        │ PACOTE 7.5                                              │
│ MCP Context       │ Integration SDK & OpenAPI Public Portal                  │
│ Provider (IA)     │ Homologação e documentação para software houses          │
└───────────────────┴─────────────────────────────────────────────────────────┘
```

1. **Pacote 5.7 — Integration Field Mapping UI Studio:** Interface de de-para no Admin (`/admin/integrations/:id/mapping`) com validação de tipos de dados antes da injeção no template.
2. **Pacote 5.8 — Webhook Ingestion Engine & Credentials Vault:** Infraestrutura de recepção de webhooks HMAC e cofre criptográfico AES-256 para segredos.
3. **Pacote 7.1 — Conectores Nativos Cloud REST (Bling, Tiny, Omie):** Primeiro conjunto de adaptadores homologados fim a fim com OAuth2.
4. **Pacote 7.2 — Conectores Enterprise On-Premise (Protheus, WinThor, SAP B1):** Coleta direta em bancos relacionais corporativos orquestrada de forma segura pelo Witiquetas Agent local.
5. **Pacote 7.3 — Ingestão por Hot-Folder e Arquivos Estruturados:** Automação de leitura de pastas locais e upload assistido na Central de Impressão.
6. **Pacote 7.4 — Provedor de Contexto MCP:** Servidor MCP homologado para agentes corporativos de IA sob estrito RBAC e tenant isolation.
7. **Pacote 7.5 — Integration SDK & OpenAPI Developer Portal:** Publicação formal de OpenAPI 3.1 e SDKs em TypeScript para software houses parceiras.
