# Witiquetas — Integration Field Catalog & SDK de Integração

Este documento especifica o **Integration Field Catalog (Catálogo de Campos de Integração)** e o **Integration SDK / API Contratual** do Witiquetas.

---

## 1. Visão Geral e Princípio de Não-Acoplamento

> **OBJETIVO ARQUITETURAL: O Witiquetas NÃO deve receber novo código ou alterar seus modelos internos toda vez que um ERP parceiro criar, renomear ou disponibilizar novos campos.**

Em vez de criar estruturas de dados estáticas no TypeScript para cada software de gestão do mercado, o Witiquetas utiliza um **Catálogo Dinâmico e Semântico**. Cada integração (ou ERP conectado via API) declara os campos que é capaz de fornecer.

```text
┌─────────────────────────────────────────────────────────────┐
│ ERP Externo (Startwo, SAP, Totvs, Senior, Linx, Sankhya...) │
└──────────────────────────────┬──────────────────────────────┘
                               │ Envia Declaração do Catálogo
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Integration Field Catalog (Witiquetas)                      │
├─────────────────────────────────────────────────────────────┤
│ • Identificadores com Namespace (<namespace>.<campo>)        │
│ • Rótulos amigáveis para o usuário no Editor                │
│ • Metadados de Tipo, Categoria e Pesquisa                   │
│ • Valores de Exemplo para visualização em tempo de design   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Estrutura Canônica de um Campo do Catálogo

Cada campo registrado no catálogo deve declarar a seguinte estrutura:

```typescript
export type FieldType =
  | 'string'    // Textos gerais, descrições, nomes
  | 'integer'   // Números inteiros, quantidades, códigos numéricos
  | 'decimal'   // Valores monetários, pesos, dimensões fracionárias
  | 'boolean'   // Sinalizadores lógicos (ex: emPromocao, fracionado)
  | 'date'      // Datas no padrão ISO (YYYY-MM-DD)
  | 'datetime'  // Data e hora com fuso horário ISO 8601
  | 'url'       // Endereços web para QR Codes e links
  | 'barcode'   // Conteúdo padronizado para códigos de barra (EAN, Code128, GS1)
  | 'image';    // URLs ou identificadores de imagem/logotipo

export interface IntegrationFieldDefinition {
  /** Identificador único do campo com namespace (ex: "startwo.precoVenda") */
  id: string;

  /** Namespace que agrupa a origem dos dados (ex: "startwo", "hospital", "system") */
  namespace: string;

  /** Nome amigável exibido no painel de propriedades do editor */
  label: string;

  /** Tipo primitivo do dado para validação e formatação */
  type: FieldType;

  /** Categoria visual para agrupamento no seletor (ex: "Preços", "Identificação", "Logística") */
  category: string;

  /** Indica se o campo deve ser incluído na busca rápida da Central de Impressão */
  searchable: boolean;

  /** Indica se o campo pode ser vinculado a elementos visuais de impressão */
  printable: boolean;

  /** Valor de exemplo exibido no canvas durante a edição/design */
  example: string | number | boolean;

  /** Descrição técnica ou de negócio detalhando o significado do dado (opcional) */
  description?: string;
}
```

---

## 3. Exemplos de Catálogos por Nicho

### Exemplo 1: Catálogo do Módulo de Varejo (`startwo`)
```json
[
  {
    "id": "startwo.codigo",
    "namespace": "startwo",
    "label": "Código do Produto",
    "type": "integer",
    "category": "Identificação",
    "searchable": true,
    "printable": true,
    "example": 10452,
    "description": "Código interno de cadastro no ERP"
  },
  {
    "id": "startwo.mercadoria",
    "namespace": "startwo",
    "label": "Descrição da Mercadoria",
    "type": "string",
    "category": "Identificação",
    "searchable": true,
    "printable": true,
    "example": "ARROZ TIPO 1 5KG TIO JOAO",
    "description": "Nome comercial completo do item"
  },
  {
    "id": "startwo.codigoBarras",
    "namespace": "startwo",
    "label": "Código de Barras (EAN-13)",
    "type": "barcode",
    "category": "Identificação",
    "searchable": true,
    "printable": true,
    "example": "7891234567890"
  },
  {
    "id": "startwo.precoVenda",
    "namespace": "startwo",
    "label": "Preço de Venda (Normal)",
    "type": "decimal",
    "category": "Preços",
    "searchable": false,
    "printable": true,
    "example": 28.90
  },
  {
    "id": "startwo.precoFidelidade",
    "namespace": "startwo",
    "label": "Preço Clube / Fidelidade",
    "type": "decimal",
    "category": "Preços",
    "searchable": false,
    "printable": true,
    "example": 24.90
  },
  {
    "id": "startwo.emPromocao",
    "namespace": "startwo",
    "label": "Em Promoção?",
    "type": "boolean",
    "category": "Regras",
    "searchable": false,
    "printable": false,
    "example": true
  }
]
```

### Exemplo 2: Catálogo do Módulo de Saúde / Hospital (`hospital`)
```json
[
  {
    "id": "hospital.prontuario",
    "namespace": "hospital",
    "label": "Número do Prontuário",
    "type": "string",
    "category": "Paciente",
    "searchable": true,
    "printable": true,
    "example": "PRN-88419-X"
  },
  {
    "id": "hospital.pacienteNome",
    "namespace": "hospital",
    "label": "Nome do Paciente",
    "type": "string",
    "category": "Paciente",
    "searchable": true,
    "printable": true,
    "example": "MARIA DAS DORES OLIVEIRA"
  },
  {
    "id": "hospital.leito",
    "namespace": "hospital",
    "label": "Leito / Quarto",
    "type": "string",
    "category": "Localização",
    "searchable": true,
    "printable": true,
    "example": "UTI-04 / LEITO B"
  },
  {
    "id": "hospital.alergias",
    "namespace": "hospital",
    "label": "Alergias Conhecidas",
    "type": "string",
    "category": "Clínico",
    "searchable": false,
    "printable": true,
    "example": "ALERGIA SEVERA A DIPIRONA"
  }
]
```

---

## 4. Contrato da API de Integração (Integration API / SDK)

A API de integração pública do Witiquetas fornece endpoints padronizados para que sistemas de terceiros realizem:

1. **Declaração do Catálogo (`POST /api/v1/integrations/catalog`):** Registra ou atualiza a lista de campos que a integração é capaz de fornecer para a empresa.
2. **Sincronização de Registros em Lote (`POST /api/v1/integrations/records`):** Envia entidades com seus valores preenchidos para consulta na Central de Impressão.
3. **Consulta de Registros sob Demanda (`GET /api/v1/integrations/query?search=...`):** Permite à Central de Impressão buscar dados em tempo real no backend do ERP via webhook/proxy.
4. **Disparo de Impressão Direta por API (`POST /api/v1/integrations/print-jobs`):** Permite ao ERP disparar uma impressão automática (ex: faturamento de pedido na expedição gerando etiqueta na impressora da doca).

---

## 5. Benefícios da Abstração
- **Zero Alteração no Editor:** Novos campos aparecem automaticamente no dropdown do painel de propriedades sob sua respectiva categoria.
- **Zero Alteração no Compilador:** O motor substitui `[[campo]]` pelo valor real fornecido na carga de dados, sem precisar saber se é um preço, prontuário ou lote de fabricação.
- **Escalabilidade Comercial:** Software houses podem homologar suas próprias integrações sem depender de suporte direto da equipe de desenvolvimento do Witiquetas.
