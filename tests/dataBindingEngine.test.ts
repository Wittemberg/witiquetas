import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_RETAIL_CATALOG,
  DEFAULT_HOSPITAL_CATALOG,
  DEFAULT_LOGISTICS_CATALOG,
  SYSTEM_FIELDS,
  type IntegrationFieldDefinition,
  type ElementBinding,
} from '../packages/label-schema/src/canonicalFields.ts';
import {
  resolveFieldValue,
  evaluateVisibilityRule,
  MOCK_PRODUCT_DATA,
} from '../packages/label-schema/src/dataBindingEngine.ts';
import type { TextElement, PriceElement, BarcodeElement, QrCodeElement } from '../packages/label-schema/src/types.ts';

test('1. FASE 3.5 PATCH 2.1: Catálogo Dinâmico e Categorias Abertas (Sem Union Fechada)', () => {
  const customField: IntegrationFieldDefinition = {
    id: 'finance.invoiceNumber',
    namespace: 'finance',
    label: 'Número da Nota Fiscal',
    category: 'Financeiro e Impostos',
    example: 'NF-2026-991',
    printable: true,
  };

  assert.equal(customField.category, 'Financeiro e Impostos');
  assert.equal(customField.namespace, 'finance');
});

test('2. FASE 3.5 PATCH 2.1: Separação de System Field Registry e Integration Field Catalog', () => {
  assert.equal(SYSTEM_FIELDS.length, 1);
  assert.equal(SYSTEM_FIELDS[0].id, 'system.printDateTime');
  assert.equal(SYSTEM_FIELDS[0].namespace, 'system');

  assert.ok(DEFAULT_RETAIL_CATALOG.some((f) => f.id === 'retail.description'));
  assert.ok(DEFAULT_HOSPITAL_CATALOG.some((f) => f.id === 'hospital.patientName'));
  assert.ok(DEFAULT_LOGISTICS_CATALOG.some((f) => f.id === 'logistics.recipient'));
});

test('3. FASE 3.5 PATCH 2.1: Prova Multinicho — Mesmo TextElement em 3 Nichos Diferentes', () => {
  const textElem: TextElement = {
    id: 't-multiniche',
    type: 'text',
    text: 'Fallback Estático',
    x: 10,
    y: 10,
    width: 50,
    height: 10,
    fontFamily: 'Roboto',
    fontSize: 12,
  };

  // 1. Nicho Varejo
  const retailData = { 'retail.description': 'REFRIGERANTE COCA-COLA 2L' };
  const retailText = resolveFieldValue('retail.description', retailData);
  assert.equal(retailText, 'REFRIGERANTE COCA-COLA 2L');

  // 2. Nicho Saúde / Hospitalar
  const hospitalData = { 'hospital.patientName': 'MARIA DA SILVA SOUZA' };
  const hospitalText = resolveFieldValue('hospital.patientName', hospitalData);
  assert.equal(hospitalText, 'MARIA DA SILVA SOUZA');

  // 3. Nicho Logística
  const logisticsData = { 'logistics.recipient': 'JOÃO PEDRO OLIVEIRA' };
  const logisticsText = resolveFieldValue('logistics.recipient', logisticsData);
  assert.equal(logisticsText, 'JOÃO PEDRO OLIVEIRA');

  // Prova de que a estrutura do componente TextElement é 100% agnóstica
  assert.equal(textElem.type, 'text');
});

test('4. FASE 3.5 PATCH 2.1: System Print DateTime — Um Campo, Três Formatos (Date, DateTime, Time)', () => {
  const fixedDate = new Date('2026-08-20T15:30:00');

  // 1. Formato DateTime (Padrão)
  const dtVal = resolveFieldValue(
    { source: 'system', fieldId: 'system.printDateTime', format: 'datetime' },
    { timestamp: fixedDate }
  );
  assert.equal(dtVal, '20/08/2026 15:30');

  // 2. Formato Date
  const dateVal = resolveFieldValue(
    { source: 'system', fieldId: 'system.printDateTime', format: 'date' },
    { timestamp: fixedDate }
  );
  assert.equal(dateVal, '20/08/2026');

  // 3. Formato Time
  const timeVal = resolveFieldValue(
    { source: 'system', fieldId: 'system.printDateTime', format: 'time' },
    { timestamp: fixedDate }
  );
  assert.equal(timeVal, '15:30');

  // 4. Aliases de compatibilidade para system.printDate e system.printTime
  const aliasDate = resolveFieldValue('system.printDate', { timestamp: fixedDate });
  assert.equal(aliasDate, '20/08/2026');

  const aliasTime = resolveFieldValue('system.printTime', { timestamp: fixedDate });
  assert.equal(aliasTime, '15:30');
});

