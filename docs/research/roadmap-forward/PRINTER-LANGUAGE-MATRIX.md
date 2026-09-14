# WITIQUETAS — PRINTER LANGUAGE MATRIX & KNOWLEDGE BASE
**Compêndio Técnico de Linguagens Térmicas e Engenharia de Hardware**  
**Trilha Paralela:** ROADMAP FORWARD PREPARATION (Subsídio à futura Fase 6)  
**Data:** 14/09/2026  
**Status:** PESQUISA PREPARATÓRIA / BASE DE CONHECIMENTO CANÔNICA  
**Conformidade:** Alinhado a `AGENTS.md`, `CONTEXT.md`, `docs/architecture/PRINTER-LANGUAGE-KNOWLEDGE-BASE.md` e manuais técnicos de fabricantes.

---

## 1. INTRODUÇÃO E DIRETRIZES DE HOMOLOGAÇÃO

O Witiquetas tem como princípio arquitetural a preservação do pipeline canônico de dados:  
$$\text{Dados} \longrightarrow \text{LabelDocument} \longrightarrow \text{Motor} \longrightarrow \text{Compiler} \longrightarrow \text{PrintJob} \longrightarrow \text{Agent} \longrightarrow \text{Impressora}$$

Para expandir o suporte de hardware na **Fase 6** (Zebra ZPL II, EPL2, Elgin, TSC TSPL, Datamax DPL), este documento cataloga formalmente as linguagens térmicas de baixo nível, seus comandos, unidades físicas, encodings, mecanismos de telemetria bidirecional e particularidades de fabricantes.

### Critérios Rígidos de Classificação:
- **`[DOCUMENTADO]`**: Especificação constante de manuais oficiais de programação dos fabricantes (Zebra ZPL/EPL Programming Guides, Argox PPLA/PPLB Manual, TSC TSPL/TSPL2 Architecture Manual, Datamax DPL Reference Manual).
- **`[INFERIDO]`**: Dedução lógica de engenharia reversa baseada em comportamento comum de mercado, drivers de terceiros (ex: Seagull, Bartender) ou bibliotecas de código aberto (ex: ACBr).
- **`[PRECISA HOMOLOGAÇÃO FÍSICA]`**: Comportamento que depende de variação física de placa, versão de firmware embarcado ou teste real em bancada. **Nenhuma impressão física pode ser considerada pronta sem teste real em equipamento.**

---

## 2. MATRIZ CONVERSÃO MÉTRICA E SISTEMA DE COORDENADAS

### 2.1 Resoluções e Fatores de Conversão
| Resolução Nominal | Pontos por mm (dots/mm) | Tamanho do Ponto (dot pitch) | Conversão mm $\rightarrow$ dots | Conversão dots $\rightarrow$ mm | Classificação |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **203 DPI** (Desktop Padrão) | 8.000 dots/mm | 0.1250 mm | $\text{dots} = \text{round}(\text{mm} \times 8.0)$ | $\text{mm} = \text{dots} / 8.0$ | `[DOCUMENTADO]` |
| **300 DPI** (Alta Densidade) | 11.811 dots/mm (~11.81) | 0.08466 mm | $\text{dots} = \text{round}(\text{mm} \times 11.811)$ | $\text{mm} = \text{dots} / 11.811$ | `[DOCUMENTADO]` |
| **600 DPI** (Micro-etiquetas) | 23.622 dots/mm (~23.62) | 0.04233 mm | $\text{dots} = \text{round}(\text{mm} \times 23.622)$ | $\text{mm} = \text{dots} / 23.622$ | `[DOCUMENTADO]` |

