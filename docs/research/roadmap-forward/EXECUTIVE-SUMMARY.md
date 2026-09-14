# WITIQUETAS — EXECUTIVE SUMMARY: ROADMAP FORWARD PREPARATION
**Relatório Executivo de Inteligência Estratégica e Pesquisa Técnica**  
**Trilha Paralela:** ROADMAP FORWARD PREPARATION  
**Data:** 14 de Setembro de 2026  
**Autores:** Agentes Especialistas em Paralelo (Roadmap Analyst, Printer KB Researcher, Compiler Gap Analyst, Test & Quality Auditor, Local Agent Architect, Integration Landscape Researcher)  
**Status:** PESQUISA CONCLUÍDA / ARTEFATO PURAMENTE DOCUMENTAL  
**Conformidade:** Alinhado a `AGENTS.md`, `CONTEXT.md`, `ROADMAP.md` e regras globais do projeto.

---

## SUMÁRIO GERAL

Em suporte à evolução do **Witiquetas** e sem interferir na sessão paralela que executa o **Pacote 5.6 (Integration Foundation)**, foi conduzida uma força-tarefa de pesquisa aprofundada abrangendo governança, linguagens térmicas de baixo nível, compiladores, suíte de qualidade, arquitetura do Agente Local e integrações corporativas.

Esta pesquisa produziu 6 documentos técnicos minuciosos consolidados na pasta `docs/research/roadmap-forward/`:
1. `ROADMAP-FORWARD-ANALYSIS.md`: Auditoria do estado do repositório, dependências e caminho crítico.
2. `PRINTER-LANGUAGE-MATRIX.md`: Compêndio técnico de Zebra (ZPL/EPL/CPCL), Argox (PPLA/PPLB), Elgin, TSC (TSPL) e Datamax (DPL).
3. `COMPILER-GAP-ANALYSIS.md`: Matriz Elemento Visual $\times$ Linguagem Térmica e auditoria linha a linha.
4. `TEST-QUALITY-ROADMAP.md`: Diagnóstico dos 67 arquivos de teste/shims e Matriz de 7 Gates de Qualidade.
5. `LOCAL-AGENT-FUTURE.md`: Arquitetura do daemon Rust, transporte físico e invariante `DELIVERED_TO_TRANSPORT` $\neq$ `PRINTED`.
6. `INTEGRATION-LANDSCAPE.md`: Panorama de 9 ERPs brasileiros, adaptadores canônicos e cofre de credenciais.

Abaixo, sintetizam-se os 7 pilares executivos da pesquisa:

---

## 1. DESCOBERTAS CRÍTICAS DA AUDITORIA

1. **Defeito Visual Crítico de Moldura no Compilador PPLB de Runtime:**
   O arquivo `packages/printer-pplb/src/index.ts` emite `LO${x},${y},${w},${h}` para retângulos. Na especificação oficial PPLB/EPL2, o comando `LO` com largura e altura preenche um **retângulo preto 100% sólido**. O comando oficial para molduras vazadas é `X${x},${y},${thick},${endX},${endY}` (já adotado com sucesso no `LegacyCompiler` do frontend).
2. **Dualidade de Compiladores (Runtime vs Legacy Importer):**
   O `LegacyCompiler` em `apps/frontend/src/editor/importers/legacyCompiler.ts` possui implementações avançadas para códigos de barras (EAN-13, EAN-8, Code 128) e rotações, enquanto os pacotes monorepo de runtime (`packages/printer-pplb`, `packages/printer-ppla`, `packages/printer-core`) possuem parâmetros fixos (*hardcoded*) e forçam `E30` (EAN-13) para qualquer código de barras.
3. **Inversão Cartesiana Obrigatória em Argox PPLA:**
   Diferente de ZPL, PPLB, EPL2 e TSPL (cuja origem é no canto superior esquerdo — Top-Left), a linguagem **PPLA possui origem no canto inferior esquerdo (Bottom-Left)**. Compilar para PPLA exige a inversão matemática $Y_{\text{ppla}} = \text{AlturaDots} - Y_{\text{desenho}} - \text{AlturaElemento}$.
4. **Falsos Positivos em Testes por Causa do `zod-shim.js`:**
   O arquivo `tests/zod-shim.js` intercepta importações de `zod` e retorna sempre `{ success: true, data }` no `safeParse()`. Os testes de schema atuais não estão validando restrições de contrato, permitindo que payloads inválidos passem despercebidos.
5. **Ausência de `npm test` no Pipeline CI do GitHub Actions:**
   O workflow `.github/workflows/docker.yml` executa `cargo test` para Rust, mas **não executa a suíte de testes do Node.js (`npm test`)** antes do build Docker e deploy, permitindo que regressões no backend ou frontend cheguem a produção se não houver erro de compilação TypeScript.
