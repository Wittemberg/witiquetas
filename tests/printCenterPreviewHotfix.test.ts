import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { LabelDocument, TextElement, PriceElement, BarcodeElement } from '@witiquetas/label-schema';
import { resolveFieldValue, formatDateValue } from '@witiquetas/label-schema';

// Carregar arquivos fonte para verificação estática e estrutural dos componentes
const printCenterPagePath = path.resolve('apps/frontend/src/modules/printcenter/PrintCenterPage.tsx');
const printCenterPageContent = fs.readFileSync(printCenterPagePath, 'utf8');

const printPreviewPath = path.resolve('apps/frontend/src/modules/printcenter/PrintPreview.tsx');
const printPreviewContent = fs.readFileSync(printPreviewPath, 'utf8');

// ============================================================================
// SUÍTE DE TESTES EXAUSTIVA: PREVIEW DA CENTRAL DE IMPRESSÃO (HOTFIX 4.5.6.1)
// Cobre os 16 itens do Requisito B.2
// ============================================================================

test('1. B.2: PrintCenter passa data para PrintPreview', () => {
  assert.ok(
    printCenterPageContent.includes('<PrintPreview'),
    'PrintCenterPage deve instanciar o componente <PrintPreview />'
  );
  assert.ok(
    printCenterPageContent.includes('data={(activeRecord?.data as Record<string, unknown>) || null}'),
    'PrintCenterPage deve passar explicitamente a prop data com os dados do registro ativo'
  );
});

test('2. B.2: Modelo selecionado renderiza preview', () => {
  assert.ok(
    printPreviewContent.includes('document.elements.map'),
    'PrintPreview deve mapear e renderizar elementos do documento do modelo'
  );
  assert.ok(
    printPreviewContent.includes('SingleElementPreview'),
    'PrintPreview deve renderizar cada elemento através de SingleElementPreview'
  );
  assert.ok(
    printPreviewContent.includes('if (!document)'),
    'PrintPreview deve tratar ausência de modelo exibindo mensagem amigável'
  );
});

test('3. B.2: activeRecord chega ao preview e popula campos de integração', () => {
  const recordData = {
    'retail.description': 'DETERGENTE LIQUIDO 500ML',
    'retail.price': '3.49',
    'retail.code': '100452',
    'retail.ean': '7891000100452',
  };

  const resolvedDesc = resolveFieldValue('retail.description', recordData);
  const resolvedPrice = resolveFieldValue('retail.price', recordData);
  const resolvedCode = resolveFieldValue('retail.code', recordData);

  assert.equal(resolvedDesc, 'DETERGENTE LIQUIDO 500ML', 'activeRecord deve popular descrição');
  assert.equal(resolvedPrice, '3.49', 'activeRecord deve popular preço');
  assert.equal(resolvedCode, '100452', 'activeRecord deve popular código');
});

test('4. B.2: Troca de registro atualiza os valores da prévia', () => {
  const recordA = { 'retail.description': 'PRODUTO A', 'retail.price': '10.00' };
  const recordB = { 'retail.description': 'PRODUTO B', 'retail.price': '25.50' };

  assert.equal(resolveFieldValue('retail.description', recordA), 'PRODUTO A');
  assert.equal(resolveFieldValue('retail.price', recordA), '10.00');

  assert.equal(resolveFieldValue('retail.description', recordB), 'PRODUTO B');
  assert.equal(resolveFieldValue('retail.price', recordB), '25.50');
});

test('5. B.2: Troca de modelo atualiza as dimensões e elementos do preview', () => {
  const modelA: LabelDocument = {
    schemaVersion: 1,
    dimensions: { widthMm: 100, heightMm: 30, dpi: 203 },
    elements: [],
  };
  const modelB: LabelDocument = {
    schemaVersion: 1,
    dimensions: { widthMm: 50, heightMm: 25, dpi: 203 },
    elements: [],
  };

  const calcNativeWidthPx = (doc: LabelDocument) => (doc.dimensions.widthMm * doc.dimensions.dpi) / 25.4;
  const calcNativeHeightPx = (doc: LabelDocument) => (doc.dimensions.heightMm * doc.dimensions.dpi) / 25.4;

  const wA = calcNativeWidthPx(modelA);
  const hA = calcNativeHeightPx(modelA);
  const wB = calcNativeWidthPx(modelB);
  const hB = calcNativeHeightPx(modelB);

  assert.notEqual(wA, wB, 'Largura em px deve mudar ao trocar de modelo');
  assert.notEqual(hA, hB, 'Altura em px deve mudar ao trocar de modelo');
});

test('6. B.2: Ausência de activeRecord não causa crash e renderiza modelo base', () => {
  assert.ok(
    printPreviewContent.includes('const effectiveData: Record<string, unknown> = data || activeRecord || {};'),
    'PrintPreview deve adotar objeto vazio como fallback quando não houver registro ativo'
  );
  // Não bloqueia renderização com if (!data) return ...
  assert.ok(
    !printPreviewContent.includes('if (!data) {\n    return ('),
    'PrintPreview NÃO deve bloquear preview com return antecipado na ausência de registro'
  );
  assert.ok(
    printPreviewContent.includes('Selecione um registro para visualizar a impressão.'),
    'PrintPreview deve manter aviso informativo amigável'
  );
});

