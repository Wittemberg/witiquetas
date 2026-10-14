# Witiquetas — Estado Atual

Atualizado em:
2026-10-14

## Fase atual

Fase 5.7.1 — Persistent Print Queue & Lease Safety (Fase 5 — Administração e Governança da Aplicação).

## Status

Implementado, validado tecnicamente, aguardando homologação manual controlada.
Baseline técnica validada: commit `904caa1b8036393d558dc4d15645de8b6f60f2fa` na branch `validation/package-5.7.1-postgres-gate`.
Status DCC: `IMPLEMENTED_AWAITING_MANUAL_HOMOLOGATION` (deployed: false).

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
`904caa1b8036393d558dc4d15645de8b6f60f2fa` (branch `validation/package-5.7.1-postgres-gate`)

CI / Pipelines:
GitHub Actions Run `#198` (Run ID `38645989365`) — **100% SUCCESS**

Testes:
- PostgreSQL 14 Real Gate: 11/11 subtestes PASS (`tests/package571PostgresRealIntegration.test.ts`)
- Suíte de Regressão: 260/260 testes automatizados PASS
- Builds de Produção: `@witiquetas/contracts`, `@witiquetas/backend`, `@witiquetas/frontend` e Agent Windows PE x64 (Rust) 100% GREEN

Resultado:
Validação técnica completa em ambiente PostgreSQL 14 isolado. SQLSTATE 42703 corrigido.

## Trabalho em andamento

Preparação concluída da documentação operacional e checklist de homologação: `docs/operations/PACKAGE-5.7.1-DEPLOY-SAFETY.md`.

## Próximo passo autorizado

Homologação não-física com Agent virtual conforme plano (12 cenários A a L de `docs/operations/PACKAGE-5.7.1-DEPLOY-SAFETY.md`).
Proibido: deploy em produção, merge na main, envio de bytes para impressoras físicas.

## Referências

- `docs/development-control/project.json`
- `docs/development-control/roadmap.json`
- `AGENTS.md`
- `.harness/REVISION.md`
