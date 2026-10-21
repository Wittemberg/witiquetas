# ADR 006: Central de Atualizações da Plataforma (Updates Center)

## Status
Aceito (Fase 5 — Sprint 1: Arquitetura, Governança e Interface)

## Data
2026-10-19

## Contexto
O Witiquetas opera em modelo multi-tenant com deployment conteinerizado via Docker/Swarm, orquestrado com Traefik, PostgreSQL 14, MinIO e Agents locais Windows/Linux. Com a maturidade alcançada nas Fases 0 a 5 (compiladores, fila persistente 5.7.1, governança de impressoras e agents), surge a necessidade de uma **Central de Atualizações** administrativa unificada que permita:
1. Consultar a versão atual em execução de cada componente (Backend, Frontend, Agent Windows).
2. Visualizar notas de versão (Release Notes), changelogs, breaking changes e migrações exigidas.
3. Permitir a administradores corporativos e operadores autorizados conhecer o que há de novo na plataforma.
4. Estabelecer um ciclo de vida formal e governado de atualizações, prevenindo publicações descontroladas ou quebras em tempo de execução.

### Restrições Críticas (Sprint 1)
- **Zero Deploy Ativo**: Nesta fase de fundação, a Central de Atualizações NÃO executa comandos no host, NÃO aciona webhooks do Portainer, NÃO puxa imagens do GHCR e NÃO reinicia containers.
- **Fail-Closed e RBAC Estrito**: Todas as operações de consulta exigem a permissão `updates.view`; operações de edição de notas exigem `updates.manage`.
- **Compatibilidade Multi-Tenant**: Configurações de exibição e histórico são seguras e não vazam segredos de infraestrutura.

## Decisão
1. **Contratos Canônicos Compartilhados**: Criar tipos e DTOs em `@witiquetas/contracts` (`ReleaseManifestDTO`, `UpdateCenterOverviewDTO`, `ReleaseChannel`, `UpdateStatus`, etc.) para garantir integridade ponta a ponta entre Backend e Frontend.
2. **Separação por Sprints**:
   - **Sprint 1 (Atual)**: Arquitetura canônica, inventário do ecossistema, permissões RBAC (`updates.view` e `updates.manage`), DTOs, serviço backend de consulta/simulação, visualizador e editor administrativo de notas de versão, e suíte de testes.
   - **Sprint 2**: Verificação remota de manifestos e checagem de integridade criptográfica (SHA-256 de artefatos e imagens).
   - **Sprint 3**: Verificação de compatibilidade de pré-requisitos (migrações pendentes no PostgreSQL, versão mínima do Agent Windows).
   - **Sprint 4**: Fluxo assistido de atualização manual com healthcheck pós-deploy e auto-rollback guard.
3. **Mecanismo de Consulta Simulado e Declarativo**: O backend provê endpoints `/api/updates/overview`, `/api/updates/history`, `/api/updates/check` e `/api/updates/releases/:version` alimentados por manifestos declarativos versionados, coerentes com os checkpoints do DCC.
4. **Interface Administrativa Integrada**: Incorporar a aba **Atualizações** no módulo existente `AdminPage` do Frontend, preservando o layout, acessibilidade e temas do Shell da aplicação.

## Consequências
### Positivas
- Total previsibilidade e governança sobre as versões da plataforma.
- Usuários e administradores visualizam claramente novidades e correções aplicadas.
- Zero risco de interrupção ou deploy não autorizado durante a fase de desenvolvimento.
- Alinhamento total com as regras de governança e inventário do DCC.

### Negativas / Mitigações
- A aplicação efetiva de atualizações na infraestrutura continuará dependente do fluxo protegido do GitHub Actions (`deploy-production` via `workflow_dispatch`) até a implementação controlada de sprints futuras.

## Referências
- `docs/architecture/UPDATES-CENTER-ARCHITECTURE.md`
- `docs/operations/PACKAGE-5.7.1-DEPLOY-SAFETY.md`
- `docs/development-control/project.json`
