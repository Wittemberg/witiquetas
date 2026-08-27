import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { LabelDocument } from '@witiquetas/label-schema';

// Carregar arquivos fonte para verificação estática do PrintPreview
const printPreviewPath = path.resolve('apps/frontend/src/modules/printcenter/PrintPreview.tsx');
const printPreviewContent = fs.readFileSync(printPreviewPath, 'utf8');

const printCenterPagePath = path.resolve('apps/frontend/src/modules/printcenter/PrintCenterPage.tsx');
const printCenterPageContent = fs.readFileSync(printCenterPagePath, 'utf8');

// Documento de modelo simulado contendo todos os tipos de elementos
const mockDocument: LabelDocument = {
  schemaVersion: 1,
  dimensions: {
    widthMm: 100,
    heightMm: 30,
    dpi: 203,
  },
  elements: [
    {
      id: 'txt-desc',
      type: 'text',
      x: 5,
      y: 3,
      width: 90,
      height: 6,
      text: 'Descrição Padrão',
      binding: { source: 'integration', fieldId: 'retail.description' },
      fontSizeMm: 4,
      fontFamily: 'Roboto',
      fontWeight: 'bold',
      color: '#000000',
    },
    {
      id: 'price-val',
      type: 'price',
      x: 60,
      y: 12,
      width: 35,
      height: 12,
      sampleValue: '9.99',
      binding: { source: 'integration', fieldId: 'retail.price' },
      fontFamily: 'Roboto',
      color: '#dc2626',
    },
    {
      id: 'bar-ean',
      type: 'barcode',
      x: 5,
      y: 12,
      width: 50,
      height: 12,
      value: '7894900011517',
      binding: { source: 'integration', fieldId: 'retail.ean' },
      format: 'EAN13',
      showText: true,
    },
    {
      id: 'qr-site',
      type: 'qrcode',
      x: 80,
      y: 2,
      width: 15,
      height: 15,
      value: 'https://witiquetas.wrtec.com.br',
    },
    {
      id: 'line-sep',
      type: 'line',
      x: 5,
      y: 10,
      width: 90,
      height: 0,
      color: '#000000',
      thicknessMm: 0.5,
    },
    {
      id: 'rect-border',
      type: 'rectangle',
      x: 2,
      y: 1,
      width: 96,
      height: 28,
      fill: 'transparent',
      stroke: '#000000',
      strokeWidthMm: 0.5,
    },
  ],
};

// ============================================================================
// SUÍTE DE TESTES DA PRÉVIA REAL DE IMPRESSÃO (FASE 4.1 ETAPA 3)
// ============================================================================

test('PREVIEW A, B, P: PrintPreview consome LabelDocument real e os dados do registro usando renderer do Editor', () => {
  assert.ok(
    printPreviewContent.includes('document: LabelDocument'),
    'PrintPreview deve receber prop document do tipo LabelDocument'
  );
  assert.ok(
    printPreviewContent.includes('resolveFieldValue('),
    'PrintPreview deve utilizar resolveFieldValue do dataBindingEngine'
  );
  assert.ok(
    printPreviewContent.includes('SingleElementPreview'),
    'PrintPreview deve utilizar componente SingleElementPreview para renderizar elementos do documento'
  );
});

test('PREVIEW C & D: PrintCenterPage passa registro ativo e documento do modelo selecionado ao PrintPreview', () => {
  assert.ok(
    printCenterPageContent.includes('<PrintPreview'),
    'PrintCenterPage.tsx deve renderizar o componente <PrintPreview />'
  );
  assert.ok(
    printCenterPageContent.includes('document={selectedTemplate?.document || null}'),
    'PrintCenterPage.tsx deve passar o documento do modelo selecionado ao PrintPreview'
  );
  assert.ok(
    printCenterPageContent.includes('data={(activeRecord?.data as Record<string, unknown>) || null}'),
    'PrintCenterPage.tsx deve passar os dados do registro ativo ao PrintPreview'
  );
});

test('PREVIEW E & H (ESCALA): Preserva proporção física widthMm x heightMm e calcula escala proporcional', () => {
  assert.ok(
    printPreviewContent.includes('const scale = targetWidthPx / nativeWidthPx;'),
    'PrintPreview deve calcular escala com base na largura nativa em px'
  );
  assert.ok(
    printPreviewContent.includes('const scaledHeightPx = nativeHeightPx * scale;'),
    'PrintPreview deve manter a altura proporcional ao fator de escala sem deformar'
  );
});

test('PREVIEW F, G, H, I, J, K (ELEMENTOS): Suporta renderização de Text, Price, Barcode, QRCode, Line e Rectangle', () => {
  const elementTypes = ['text', 'price', 'barcode', 'qrcode', 'line', 'rectangle'];
  for (const type of elementTypes) {
    assert.ok(
      printPreviewContent.includes(`case '${type}':`),
      `PrintPreview deve tratar explicitamente o tipo de elemento: ${type}`
    );
  }
});

test('PREVIEW L & M (EMPTY STATES): Exibe mensagens claras na ausência de modelo ou registro', () => {
  assert.ok(
    printPreviewContent.includes('Selecione um modelo de etiqueta.'),
    'PrintPreview deve exibir mensagem amigável quando o documento for nulo'
  );
  assert.ok(
    printPreviewContent.includes('Selecione um registro para visualizar a impressão.'),
    'PrintPreview deve exibir mensagem amigável quando os dados do registro forem nulos'
  );
});

test('PREVIEW N (MODELO REMOVIDO): Trata gracioso de modelo removido ou ID inexistente sem disparar Error Boundary', () => {
  assert.ok(
    printCenterPageContent.includes("Modelo de etiqueta '") &&
      printCenterPageContent.includes("setSelectedTemplateId('')"),
    'PrintCenterPage.tsx deve tratar erro de modelo inexistente/removido limpando a seleção fantasma'
  );
});

test('PREVIEW O (READ-ONLY): Não expõe controles de edição (handles, réguas, seletores ou ferramentas)', () => {
  assert.ok(
    !printPreviewContent.includes('<Transformer'),
    'PrintPreview NÃO deve renderizar Konva Transformer para edição'
  );
  assert.ok(
    !printPreviewContent.includes('draggable={true}'),
    'PrintPreview NÃO deve habilitar arrasto de elementos (draggable)'
  );
  assert.ok(
    !printPreviewContent.includes('HorizontalRuler'),
    'PrintPreview NÃO deve exibir réguas de edição'
  );
});

test('PREVIEW Q & R (SEM DUPLICAÇÃO DE LÓGICA): Reutiliza getPriceRenderMetrics e generateBarcodeModules do Editor', () => {
  assert.ok(
    printPreviewContent.includes('getPriceRenderMetrics') && printPreviewContent.includes('../../editor/bounds.js'),
    'PrintPreview deve importar e reutilizar getPriceRenderMetrics de bounds.js'
  );
  assert.ok(
    printPreviewContent.includes('generateBarcodeModules') && printPreviewContent.includes('../../editor/barcodeEngine.js'),
    'PrintPreview deve importar e reutilizar generateBarcodeModules de barcodeEngine.ts'
  );
  assert.ok(
    printPreviewContent.includes('generateQRCodeDataUrl') && printPreviewContent.includes('../../editor/qrCodeGenerator.js'),
    'PrintPreview deve importar e reutilizar generateQRCodeDataUrl de qrCodeGenerator.ts'
  );
});
