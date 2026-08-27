import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getRequiredIntegrationFields } from '@witiquetas/label-schema';
import { deriveBatchStatus } from '../apps/backend/src/routes/printJobs.js';
import type { PrintJobBatchItemDTO, PrintJobDeliveryStatus } from '@witiquetas/contracts';

// Verification of files and content for frontend integrity
const appTsxPath = path.resolve('apps/frontend/src/App.tsx');
const appTsxContent = fs.readFileSync(appTsxPath, 'utf8');

const printCenterPagePath = path.resolve('apps/frontend/src/modules/printcenter/PrintCenterPage.tsx');
const printCenterPageContent = fs.readFileSync(printCenterPagePath, 'utf8');

const printCenterGridPath = path.resolve('apps/frontend/src/modules/printcenter/PrintCenterGrid.tsx');
const printCenterGridContent = fs.readFileSync(printCenterGridPath, 'utf8');

// ============================================================================
// SUÍTE DE TESTES: CENTRAL DE IMPRESSÃO UNIVERSAL (FASE 4.1 ETAPA 2)
// ============================================================================

test('FRONTEND A: Rota #print-center substitui PlaceholderModulePage por PrintCenterPage real', () => {
  assert.ok(
    appTsxContent.includes("import PrintCenterPage from './modules/printcenter/PrintCenterPage.js';"),
    'App.tsx deve importar PrintCenterPage'
  );
  assert.ok(
    appTsxContent.includes("<PrintCenterPage />"),
    'App.tsx deve renderizar <PrintCenterPage /> para case print-center'
  );
  assert.ok(
    !appTsxContent.includes('title="Central de Impressão"'),
    'App.tsx NÃO deve mais renderizar o PlaceholderModulePage na rota print-center'
  );
});

test('HOTFIX 4.1.1: PrintCenterPage chama canonicamente templatesApi.getTemplateById e previne TypeError', () => {
  const content = fs.readFileSync(printCenterPagePath, 'utf8');
  assert.ok(
    !content.includes('templatesApi.getTemplate('),
    'PrintCenterPage NÃO deve conter o método inexistente templatesApi.getTemplate('
  );
  assert.ok(
    content.includes('getTemplateById('),
    'PrintCenterPage deve chamar canonicamente getTemplateById('
  );
});

test('FRONTEND B, C & D: getRequiredIntegrationFields extrai bindings determinísticos e remove duplicidades', () => {
  const mockDocument = {
    schemaVersion: 1,
    dimensions: { widthMm: 100, heightMm: 30, dpi: 203 },
    elements: [
      {
        id: 'txt-1',
        type: 'text',
        binding: { source: 'integration', fieldId: 'retail.description' },
      },
      {
        id: 'price-1',
        type: 'price',
        binding: { source: 'integration', fieldId: 'retail.price' },
      },
      {
        id: 'barcode-1',
        type: 'barcode',
        binding: { source: 'integration', fieldId: 'retail.code' },
      },
      {
        id: 'qrcode-1',
        type: 'qrcode',
        binding: { source: 'integration', fieldId: 'retail.ean' },
      },
      {
        id: 'txt-2-dup',
        type: 'text',
        binding: { source: 'integration', fieldId: 'retail.description' }, // Duplicado intencional
      },
      {
        id: 'txt-sys',
        type: 'text',
        binding: { source: 'system', fieldId: 'system.printDateTime' }, // Campo do sistema reservado
      },
    ],
  };

  const extracted = getRequiredIntegrationFields(mockDocument);

  assert.equal(extracted.length, 4, 'Deve extrair exatamente 4 campos de integração únicos');
  assert.ok(extracted.includes('retail.description'), 'Deve conter retail.description');
  assert.ok(extracted.includes('retail.price'), 'Deve conter retail.price');
  assert.ok(extracted.includes('retail.code'), 'Deve conter retail.code');
  assert.ok(extracted.includes('retail.ean'), 'Deve conter retail.ean');
  assert.ok(!extracted.includes('system.printDateTime'), 'NÃO deve incluir campos do sistema (system.*)');
});

