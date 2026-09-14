# WITIQUETAS — COMPILER GAP ANALYSIS
**Auditoria de Compiladores e Matriz de Compatibilidade de Elementos Visuais**  
**Trilha Paralela:** ROADMAP FORWARD PREPARATION (Subsídio à futura Fase 6)  
**Data:** 14/09/2026  
**Status:** ANÁLISE ARQUITETURAL / NÃO-EXECUTÁVEL (Sem alteração de código)  
**Conformidade:** Alinhado a `packages/printer-core`, `packages/printer-ppla`, `packages/printer-pplb`, `packages/label-schema` e suíte de testes.

---

## 1. ESCOPO DA AUDITORIA

Esta auditoria realizou uma inspeção técnica aprofundada nos compiladores de runtime e serializadores de importação existentes no repositório:
- `packages/printer-core/src/zplCompiler.ts`, `types.ts`, `registry.ts`
- `packages/printer-ppla/src/index.ts`
- `packages/printer-pplb/src/index.ts`
- `apps/frontend/src/editor/importers/legacyCompiler.ts`, `pplbParser.ts`, `pplaParser.ts`, `zplParser.ts`
- `packages/label-schema/src/` (`canonicalFields.ts`, `dataBindingEngine.ts`, `types.ts`)
- Suíte de Testes: `tests/barcodePplb.test.ts`, `tests/textPplb.test.ts`, `tests/shapeAndImage.test.ts`, `tests/goldenE2E.test.ts`, `tests/elementRotation.test.ts`, `tests/physicalUnits.test.ts`.

---

## 2. MATRIZ CONSOLIDADA DE COMPATIBILIDADE
### Visual Element × Linguagem de Impressão

**Critérios de Classificação:**
- **SUPPORTED:** Implementado em código, compila comandos válidos e possui cobertura de testes automatizados.
- **PARTIAL:** Implementado com restrições, fallbacks, parâmetros estáticos (hardcoded) ou sem suporte a rotação/escalas.
- **MISSING:** Não implementado, omitido no switch (degrada para warning) ou lança exceção explícita (`throw Error`).
- **UNKNOWN:** Não analisado ou comportamento indefinido.
- **NEEDS_PHYSICAL_TEST:** Implementado em código mas sem homologação física em bancada de hardware.

| Elemento Canônico | PPLB (Argox/Elgin) | PPLA (Argox) | ZPL (Zebra) | EPL (Zebra Legacy) | TSPL (TSC/Elgin) | DPL (Datamax) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **1. Text** | **PARTIAL** | **PARTIAL** | **PARTIAL** | **MISSING** | **MISSING** | **PARTIAL** |
| **2. Price** | **PARTIAL** | **PARTIAL** | **PARTIAL** | **MISSING** | **MISSING** | **PARTIAL** |
| **3. Date** | **PARTIAL** | **PARTIAL** | **MISSING** | **MISSING** | **MISSING** | **PARTIAL** |
| **4. Barcode EAN-13** | **SUPPORTED** | **PARTIAL** | **NEEDS_PHYSICAL_TEST** | **MISSING** | **MISSING** | **PARTIAL** |
| **5. Barcode EAN-8** | **PARTIAL** | **MISSING** | **MISSING** | **MISSING** | **MISSING** | **MISSING** |
| **6. Barcode Code 128** | **PARTIAL** | **MISSING** | **MISSING** | **MISSING** | **MISSING** | **MISSING** |
| **7. Barcode Code 39** | **MISSING** | **MISSING** | **MISSING** | **MISSING** | **MISSING** | **MISSING** |
| **8. QRCode (2D)** | **MISSING** | **MISSING** | **MISSING** | **MISSING** | **MISSING** | **MISSING** |
| **9. Line** | **PARTIAL** | **PARTIAL** | **NEEDS_PHYSICAL_TEST** | **MISSING** | **MISSING** | **PARTIAL** |
| **10. Rectangle** | **PARTIAL** | **PARTIAL** | **NEEDS_PHYSICAL_TEST** | **MISSING** | **MISSING** | **PARTIAL** |
| **11. Image** | **MISSING** | **MISSING** | **MISSING** | **MISSING** | **MISSING** | **MISSING** |

---

## 3. AUDITORIA DETALHADA LINHA A LINHA

### 3.1 PPLB (Argox OS-214 Plus, Elgin L42, Elgin L42 Pro)
- **Arquivo Runtime:** `packages/printer-pplb/src/index.ts`
- **Arquivo Serializer Legado:** `apps/frontend/src/editor/importers/legacyCompiler.ts`

1. **Cabeçalho:**
   - *Runtime:* Emite `N\n`, `q${wDots}\n`, `Q${hDots},24\n`. O gap é fixado em 24 dots (~3mm).
   - *Serializador Legado:* Preserva o gap original lido do template (`Q${height},${gap}\n`) e adiciona zeros à esquerda (`024`), validado em `tests/physicalUnits.test.ts`.
