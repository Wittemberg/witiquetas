# Arquitetura de Contexto e Skills para Agentes

## Motivação
Agentes de desenvolvimento degradam quando recebem contexto demais ou regras duplicadas. O Witiquetas adota contexto progressivo:

`AGENTS.md` → `CONTEXT.md` → `DESIGN.md` → skill específica → arquivos afetados.

## Objetivos
- reduzir contexto irrelevante;
- diminuir alterações fora de escopo;
- preservar módulos homologados;
- tornar decisões repetíveis;
- melhorar handoff entre Antigravity, ChatGPT e outros agentes.

## Modelo
Cada skill descreve invariantes e testes de um domínio. Skills não substituem código, testes, roadmap ou documentação técnica; funcionam como instruções operacionais.

## Regra de evolução
Criar nova skill apenas quando houver um domínio recorrente com invariantes próprios. Evitar uma skill por feature pequena.

## Futuras skills candidatas
- integrations
- database/migrations
- security/auth
- dcc/maintenance
- compiler/importer round-trip

## Referências conceituais
A estrutura foi inspirada em padrões observados em projetos open-source de agentes, design systems, workflows e control planes. Nenhuma dependência externa é introduzida por esta documentação.
