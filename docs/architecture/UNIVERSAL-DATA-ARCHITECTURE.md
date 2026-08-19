# Witiquetas — Universal Data Architecture

Este documento define a **Arquitetura Universal de Dados** do Witiquetas, estabelecendo como informações fluem entre sistemas externos (ERPs, APIs, bancos), o modelo visual, o motor de regras e os compiladores de impressão.

---

## 1. A Arquitetura Conceitual em 4 Camadas

O processamento e emissão de etiquetas no Witiquetas é estruturado em **quatro camadas desacopladas**:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. CAMADA DE DADOS                                                          │
│    ERP / API / WMS / LIMS / Integração fornece registros e campos            │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Catálogo & Valores
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. CAMADA DE MODELO (LabelDocument)                                         │
│    Design visual; associação de elementos gráficos às fontes de dados       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Schema do Modelo + Registro Ativo
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. MOTOR WITIQUETAS (Core Engine)                                           │
│    Regras de exibição, condicionais, cálculos, conversão de unidades,       │
│    validação de limites físicos, preview e representação intermediária      │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Modelo Resolvido + Dados Normalizados
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. CAMADA DE IMPRESSÃO                                                      │
│    • Compiladores: PPLA, PPLB, ZPL, EPL geram payload binário               │
│    • Print Jobs: Fila persistente com leases e idempotência                │
│    • Witiquetas Agent: Entrega física de bytes via RAW TCP/Spooler          │
│    • Hardware: Impressora térmica física                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Fluxo Ponta a Ponta:
$$\text{Dados} \longrightarrow \text{Modelo} \longrightarrow \text{Motor Witiquetas} \longrightarrow \text{Compilador} \longrightarrow \text{Print Job} \longrightarrow \text{Agent} \longrightarrow \text{Impressora}$$

---

## 2. As Três Fontes Universais de Informação

Todo elemento vinculável no editor (Textos, Códigos de Barras, QR Codes) pode extrair seu conteúdo de três origens distintas:

```text
                  ┌──────────────────────────────────────────────┐
                  │ 1. Dados da Integração (ERP / API Externa)  │
                  ├──────────────────────────────────────────────┤
                  │ 2. Campos do Sistema Witiquetas              │
                  ├──────────────────────────────────────────────┤
                  │ 3. Conteúdo Manual / Fixo                   │
                  └──────────────────────────────────────────────┘
```

### Hierarquia e Prioridade de Resolução de UX:
Em qualquer elemento visual vinculável, a prioridade padrão de apresentação e resolução é:
1. **Dados da Integração (Prioridade Máxima)**
2. **Campos do Sistema Witiquetas**
3. **Conteúdo Manual (Texto Fixo)**

---

### A. Campos do Sistema Witiquetas (`system.*`)

Valores gerados e mantidos pela própria plataforma Witiquetas. Não dependem de envio prévio pelo ERP e são resolvidos em tempo de geração do trabalho de impressão.

#### Primeiro Campo Oficial do Sistema:
- **Identificador:** `system.printDateTime`
- **Nome Visual:** `Data/Hora de Impressão`
- **Formatos Suportados:**
  - `DATE` (Ex: `19/08/2026`)
  - `DATETIME` (Ex: `19/08/2026 17:30:00`)
  - `TIME` (Ex: `17:30:00`)
- **Comportamento no Editor:** Exibe *preview* dinâmico com a data/hora do momento da edição.
- **Comportamento na Impressão:** O valor exato é congelado e resolvido pelo backend no instante da criação do `PrintJob`.
- **Propriedades:** Herda todas as propriedades visuais de texto (fonte, tamanho, peso, alinhamento, auto-fit, rotação).

---

### B. Campos da Integração (`<namespace>.<campo>`)

Campos dinâmicos declarados pelos sistemas parceiros por meio do **Integration Field Catalog**.
- O Witiquetas **não possui modelos de dados hardcoded** para ERPs específicos.
- Cada integração declara seu catálogo, informando identificador, namespace, rótulo amigável, tipo de dado e exemplos.

