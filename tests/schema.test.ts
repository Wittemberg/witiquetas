import test from 'node:test';
import assert from 'node:assert/strict';

import type {
  LabelDocument,
  TextElement,
  PriceElement,
  BarcodeElement,
} from '../packages/label-schema/src/types.ts';
import {
  LabelDocumentSchema,
  TextElementSchema,
  PriceElementSchema,
  BarcodeElementSchema,
} from '../packages/label-schema/src/schema.ts';

test('1. Retrocompatibilidade: Documento legado sem novas propriedades valida 100%', () => {
  const legacyDoc: LabelDocument = {
    schemaVersion: 1,
    title: 'Etiqueta Legada Padrão',
    dimensions: {
      widthMm: 100,
      heightMm: 30,
      dpi: 203,
      orientation: 'landscape',
    },
    elements: [
      {
        id: 'txt-1',
        type: 'text',
        text: 'PRODUTO EXEMPLO',
        fontFamily: 'Inter',
        fontSize: 12,
        x: 10,
        y: 5,
        width: 80,
        height: 6,
      },
      {
        id: 'bar-1',
        type: 'barcode',
        format: 'EAN13',
        value: '7891234567895',
        showText: true,
        x: 10,
        y: 15,
        width: 38,
        height: 12,
      },
    ],
  };

  const validation = LabelDocumentSchema.safeParse(legacyDoc);
  assert.equal(validation.success, true, 'Documento legado deve validar com sucesso');
});

test('2. TextElement: Valida e aceita todas as novas propriedades técnicas de fonte', () => {
  const textElem: TextElement = {
    id: 'txt-pplb-1',
    name: 'Nome do Produto PPLB',
    type: 'text',
    text: 'SABONETE LIQUIDO 250ML',
    field: 'produto.descricao',
    fontFamily: 'Inter',
    fontSize: 14,
    x: 10,
    y: 5,
    width: 60,
    height: 8,
    // Novas propriedades técnicas opcionais
    printerFontId: 2,
    horizontalMultiplier: 2,
    verticalMultiplier: 3,
    scaleX: 2.0,
    reversePrint: false,
  };

  const validation = TextElementSchema.safeParse(textElem);
  assert.equal(validation.success, true, 'TextElement com propriedades técnicas de fonte deve ser válido');
  
  if (validation.success) {
    assert.equal(textElem.printerFontId, 2);
    assert.equal(textElem.horizontalMultiplier, 2);
    assert.equal(textElem.verticalMultiplier, 3);
    assert.equal(textElem.scaleX, 2.0);
    assert.equal(textElem.reversePrint, false);
  }
});

test('3. PriceElement: Valida e aceita propriedades técnicas de fonte e reverse print', () => {
  const priceElem: PriceElement = {
    id: 'price-pplb-1',
    name: 'Preço Promocional PPLB',
    type: 'price',
    field: 'produto.promocao.preco',
    prefix: 'R$',
    sampleValue: '19,90',
    reducedCents: true,
    fontFamily: 'Roboto',
    x: 50,
    y: 10,
    width: 40,
    height: 12,
    // Propriedades técnicas
    printerFontId: 4,
    horizontalMultiplier: 2,
    verticalMultiplier: 2,
    scaleX: 1.5,
    reversePrint: true,
  };

  const validation = PriceElementSchema.safeParse(priceElem);
  assert.equal(validation.success, true, 'PriceElement com propriedades técnicas deve ser válido');
  
  if (validation.success) {
    assert.equal(priceElem.printerFontId, 4);
    assert.equal(priceElem.reversePrint, true);
  }
});

test('4. BarcodeElement: Valida e preserva parâmetros nativos narrow, wide, height e sourceBarcodeType', () => {
  const barcodeElem: BarcodeElement = {
    id: 'bar-pplb-1',
    name: 'Código de Barras PPLB',
    type: 'barcode',
    format: 'EAN13',
    field: 'produto.ean',
    value: '7891234567895',
    showText: true,
    x: 10,
    y: 15,
    width: 35,
    height: 10,
    // Novas propriedades técnicas opcionais
    narrowBarDots: 2,
    wideBarDots: 4,
    barcodeHeightDots: 30,
    sourceBarcodeType: 'E30',
  };

  const validation = BarcodeElementSchema.safeParse(barcodeElem);
  assert.equal(validation.success, true, 'BarcodeElement com parâmetros técnicos deve ser válido');
  
  if (validation.success) {
    assert.equal(barcodeElem.narrowBarDots, 2);
    assert.equal(barcodeElem.wideBarDots, 4);
    assert.equal(barcodeElem.barcodeHeightDots, 30);
    assert.equal(barcodeElem.sourceBarcodeType, 'E30');
  }
});

test('5. Serialização e Imutabilidade: JSON.stringify e JSON.parse preservam 100% dos dados', () => {
  const fullDoc: LabelDocument = {
    schemaVersion: 1,
    title: 'Etiqueta com Metadados Nativos',
    dimensions: {
      widthMm: 100,
      heightMm: 30,
      dpi: 203,
    },
    elements: [
      {
        id: 'txt-1',
        type: 'text',
        text: 'PRODUTO',
        fontFamily: 'Inter',
        fontSize: 12,
        x: 10,
        y: 5,
        width: 80,
        height: 6,
        printerFontId: 3,
        horizontalMultiplier: 2,
        verticalMultiplier: 2,
        scaleX: 2.0,
        reversePrint: true,
      },
      {
        id: 'bar-1',
        type: 'barcode',
        format: 'EAN13',
        value: '7891234567895',
        showText: true,
        x: 10,
        y: 15,
        width: 38,
        height: 12,
        narrowBarDots: 2,
        wideBarDots: 5,
        barcodeHeightDots: 60,
        sourceBarcodeType: '1',
      },
    ],
  };

  const serialized = JSON.stringify(fullDoc);
  const parsed: LabelDocument = JSON.parse(serialized);

  assert.deepEqual(parsed, fullDoc, 'Objeto deserializado deve ser idêntico ao original');
  
  const parsedText = parsed.elements[0] as TextElement;
  assert.equal(parsedText.printerFontId, 3);
  assert.equal(parsedText.horizontalMultiplier, 2);
  assert.equal(parsedText.verticalMultiplier, 2);
  assert.equal(parsedText.reversePrint, true);

  const parsedBar = parsed.elements[1] as BarcodeElement;
  assert.equal(parsedBar.narrowBarDots, 2);
  assert.equal(parsedBar.wideBarDots, 5);
  assert.equal(parsedBar.barcodeHeightDots, 60);
  assert.equal(parsedBar.sourceBarcodeType, '1');
});