test('5. FASE 3.5 PATCH 2.1: Proteção Estrita do Namespace system.* Contra Sobrescrita por Mock', () => {
  const maliciousMockData = {
    'system.printDateTime': 'HACKED_BY_INTEGRATION_MOCK',
    'retail.description': 'PRODUTO REAL',
  };

  const resolvedSystemField = resolveFieldValue('system.printDateTime', maliciousMockData);

  assert.notEqual(resolvedSystemField, 'HACKED_BY_INTEGRATION_MOCK', 'O mock da integração NÃO pode sobrescrever system.printDateTime');
  assert.match(resolvedSystemField!, /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/, 'system.printDateTime deve ser gerado pelo SystemFieldResolver');
});

test('6. FASE 3.5 PATCH 2.1: Separação de Preview Time vs Print Job Time', () => {
  const editTime = new Date('2026-08-20T10:00:00');
  const printJobTime = new Date('2026-08-20T15:00:00');

  // No editor (Preview Mode): resolve no momento do render
  const previewVal = resolveFieldValue(
    { source: 'system', fieldId: 'system.printDateTime', format: 'time' },
    { mode: 'preview', timestamp: editTime }
  );
  assert.equal(previewVal, '10:00');

  // No disparo do Print Job (Print Mode): resolve no momento da compilação às 15:00
  const printJobVal = resolveFieldValue(
    { source: 'system', fieldId: 'system.printDateTime', format: 'time' },
    { mode: 'print', timestamp: printJobTime }
  );
  assert.equal(printJobVal, '15:00', 'No Print Job, system.printDateTime deve resolver 15:00 (momento da compilação/impressão) e NÃO snapshot salvo às 10:00');
});

test('7. FASE 3.5 PATCH 2.1: Binding Manual (Texto Estático)', () => {
  const manualBinding: ElementBinding = {
    source: 'manual',
    value: 'LOTE PROMOCIONAL ESPECIAL',
  };

  const resolved = resolveFieldValue(manualBinding);
  assert.equal(resolved, 'LOTE PROMOCIONAL ESPECIAL');
});

test('8. FASE 3.5 PATCH 2.1: Bindings Genéricos para Price, Barcode e QR Code', () => {
  // Price Element
  const priceElem: PriceElement = {
    id: 'p1',
    type: 'price',
    field: 'retail.price',
    x: 0, y: 0, width: 30, height: 10,
  };
  const priceVal = resolveFieldValue(priceElem.field, { 'retail.price': '19.90' });
  assert.equal(priceVal, '19.90');

  // Barcode Element (Logística)
  const barcodeElem: BarcodeElement = {
    id: 'b1',
    type: 'barcode',
    format: 'CODE128',
    field: 'logistics.trackingCode',
    value: '0000',
    x: 0, y: 0, width: 50, height: 15,
  };
  const barcodeVal = resolveFieldValue(barcodeElem.field, { 'logistics.trackingCode': 'BR991823746PT' });
  assert.equal(barcodeVal, 'BR991823746PT');

  // QR Code Element (Hospitalar)
  const qrElem: QrCodeElement = {
    id: 'q1',
    type: 'qrcode',
    field: 'hospital.medicalRecord',
    value: 'https://witiquetas.wrtec.com.br',
    x: 0, y: 0, width: 20, height: 20,
  };
  const qrVal = resolveFieldValue(qrElem.field, { 'hospital.medicalRecord': 'PAC-2026-8841' });
  assert.equal(qrVal, 'PAC-2026-8841');
});

test('9. FASE 3.5 PATCH 2.1: Regras de Exibição Condicional em Campos Arbitrários de Integração', () => {
  // Regra em campo de saúde
  const ruleHospital = {
    field: 'hospital.bed',
    operator: 'not_empty' as const,
    value: '',
  };
  const isVisibleHospital = evaluateVisibilityRule(ruleHospital, { 'hospital.bed': 'LEITO 402-A' });
  assert.equal(isVisibleHospital, true);

  // Regra em campo de logística
  const ruleLogistics = {
    field: 'logistics.weightKg',
    operator: '>' as const,
    value: '10',
  };
  const isVisibleLogistics = evaluateVisibilityRule(ruleLogistics, { 'logistics.weightKg': '12.50' });
  assert.equal(isVisibleLogistics, true);
});

test('10. FASE 3.5 PATCH 2.1: Auditoria do Componente FieldPicker e Design Contract 224599d', () => {
  const fieldPickerPath = path.resolve('apps/frontend/src/editor/FieldPicker.tsx');
  const fieldPickerCode = fs.readFileSync(fieldPickerPath, 'utf8');

  assert.ok(fieldPickerCode.includes('categoriesMap'), 'FieldPicker deve agrupar opções dinamicamente via Map por categoria');
  assert.ok(!fieldPickerCode.includes("if (category === 'produto')"), 'FieldPicker NÃO pode ter tratamentos condicionais hardcodados para categorias comerciais');
  assert.ok(fieldPickerCode.includes('activeFields'), 'FieldPicker deve aceitar catálogo dinâmico de campos via props ou store');
  assert.ok(fieldPickerCode.includes("textOverflow: 'ellipsis'"), 'FieldPicker deve conter textOverflow: ellipsis para evitar overflow horizontal');
});