### 2.2 Ponto de Origem Cartesiano por Linguagem
- **Origem no Canto Superior Esquerdo (Top-Left — 0,0):**
  - **ZPL II (Zebra):** (0,0) superior esquerdo da mídia útil. Ajustável por `^LH` (Label Home). `[DOCUMENTADO]`
  - **PPLB (Argox / Elgin) / EPL2 (Zebra):** (0,0) superior esquerdo. Eixo X horizontal, eixo Y no sentido do avanço da mídia. `[DOCUMENTADO]`
  - **TSPL / TSPL2 (TSC / Elgin):** (0,0) superior esquerdo. `DIRECTION 0` mantém padrão; `DIRECTION 1` gira 180°. `[DOCUMENTADO]`
  - **CPCL (Zebra Mobile):** (0,0) superior esquerdo relativo ao offset do cabeçalho `! <offset> ...`. `[DOCUMENTADO]`
  - **DPL (Datamax):** (0,0) superior esquerdo por padrão em coordenadas `Row` (vertical) e `Column` (horizontal). `[DOCUMENTADO]`
- **Origem no Canto Inferior Esquerdo (Bottom-Left — 0,0) — PPLA (Argox):**
  - **DIVERGÊNCIA CRÍTICA:** No protocolo PPLA da Argox, o ponto (0,0) situa-se no **canto inferior esquerdo** da etiqueta física. O eixo Y cresce no sentido do avanço do rolo de mídia. `[DOCUMENTADO]`
  - **Implicação no Compilador:** A compilação de `LabelDocument` para PPLA exige inversão vertical estrita:  
    $$Y_{\text{ppla}} = \text{AlturaTotalEtiquetaDots} - Y_{\text{desenho}} - \text{AlturaElementoDots}$$  
    `[INFERIDO]` `[PRECISA HOMOLOGAÇÃO FÍSICA]`

---

## 3. ZEBRA ZPL II (Zebra Programming Language)

### 3.1 Arquitetura e Ciclo do Formato
- **Abertura e Fechamento:** Inicia com `^XA` e encerra com `^XZ` (provoca gravação e avanço mecânico). `[DOCUMENTADO]`
- **Comandos Imediatos vs Formatadores:** Comandos com circunflexo (`^`) são formatadores de buffer; comandos com til (`~`) são comandos de ação imediata em tempo real (ex: cancelamento `~JA`, status `~HS`). `[DOCUMENTADO]`

### 3.2 Comandos Principais por Tipo de Elemento
- **Texto:**
  - `^FOx,y`: Posição do campo (Field Origin). `[DOCUMENTADO]`
  - `^Afo,h,w`: Seleção de fonte (`f`: `0` para fonte escalável vetorial Zebra Zero; `A` a `Z` para bitmaps; `o`: `N`=0°, `R`=90°, `I`=180°, `B`=270°; `h,w`: altura e largura em dots). `[DOCUMENTADO]`
  - `^FD{texto}^FS`: Field Data e Field Separator. `[DOCUMENTADO]`
- **Preço / Moeda:** Renderizado com `^A0N,h,w^FD R$ 19,90^FS`. Acentuação e símbolo de moeda exigem `^CI27` (Windows-1252) ou `^CI28` (UTF-8). `[DOCUMENTADO]`
- **Data / Hora (Hardware RTC):** Comando `^FC%,{CR},+0` (Format Clock) e variáveis de escape `%d/%m/%Y` associadas a `^SL` (Set RTC). `[DOCUMENTADO]` `[PRECISA HOMOLOGAÇÃO FÍSICA]`
- **Código de Barras 1D:**
  - `^BYw,r,h`: Largura de barra estreita em dots (`w`), razão narrow:wide (`r`), altura padrão (`h`). `[DOCUMENTADO]`
  - `^BEN,h,Y,N^FD{ean13}^FS`: EAN-13 com cálculo automático de dígito verificador. `[DOCUMENTADO]`
  - `^B8N,h,Y,N^FD{ean8}^FS`: EAN-8. `[DOCUMENTADO]`
  - `^BCN,h,Y,N,N,A^FD>;>8{code128}^FS`: Code 128 com seleção automática de subset. `[DOCUMENTADO]`
  - `^B3N,N,h,Y,N^FD{code39}^FS`: Code 39. `[DOCUMENTADO]`