6. **Autodetecção e Risco de Buffer na Elgin L42 Pro:**
   A Elgin L42 Pro autodetecta ZPL, PPLB e PPLA inspecionando os primeiros bytes do buffer. Enviar comandos de status isolados (como `~HS`) antes da etiqueta pode quebrar a autodetecção. Além disso, a L42 Pro exige quebra de linha `\n` estrita após o comando `P1` para não travar o buffer.
7. **Inviabilidade de Comunicação WinUSB Direta em Ambientes com Driver:**
   Tentar comunicação USB direta via WinUSB/libusb no Windows colide com o driver de impressão do fabricante (`usbprint.sys`). O caminho comercial sustentável é utilizar o Spooler do Windows com Datatype `"RAW"` (`winspool.drv`).

---

## 2. OPORTUNIDADES ESTRATÉGICAS

1. **Unificação dos Compiladores Monorepo:**
   Portar as rotinas maduras de cálculo de módulos e fontes do `LegacyCompiler` para `@witiquetas/printer-pplb` e `@witiquetas/printer-core`, unificando a fidelidade entre o que é importado e o que é emitido em runtime.
2. **Criação do Pacote `printer-zpl` Nativo (Fase 6):**
   A arquitetura abstrata do `LabelDocument v1` permite criar o compilador ZPL II com alta velocidade, aproveitando que a maior parte dos clientes industriais e logísticos utiliza impressoras Zebra.
3. **Descoberta Autônoma de Impressoras no Agente Local:**
   Implementar varredura passiva de mDNS/Bonjour (`_pdl-datastream._tcp`) e SNMP v1/v2c no Agente Local, permitindo que impressoras de rede sejam detectadas automaticamente sem digitação manual de IP pelo cliente.
4. **Ativação da Máquina de Confirmação em Duas Fases:**
   Evoluir a telemetria pós-envio com consultas imediatas de hardware (`~HS` no ZPL, `<ESC>!?` no TSPL) para que impressoras que suportam canal bidirecional possam transicionar de `DELIVERED_TO_TRANSPORT` para `PRINTED` com base no esvaziamento real do buffer físico.
5. **Adoção do Spooler RAW Win32:**
   Permitir impressão transparente em qualquer impressora térmica USB conectada ao Windows através da API `StartDocPrinterW` com Datatype RAW, eliminando necessidade de suporte a drivers USB proprietários.

---

## 3. DEPENDÊNCIAS DO ROADMAP

```
[Pacotes 5.4 e 5.5.1.x] (Niches, Elements e Effective Config no Editor)
          │
          ▼
[Pacote 5.6] (Admin de Impressoras e Agentes Locais — Em andamento)
          │
          ▼
[Pacote 5.7A] (Integration Field Mapping & Catálogo Canônico)
          │
          ▼
[DESCONGELAMENTO DA CENTRAL DE IMPRESSÃO — FASE 4 UNFREEZE]
          │
          ▼
[MVP COMERCIAL HOMOLOGADO EM BANCADA]
          │
          ├───► [Pacote 5.8: Auditoria Imutável, Maintenance Center e Licenças]
          │
          └───► [Fase 6: Compilador Zebra ZPL II e Catálogo de Hardware]
```

---

## 4. TRABALHOS PARALELIZÁVEIS (ZERO CONFLITO)

Foram identificadas 4 frentes de trabalho que podem avançar simultaneamente no repositório sem qualquer risco de conflito de código:
- **Trilha A (Web/Admin — Caminho Crítico):** Conclusão do Pacote 5.6 (em andamento) e implementação subsequente do Pacote 5.7A (Field Mapping UI).
- **Trilha B (Compiladores / Core — Fase 6):** Criação do pacote `packages/printer-zpl` com AST de ZPL II e testes de Golden Files. Isolado em novo pacote no monorepo.
- **Trilha C (Agente Local / Rust):** Implementação do transporte WinSpool RAW e controle de fluxo RTS/CTS via `tokio-serial` em `apps/agent-core`. Isolado em Rust/Cargo.
- **Trilha D (Qualidade & CI/CD):** Inclusão de `npm test` no GitHub Actions, substituição de `zod-shim.js` por validação real e testes de isolamento multi-tenant em `tests/`.

---

## 5. RISCOS P0 FUTUROS

1. **Risco P0 — Duplicação Física de Etiquetas por Retentativa Cega:**
   Se uma conexão de rede cair após transmitir bytes ($>0$), o Agente Local deve registrar imperativamente `UNKNOWN_RESULT`. **É expressamente proibido retry automático** pelo sistema, pois isso provocaria impressão repetida de etiquetas e quebra de sequencial de rastreabilidade na fábrica.
