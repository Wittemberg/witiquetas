# Witiquetas — Roadmap
 
> **AVISO DE ATUALIZAÇÃO / FASE 3.5:**
> Este roadmap preliminar foi formalizado e expandido no documento oficial:
> **[`docs/product/ROADMAP-PHASE-3-5.md`](file:///c:/Users/start/OneDrive/Área%20de%20Trabalho/Aprendendo/Witiquetas/witiquetas/docs/product/ROADMAP-PHASE-3-5.md)**
> que organiza as metas em **P0 (Editor Confiável, Universal Data Binding, Conditional Preview, Model Lifecycle, Application Shell)**, **P1 (Smart Import, Universal Print Center, RBAC, Agent UX, Printer KB)**, **P2 (SDK)** e **Laboratório (Universal Scale Gateway)**.

---

## Objetivo
 
Este roadmap organiza o desenvolvimento do Witiquetas em fases validáveis. A prioridade é comprovar primeiro o coração do produto: desenhar uma etiqueta, compilar o layout e gerar um comando que imprima corretamente.

---

## Fase 0 — Fundação

### Objetivo

Criar uma base executável, versionada e implantável antes de construir funcionalidades de negócio.

### Entregas

- monorepo;
- workspace;
- `apps/frontend`;
- `apps/backend`;
- `apps/agent-local`;
- packages compartilhados;
- lint;
- typecheck;
- testes;
- Dockerfiles;
- GitHub Actions;
- GHCR;
- Portainer;
- healthcheck;
- `/api/health`;
- `/api/version`;
- `.env.example`;
- migrations iniciais;
- banco `witiquetas`;
- usuário PostgreSQL exclusivo;
- bucket MinIO/S3 exclusivo;
- configuração do domínio.

### Critério de saída

```text
Frontend responde em produção
+
Backend responde /api/health
+
pipeline publica e redeploya
```

---

## Fase 1 — Editor visual e schema abstrato

### Objetivo

Criar etiqueta visual sem dependência de linguagem de impressora.

### Entregas

- tamanho em mm;
- DPI;
- canvas;
- zoom;
- grade;
- snap;
- texto;
- descrição;
- preço;
- barcode;
- linha;
- retângulo;
- arrastar;
- redimensionar;
- propriedades;
- dados simulados;
- serialização;
- salvar;
- reabrir;
- `LabelDocument v1`;
- undo/redo.

### Critério de saída

Um layout criado no navegador pode ser salvo, recarregado e reproduzido sem perda.

---

## Fase 2 — Compiladores PPLA/PPLB e Importador Legado (Fase 2.1)

### Objetivo

Comprovar a primeira impressão real, importação lossless de modelos legados e fidelidade de round-trip.

### Entregas da Fase 2.1 (Concluída Tecnico-Documentalmente)

- [x] Pré-processador hierárquico com preservação de comentários e comandos de configuração;
- [x] Parsing de macros ERP e transformações (`[[NOME,0,18]]`, `[[BARRA]]`, `[[PROMOCAO]]`, `[[PRECO]]`);
- [x] Catálogo centralizado de fontes PPLB 1–5 com métricas físicas exatas;
- [x] Catálogo e cálculo dimensional de códigos de barras (EAN-13, EAN-8, Code 128) por contagem de módulos;
- [x] Precisão física centralizada `dotsToMm` e `mmToDots` sem arredondamento prematuro;
- [x] Distinção estrita entre `Q` (altura + gap) e `q` (largura imprimível);
- [x] Suporte completo a condicionais inline e multilinha com `[[SE]]`, `[[SENAO]]`, `[[FIMSE]]` e aninhamentos (profundidade defensiva de 32 níveis);
- [x] Suíte de 61 testes automatizados (Golden Tests, Round-trip Diff Zero e modificações cirúrgicas localizadas);
- [x] Contrato preparatório `CompiledPrintPayload` para o Agente Local da Fase 3.

### Status da Fase 2.1

```text
Fase 2.1 — Concluída tecnicamente (61/61 testes aprovados)
Homologação física de hardware pendente para validação em conjunto com a Fase 3.
```

### Critério de saída para Fase 3

```text
Modelo real importado
→ Zero-change round-trip Diff Zero
→ Alterações localizadas cirúrgicas
→ Payload RAW compilado com SHA-256
→ Pronto para envio via Agente Local (Fase 3)
```

---

## Fase 3 — Agente Local

### Objetivo

Eliminar a etapa manual de envio para impressora.

### Entregas

- instalador Windows;
- pareamento;
- token de instalação;
- heartbeat;
- cadastro de impressora TCP;
- teste de conexão;
- job de impressão;
- idempotência;
- RAW TCP;
- fila local mínima;
- logs;
- diagnóstico;
- atualização assinada.

### Critério de saída

Usuário clica em imprimir no Web e a etiqueta é impressa diretamente na impressora configurada.

---

## Fase 4 — Central de Impressão Universal e Perfis Multi-Nicho

### Status
`BASELINE CONGELADO / PAUSADO PARA FASE DE ADMINISTRAÇÃO`

### Objetivo
Plataforma de despacho de impressões térmicas operacionais, catálogo de 11 nichos, 66 tamanhos industriais, 112 relações de templates e estabilização de todos os elementos visuais do Editor.

### Entregas Homologadas (PACOTE 4.5.5 + HOTFIX 4.5.5.1):
- Elemento Preço único no Editor (`Price`) com eliminação de elemento promocional redundante e preservação retrocompatível;
- Restauração de redimensionamento (`resize`) interativo e dimensional do elemento Linha;
- Restauração de rotação canônica (0°, 90°, 180°, 270°) com snap magnético e bounding box geométrico perfeito no elemento Linha e demais elementos;
- Precedência estrita de digitação manual de texto sobre campos vinculados no motor de data binding;
- Campo de data de validade tipada com máscara e formatação canônica `DD/MM/AAAA`;
- Campo de sistema da data de impressão (`_sistema.dataImpressao`) acessível e resolvido em runtime;
- Toolbox compacta em lista na sidebar com fluxo vertical natural;
- Multiseleção em lista de Camadas (Layers) com Ctrl/Cmd + Clique;
- Catálogo multinicho completo (11 nichos, 66 tamanhos e 112 relações).

### Central de Impressão — Baseline Pausado (`PRINT_CENTER_BASELINE_FREEZE`):
- Modelos, preview, datasets, seleção de impressoras, jobs, histórico, batch e semântica de transporte com Agente Local (`DELIVERED_TO_TRANSPORT`);
- Pausada para retomada posterior após configuração administrativa e multiempresa.

---

## Fase 5 — Administração e Governança da Aplicação

### Status
`PLANEJADA / NOT_STARTED`

### Objetivo
Transformar o Witiquetas de editor funcional em plataforma configurável, multiempresa e preparada para integrações reais.

### Capacidades Oficiais (37 Capabilities + RBAC + Licenciamento):

#### A. APPLICATION CONFIGURATION
- `cap-company-settings`: Configurações gerais da empresa / tenant;
- `cap-enabled-niches`: Habilitação contextual de nichos por empresa;
- `cap-enabled-elements`: Habilitação de elementos visuais por nicho/empresa;
- `cap-enabled-fields`: Habilitação de campos canônicos por empresa;
- `cap-effective-configuration`: Resolvedor de configuração efetiva da plataforma.

#### B. AUTHENTICATION
- `cap-login`: Fluxo de autenticação com e-mail e senha;
- `cap-session`: Gerenciamento de sessão segura e tokens JWT;
- `cap-session-context`: Contexto de sessão ativa (Tenant, Nicho, Papel);
- `cap-logout`: Encerramento de sessão e invalidação de tokens.

#### C. USERS
- `cap-user-management`: Gestão e CRUD de usuários da empresa;
- `cap-user-status`: Ciclo de vida e status do usuário (Ativo, Inativo, Bloqueado);
- `cap-user-company-assignment`: Vínculo de usuários a empresas e filiais.

#### D. RBAC
- `cap-role-management`: Gestão de perfis de acesso (Administrador, Designer, Operador);
- `cap-permission-catalog`: Catálogo canônico de permissões da plataforma;
- `cap-role-permissions`: Mapeamento de permissões por perfil;
- `cap-user-role-assignment`: Atribuição de papéis a usuários;
- `cap-niche-access-control`: Controle de acesso a nichos por perfil/usuário;
- `cap-rbac-multi-tenant`: Governança multi-tenant e autenticação RBAC macro.

#### E. INTEGRATIONS
- `cap-integration-registry`: Cadastro de integrações e provedores ERP;
- `cap-canonical-field-registry`: Dicionário canônico de campos da plataforma;
- `cap-integration-field-mapping`: Mapeamento de campos ERP para campos canônicos;
- `cap-integration-capability-matrix`: Matriz de capacidades por integração;
- `cap-integration-contract-export`: Exportação e documentação OpenAPI do contrato público de integração.

#### F. ADMIN UI
- `cap-admin-shell`: Shell visual e navegação da área administrativa;
- `cap-admin-company`: Interface de gestão da empresa e filiais;
- `cap-admin-niches-elements`: Interface de configuração de nichos e elementos habilitados;
- `cap-admin-users`: Interface de gestão de usuários;
- `cap-admin-roles`: Interface de gestão de perfis e permissões;
- `cap-admin-integrations`: Interface de configuração de integrações ERP;
- `cap-admin-printers-agents`: Interface de monitoramento de impressoras e agentes locais;
- `cap-admin-audit`: Interface de visualização de trilhas de auditoria.

#### G. SECURITY / AUDIT
- `cap-authz-enforcement`: Middleware fail-closed de aplicação de autorização;
- `cap-admin-audit-log`: Log imutável de eventos administrativos;
- `cap-config-change-audit`: Auditoria de alterações de configuração da plataforma;
- `cap-licensing-billing`: Gestão de licenças e limite de dispositivos.

#### H. FUTURE PRICING FOUNDATION
- `cap-pricing-policy-model`: Modelo conceitual de políticas de preço / PriceRule;
- `cap-price-rule-types`: Tipos de regras de preço (Normal, Promoção, Atacado, Clube, Fidelidade);
- `cap-price-validity`: Regras de vigência temporal e quantidade mínima de preço;
- `cap-price-resolution`: Resolvedor conceitual de preço efetivo no editor e impressão.

---

## Modelo Conceitual e Arquitetura de Governança

### Hierarquia da Plataforma
```text
PLATFORM
  ↓
COMPANY
  ↓
NICHE
  ↓
INTEGRATION
  ↓
ROLE
  ↓
USER
  ↓
MODEL
```

### Resolvedores Conceituais
1. **Disponibilidade de Elementos (Editor):**
   `Platform Supported ∩ Company Enabled ∩ Niche Enabled ∩ Role Allowed ∩ User Allowed = Effective Editor Elements`

2. **Disponibilidade de Campos (Integração):**
   `Canonical Field ∩ Company/Niche Enabled ∩ Integration Provides = Effective Integration Fields`

### Separação Canônica de Conceitos
- **ELEMENT TYPE**: O que o editor desenha visualmente em tela (`Text`, `Price`, `Barcode`, `Line`, etc.).
- **CANONICAL FIELD**: Dado conhecido e padronizado universalmente pela plataforma (`produto.descricao`, etc.).
- **INTEGRATION FIELD**: Dado efetivamente entregue pelo ERP/sistema terceiro (`B1_DESC`, etc.).
- **SYSTEM FIELD**: Dado gerado em tempo de execução pelo próprio Witiquetas (`_sistema.dataImpressao`, etc.).
- **COMPANY CONFIG**: O que a empresa contratante habilita e parametriza.
- **ROLE / PERMISSION**: O que o usuário logado tem privilégio de executar.
- **MODEL**: O que o template específico de etiqueta consome e vincula.

### Regra Arquitetural de Preço
Existe **UM ÚNICO elemento visual de preço**: `Price`. Preço promocional, fidelidade, atacado, rebaixa e clube são dados/regras do futuro domínio `PriceRule` (`type`, `value`, `validFrom`, `validTo`, `minQuantity`, `maxQuantity`, `customerSegment`, `priority`, `active`), não elementos visuais distintos.

### Estrutura Visual Alvo da Administração
```text
ADMINISTRAÇÃO
├── Empresa
├── Nichos e Elementos
├── Integrações
├── Usuários
├── Perfis e Permissões
├── Impressoras
├── Agentes Locais
└── Auditoria
```

### Política de Congelamento (Freeze Policy)
- **Módulos Congelados:** Editor Visual e Central de Impressão.
- **Alterações permitidas apenas por:** Bug P0 comprovado, falha de segurança, risco de perda de dados, runtime crash, regressão confirmada ou novo pacote formal aprovado.
- **Proibido durante a Fase de Administração:** Redesign espontâneo, alteração de CSS global, alteração no Canvas, alteração na Toolbox, alteração em Layers, alteração de compilador, alteração de semântica de impressão e alteração no protocolo do Agente.

---

## Fase 6 — Novas linguagens e impressoras

### Objetivo
Expandir compatibilidade mantendo o schema abstrato.

### Prioridade inicial
1. Zebra ZPL;
2. EPL;
3. Elgin conforme modelos/protocolos selecionados;
4. demais linguagens conforme demanda real.

---

## Fase 7 — Integrações ERP Nativas

### Objetivo
Consumir produtos e alterações de preços de ERPs externos por contrato documentado.

---

## Fase 8 — Manutenção assistida por IA

### Objetivo

Reduzir tempo de diagnóstico mantendo segurança.

### Entregas

- captura sanitizada de erros;
- incidentes;
- stack trace;
- correlação;
- análise IA;
- sugestão de patch;
- criação de branch/PR;
- testes;
- revisão humana;
- histórico de manutenção.

### Restrição

Nenhuma execução remota arbitrária de scripts em produção.

---

## Princípio de priorização

Nova funcionalidade não deve antecipar fases se ela não for necessária para validar a fase atual.

A primeira prova comercial do produto é:

```text
desenhar
→ compilar
→ imprimir corretamente
```

---

Roadmap inicial: 13/08/2026.