#### Exemplos de Campos Reais:
- Varejo: `startwo.mercadoria`, `startwo.precoVenda`, `startwo.precoFidelidade`, `startwo.codigoBarras`
- Saúde / Hospital: `hospital.prontuario`, `hospital.pacienteNome`, `hospital.leito`, `hospital.amostraCodigo`
- Logística: `logistica.trackingCode`, `logistica.destinatario`, `logistica.pesoKg`, `logistica.volumeNumero`
- Indústria: `industria.ordemProducao`, `industria.lote`, `industria.codigoPeca`

---

### C. Conteúdo Manual

Texto fixo, título ou valor estático digitado diretamente pelo operador no canvas (ex: *"FABRICADO NO BRASIL"*, *"ATENÇÃO: MANUSEIE COM CUIDADO"*, *"VALOR À VISTA"*).

---

## 3. Dependências de Dados do Modelo (Template Data Dependencies)

O `LabelDocument` mapeia internamente todos os campos que seus elementos e regras condicionais utilizam.

```json
{
  "schemaVersion": 1,
  "label": {
    "widthMm": 100,
    "heightMm": 30,
    "dpi": 203
  },
  "dataDependencies": [
    "startwo.mercadoria",
    "startwo.precoVenda",
    "startwo.precoFidelidade",
    "startwo.cd_regraPrecos",
    "system.printDateTime"
  ]
}
```

### Benefícios do Mapeamento Automático:
1. **Central de Impressão:** Gera automaticamente as colunas relevantes na grade sem necessidade de configuração manual.
2. **Validação Pré-Impressão:** Alerta o operador se um registro enviado pelo ERP não possui os campos obrigatórios exigidos pelo layout.
3. **Simulador de Preview:** Sugere cenários de teste com base nas variáveis encontradas no modelo.

---

## 4. Smart Import & ImportLayoutAnalyzer

O motor de importação de arquivos legados (PPLA, PPLB, ZPL) evolui da análise simples de sintaxe para a **compreensão estrutural do layout**.

```text
Arquivo Legado (.txt / .prn)
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│ ImportLayoutAnalyzer                                        │
├─────────────────────────────────────────────────────────────┤
│ 1. Diagnóstico de Linguagem (PPLA, PPLB, ZPL, EPL)          │
│ 2. Dimensão Física e Resolução (Dots / Mm / DPI)            │
│ 3. Agrupamento Espacial e Repetição                         │
│ 4. Contagem de Códigos de Barras e QR Codes                 │
│ 5. Extração de Regras e Condicionais                        │
│ 6. Reconhecimento de Padrão com Nível de Confiança          │
└─────────────────────────────────────────────────────────────┘
  │
  ▼
Sugestão: "Etiqueta Múltipla de Produto — 3 Colunas (Confiança: 95%)"
```

### Exemplo Prático de Diagnóstico:
Ao identificar 3 blocos de código de barras dispostos horizontalmente com dimensões idênticas em uma mídia de 105 mm, o analisador sugere:
- **Padrão:** *Etiqueta em 3 colunas (gôndola / unitária)*.
- **Sugestão de Uso:** *Produtos sem código de barras industrial, itens fracionados ou etiquetagem de gôndola compacta*.
- **Transparência:** O sistema **nunca assume silenciosamente**; exibe a recomendação acompanhada do índice de confiança para validação do usuário.

---

## 5. Distinção Rígida das Três Camadas de Linguagem

Para manter a integridade arquitetural do monorepo, as seguintes três camadas conceituais **nunca devem ser misturadas**:

| Camada | Propósito | Responsabilidade | Exemplos |
|---|---|---|---|
| **1. Printer Language** | Define **COMO** a impressora imprime fisicamente. | Comandos nativos da controladora da impressora térmica. | `^XA`, `^XZ`, `Q240,024`, `A50,10,0,3,1,1,N` |
| **2. Witiquetas Template Language** | Define **LÓGICA, CÁLCULOS E REGRAS** no layout. | Macros, condicionais e transformações de texto avaliadas pelo motor. | `[[SE]]`, `[[SENAO]]`, `[[FIMSE]]`, `[[CALC]]`, `[[NOME,0,18]]` |
| **3. Integration Field Catalog** | Define **QUAIS DADOS ESTÃO DISPONÍVEIS**. | Esquema contratual de campos fornecidos pelo ERP/API. | `hospital.prontuario`, `startwo.precoVenda`, `system.printDateTime` |