2. **Risco P0 — Violação da Invariante `DELIVERED_TO_TRANSPORT` $\neq$ `PRINTED`:**
   O software nunca deve marcar um PrintJob como `PRINTED` apenas porque os bytes saíram do socket TCP. O status final permanece `DELIVERED_TO_TRANSPORT` a menos que haja confirmação explícita de sensores de hardware via canal bidirecional homologado.
3. **Risco P0 — Contaminação do Catálogo Canônico por Campos de ERP:**
   Campos externos do ERP (ex: `B1_PRCVEN`, `DTA_VLD`) **nunca** devem ser inseridos diretamente no `LabelDocument`. Toda tradução deve ser declarativa através do Adapter de Integração.
4. **Risco P0 — Falha no CI Permitindo Deploy Quebrado:**
   A ausência de `npm test` no pipeline `.github/workflows/docker.yml` é uma brecha que permite deploys em produção com regressões ativas de regras de negócio.
5. **Risco P0 — Bloqueio de Comunicação Serial por XON/XOFF:**
   O uso de controle de fluxo por software (XON/XOFF) em portas seriais ao transmitir gráficos ou códigos de barra binários congela a comunicação se os bytes `0x11` ou `0x13` estiverem presentes no payload. Controle por hardware (RTS/CTS) é obrigatório.

---

## 6. RECOMENDAÇÕES PARA OS PACOTES 5.7, 5.8 E FASE 6

### Para o Pacote 5.7:
- **Sub-Pacote 5.7A (Mapeamento de Integrações):** Criar tabelas relacionais `canonical_fields`, `company_integrations` e `integration_field_mappings`. Implementar a interface visual de de-para na rota `/admin/integrations/:id/mapping` e exportar a especificação OpenAPI dinâmica.
- **Sub-Pacote 5.7B (Domínio de Políticas de Preço):** Modelar a entidade `PriceRule` e implementar o resolvedor determinístico de preços, mantendo a regra de ouro de que **existe apenas um elemento visual de preço (`Price`)** no Editor.

### Para o Pacote 5.8:
- **Auditoria Imutável:** Tabela append-only `audit_logs` no PostgreSQL (sem permissão de `UPDATE`/`DELETE`) gravando snapshots before/after.
- **Central de Manutenção (Maintenance Center):** Painel acessível via DCC com TOTP RFC 6238 e catálogo de operações tipadas (`DIAGNOSTIC`, `SAFE_MAINTENANCE`, `CRITICAL_MAINTENANCE` com dry-run obrigatório). Proibido terminal ou SQL arbitrário.
- **Licenciamento:** Controle de limites contratuais de impressoras e agentes com bloqueio fail-soft.

### Para a Fase 6:
- **Compilador Zebra ZPL II:** Implementar o pacote monorepo `packages/printer-zpl` com suporte completo a comandos `^XA`, `^XZ`, `^FO`, `^FD`, `^FS`, `^A0`, `^BE`, `^BC`, `^BQ`, `^GB`.
- **Correção Imediata de PPLB:** Corrigir a geração de retângulo no `PPLBCompiler`, trocando `LO` por `X`.
- **Rotação Canônica no Runtime:** Repassar `elem.rotation` para todos os compiladores de runtime.

---

## 7. ITENS QUE DEPENDEM DA CONCLUSÃO DO PACOTE 5.6

Os seguintes módulos e ações estão **estritamente bloqueados** aguardando a finalização e homologação do Pacote 5.6 (Admin de Impressoras e Agentes):
1. **Descongelamento da Central de Impressão (Fase 4 Unfreeze):** A Central não pode listar impressoras nem despachar jobs em ambiente multi-tenant real enquanto as rotas de impressoras e agentes continuarem em memória mocada.
2. **Homologação Física Ponta a Ponta:** O teste de fogo do pipeline completo (ERP $\rightarrow$ LabelDocument $\rightarrow$ Compilador $\rightarrow$ PrintJob $\rightarrow$ Agent Rust $\rightarrow$ Impressora) exige a persistência relacional do 5.6.
3. **Persistência de Telemetria no Heartbeat:** O armazenamento das métricas de telemetria estendida dos agentes depende das tabelas relacionais introduzidas no 5.6.
4. **Fechamento do MVP Comercial:** A declaração de conclusão do MVP da aplicação depende da operacionalidade conjunta do Editor, Administração de Dispositivos (5.6) e Central de Impressão.

---
*Relatório Executivo consolidado e formalizado na base de conhecimento canônica do repositório Witiquetas.*
