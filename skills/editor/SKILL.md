# Skill — Editor

Use ao alterar Canvas, Toolbox, Property Inspector, FieldPicker, Wizard, modelos e fluxo de edição.

## Invariantes
- Editor visual homologado não deve sofrer redesign incidental.
- Configuração efetiva controla criação de novos elementos/campos.
- LOADING/ERROR/UNKNOWN não podem apagar, bloquear destrutivamente ou reescrever modelo.
- `EXISTING_DISABLED_ELEMENT`: preservar, selecionar, mover, redimensionar, editar propriedades permitidas, exportar/compilar/round-trip e deletar; não duplicar/copiar para criar novo.
- `EXISTING_DISABLED_BINDING`: preservar binding legado; impedir novos bindings proibidos.
- SYSTEM é automático; MANUAL deve ser editável apenas quando autorizado; INTEGRATION não deve simular ERP inexistente.
- `system.printDate` independe de ERP.
- Price permanece um único tipo visual.
- Documento canônico: `docs/product/PRODUCT-UX-CONSOLIDATION.md` e `packages/label-schema`.

## Autorização
- Novo modelo exige `templates.create`.
- Modelo existente usa `templates.view`/`templates.edit` conforme operação.
- Read-only não apresenta salvar como ação válida.
- Duplicar/Save As/importar como novo são criação e exigem `templates.create`.

## Testes mínimos
- runtime real do Editor;
- PropertyInspector/FieldPicker;
- source MANUAL/INTEGRATION/SYSTEM;
- configuração READY + fail-safe LOADING/ERROR;
- create/edit/read-only;
- regressão de compiladores/importadores quando modelo/schema for afetado.