- **Código de Barras 2D / QR Code:**
  - `^BQN,2,magnification,ecc,mask` seguido de `^FD{ecc_flag}{data_mode},{conteúdo}^FS`.
  - Exemplo canônico (Model 2, escala 5 dots/módulo, correção M 15%):  
    `^FO100,100^BQN,2,5,M,7^FDMM,Ahttps://witiquetas.com.br^FS` `[DOCUMENTADO]`
- **Linhas e Retângulos:**
  - `^GBw,h,t,c,r^FS`: Caixa gráfica (`w`: largura, `h`: altura, `t`: espessura da borda, `c`: cor `B`/`W`, `r`: curvatura dos cantos 0 a 8). `[DOCUMENTADO]`
  - Linha horizontal: `^GB400,0,3,B^FS` ou `^GB400,3,3,B^FS`. `[DOCUMENTADO]`
  - Bloco preto sólido: `^GB200,100,100,B^FS`. `[DOCUMENTADO]`
- **Imagens e Bitmaps:**
  - `^GFformat,data_bytes,total_bytes,bytes_per_row,data`: Formatos `A` (ASCII Hex), `B` (Binário cru) e `C` (RLE compactado). `[DOCUMENTADO]`
  - `~DGnome,total,bpr,data`: Armazenamento de imagem em DRAM/Flash e chamada posterior via `^XGnome,1,1^FS`. `[DOCUMENTADO]`
- **Mídia e Sensores:**
  - `^MNY`: Sensor Gap/Web; `^MNM`: Black Mark; `^MNN`: Contínuo. `[DOCUMENTADO]`
  - `^LLdots`: Comprimento da etiqueta (mandatório em papel contínuo). `[DOCUMENTADO]`
  - `^PWdots`: Largura de impressão útil. `[DOCUMENTADO]`
  - `~SD00..30`: Ajuste térmico de densidade (Darkness). `[DOCUMENTADO]`
  - `^PR2,3,4,6,8,10,12`: Velocidade de tração em polegadas por segundo. `[DOCUMENTADO]`

### 3.3 Protocolo Bidirecional e Telemetria (~HS)
O comando imediato `~HS` (Host Status) devolve 3 linhas delimitadas por `<STX>` (0x02) e `<ETX>` (0x03) + `<CR><LF>`:
- **Linha 1:** `<STX>aaa,b,c,dddd,eee,f,g,h,iii,j,k,l<ETX><CR><LF>`
  - `b`: **Paper Out** (`0` = OK, `1` = Falta de papel). `[DOCUMENTADO]`
  - `c`: **Pause State** (`0` = Normal, `1` = Pausada). `[DOCUMENTADO]`
  - `f`: **Buffer Full** (`0` = Livre, `1` = Buffer cheio). `[DOCUMENTADO]`
  - `l`: **Sobretemperatura da Cabeça Térmica** (`1` = Erro térmico). `[DOCUMENTADO]`
- **Linha 2:** `<STX>mmm,n,o,p,q,r,s,t,uuu,v,w<ETX><CR><LF>`
  - `o`: **Head Up** (`0` = Cabeça fechada, `1` = Cabeça aberta). `[DOCUMENTADO]`
  - `p`: **Ribbon Out** (`0` = Ribbon OK, `1` = Falta de ribbon). `[DOCUMENTADO]`
  - `t`: **Label Waiting** (`1` = Etiqueta no sensor de peel-off aguardando retirada). `[DOCUMENTADO]`
  - `uuu`: Quantidade de formatos pendentes no lote de impressão. `[DOCUMENTADO]`

---

## 4. ZEBRA EPL2 / ARGOX PPLB (Eltron Programming Language)

### 4.1 Arquitetura e Ciclo do Formato
- **Comandos Linha a Linha:** Cada comando termina estritamente com `\n` (0x0A) ou `\r\n`. `[DOCUMENTADO]`
- **Abertura e Fechamento:** Inicia com `N\n` (Clear Image Buffer) e finaliza com `P<qtd>[,<copias>]\n` (ex: `P1\n`). `[DOCUMENTADO]`
- **Reset:** `^@` (Soft Reset). `[DOCUMENTADO]`

