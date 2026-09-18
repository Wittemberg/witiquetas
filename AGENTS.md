# Witiquetas — Agent Instructions

Este arquivo é o roteador de contexto e contrato operacional para agentes de IA que trabalhem no repositório Witiquetas.

## Inicialização de uma tarefa

Sempre:
1. `git status`
2. Ler `docs/development-control/project.json`
3. Identificar fase atual
4. Identificar mudança OpenSpec ativa em `openspec/changes/`, se houver
5. Ler `docs/estado-atual.md`
6. Localizar código e testes relacionados
7. Carregar somente a documentação e skills necessárias

## Princípio operacional

ENTENDER → DELIMITAR → IMPLEMENTAR → TESTAR → VALIDAR → DOCUMENTAR → ENTREGAR

## Regra de escopo

- Prefira o MENOR DIFF CORRETO.
- Não alterar módulos não relacionados.
- Não refatorar áreas estáveis sem necessidade.
- Corrija a causa raiz, não o sintoma. Não use `any`, `@ts-ignore` ou fallback permissivo para mascarar erros.

## Fontes de verdade

Hierarquia de precedência:
1. Requisito explícito atual
2. ADR aplicável (`docs/decisions/`)
3. Documento canônico específico da área
4. Roadmap / Governança (`docs/development-control/`)
5. Contratos / Schemas (`packages/contracts/`, `packages/label-schema/`)
6. Testes executáveis / Golden tests (`tests/`)
7. Código existente
8. Documentação histórica

Se houver conflito real entre fontes canônicas, registre e não decida silenciosamente.

## Freeze e Módulos Homologados

Consultar `project.json` e `roadmap.json` antes de qualquer alteração:
- Módulos `FROZEN` ou `HOMOLOGATED` (Editor, Compiladores, Agente Local, Central de Impressão) estão congelados contra mudanças funcionais durante fases administrativas, salvo P0, segurança, perda de dados, crash ou regressão explícita.

## Arquitetura

Preservar o fluxo linear:
Dados → LabelDocument → Motor Witiquetas → Compiler → PrintJob → Agent → Impressora

Invariantes de domínio:
- `Printer Language` != `Template Language` != `Integration Field Catalog`.
- Elemento visual, campo canônico e fonte de valor (MANUAL / INTEGRATION / SYSTEM) são separados.
- `DELIVERED_TO_TRANSPORT` significa apenas entrega ao transporte, nunca `PRINTED` sem telemetria física real.
- Agent é transporte local e não deve reinterpretar linguagens de impressão nem expor TCP/9100 publicamente.

## Segurança e Autorização

- Frontend controla UX; Backend é a autoridade final para autorização e persistência.
- Multi-tenancy e RBAC são fail-closed: hierarquia `Platform → Company → Niche → Integration → Role → User → Model`.
- Nunca expor secrets, tokens ou variáveis sensíveis.

## OpenSpec

- **Correção pequena e clara:** implementação direta + testes correspondentes.
- **Feature, mudança de contrato, schema ou realinhamento relevante:** ciclo formal OpenSpec (`proposal` → `specs` → `design` → `tasks`).
- Apenas uma mudança OpenSpec ativa por vez.

## Documentação e Retomada

- Não crie arquivos `.md` avulsos para cada correção pontual; atualize o documento canônico existente.
- Mantenha `docs/estado-atual.md` curto e atualizado para handoff e retomada rápida entre sessões.

## Consulta Rápida de Contexto

- **Produto e UX:** `docs/product/`
- **Arquitetura Geral:** `ARQUITETURA.md`, `docs/architecture/`
- **Roadmap e Estado:** `docs/development-control/project.json`, `docs/development-control/roadmap.json`
- **Operações e Release:** `docs/operations/RELEASE-SAFETY.md`, `docs/development-control/checkpoints.json`
- **Agente Local:** `DOCUMENTACAO-AGENTE-LOCAL.md`, `packages/contracts/`
- **Impressão e Compiladores:** `packages/printer-core/`, `packages/printer-*/`
- **Segurança:** `SECURITY.md`, `docs/SECURITY-DEVELOPER-AUTH.md`
- **Skills Locais:** `skills/editor/`, `skills/admin/`, `skills/printing/`, `skills/release/`
- **Harness e Padrões Wittemberg:** `.harness/AGENTS.md`, `.harness/standards/wittemberg/`
- **Estado de Retomada:** `docs/estado-atual.md`
