# Arquitetura de Governança, Congelamento e Fase de Administração

> **Documento Canônico de Governança — PACOTE 4.5.6**  
> **Status:** APROVADO / FROZEN BASELINE  
> **Versão Baseline:** 4.5.5.1 / 4.5.6-governance  
> **Data:** 04/09/2026  

---

## 1. Objetivo

Formalizar o encerramento da fase de desenvolvimento visual e funcional do **Editor de Etiquetas** e da **Central de Impressão**, registrar os baselines congelados no Development Control Center (DCC) e estabelecer os fundamentos arquiteturais, conceituais e estruturais para a próxima fase oficial:

**FASE 5 — ADMINISTRAÇÃO E GOVERNANÇA DA APLICAÇÃO**  
*(Configuração, Multi-Tenancy, Autenticação, Usuários, RBAC, Integrações ERP e Trilha de Auditoria)*

---

## 2. Congelamento Formal do Editor (EDITOR_BASELINE_FREEZE)

O Editor Visual do Witiquetas atingiu estabilidade dimensional, funcional e de renderização comprovada por suíte completa de testes e 100% de validação manual do usuário.

```yaml
id: EDITOR_BASELINE_FREEZE
status: FROZEN
baselineVersion: 4.5.5.1
reason: "Editor funcional homologado antes da fase de Administração"
```

### Componentes e Capacidades Congeladas:
- **Canvas Interativo:** Dimensões em mm, DPI, zoom, grid magnética, snap e bounds clamping físico;
- **Toolbox Compacta em Lista:** Navegação vertical na sidebar com separação de ferramentas recomendadas e disponíveis;
- **Layers (Lista de Camadas):** Ordenação Z-index, visibilidade, bloqueio e **multiselect via Ctrl/Cmd + Clique** sincronizado canonicamente com o Canvas;
- **Elementos Visuais Canônicos:**
  - `Text`: Texto estático e dinâmico com precedência estrita de digitação manual sobre campo vinculado;
  - `Price`: Elemento visual único de preço com suporte a decimais em escala (`secondLineScale`), formatação de moeda e descontinuação definitiva do elemento promocional duplicado;
  - `Date`: Data tipada com máscara e formatação canônica `DD/MM/AAAA` e campo de sistema `_sistema.dataImpressao`;
  - `Barcode`: Códigos 1D (EAN-13, Code 128, etc.) com cálculo automático de dígito verificador;
  - `QRCode`: Código bidimensional com dados estáticos e dinâmicos;
  - `Line`: Linha vetorial pura com espessura (`strokeWidth`), redimensionamento interativo e rotação canônica;
  - `Rectangle / Shape`: Molduras vetoriais e formas geométricas unificadas;
  - `Image`: Logomarcas monocromáticas térmicas com proporção preservada;
- **Transformações Geométricas:** Rotação canônica (0°, 90°, 180°, 270°) com snap magnético e bounding box geométrico perfeito em todos os elementos;
- **Ciclo de Vida:** Serialização `LabelDocument v1`, salvar, reabrir, duplicar e restaurar sem perda;
- **Catálogo Multi-Nicho:** 11 nichos de mercado, 66 tamanhos industriais pré-configurados e 112 relações canônicas de templates.

---

## 3. Congelamento e Pausa Formal da Central de Impressão (PRINT_CENTER_BASELINE_FREEZE)

A Central de Impressão Universal encontra-se funcional e com arquitetura validada para o envio de trabalhos, devendo ser formalmente pausada até que os contextos administrativos e multiempresa estejam plenamente configurados.

```yaml
id: PRINT_CENTER_BASELINE_FREEZE
status: FROZEN / PAUSED
realState: IMPLEMENTED / PARTIALLY HOMOLOGATED / PAUSED
reason: "Fluxo suficientemente maduro para retomada posterior após Administração e configuração contextual"
```

### Baseline Preservado:
- Carregamento de modelos/templates cadastrados;
- Preview vetorial com resolução de dados dinâmicos;
- Datasets de teste e amostras contextuais;
- Seleção de impressoras físicas e de rede;
- Criação e despacho de Print Jobs;
- Histórico de trabalhos executados;
- Disparo em lote (batch) quando habilitado;
- Fluxo de comunicação com o Agente Local e semântica de transporte.

---

## 4. Agente Local de Impressão (LOCAL_AGENT)

O Agente Local nativo em Rust (`apps/agent-core`) permanece como componente estrutural ativo no roadmap, em evolução controlada:

```yaml
id: LOCAL_AGENT
status: IMPLEMENTED / IN_PROGRESS
```

### Diretrizes e Semânticas Estritas:
- **Pareamento:** Protocolo por código temporário de 6 dígitos;
- **Heartbeat:** Notificação periódica de presença para o backend;
- **Job Claim & Download:** Resgate seguro do payload de impressão compilado via TLS;
- **RAW_TCP:** Envio de bytes brutos (PPLA/PPLB/ZPL) diretamente para as portas de rede da impressora (porta 9100) ou spooler;
- **DELIVERED_TO_TRANSPORT:** O status do trabalho é estritamente "entregue ao transporte". **É expressamente proibido declarar o status `PRINTED`** sem confirmação física de hardware bidirecional.

---

## 5. Modelo Conceitual e Hierarquia da Plataforma

A governança do Witiquetas obedece à seguinte árvore hierárquica estrita:

```
PLATFORM
  ↓
COMPANY (Tenant)
  ↓
NICHE (Contexto Operacional)
  ↓
INTEGRATION (Conector ERP)
  ↓
ROLE (Papel RBAC)
  ↓
USER (Operador / Designer / Administrador)
  ↓
MODEL (Etiqueta Térmica)
```

### 5.1. Resolvedores Conceituais de Governança

#### A. Element Availability (Elementos Efetivos no Editor)
Define quais ferramentas visuais o usuário pode visualizar e utilizar na Toolbox do Editor:

$$\text{Effective Elements} = \text{Platform Supported} \cap \text{Company Enabled} \cap \text{Niche Enabled} \cap \text{Role Allowed} \cap \text{User Allowed}$$

#### B. Integration Field Availability (Campos Efetivos de Integração)
Define quais dados externos de negócio estão acessíveis para data-binding:

$$\text{Effective Fields} = \text{Canonical Field} \cap \text{Company/Niche Enabled} \cap \text{Integration Provides}$$

---

## 6. Separação Estrita de Conceitos

Para eliminar qualquer ambiguidade entre camadas visuais, lógicas e operacionais, a plataforma estabelece:

| Conceito | Definição Arquitetural |
| :--- | :--- |
| **ELEMENT TYPE** | O que o motor visual do editor desenha em tela (ex: `Text`, `Price`, `Barcode`, `Line`, `Image`). |
| **CANONICAL FIELD** | Atributo de dado conhecido e padronizado universalmente pela plataforma Witiquetas (ex: `produto.descricao`, `produto.preco`, `lote.dataValidade`). |
| **INTEGRATION FIELD** | Dado efetivamente entregue pelo ERP ou sistema terceiro conectado (ex: `B1_DESC`, `PRECO_VENDA`, `DTA_VAL`). |
| **SYSTEM FIELD** | Dado gerado em tempo de execução pelo próprio Witiquetas (ex: `_sistema.dataImpressao`, `_sistema.operadorNome`, `_sistema.copiaNumero`). |
| **COMPANY CONFIG** | Conjunto de regras, nichos, limites e provedores habilitados para uma empresa contratante. |
| **ROLE / PERMISSION** | O que o colaborador logado tem autorização para visualizar, editar ou despachar. |
| **MODEL** | O layout serializado (`LabelDocument v1`) que consome elementos e amarra campos para compilação física. |

---

## 7. Regra Arquitetural de Preço e Domínio PriceRule

Existe **UM ÚNICO elemento visual de preço** no Canvas: `Price`.

> Preço promocional, fidelidade, atacado, rebaixa, preço de clube ou convênio são **regras de negócio e dados contextuais**, e **NÃO** elementos visuais distintos na Toolbox.

### Futuro Domínio `PriceRule`:
```typescript
interface PriceRule {
  id: string;
  companyId: string;
  productId: string;
  type: 'REGULAR' | 'PROMOTIONAL' | 'WHOLESALE' | 'CLUB' | 'LOYALTY' | 'CLEARANCE';
  value: number;
  validFrom?: string; // ISO 8601
  validTo?: string;   // ISO 8601
  minQuantity?: number;
  maxQuantity?: number;
  customerSegment?: string;
  priority: number;
  active: boolean;
}
```

*Nota: Nenhuma tabela ou engine de preços deve ser implementada antes da aprovação da Fase de Administração.*

---

## 8. Estrutura Alvo da Área de Administração (Roadmap)

A navegação da futura área administrativa será organizada nos seguintes módulos:

```text
ADMINISTRAÇÃO
├── 1. Empresa (Dados cadastrais, filiais, parâmetros globais)
├── 2. Nichos e Elementos (Habilitação de nichos e catálogo de ferramentas visuais)
├── 3. Integrações (Provedores ERP, mapeamentos de-para, contratos públicos)
├── 4. Usuários (Gestão de colaboradores, status e convites)
├── 5. Perfis e Permissões (RBAC: Administrador, Designer, Operador e permissões)
├── 6. Impressoras (Parque de equipamentos, filas e resoluções DPI)
├── 7. Agentes Locais (Monitoramento de daemons e status de pareamento)
└── 8. Auditoria (Logs imutáveis de alterações e trilha de segurança)
```

---

## 9. Regras de Congelamento e Governança (Freeze Policy)

### Módulos Congelados:
1. **Editor Visual Core & Toolbox**
2. **Central de Impressão (Baseline)**

### Exceções Autorizadas:
Alterações nos módulos congelados durante a Fase de Administração são permitidas **exclusivamente** mediante:
1. Bug com severidade **P0** comprovada;
2. Vulnerabilidade de segurança detectada;
3. Risco de corrupção ou perda de dados;
4. Crash em tempo de execução (runtime crash);
5. Regressão funcional documentada com teste automatizado prévio;
6. Pacote formal explicitamente aprovado pelo usuário.

### Ações Proibidas durante a Fase de Administração:
- ❌ Redesign espontâneo de interface;
- ❌ Alteração de CSS global que impacte o Canvas ou Toolbox;
- ❌ Modificação no algoritmo geométrico do Canvas ou cálculo de DPI/mm;
- ❌ Alteração na disposição ou componentes da Toolbox;
- ❌ Modificação no componente de Camadas (Layers);
- ❌ Alteração nos compiladores PPLA/PPLB/ZPL;
- ❌ Alteração na semântica de envio ou despacho de impressão;
- ❌ Modificação no protocolo de transporte do Agente Local.