### 4.2 Comandos Principais por Tipo de Elemento
- **Texto:** `A<x>,<y>,<rot>,<font>,<h_mult>,<v_mult>,<rev>,"<texto>"\n` `[DOCUMENTADO]`
  - `rot`: `0` (0°), `1` (90°), `2` (180°), `3` (270°).
  - `font`: `1` (8x12), `2` (10x16), `3` (12x20), `4` (14x24), `5` (32x48 dots) — bitmap residente.
  - `h_mult`, `v_mult`: Multiplicadores de escala (1 a 8).
  - `rev`: `N` (Normal), `R` (Reverse / Fundo preto com texto branco).
- **Código de Barras 1D:** `B<x>,<y>,<rot>,<type>,<narrow>,<wide>,<height>,<human>,"<valor>"\n` `[DOCUMENTADO]`
  - `type`: `E30` (EAN-13), `E80` (EAN-8), `1` (Code 128), `3` (Code 39), `2` (Interleaved 2 of 5).
  - `human`: `B` (com legenda abaixo), `N` (sem legenda).
- **Código de Barras 2D / QR Code:** `b<x>,<y>,Q,m,s,e,v,"<conteudo>"\n` `[DOCUMENTADO]`
  - `m`: Modelo (`2` = Model 2 recomendado).
  - `s`: Escala do módulo em dots (1 a 15).
  - `e`: Correção de erro (`L`, `M`, `Q`, `H`).
  - `v`: Máscara (`0` a `7`).
  - Exemplo: `b50,50,Q,2,5,M,7,"https://witiquetas.com.br"\n` `[DOCUMENTADO]`
- **Linhas e Retângulos:**
  - Linha sólida ou preenchimento preto: `LO<x>,<y>,<w>,<h>\n` `[DOCUMENTADO]`
  - **Moldura Retangular Vazada:** `X<x>,<y>,<thick>,<endX>,<endY>\n` `[DOCUMENTADO]`  
    *(Atenção: emitir `LO` para molduras causa bloco preto sólido na impressora).*
- **Imagens e Bitmaps:**
  - Gráfico binário direto: `GW<x>,<y>,<w_bytes>,<h_dots>,<raw_binary_bytes>\n` `[DOCUMENTADO]`
  - Download PCX em memória: `GM"NOME"<bytes>\n<pcx_data>` e impressão via `GG<x>,<y>,"NOME"\n`. `[DOCUMENTADO]`
- **Mídia e Sensores:**
  - `Q<altura_dots>,<gap_dots>`: Tamanho da etiqueta e gap (ex: `Q240,24` para 30mm com gap de 3mm). `[DOCUMENTADO]`
  - `q<largura_dots>`: Largura imprimível (ex: `q832` para 104mm a 203 DPI). `[DOCUMENTADO]`
  - `D<0..15>`: Densidade/Temperatura. `S<0..6>`: Velocidade de tração. `[DOCUMENTADO]`

### 4.3 Protocolo Bidirecional e Telemetria (^ee)
O comando imediato `^ee` retorna 4 bytes: `XX<CR><LF>`:
- `00`: No Error (Pronta e sem falhas). `[DOCUMENTADO]`
- `01`: Syntax Error (Comando desconhecido ou malformado). `[DOCUMENTADO]`
- `02`: Object Exceeded Label Border (Coordenada extrapolou a mídia física). `[DOCUMENTADO]`
- `03`: Bar Code Data Length Error (Quantidade inválida de dígitos). `[DOCUMENTADO]`
- `04`: Insufficient Memory (Estouro de buffer gráfico). `[DOCUMENTADO]`
- `07`: **Paper Out / Ribbon Out** (Falta de papel ou ribbon). `[DOCUMENTADO]`
- `11`: **Print Head Open** (Cabeça térmica/tampa aberta). `[DOCUMENTADO]`

