# AGENTS.md — Contrato Global de Desenvolvimento do Witiquetas

Este arquivo é o contrato operacional para agentes de IA, IDEs agentes e automações que trabalhem neste repositório.

## Princípios
- Preserve comportamento homologado. Mudanças devem ser cirúrgicas.
- Não redesenhe módulos estáveis para resolver um bug local.
- Segurança, integridade de dados, isolamento multiempresa, impressão física e governança têm prioridade.
- Nunca invente permissões, campos canônicos, nichos, status de impressão ou capacidades de hardware.
- Backend é a autoridade final para autorização e persistência; UI deve refletir permissões sem substituir enforcement server-side.
- Corrija causa raiz, não sintoma.

## Antes de alterar código
1. Identifique o módulo afetado.
2. Leia `CONTEXT.md`, `DESIGN.md` e somente a skill necessária em `skills/`.
3. Consulte a fase atual e o escopo canônico em `docs/development-control/project.json` e `docs/development-control/roadmap.json`.
4. Localize testes e invariantes relacionados.
5. Confirme se o componente está HOMOLOGATED/FROZEN.
6. Consulte a documentação canônica correspondente em `docs/` e na raiz (`ARQUITETURA.md`, `docs/architecture/UNIVERSAL-DATA-ARCHITECTURE.md`).
7. Defina o menor diff possível.

## Regressão e escopo
- Não alterar Editor, Central de Impressão, Agent, Administração, DCC ou autenticação fora do escopo.
- Não mascarar layout com `overflow:hidden`.
- Não usar `any`, `@ts-ignore` ou fallback permissivo para contornar domínio.
- LOADING/ERROR/UNKNOWN de configuração não podem significar `EVERYTHING_DISABLED` nem mutar modelo.
- Elemento legado já existente e depois desabilitado deve continuar preservável/selecionável/exportável/deletável; criação e duplicação obedecem configuração efetiva.

## Impressão
- `DELIVERED_TO_TRANSPORT` significa entrega ao transporte, nunca `PRINTED` sem feedback real do hardware.
- Agent é transporte local; não deve reinterpretar linguagem da impressora.
- Nunca expor RAW TCP/9100 publicamente.
- Documento canônico: `DOCUMENTACAO-AGENTE-LOCAL.md` e `packages/printer-core`.

## Administração e autorização
- Hierarquia efetiva: Platform → Company → Niche → Integration → Role → User → Model.
- Preservar o catálogo canônico vigente; não inventar permissões.
- `templates.view`, `templates.create` e `templates.edit` são independentes.
- PLATFORM_DEVELOPER não é ADMIN de tenant e permanece restrito à empresa configurada.
- Documento canônico: `docs/architecture/GOVERNANCE-ADMIN-ARCHITECTURE.md` e `docs/decisions/ADR-002-customer-company.md`.

## Dados e integrações
- Separar elemento visual, campo canônico e fonte de valor.
- Fontes: MANUAL / INTEGRATION / SYSTEM.
- Dados externos devem ser mapeados para campos canônicos por contrato versionado.
- ERP é autoridade empresarial; APIs públicas são apenas enriquecimento.
- Documento canônico: `docs/architecture/UNIVERSAL-DATA-ARCHITECTURE.md` e `docs/governance/INTEGRATION-MANIFEST-SPEC.md`.

## Release
Antes de declarar pacote pronto:
- testes relevantes verdes;
- build frontend/backend/workspaces sem erro;
- regressão crítica coberta por teste executável;
- commit/push/CI/deploy convergentes;
- `/version.json`, `/api/version` e `/api/health` coerentes;
- validação manual quando exigida;
- STOP RULE respeitada.
- Documento canônico: `docs/operations/RELEASE-SAFETY.md` e `docs/development-control/checkpoints.json`.

## Skills
Carregue apenas as skills relevantes:
- `skills/editor/SKILL.md`
- `skills/admin/SKILL.md`
- `skills/printing/SKILL.md`
- `skills/release/SKILL.md`