2. **Texto (`text`):**
   - *Runtime (linhas 60-65):* `A${xDots},${yDots},0,3,1,1,N,"${textValue}"`.
   - *Gap:* Rotação fixada em 0 (ignora `elem.rotation`), fonte fixada em 3 (ignora `fontSize` e `fontFamily`), multiplicadores fixados em 1,1.
   - *Serializador Legado:* Suporta rotações 0..3, fontes 1..5 e multiplicadores dinâmicos.
3. **Código de Barras 1D (`barcode`):**
   - *Runtime (linhas 76-81):* `B${xDots},${yDots},0,E30,2,4,${elHDots},B,"${barcodeValue}"`.
   - *Gap Crítico:* Força incondicionalmente a simbologia `E30` (EAN-13). Se o elemento for um Code 128 (ex: alfanumérico de lote ou serial), a impressora falha ou imprime código corrompido.
   - *Serializador Legado:* Trata adequadamente `E30` (EAN-13), `'8'` (EAN-8) e `'1'` (Code 128), conforme testado em `tests/barcodePplb.test.ts`.
4. **Retângulo e Linha (`rectangle` e `line`):**
   - *Runtime (linhas 84-93):* Emite `LO${xDots},${yDots},${elWDots},${elHDots}` para retângulo e `LO${xDots},${yDots},${elWDots},2` para linha.
   - *DEFEITO GRAVE NO RUNTIME:* O comando `LO` (*Line Overwrite*) em PPLB com largura e altura preenche um **retângulo preto 100% sólido**. O comando oficial para moldura vazada é `X${xDots},${yDots},${thick},${endX},${endY}` (usado corretamente pelo `LegacyCompiler`).
5. **Finalização:** Emite `P1\n` (imprime 1 cópia).

---

### 3.2 PPLA (Argox OS-214)
- **Arquivo Runtime:** `packages/printer-ppla/src/index.ts`
- **Arquivo Serializer Legado:** `apps/frontend/src/editor/importers/legacyCompiler.ts`

1. **Inicialização:** Emite `\x02L` (`<STX>L`), `D11` (densidade padrão) e `H10` (temperatura de cabeçote).
2. **Coordenadas:** Formata coordenadas em 4 dígitos decimais com **Y antes de X** (`1211000${yStr}${xStr}${textValue}`).
3. **Texto (`text`):** Orientação fixada em 1 (0°), fonte fixada em 2, multiplicadores fixados em 1,1.
4. **Código de Barras (`barcode`):** Emite `1F22000${yStr}${xStr}${barcodeValue}`.
   - *Gap:* Altura emitida como `000` (zero absoluto, dependente do default do firmware). Simbologias EAN-8 (`G`), Code 128 (`E`) e Code 39 (`A`) são ignoradas.
5. **Retângulo e Linha:** Emite `X110000${yStr}${xStr}${hStr}${wStr}`.
6. **Finalização:** Emite `E\n` (disparo e avanço).

---

### 3.3 ZPL II (Zebra Technologies)
- **Arquivo Runtime:** `packages/printer-core/src/zplCompiler.ts`

1. **Estrutura de Formato:** Inicia com `^XA` e encerra com `^XZ` (conforme especificação oficial).
2. **Texto (`text`):** Emite `^FO${xDots},${yDots}^A0N,28,28^FD${textValue}^FS`.
   - *Gap:* Rotação fixada em 'N' (0°); tamanho de fonte fixado em 28x28 dots (~3.5mm de altura), desconsiderando a escala do canvas.
3. **Código de Barras (`barcode`):** Emite `^FO${xDots},${yDots}^BEN,${hDots},Y,N^FD${barcodeValue}^FS`.
   - *Gap Crítico:* Emite `^BE` (EAN-13) para todos os códigos. Falha ao imprimir Code 128 (`^BC`), Code 39 (`^B3`) ou EAN-8 (`^B8`). Além disso, omite o comando `^BY`, impedindo a calibração de largura de barras.
4. **Retângulo e Linha:** Emite `^FO${xDots},${yDots}^GB${wDots},${hDots},${strokeWidth}^FS`.
   - *Auditoria:* Emissão sintaticamente correta de `^GB` para caixas vazadas e linhas horizontais. Falta suporte a linhas verticais ortogonais.

---

## 4. AUDITORIA DOS TRATAMENTOS DE ERRO (CAPABILITY FAILURES)

### 4.1 Tratamento do Elemento `image` (Ajuste P0 - Homologado)
Em conformidade com a decisão da Fase 4.3 validada em `tests/shapeAndImage.test.ts`:
- **Validação Antecipada (`validate()`):**
  Se houver imagem visível (`type === 'image' && elem.visible !== false`), os compiladores PPLB, PPLA e ZPL retornam `valid: false` com erro informativo:  
  `"Este modelo contém uma imagem, mas a linguagem [PPLB/PPLA/ZPL] selecionada ainda não possui suporte a bitmap."`
- **Bloqueio em Execução (`compile()`):**
  Dispara `throw new Error(...)` bloqueando a emissão antes de gerar payloads térmicos parciais ou corrompidos.
- **Resiliência:** Imagens ocultas (`visible === false`) não bloqueiam a compilação.

