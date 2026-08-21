import { test } from 'node:test';
import assert from 'node:assert/strict';
import { type LabelDocument } from '@witiquetas/label-schema';
import { templateRepository } from '../apps/backend/src/repositories/templateRepository.ts';

test('GATE BLOQUEANTE: Round-Trip Semântico de LabelDocument (PostgreSQL / Repository)', async () => {
  const companyId = 'comp-roundtrip-test';

  const originalDocument: LabelDocument = {
    schemaVersion: 1,
    title: 'Etiqueta Teste Roundtrip Completa',
    printerLanguage: 'ZPL',
    dimensions: {
      widthMm: 100,
      heightMm: 50,
      dpi: 300,
      orientation: 'landscape',
    },
    elements: [
      {
        id: 'txt-001',
        name: 'Descrição do Produto',
        type: 'text',
        text: 'SABÃO EM PÓ IPÊ 1KG',
        field: 'produto.descricao',
        x: 5,
        y: 5,
        width: 60,
        height: 10,
        fontFamily: 'Inter',
        fontSize: 14,
        fontWeight: 'bold',
        alignment: 'left',
        color: '#0f172a',
        format: 'uppercase',
        visibilityRule: {
          field: 'produto.estoque',
          operator: '>',
          value: '0',
        },
        sourceReference: {
          state: 'created',
          format: 'zpl',
        },
      },
      {
        id: 'price-001',
        name: 'Preço em Oferta',
        type: 'price',
        field: 'produto.preco',
        prefix: 'R$',
        x: 68,
        y: 5,
        width: 28,
        height: 12,
        integerFontSize: 24,
        fractionFontSize: 14,
        currencyFontSize: 12,
        color: '#dc2626',
      },
      {
        id: 'bar-001',
        name: 'EAN-13 Principal',
        type: 'barcode',
        format: 'EAN13',
        field: 'produto.ean',
        value: '7891234567890',
        x: 5,
        y: 20,
        width: 50,
        height: 15,
        showText: true,
      },
      {
        id: 'qr-001',
        name: 'QR Code Rastreabilidade',
        type: 'qrcode',
        field: 'produto.url',
        value: 'https://witiquetas.wrtec.com.br/p/7891234567890',
        x: 60,
        y: 20,
        width: 15,
        height: 15,
      },
      {
        id: 'line-001',
        name: 'Divisória Central',
        type: 'line',
        x: 5,
        y: 38,
        width: 90,
        height: 1,
        strokeWidth: 0.5,
        strokeColor: '#cbd5e1',
      },
    ],
  };

  // 1. Criar Modelo no Repository
  const created = await templateRepository.createTemplate(
    {
      title: originalDocument.title,
      name: originalDocument.title,
      document: originalDocument,
    },
    companyId
  );

  assert.ok(created.id, 'Modelo deve possuir ID único gerado.');
  assert.equal(created.companyId, companyId, 'Company ID deve corresponder ao tenant.');

  // 2. Recuperar Modelo Completo por ID
  const retrieved = await templateRepository.getTemplateById(created.id, companyId);
  assert.ok(retrieved, 'Modelo deve ser recuperável por ID.');

  const doc = retrieved!.document;

  // 3. Validação Semântica Estrita de Campos e Atributos
  assert.equal(doc.schemaVersion, originalDocument.schemaVersion, 'schemaVersion deve ser preservado.');
  assert.equal(doc.title, originalDocument.title, 'Título deve ser preservado.');
  assert.equal(doc.printerLanguage, originalDocument.printerLanguage, 'printerLanguage deve ser preservado.');

  // Dimensões & DPI
  assert.equal(doc.dimensions.widthMm, originalDocument.dimensions.widthMm, 'widthMm deve ser idêntico.');
  assert.equal(doc.dimensions.heightMm, originalDocument.dimensions.heightMm, 'heightMm deve ser idêntico.');
  assert.equal(doc.dimensions.dpi, originalDocument.dimensions.dpi, 'DPI deve ser idêntico.');
  assert.equal(doc.dimensions.orientation, originalDocument.dimensions.orientation, 'orientation deve ser idêntico.');

  // Quantidade e Identidade dos Elementos
  assert.equal(doc.elements.length, originalDocument.elements.length, 'Quantidade de elementos deve ser igual.');

  // Comparar cada elemento individualmente
  for (let i = 0; i < originalDocument.elements.length; i++) {
    const orig = originalDocument.elements[i];
    const actual = doc.elements[i];

    assert.equal(actual.id, orig.id, `Elemento ${i}: ID deve ser idêntico.`);
    assert.equal(actual.type, orig.type, `Elemento ${i}: Tipo deve ser idêntico.`);
    assert.equal(actual.x, orig.x, `Elemento ${i}: Coordenada X deve ser idêntica.`);
    assert.equal(actual.y, orig.y, `Elemento ${i}: Coordenada Y deve ser idêntica.`);
    assert.equal(actual.width, orig.width, `Elemento ${i}: Largura deve ser idêntica.`);
    assert.equal(actual.height, orig.height, `Elemento ${i}: Altura deve ser idêntica.`);
    assert.equal(actual.field, orig.field, `Elemento ${i}: Campo de binding deve ser idêntico.`);

    if (orig.type === 'text') {
      assert.equal(actual.format, orig.format, `Elemento ${i}: Formato de texto deve ser preservado.`);
      assert.deepEqual(actual.visibilityRule, orig.visibilityRule, `Elemento ${i}: Regra de exibição condicional deve ser idêntica.`);
    }
  }
});