---

## 5. ARGOX PPLA (Argox Programming Language A)

### 5.1 Arquitetura e Ciclo do Formato
- **Origem no Canto Inferior Esquerdo (Bottom-Left):** Eixo Y cresce no sentido do avanço do rolo. `[DOCUMENTADO]`
- **Abertura e Fechamento:** Inicia com `<STX>L` (0x02 0x4C) e finaliza com `E\n` (ou `<STX>E`), executando a impressão e corte. `[DOCUMENTADO]`

### 5.2 Comandos Principais
- **Texto:** `kabcdefy4x4data\n` `[DOCUMENTADO]`
  - `k`: Rotação (`1`=0°, `2`=90°, `3`=180°, `4`=270°).
  - `a`: Fonte residente (`1` a `5`).
  - `b,c`: Multiplicadores horizontal e vertical (1 a 9).
  - `def`: Subtipo (`000` padrão).
  - `y4, x4`: Coordenadas Y e X em 4 dígitos decimais (0000-9999).
- **Código de Barras 1D:** `kabchhhhy4x4data\n` `[DOCUMENTADO]`
  - `a`: Simbologia (`F`=EAN-13, `G`=EAN-8, `E`=Code 128, `A`=Code 39).
  - `bc`: Razão de barra. `hhhh`: Altura em dots (4 dígitos).
- **Linhas e Retângulos:** `X110000{y4}{x4}{h4}{w4}\n` `[DOCUMENTADO]`

### 5.3 Telemetria PPLA (<SOH>F e <SOH>A)
- `<SOH>F`: Retorna 1 byte de status binário + `<CR>`:
  - Bit 1: Parser ocupado. Bit 2: **Paper Out**. Bit 3: **Ribbon Out**. Bit 5: Queima ativa. Bit 6: Pausa. Bit 7: Peel-off ativo. `[DOCUMENTADO]`
- `<SOH>A`: Retorna string ASCII de 8 posições com `Y` ou `N`. `[DOCUMENTADO]`

---

## 6. TSC TSPL / TSPL2 (TSC Programming Language)

### 6.1 Arquitetura e Ciclo do Formato
- **Comandos Declarativos em Linha:** Terminados estritamente por `\r\n`. `[DOCUMENTADO]`
- **Abertura e Limpeza:** `SIZE w mm, h mm\n`, `GAP m mm, n mm\n`, `CLS\n` (Clear Buffer obrigatório). `[DOCUMENTADO]`
- **Disparo:** `PRINT <etiquetas>[,<copias>]\n`. `[DOCUMENTADO]`

### 6.2 Comandos Principais
- **Texto:** `TEXT X,Y,"font",rotation,x_mult,y_mult,"content"\n` `[DOCUMENTADO]`
  - `font`: `"1"` a `"5"` (bitmaps residentes) ou `"ROMAN.TTF"` (TrueType).
  - `rotation`: `0`, `90`, `180`, `270`. `x_mult, y_mult`: `1` a `10`.
- **Preço e RTC:** Suporta concatenação de variáveis nativas de relógio de hardware:  
  `TEXT 50,50,"3",0,1,1,"Data: "+@DATE` e `TEXT 50,80,"3",0,1,1,"Hora: "+@TIME`. `[DOCUMENTADO]` `[PRECISA HOMOLOGAÇÃO FÍSICA]`
- **Código de Barras 1D:** `BARCODE X,Y,"type",height,human_readable,rotation,narrow,wide,"content"\n` `[DOCUMENTADO]`
  - `type`: `"EAN13"`, `"EAN8"`, `"128"`, `"39"`, `"ITF"`.
  - `human_readable`: `0` (não), `1` (esquerda), `2` (centro), `3` (direita).
- **Código de Barras 2D / QR Code:** `QRCODE X,Y,ecc,cell_width,mode,rotation,model,mask,"content"\n` `[DOCUMENTADO]`
  - Exemplo: `QRCODE 50,50,M,6,A,0,M2,S7,"https://witiquetas.com.br"\n` `[DOCUMENTADO]`
