import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SAFE_AREA_MARGIN_MM, validateElementBounds } from '../apps/frontend/src/editor/bounds';

test('1. DASHBOARD HEADER AUDIT: Controles Superseded Removidos do Header Global', () => {
  const appJsxPath = path.resolve('apps/frontend/src/App.tsx');
  const appJsx = fs.readFileSync(appJsxPath, 'utf8');

  // Os 3 botões superseded devem ter sido removidos do header do Dashboard
  assert.ok(!appJsx.includes('<span>Abrir Editor</span>'), 'App.tsx não deve conter o botão superseded "Abrir Editor" no header');
  assert.ok(!appJsx.includes('Auto-refresh On'), 'App.tsx não deve conter o botão superseded "Auto-refresh On/Off" no header');
  assert.ok(!appJsx.includes('<span>Atualizar</span>'), 'App.tsx não deve conter o botão superseded "Atualizar" no header');

  // A atualização em background deve ser mantida transparente no useEffect
  assert.ok(appJsx.includes('const [autoRefresh, setAutoRefresh] = useState<boolean>(true)'), 'App.tsx deve manter autoRefresh ativo em background por padrão');
  assert.ok(appJsx.includes('setInterval(fetchData, 15000)'), 'App.tsx deve manter polling transparente a cada 15 segundos');
});

test('2. WIZARD TO EDITOR FLOW: Wizard Cria o Documento e Reseta Estado', () => {
  const wizardPath = path.resolve('apps/frontend/src/editor/NewTemplateWizard.tsx');
  const wizardCode = fs.readFileSync(wizardPath, 'utf8');

  assert.ok(wizardCode.includes('createNewDocument({'), 'Wizard deve chamar createNewDocument com parâmetros de nicho e tamanho');
  assert.ok(wizardCode.includes('onSuccess?.()'), 'Wizard deve disparar onSuccess para trocar a view para editor');
  assert.ok(wizardCode.includes("setStep('niche')"), 'Wizard deve resetar o passo para niche após criação');
});

test('3. EDITOR HEADER & NOMENCLATURA: Visualizar como, Salvar Sempre Visível e Imprimir', () => {
  const layoutPath = path.resolve('apps/frontend/src/editor/EditorLayout.tsx');
  const layoutCode = fs.readFileSync(layoutPath, 'utf8');

  // Nomenclatura oficial "Visualizar como"
  assert.ok(layoutCode.includes('Visualizar como: Promoção'), 'Deve utilizar a nomenclatura "Visualizar como" para promoção');
  assert.ok(layoutCode.includes('Visualizar como: Normal'), 'Deve utilizar a nomenclatura "Visualizar como" para normal');
  assert.ok(
    layoutCode.includes('Simula diferentes condições dos dados para conferir como a etiqueta será impressa.'),
    'Deve incluir o tooltip oficial no seletor Visualizar como'
  );

  // Botão Salvar sempre presente e visível no DOM do Header
  assert.ok(layoutCode.includes('onClick={() => saveDocumentToBackend()}'), 'Botão Salvar deve estar sempre no DOM do Header');
  assert.ok(layoutCode.includes("disabled={saveStatus === 'saving' || saveStatus === 'saved'}"), 'Botão Salvar deve ficar desabilitado somente quando salvo ou salvando');

  // Botão Imprimir sempre visível
  assert.ok(layoutCode.includes('onClick={() => setIsCompileOpen(true)}'), 'Botão Imprimir deve estar presente e visível');
});

test('4. INSPECTOR UX: Regras de Exibição com Rótulo Semântico e Data/Hora em Avançado', () => {
  const inspectorPath = path.resolve('apps/frontend/src/editor/PropertyInspector.tsx');
  const inspectorCode = fs.readFileSync(inspectorPath, 'utf8');

  // Rótulo semântico de Regras de Exibição
  assert.ok(inspectorCode.includes('Mostrar este conteúdo quando...'), 'Deve incluir a declaração semântica "Mostrar este conteúdo quando..."');

  // Data e hora avançado com checkbox de personalização e prop canônica format
  assert.ok(inspectorCode.includes('Personalizar formato de data/hora'), 'Deve conter checkbox "Personalizar formato de data/hora"');
  assert.ok(inspectorCode.includes('format: e.target.value as any'), 'Deve utilizar a propriedade canônica "format"');
  assert.ok(!inspectorCode.includes('bindingFormat:'), 'NÃO deve reintroduzir bindingFormat');
});

test('5. SAFE AREA EPSILON TOLERANCE: Eliminação de Falsos Positivos a 1.0 mm', () => {
  // Elemento exatamente a 1.0 mm de margem segura não deve gerar falso positivo
  const elementAtMargin = {
    id: 'test-el-1',
    name: 'Texto Seguro',
    type: 'text' as const,
    x: 1.0,
    y: 1.0,
    width: 20.0,
    height: 5.0,
    rotation: 0,
    visible: true,
  };

  const dimensions = { widthMm: 100, heightMm: 30 };
  const violation = validateElementBounds(elementAtMargin, dimensions, SAFE_AREA_MARGIN_MM);

  assert.equal(violation.isOutOfBounds, false, 'Elemento a 1.0mm não deve violar limites da etiqueta');
  assert.equal(violation.overflowLeftMm, 0, 'overflowLeftMm deve ser 0');
  assert.equal(violation.overflowRightMm, 0, 'overflowRightMm deve ser 0');
});
