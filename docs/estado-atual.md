# Witiquetas — Estado Atual

Atualizado em:
2026-09-18

## Fase atual

Fase 5 — Administração e Governança da Aplicação (conforme `docs/development-control/project.json`).

## Status

Implantação preliminar e segura do fluxo harness-skills + OpenSpec para governança e execução de agentes. Nenhum código funcional do Witiquetas foi alterado.

## Mudança OpenSpec ativa

Nenhuma.

## Áreas congeladas

- Fase 0 — Fundação e Conectividade (`FROZEN`)
- Fase 1 — Editor Visual e Schema Abstrato (`FROZEN`)
- Fase 2 — Compiladores PPLA/PPLB (`HOMOLOGATED`)
- Fase 3 — Agente Local Daemon Rust (`HOMOLOGATED`)
- Fase 3.5 — Hardening de Produto e UX Shell (`HOMOLOGATED`)

Referência canônica: `docs/development-control/project.json` e `docs/development-control/roadmap.json`.

## Última evidência válida

Commit:
`6436984` (main)

Testes:
`node --import ./tests/ts-loader.js --test tests/schema.test.ts`

Resultado:
5 testes aprovados, 0 falhas. (Discrepância preexistente em tests/devControlInvariants.test.ts — soma de pesos de roadmap 356 vs 354 — mantida sem alteração conforme regras de escopo).

## Trabalho em andamento

Configuração da cópia portátil `.harness/`, revisão do roteador `AGENTS.md` e preparação do OpenSpec.

## Próximo passo autorizado

Concluir verificação do OpenSpec CLI e validação final da baseline sem alterações funcionais.

## Referências

- `docs/development-control/project.json`
- `docs/development-control/roadmap.json`
- `AGENTS.md`
- `.harness/REVISION.md`