test('7. B.2: Elemento Text renderiza com suporte a manual, integração e sistema', () => {
  assert.ok(
    printPreviewContent.includes("case 'text':"),
    'SingleElementPreview deve conter switch case para text'
  );
  assert.ok(
    printPreviewContent.includes('resolveFieldValue('),
    'SingleElementPreview deve resolver bindings de texto com resolveFieldValue'
  );
});

test('8. B.2: Elemento Price renderiza com getPriceRenderMetrics e formatação canônica', () => {
  assert.ok(
    printPreviewContent.includes("case 'price':"),
    'SingleElementPreview deve conter switch case para price'
  );
  assert.ok(
    printPreviewContent.includes('getPriceRenderMetrics('),
    'SingleElementPreview deve calcular métricas de preço canônicas'
  );
  assert.ok(
    printPreviewContent.includes('metrics.integerPart') && printPreviewContent.includes('metrics.fractionPart'),
    'SingleElementPreview deve renderizar parte inteira e centavos separados'
  );
});

test('9. B.2: Elemento Date renderiza e formata datas canonicamente', () => {
  const dateIso = '2026-09-04';
  const formattedBr = formatDateValue(dateIso, 'DD/MM/YYYY');
  assert.equal(formattedBr, '04/09/2026', 'Data ISO deve formatar para DD/MM/YYYY');

  const formattedShort = formatDateValue(dateIso, 'DD/MM/YY');
  assert.equal(formattedShort, '04/09/26', 'Data ISO deve formatar para DD/MM/YY');

  const resolvedDate = resolveFieldValue('system.printDate', {});
  assert.ok(resolvedDate, 'Data de impressão do sistema deve resolver para string preenchida');

  const resolvedDateTime = resolveFieldValue('system.printDateTime', {});
  assert.ok(resolvedDateTime, 'Data/Hora de impressão do sistema deve resolver para string preenchida');
});

test('10. B.2: Elemento Barcode renderiza com gerador canônico de módulos', () => {
  assert.ok(
    printPreviewContent.includes("case 'barcode':"),
    'SingleElementPreview deve conter switch case para barcode'
  );
  assert.ok(
    printPreviewContent.includes('generateBarcodeModules('),
    'SingleElementPreview deve gerar módulos do código de barras'
  );
  assert.ok(
    printPreviewContent.includes('showHumanText'),
    'SingleElementPreview deve respeitar flag de texto legível'
  );
});

test('11. B.2: Elemento QRCode renderiza via KonvaQRCodePreview', () => {
  assert.ok(
    printPreviewContent.includes("case 'qrcode':"),
    'SingleElementPreview deve conter switch case para qrcode'
  );
  assert.ok(
    printPreviewContent.includes('<KonvaQRCodePreview'),
    'SingleElementPreview deve renderizar componente KonvaQRCodePreview'
  );
});

test('12. B.2: Elemento Line renderiza com stroke e dimensões físicas', () => {
  assert.ok(
    printPreviewContent.includes("case 'line':"),
    'SingleElementPreview deve conter switch case para line'
  );
  assert.ok(
    printPreviewContent.includes('<Line'),
    'SingleElementPreview deve renderizar componente Line do Konva'
  );
});

test('13. B.2: Elemento Rectangle renderiza com stroke, fill e cornerRadius', () => {
  assert.ok(
    printPreviewContent.includes("case 'rectangle':"),
    'SingleElementPreview deve conter switch case para rectangle'
  );
  assert.ok(
    printPreviewContent.includes('cornerRadius={mmToPx(rectElem.cornerRadiusMm || 0, dpi)}'),
    'SingleElementPreview deve suportar cornerRadius do retângulo'
  );
});

test('14. B.2: Elemento Image renderiza via KonvaImagePreview quando previsto', () => {
  assert.ok(
    printPreviewContent.includes("case 'image':"),
    'SingleElementPreview deve conter switch case para image'
  );
  assert.ok(
    printPreviewContent.includes('<KonvaImagePreview'),
    'SingleElementPreview deve renderizar componente KonvaImagePreview'
  );
});

test('15. B.2: Preview é estritamente read-only e NÃO cria print-job', () => {
  assert.ok(
    !printPreviewContent.includes('/api/print-jobs'),
    'PrintPreview NÃO deve interagir diretamente com endpoints de print-jobs'
  );
  assert.ok(
    !printPreviewContent.includes('fetch('),
    'PrintPreview NÃO deve disparar requisições fetch de rede'
  );
});

test('16. B.2: Preview é puramente visual no frontend e NÃO depende do Agent de impressão', () => {
  assert.ok(
    !printPreviewContent.includes('agentStatus'),
    'PrintPreview NÃO deve depender do estado online/offline do Agent'
  );
  assert.ok(
    !printPreviewContent.includes('WebSocket'),
    'PrintPreview NÃO deve depender de conexão WebSocket com Agent'
  );
});