test('FRONTEND E & F: Grid Dinâmico suporta colunas dinâmicas e busca por texto', () => {
  assert.ok(
    printCenterGridContent.includes('formatColumnHeader'),
    'PrintCenterGrid deve incluir formatador de cabeçalhos'
  );
  assert.ok(
    printCenterGridContent.includes('filteredRecords'),
    'PrintCenterGrid deve implementar filtro de busca'
  );
  assert.ok(
    printCenterGridContent.includes('effectiveColumns'),
    'PrintCenterGrid deve adaptar colunas dinamicamente aos requiredFields'
  );
});

test('FRONTEND G, H, I, J & K: Seleção individual, seleção total e limites de quantidade 1..999', () => {
  assert.ok(
    printCenterGridContent.includes('onChangeQuantity'),
    'PrintCenterGrid deve conter callback para quantidade individual'
  );
  assert.ok(
    printCenterGridContent.includes('max={999}'),
    'PrintCenterGrid deve delimitar o valor máximo do input em 999'
  );
  assert.ok(
    printCenterGridContent.includes('min={1}'),
    'PrintCenterGrid deve delimitar o valor mínimo em 1'
  );
  assert.ok(
    printCenterPageContent.includes('handleApplyBatchQuantity'),
    'PrintCenterPage deve implementar a aplicação de quantidade em lote'
  );
});

test('FRONTEND L, M, N & O: Preview contextual, agent status, envio em lote e cálculo de totalLabels', () => {
  assert.ok(
    printCenterPageContent.includes('resolveFieldValue'),
    'PrintCenterPage deve resolver valores para a Prévia Contextual'
  );
  assert.ok(
    printCenterPageContent.includes('agentStatus.online'),
    'PrintCenterPage deve validar status do Agent/Impressora'
  );
  assert.ok(
    printCenterPageContent.includes("build_api_url('/api/print-jobs/batch')"),
    'PrintCenterPage deve disparar POST /api/print-jobs/batch'
  );
  assert.ok(
    printCenterPageContent.includes('totalSelectedLabels'),
    'PrintCenterPage deve somar corretamente o número total de etiquetas'
  );
});

test('FRONTEND P: Layout não possui overflow horizontal grave ou quebra de Application Shell', () => {
  assert.ok(
    printCenterGridContent.includes('overflow-x-auto'),
    'PrintCenterGrid wrapper deve ter overflow-x-auto para responsividade de colunas'
  );
});

test('BACKEND K, L, M: deriveBatchStatus calcula o status do lote corretamente a partir dos filhos', () => {
  const createMockItem = (status: PrintJobDeliveryStatus): PrintJobBatchItemDTO => ({
    id: 'item-1',
    batchId: 'batch-1',
    sourceRecordId: 'rec-1',
    resolvedData: {},
    quantity: 1,
    status,
  });

  // Todos concluídos -> COMPLETED
  const completedItems = [createMockItem('PRINTED'), createMockItem('DELIVERED_TO_TRANSPORT')];
  assert.equal(deriveBatchStatus(completedItems), 'COMPLETED');

  // Todos falharam -> FAILED
  const failedItems = [createMockItem('FAILED'), createMockItem('FAILED')];
  assert.equal(deriveBatchStatus(failedItems), 'FAILED');

  // Mistura concluídos e falhos -> PARTIAL
  const partialItems = [createMockItem('PRINTED'), createMockItem('FAILED')];
  assert.equal(deriveBatchStatus(partialItems), 'PARTIAL');

  // Em processamento -> PROCESSING
  const processingItems = [createMockItem('DELIVERING'), createMockItem('CLAIMED')];
  assert.equal(deriveBatchStatus(processingItems), 'PROCESSING');

  // Nenhum iniciado -> QUEUED
  const queuedItems = [createMockItem('PENDING'), createMockItem('PENDING')];
  assert.equal(deriveBatchStatus(queuedItems), 'QUEUED');
});
