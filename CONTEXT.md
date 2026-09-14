# CONTEXT.md — Contexto compacto do Witiquetas

## Produto
Witiquetas é uma plataforma multiempresa para criação, importação, compilação, administração e impressão de etiquetas térmicas.

## Arquitetura
- Monorepo `apps/*` e `packages/*`.
- Frontend web + backend + Agent local.
- PostgreSQL e armazenamento de objetos.
- Editor visual multi-linguagem.
- Administração multiempresa/RBAC.
- DCC para governança/desenvolvimento.
- Impressão física via Agent local.
- Documento canônico: `ARQUITETURA.md` e `docs/architecture/UNIVERSAL-DATA-ARCHITECTURE.md`.

## Conceitos de domínio
### Elementos visuais
Text, Price, Date, Barcode, QRCode, Line, Rectangle, Image.

### Dados
Campos canônicos independem do ERP.
- Documento canônico: `docs/architecture/INTEGRATION-FIELD-CATALOG.md`.

### Fontes
- MANUAL
- INTEGRATION
- SYSTEM

### Preço
Existe um único elemento visual `Price`. Promoção, fidelidade, atacado e similares pertencem ao domínio de dados/regras, não a novos elementos visuais.

## Configuração efetiva
Platform → Company → Niche → Integration → Role → User → Model.

Frontend consome contexto efetivo; backend permanece autoridade para validação e persistência.
- Documento canônico: `docs/architecture/GOVERNANCE-ADMIN-ARCHITECTURE.md`.

## Nichos
Preservar os 11 nichos canônicos existentes. Não criar um 12º nicho sem decisão explícita.

## Estado operacional
- Editor possui baseline visual homologado e deve ser tratado como sensível a regressão.
- Administração/RBAC/configuração efetiva estão em evolução controlada.
- Central de Impressão e Agent possuem regras específicas de homologação (`DOCUMENTACAO-AGENTE-LOCAL.md`).
- Integrações ERP reais, Pricing Resolver, MCP e Maintenance Center são capacidades futuras, não devem ser simuladas como prontas.
- Controle de fase e capacidades: `docs/development-control/project.json` e `docs/development-control/roadmap.json`.

## Regra de contexto
Não carregue todo o histórico para cada tarefa. Use este arquivo + skill específica em `skills/` + arquivos diretamente afetados.
