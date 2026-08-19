# Witiquetas — Printer Language Knowledge Base

Este documento formaliza a iniciativa da **Base de Conhecimento de Linguagens de Impressão (Printer Language Knowledge Base)** do Witiquetas, definindo a metodologia de catalogação sistemática de comandos térmicos de baixo nível.

---

## 1. O Princípio da Preservação e Compreensão

> **PRESERVAR COMANDOS DESCONHECIDOS É OBRIGATÓRIO PARA GARANTIR ROUND-TRIP DIFF ZERO.**
>
> **NO ENTANTO, PRESERVAR PASSIVAMENTE NÃO É SUFICIENTE.**

Durante a importação de modelos legados (PPLA, PPLB, ZPL, EPL), comandos de cabeçalho, controle de mídia, velocidade, temperatura e posicionamento que não possuem representação visual imediata no canvas são preservados integralmente para assegurar a fidelidade de recompilação.

Para evoluir a plataforma para um nível superior de diagnóstico e edição assistida, cada comando identificado em arquivos reais deve ser formalmente catalogado na **Printer Language Knowledge Base**.

---

## 2. Estrutura Canônica de Catalogação de Comandos

Cada comando documentado na base de conhecimento deve conter os seguintes metadados:

| Campo | Descrição | Exemplo PPLB | Exemplo ZPL |
|---|---|---|---|
| **Linguagem** | Família e dialeto da linguagem térmica | `PPLB (Argox / Datamax)` | `ZPL II (Zebra)` |
| **Comando** | Mnemônico ou caractere de controle | `Q` | `^MD` |
| **Sintaxe** | Estrutura completa de parâmetros | `Qp1,p2` | `^MD<temperatura>` |
| **Significado** | Definição formal de acordo com o manual | Comprimento da etiqueta (altura) e tamanho do GAP | Densidade de Mídia / Ajuste de Temperatura de Impressão |
| **Unidade** | Sistema métrico ou contagem de pulsos | Dots de 203 DPI (p1 = altura, p2 = gap em dots) | Escala de intensidade de -30 a +30 |
| **Categoria** | Classificação funcional no ciclo de impressão | *Controle de Mídia & Calibração* | *Configuração de Cabeça Térmica* |
| **Efeito Físico** | O que o hardware executa ao receber o comando | Avança a mídia até o sensor óptico detectar o próximo GAP | Altera a dissipação de calor nos micropontos térmicos |
| **Impacto em Mídia** | Afeta o alinhamento ou avanço contínuo? | **Sim.** Determina o ponto de parada e corte | **Não.** Não altera dimensões físicas |
| **Impacto em Layout** | Altera a posição dos elementos no canvas? | Define a altura total disponível para os elementos | Não altera coordenadas |
| **Impacto em Impressão**| Afeta a legibilidade do produto final? | Previne impressão sobre o GAP ou corte no meio do texto | Aumenta ou diminui o contraste e nitidez dos traços |
| **Representação Visual**| Como o editor reflete este comando na tela? | Define a altura do Canvas em milímetros (`heightMm`) | Configuração avançada de temperatura da impressora |
| **Preservação** | Deve ser retido em edições de layout? | **Obrigatório.** | **Obrigatório.** |
| **Fonte Documental** | Referência ao manual oficial do fabricante | *Argox PPLB Programming Manual (Sec. 2.4)* | *Zebra ZPL II Programming Guide (Vol. 1)* |
| **Equivalências** | Comandos análogos em outras linguagens | ZPL: `^LL` (Label Length); PPLA: `e` | PPLB: `D` (Density); PPLA: `D` |

---

## 3. Classificação das Categorias de Comandos

A base agrupa comandos nas seguintes categorias operacionais:

1. **Configuração de Mídia & Sensores:**
   - Comprimento da etiqueta, largura imprimível, tipo de sensor (Gap, Black Mark, Contínuo), offset de corte/peel-off.
2. **Qualidade & Física de Impressão:**
   - Densidade térmica (Darkness/Density), velocidade de tração (Speed), tipo de ribbon (Transferência Térmica vs Térmica Direta).
3. **Elementos Gráficos Primitivos:**
   - Linhas horizontais/verticais, caixas/molduras, preenchimentos sólidos, inversão de cores (White on Black).
4. **Tipografia & Fontes Residentes:**
   - Seleção de fontes de matriz de pontos internas (Fontes 1 a 5 no PPLB, Fontes A a Z no ZPL), fatores de multiplicação horizontal e vertical.
5. **Simbologias de Código de Barras:**
   - EAN-13, EAN-8, Code 128, Code 39, Interleaved 2 of 5, QR Code, DataMatrix, PDF417, parâmetros de razão e largura de barra.
6. **Controle de Job e Spooler:**
   - Quantidade de cópias, inicialização de buffer de imagem, comando de disparo de impressão.

---

## 4. Relação com as Demais Camadas do Sistema

A **Printer Language Knowledge Base** é o pilar que sustenta o motor de compilação e o importador inteligente:

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. PRINTER LANGUAGE KNOWLEDGE BASE                          │
│    Sabe exatamente o que cada byte de hardware significa     │
└──────────────────────────────┬──────────────────────────────┘
                               │ Alimenta
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. IMPORT LAYOUT ANALYZER                                   │
│    Identifica comandos, infere o layout e gera LabelDocument │
└──────────────────────────────┬──────────────────────────────┘
                               │ Traduz para
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. WITIQUETAS COMPILER ENGINE                               │
│    Gera saídas otimizadas e limpas para qualquer impressora │
└─────────────────────────────────────────────────────────────┘
```
