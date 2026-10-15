# Witiquetas — Estado Atual

Atualizado em:
2026-10-15

## Fase atual

Fase 5.7.1 — Persistent Print Queue & Lease Safety (Fase 5 — Administração e Governança da Aplicação).

## Status

Homologado com sucesso integral em ambiente isolado de CI, aguardando revisão final de release.
Baseline validada: commit `b86f64173b0505ad647e0eb3f45e1db8cf352e0a` na branch `validation/package-5.7.1-postgres-gate`.
Status DCC: `READY_FOR_RELEASE_REVIEW` (deployed: false, manualValidation: true, homologated: true).

## Mudança OpenSpec ativa

Nenhuma.

## Áreas congeladas

- Fase 0 — Fundação e Conectividade (`FROZEN`)
- Fase 1 — Editor Visual e Schema Abstrato (`FROZEN`)
- Fase 2 — Compiladores PPLA/PPLB (`HOMOLOGATED`)
- Fase 3 — Agente Local Daemon Rust (`HOMOLOGATED`)
- Fase 3.5 — Hardening de Produto e UX Shell (`HOMOLOGATED`)
- Fase 4 — Editor Visual e Central de Impressão (`FROZEN / PAUSED` durante Fase 5)

Referência canônica: `docs/development-control/project.json` e `docs/development-control/roadmap.json`.

## Última evidência válida

Commit:
`b86f64173b0505ad647e0eb3f45e1db8cf352e0a` (branch `validation/package-5.7.1-postgres-gate`)

CI / Pipelines:
- GitHub Actions Run `#38666388916` (K/L Homologation Gate, Job `116199198915` em runner `windows-latest` + PostgreSQL 14 real) — **100% SUCCESS** (15/15 subtestes PASS)
- GitHub Actions Run `#38666388948` (PostgreSQL 14 Real Gate) — **100% SUCCESS** (11/11 subtestes PASS)

Testes:
- Cenários K (K.1 a K.8) e L (L.1 a L.7) aprovados com evidências formais registradas
- PostgreSQL 14 Real Gate: 11/11 subtestes PASS (`tests/package571PostgresRealIntegration.test.ts`)
- Suíte de Regressão: 260/260 testes automatizados PASS
- Builds de Produção: `@witiquetas/contracts`, `@witiquetas/backend`, `@witiquetas/frontend` e Agent Windows PE x64 (Rust) 100% GREEN

Resultado:
Validação técnica e homologação não-física 100% concluídas. Bloqueio e contenção de porta TCP 9100 comprovados.

## Trabalho em andamento

Revisão final de release (Final Release Review) para abertura de Pull Request para a `main`.

## Próximo passo autorizado

Abertura de Pull Request para a `main` e agendamento de janela controlada de deploy após aprovação humana.
Proibido: merge não autorizado na main, deploy automático em produção, envio de bytes para impressoras físicas.

## Referências

- `docs/development-control/project.json`
- `docs/development-control/roadmap.json`
- `AGENTS.md`
- `.harness/REVISION.md`
