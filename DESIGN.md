# DESIGN.md — Contrato Visual do Witiquetas

## Objetivo
Manter consistência visual e impedir regressões acidentais enquanto novas capacidades são adicionadas.

## Regras
- Componentes homologados são baseline congelado.
- Mudança funcional não autoriza redesign.
- Evitar alterações globais de CSS para corrigir problema local.
- Browser zoom 100%: nenhum texto, badge, botão, input ou controle pode escapar do card/container.
- Validar 1920, 1600, 1366 e 1280 quando a alteração afetar layout desktop; validar tablet/mobile quando aplicável.
- Não usar `overflow:hidden` para ocultar defeitos estruturais.
- Estados hover/focus/active devem ser visíveis e coerentes.
- Controles clicáveis precisam de hitbox alinhado ao elemento visual.
- Read-only não deve oferecer ações de persistência impossíveis.

## Editor
- Preservar layout, régua, margem segura, sidebars e gestos já homologados.
- Disponibilidade dinâmica altera ferramentas disponíveis, não o design base.
- Elementos existentes desabilitados não devem desaparecer do modelo.
- Referência canônica: `docs/product/PRODUCT-UX-CONSOLIDATION.md`.

## Administração
- Hierarquia visual clara: lista → detalhe → configuração efetiva.
- Matriz de permissões deve manter fluxo vertical estável, sem sobreposição/masonry.
- DCC é developer-only e não pertence à configuração comercial do tenant.

## Linguagem
Priorizar termos compreensíveis para operador final. IDs técnicos e tipos internos não devem dominar a UI de negócio.
