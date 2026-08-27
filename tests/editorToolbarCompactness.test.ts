import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Pacote 4.2 - Toolbar Compactness Validation', () => {
  const editorLayoutPath = path.resolve(process.cwd(), 'apps/frontend/src/editor/EditorLayout.tsx');
  const propertyInspectorPath = path.resolve(process.cwd(), 'apps/frontend/src/editor/PropertyInspector.tsx');
  const editorLayoutContent = fs.readFileSync(editorLayoutPath, 'utf8');
  const propertyInspectorContent = fs.readFileSync(propertyInspectorPath, 'utf8');

  it('1. Confirma que o botão "Guias" NÃO existe mais na toolbar principal e foi renomeado para "Opções"', () => {
    // Não deve haver <span>Guias</span> na toolbar principal
    assert.strictEqual(editorLayoutContent.includes('<span>Guias</span>'), false, 'Menu Guias não deve existir com o nome antigo na toolbar');
    // Deve existir <span>Opções</span>
    assert.strictEqual(editorLayoutContent.includes('<span>Opções</span>'), true, 'Menu suspenso deve ser renomeado para Opções');
    assert.strictEqual(editorLayoutContent.includes('VISUALIZAÇÃO & OPÇÕES'), true, 'Cabeçalho do menu suspenso deve ser VISUALIZAÇÃO & OPÇÕES');
  });

  it('2. Confirma que o item "Dados de Integração" foi movido para dentro do menu suspenso "Opções"', () => {
    // Não deve haver botão isolado de Dados de Integração fora do menu suspenso
    const standaloneBtnRegex = /<button[^>]*>[^<]*Dados de Integração[^<]*<\/button>/g;
    assert.strictEqual(standaloneBtnRegex.test(editorLayoutContent), false, 'Botão standalone de Dados de Integração não deve existir na toolbar');

    // Deve estar como checkbox dentro do dropdown de Opções
    assert.strictEqual(editorLayoutContent.includes('<span>Dados de Integração</span>'), true, 'Item Dados de Integração deve estar no menu de Opções');
  });

  it('3. Confirma que o botão de Tema foi REMOVIDO da toolbar do Editor', () => {
    assert.strictEqual(editorLayoutContent.includes('btn-theme-toggle'), false, 'Botão de alternar tema não deve existir na toolbar do editor');
  });

  it('4. Confirma que o seletor "Visualizar como: Normal / Promoção" foi MOVIDO para o Inspector do PriceElement', () => {
    // Não deve estar na toolbar (EditorLayout)
    assert.strictEqual(editorLayoutContent.includes('Visualizar como: Normal'), false, 'Seletor Visualizar como não deve estar na toolbar');

    // Deve estar no Inspector (PropertyInspector) sob a seção "VISUALIZAÇÃO DO PREÇO"
    assert.strictEqual(propertyInspectorContent.includes('Visualização do Preço'), true, 'Seção Visualização do Preço deve existir no PropertyInspector');
    assert.strictEqual(propertyInspectorContent.includes("setPreviewScenario('normal')"), true, 'Inspector deve conter botão para cenário Normal');
    assert.strictEqual(propertyInspectorContent.includes("setPreviewScenario('promo')"), true, 'Inspector deve conter botão para cenário Promoção');
  });

  it('5. Confirma que o botão "Imprimir" permanece como ação primária final na toolbar', () => {
    assert.strictEqual(editorLayoutContent.includes('<span>Imprimir</span>'), true, 'Botão Imprimir deve estar presente na toolbar');
    assert.strictEqual(editorLayoutContent.includes('btn-primary'), true, 'Botão Imprimir deve usar classe de destaque btn-primary');
  });
});
