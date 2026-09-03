import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Carregar arquivos-fonte do frontend para validação de contrato e conformidade de UX
const appTsxPath = path.resolve('apps/frontend/src/App.tsx');
const appTsxContent = fs.readFileSync(appTsxPath, 'utf8');

const layoutTsxPath = path.resolve('apps/frontend/src/editor/EditorLayout.tsx');
const layoutTsxContent = fs.readFileSync(layoutTsxPath, 'utf8');

const inspectorTsxPath = path.resolve('apps/frontend/src/editor/PropertyInspector.tsx');
const inspectorTsxContent = fs.readFileSync(inspectorTsxPath, 'utf8');

const storeTsPath = path.resolve('apps/frontend/src/editor/useEditorStore.ts');
const storeTsContent = fs.readFileSync(storeTsPath, 'utf8');

const canvasTsxPath = path.resolve('apps/frontend/src/editor/CanvasArea.tsx');
const canvasTsxContent = fs.readFileSync(canvasTsxPath, 'utf8');

const globalHeaderPath = path.resolve('apps/frontend/src/shell/GlobalHeader.tsx');
const globalHeaderContent = fs.existsSync(globalHeaderPath) ? fs.readFileSync(globalHeaderPath, 'utf8') : '';

test('1. Dashboard: Controles redundantes (Abrir Editor, Auto-refresh, Atualizar) foram removidos do topo', () => {
  const contentToTest = globalHeaderContent || appTsxContent;

  assert.ok(!contentToTest.includes('Abrir Editor'), 'Header NÃO deve ter botão Abrir Editor');
  assert.ok(!contentToTest.includes('Auto-refresh'), 'Header NÃO deve ter controle visual de Auto-refresh');
  assert.ok(!contentToTest.includes('Atualizar'), 'Header NÃO deve ter botão de Atualizar');
  assert.ok(contentToTest.includes('btn-theme-toggle'), 'Header deve preservar alternador de Tema');
});

test('2. Dashboard: Polling e background refresh continuam ativos e transparentes', () => {
  assert.ok(appTsxContent.includes('const interval = setInterval(fetchData, 15000)'), 'Intervalo de 15s para fetchData deve ser preservado');
  assert.ok(appTsxContent.includes('if (!autoRefresh) return'), 'Polling automático em segundo plano deve permanecer funcional');
});

test('3. Editor: Seletor utiliza terminologia "Visualizar como:" e tooltip oficial', () => {
  const hasSelector = layoutTsxContent.includes('Visualizar como: Normal') || inspectorTsxContent.includes('Visualização do Preço');
  assert.ok(hasSelector, 'Seletor de cenário de preço/visualização deve estar presente no editor/inspector');
});

test('4. Inspector: Regras de Exibição formatadas semanticamente', () => {
  assert.ok(inspectorTsxContent.includes('REGRAS DE EXIBIÇÃO'), 'Inspector deve exibir seção "REGRAS DE EXIBIÇÃO" em caixa alta');
  assert.ok(inspectorTsxContent.includes('Ativar exibição condicional'), 'Deve conter checkbox "Ativar exibição condicional"');
  assert.ok(inspectorTsxContent.includes('Mostrar este conteúdo quando...'), 'Deve conter o subtítulo semântico "Mostrar este conteúdo quando..."');
  assert.ok(!inspectorTsxContent.includes('Condição Fx'), 'NÃO deve utilizar "Condição Fx"');
  assert.ok(!inspectorTsxContent.includes('Campo ERP'), 'NÃO deve utilizar "Campo ERP"');
});

test('5. Inspector: Regras de Exibição restritas a Texto, Preço e metadados legados', () => {
  assert.ok(
    inspectorTsxContent.includes("elem.type === 'text' || elem.type === 'price' || !!elem.visibilityRule"),
    'Seção de Regras de Exibição deve estar ativa por padrão apenas para Texto e Preço, preservando metadados legados'
  );
});

test('6. Data/Hora: Configuração de formato de system.printDateTime movida para Avançado com fonte única format', () => {
  assert.ok(inspectorTsxContent.includes('Personalizar formato de data/hora'), 'Avançado deve conter o checkbox "Personalizar formato de data/hora"');
  assert.ok(inspectorTsxContent.includes("value=\"datetime\""), 'Opção datetime deve estar presente');
  assert.ok(inspectorTsxContent.includes("value=\"date\""), 'Opção date deve estar presente');
  assert.ok(inspectorTsxContent.includes("value=\"time\""), 'Opção time deve estar presente');
  assert.ok(!inspectorTsxContent.includes('bindingFormat'), 'NÃO deve utilizar bindingFormat');
});

test('7. Data/Hora & Canvas: resolveFieldValue suporta format (datetime, date, time) e atualiza o canvas imediatamente', () => {
  assert.ok(storeTsContent.includes('format?: string'), 'resolveFieldValue deve aceitar parâmetro de formato');
  assert.ok(canvasTsxContent.includes('resolveFieldValue(textElem.field, mockProductData || MOCK_PRODUCT_DATA, textElem.format)'), 'CanvasArea deve passar textElem.format para resolveFieldValue');
});