- **Linhas e Retângulos:**
  - Linha sólida ou barra preta: `BAR X,Y,width,height\n` `[DOCUMENTADO]`
  - Moldura vazada: `BOX X_start,Y_start,X_end,Y_end,thickness[,radius]\n` `[DOCUMENTADO]`
  - Apagar área (Whiteout): `ERASE X,Y,width,height\n` `[DOCUMENTADO]`
- **Imagens:** `BITMAP X,Y,w_bytes,h_dots,mode,data` ou `PUTBMP X,Y,"LOGO.BMP"\n`. `[DOCUMENTADO]`
- **Mídia:** `SPEED <1.5..14.0>`, `DENSITY <0..15>`, `DIRECTION 0` (ou `1`). `[DOCUMENTADO]`

### 6.3 Telemetria TSPL (<ESC>!?)
O comando imediato `<ESC>!?` (`0x1B 0x21 0x3F`) devolve 1 byte de status em tempo real:
- `0x00`: Normal / Pronta para impressão. `[DOCUMENTADO]`
- `0x01` (Bit 0): **Head Opened** (Cabeça térmica aberta). `[DOCUMENTADO]`
- `0x02` (Bit 1): **Paper Jam** (Papel atolado/engasgado). `[DOCUMENTADO]`
- `0x04` (Bit 2): **Out of Paper** (Falta de papel). `[DOCUMENTADO]`
- `0x08` (Bit 3): **Out of Ribbon** (Falta de ribbon/fita). `[DOCUMENTADO]`
- `0x10` (Bit 4): **Pause State** (Pausada). `[DOCUMENTADO]`
- `0x20` (Bit 5): **Printing** (Em queima térmica ativa). `[DOCUMENTADO]`

---

## 7. DATAMAX DPL (Datamax Programming Language)

### 7.1 Arquitetura e Ciclo do Formato
- **Modos Estritos:** Modo de Configuração de Sistema (via `<STX>`/`<SOH>`) e Modo de Formatação de Etiqueta (inicia com `<STX>L` e finaliza com `E` ou `<STX>E`). `[DOCUMENTADO]`
- **Registro Posicional de Campo:** `<rot><font><w_mult><h_mult><sub_type><row4><col4><data><CR>` `[DOCUMENTADO]`
  - `rot`: `1` (0°), `2` (90°), `3` (180°), `4` (270°).
  - `row4, col4`: Coordenadas em 4 dígitos fixos com zeros à esquerda.
- **Códigos de Barras:** Mapeados por letra de fonte: `G` (EAN-13), `F` (EAN-8), `E` (Code 128), `A` (Code 39), `W1D` (QR Code 2D). `[DOCUMENTADO]`

### 7.2 Telemetria DPL (<ENQ> e <SOH>A)
- `<ENQ>` (0x05): Retorna 1 byte com status de prontidão (`0x22` = Online/Livre; `0x20` = Offline/Erro). `[DOCUMENTADO]`
- `<SOH>A`: Retorna string ASCII de 8 posições (`Y`/`N`) cobrindo falta de papel, ribbon, pausa e queima ativa. `[DOCUMENTADO]`

---

## 8. ZEBRA CPCL (Comtec Printer Control Language — Mobile)

### 8.1 Arquitetura e Comandos para Portáteis
- **Cabeçalho Obrigatório:** `! <offset> <dpi_x> <dpi_y> <height_dots> <qty>\n` `[DOCUMENTADO]`
- **Finalização:** `PRINT\n` (ou `FORM\nPRINT\n`). `[DOCUMENTADO]`
- **Texto e Barras:** `TEXT <font> <size> <x> <y> <data>\n` e `BARCODE <type> <w> <ratio> <h> <x> <y> <data>\n`. `[DOCUMENTADO]`
- **QR Code:** `B QR <x> <y> M 2 U <module_w>\nMM,<data>\nENDQR\n`. `[DOCUMENTADO]`
- **Telemetria de Bateria e Status (<ESC>fh):** Retorna 1 byte com:
  - Bit 0: Ocupada. Bit 1: **Out of Paper**. Bit 2: **Latch Open**. Bit 3: **Battery Low** (Bateria fraca crítica). `[DOCUMENTADO]`