### 4.2 Degradação Silenciosa em `qrcode`
- O elemento `qrcode` não possui cláusula dedicada nos `switch (elem.type)` de `PPLBCompiler`, `PPLACompiler` e `ZPLCompiler`.
- **Comportamento:** Cai na cláusula `default`, gerando apenas um warning no array de retorno (`"Elemento do tipo 'qrcode' ignorado pelo compilador..."`).
- **Risco Operacional:** A compilação é considerada válida, gerando etiqueta física sem o QR Code, sem disparar erro para o operador.

---

## 5. AUDITORIA GEOMÉTRICA, ESCALA E ROTAÇÃO CANÔNICA

1. **Conversão Métrica (Dots vs Millimeters):**
   - Todos os compiladores utilizam a fórmula centralizada:  
     $$\text{dotsPerMm} = \text{dpi} / 25.4 \quad (\sim 7.992 \text{ dots/mm a 203 DPI; } \sim 11.811 \text{ a 300 DPI})$$
   - A conversão bidirecional foi auditada em `tests/physicalUnits.test.ts` com **Diff Zero absoluto**.
2. **Rotação Canônica (0°, 90°, 180°, 270°):**
   - **Frontend / Schema:** Rotação ortogonal com snap magnético e bounding box geométrico perfeito (AABB) 100% homologada (`tests/elementRotation.test.ts`).
   - **Compiladores de Runtime (`packages/printer-*`):** **FALHA GERAL DE RUNTIME.** Nem ZPL, nem PPLA, nem PPLB leem `elem.rotation` no pacote de backend. Todos emitem comandos em 0° fixo.
   - **Serializador Legado (`LegacyCompiler`):** Mapeia adequadamente para PPLB (`0,1,2,3`) e PPLA (`1,2,3,4`).

---

## 6. DIVERGÊNCIAS ARQUITETURAIS IDENTIFICADAS

1. **Dualidade de Compiladores (Backend Runtime vs Frontend Legacy):**
   - Existe uma bifurcação entre os compiladores em `packages/printer-*` e o `LegacyCompiler` em `apps/frontend/src/editor/importers/legacyCompiler.ts`.
   - O `LegacyCompiler` possui código muito mais maduro para fontes e códigos de barras, que não foi transposto para o pacote `@witiquetas/printer-pplb`.
2. **Defeito Visual de Moldura no PPLB Runtime:**
   - O uso de `LO` no `PPLBCompiler` causa impressão de bloco preto sólido, enquanto o `LegacyCompiler` usa o comando correto de moldura vazada `X`.
3. **Ausência de Pacotes EPL, TSPL e DPL:**
   - Embora `PrinterLanguage` preveja `EPL`, `TSPL` e `DPL`, nenhum pacote existe no monorepo para essas linguagens.

---

## 7. BACKLOG PRIORITÁRIO DE GAPS PARA A FASE 6

| Prioridade | Módulo | Descrição do Gap Técnico | Esforço | Impacto na Fase 6 |
| :---: | :---: | :--- | :---: | :--- |
| **P0** | `printer-pplb` | **Correção de Retângulo PPLB:** Trocar `LO` por `X` no compilador de runtime para eliminar bloco preto sólido. | 1h | Elimina defeito visual crítico em molduras na Elgin/Argox. |
| **P0** | `printer-core` | **Multi-Barcode ZPL:** Mapear `elem.format` para `^B8` (EAN-8), `^BC` (Code 128) e `^B3` (Code 39), com `^BY` para largura de barras. | 4h | Permite etiquetas logísticas e industriais com Zebra. |
| **P0** | `compilers` | **Rotação Canônica no Runtime:** Repassar `elem.rotation` para parâmetros nativos em PPLB (`0..3`), PPLA (`1..4`) e ZPL (`N,R,I,B`). | 4h | Permite etiquetas verticais de gôndola e tags têxteis. |
| **P1** | `printer-epl` | **Criação do Pacote `printer-epl`:** Criar pacote monorepo aproveitando rotinas homologadas do `PPLBCompiler`. | 6h | Habilita suporte oficial a impressoras Zebra 2844 / GC420t. |
| **P1** | `compilers` | **Implementação de QRCode (2D):** Implementar geração de `^BQ` (ZPL), `bQ` (PPLB) e `W1D` (PPLA). | 6h | Permite PIX e links de rastreabilidade na etiqueta. |
| **P1** | `printer-ppla` | **Multi-Barcode PPLA:** Mapear `G` (EAN-8), `E` (Code 128) e `A` (Code 39) com altura dinâmica (`hhhh`) em PPLA. | 3h | Desbloqueia códigos industriais em impressoras Argox. |
| **P1** | `compilers` | **Suporte a Imagens Monocromáticas (Bitmap):** Implementar conversão 1-bit com thresholding emitindo `^GF` (ZPL), `GW` (PPLB) e `<STX>I` (PPLA). | 12h | Permite logomarcas monocromáticas reais. |
| **P2** | `printer-tspl` | **Criação do Pacote `printer-tspl`:** Criar pacote monorepo para impressoras TSC e Elgin L42 Pro / TT042. | 16h | Suporte à linha mais moderna e veloz de impressoras desktop. |