---

## 9. ELGIN: L42, L42 PRO, L42 PRO FULL / ONE

### 9.1 Hardware e Histórico de Modelos
- **Elgin L42 (Legada):** Plataforma OEM baseada em chipset Argox (PPLA e PPLB). `[DOCUMENTADO]`
- **Elgin L42 Pro / Full:** Placa ARM moderna com emulação de fábrica de **PPLB/EPL2, ZPL II e PPLA**, com reconhecimento automático de protocolo. O modelo Full adiciona interface Ethernet e Serial nativas. `[DOCUMENTADO]`
- **"L42 Pro One":** Designação comercial de lote da L42 Pro com novo firmware incluindo parser **TSPL/TSPL2**. `[DOCUMENTADO]` `[INFERIDO]`

### 9.2 Matriz de Fidelidade das Emulações na L42 Pro
| Emulação | Nível de Fidelidade | Cuidados Críticos no Witiquetas | Classificação |
| :--- | :--- | :--- | :--- |
| **PPLB / EPL2** | **Excelente (Padrão Recomendado)** | Emulação mais estável no mercado brasileiro (compatível com ACBr). Exige quebra de linha individual em `P1\n`. | `[DOCUMENTADO]` `[INFERIDO]` |
| **ZPL II** | **Bom com Limitações** | Suporta comandos clássicos (`^XA`, `^XZ`, `^FO`, `^FD`, `^FS`, `^A0`, `^BE`, `^BC`, `^BQ`, `^GB`). Falha em UTF-8 multi-byte (`^CI28`) e compressão de imagens complexas. | `[DOCUMENTADO]` `[PRECISA HOMOLOGAÇÃO FÍSICA]` |
| **TSPL / TSPL2** | **Moderado** | Presente em firmwares recentes da L42 Pro One/Full. Rápida para QR Code. | `[INFERIDO]` `[PRECISA HOMOLOGAÇÃO FÍSICA]` |
| **PPLA** | **Legado** | Mantida por retrocompatibilidade. Exige inversão vertical do eixo Y. | `[DOCUMENTADO]` |

### 9.3 Peculiaridades Críticas e Comportamentos Anômalos da L42 Pro
1. **Autodetecção de Linguagem (Auto-Switching):** A L42 Pro inspeciona os primeiros bytes do buffer (`^XA` $\rightarrow$ ZPL; `N\n` $\rightarrow$ PPLB; `<STX>L` $\rightarrow$ PPLA). Enviar comandos de status isolados antes da etiqueta pode falhar a autodetecção. Recomenda-se fixar a emulação desejada no `Elgin Utility.exe`. `[DOCUMENTADO]` `[PRECISA HOMOLOGAÇÃO FÍSICA]`
2. **Sensibilidade Estrita a `\n`:** Na emulação PPLB, se `P1` não tiver seu `\n` individual, a impressora congela e acende LED vermelho. `[DOCUMENTADO]`
3. **Calibração de Gap:** Comandos de tamanho (`Q` no PPLB ou `^LL` no ZPL) discordantes do sensor físico ejetam uma etiqueta em branco extra. A calibração física pelo botão FEED antes de rodar lotes é mandatória. `[DOCUMENTADO]` `[INFERIDO]`

---

## 10. CANAIS DE TRANSPORTE FÍSICO

### 10.1 RAW TCP (Rede Ethernet / Wi-Fi)
- **Porta 9100 (Direct RAW / AppSocket):** Stream TCP direto sem cabeçalhos de encapsulamento. Disparo ocorre ao fechar o socket ou enviar o terminador de formato. Suporta leitura de status bidirecional se a impressora for consultada no mesmo socket aberto. `[DOCUMENTADO]` `[PRECISA HOMOLOGAÇÃO FÍSICA]`
- **Porta 515 (LPR / LPD):** Protocolo baseado em fila RFC 1179. **Desaconselhado** para o Witiquetas: adiciona latência e impede telemetria bidirecional direta. `[DOCUMENTADO]`

### 10.2 USB (Universal Serial Bus)
- **USB PRINTER Class (Bulk OUT / Bulk IN):**
  - *Via Windows Spooler com Datatype "RAW" (`winspool.drv`):* Melhor compatibilidade comercial com drivers existentes, mas o spooler bloqueia o endpoint Bulk IN para leitura de status direto. `[DOCUMENTADO]` `[INFERIDO]`
  - *Via WinUSB Direto:* Acesso total a Bulk OUT e Bulk IN para telemetria em tempo real, mas exige driver WinUSB dedicado. `[DOCUMENTADO]` `[PRECISA HOMOLOGAÇÃO FÍSICA]`
- **Virtual COM (CDC-ACM):** Emulação serial sobre USB para comunicação bidirecional simples sem conflito com o spooler. `[DOCUMENTADO]`

### 10.3 Serial RS-232
- **Pinagem e Parâmetros:** DB-9 (Pino 2 RX, Pino 3 TX, Pino 5 GND, Pinos 7/8 RTS/CTS), 9600 a 115200 bps, 8-N-1. `[DOCUMENTADO]`
- **Controle de Fluxo (Flow Control) — RISCO CRÍTICO:**
  - **Hardware Flow Control (RTS/CTS): OBRIGATÓRIO.** Buffers seriais térmicos são pequenos (2KB a 8KB). Sem RTS/CTS, lotes e imagens estouram o buffer. `[DOCUMENTADO]`
  - **Software Flow Control (XON/XOFF — 0x11 / 0x13): PROIBIDO EM PAYLOAD BINÁRIO.** Se um byte de imagem ou código de barras coincidir com `0x11` ou `0x13`, a impressora interpreta como comando de parada, travando a comunicação. `[DOCUMENTADO]`

---

## 11. TABELA RESUMO DE TELEMETRIA BIDIRECIONAL
| Fabricante / Linguagem | Comando de Consulta | Formato da Resposta | Sensores e Indicadores Monitorados | Classificação |
| :--- | :--- | :--- | :--- | :--- |
| **Zebra ZPL II** | `~HS` | 3 linhas ASCII delimitadas por `<STX>` e `<ETX>` | Papel esgotado, cabeça aberta, ribbon esgotado, temperatura crítica, impressora pausada, buffer cheio, etiqueta no peel-off. | `[DOCUMENTADO]` |
| **Zebra EPL2 / Argox PPLB** | `^ee` | 4 bytes: `XX\r\n` | `07` (Fim papel/ribbon), `11` (Cabeça aberta), `01` (Sintaxe), `04` (Buffer cheio). | `[DOCUMENTADO]` |
| **Zebra CPCL (Mobile)** | `<ESC>fh` | 1 byte binário | Ocupada, Fim de papel, Trava aberta, Bateria baixa crítica. | `[DOCUMENTADO]` |
| **TSC TSPL/TSPL2** | `<ESC>!?` | 1 byte binário | Cabeça aberta, papel atolado, falta de papel, falta de ribbon, pausa, imprimindo. | `[DOCUMENTADO]` |
| **Datamax DPL / Argox PPLA**| `<SOH>F` / `<SOH>A` | 1 byte binário / 8 chars ASCII | Falta de papel, falta de ribbon, impressora em pausa, impressão ativa, etiqueta no sensor. | `[DOCUMENTADO]` |
| **Elgin L42 Pro** | `~HS`, `^ee` ou `<ESC>!?` | Conforme emulação ativa | Depende do parser selecionado. Emulação ZPL pode ter resposta parcial de `~HS`. | `[PRECISA HOMOLOGAÇÃO FÍSICA]` |
