import test from 'node:test';
import assert from 'node:assert/strict';

import { PPLBParser, dotsToMm } from '../apps/frontend/src/editor/importers/pplbParser.ts';
import { calculatePPLBBarcodeGeometry, PPLB_BARCODE_CATALOG } from '../apps/frontend/src/editor/importers/pplbBarcodeMetrics.ts';
import { LegacyCompiler } from '../apps/frontend/src/editor/importers/legacyCompiler.ts';
import type { BarcodeElement } from '../packages/label-schema/src/types.ts';

test('1. Teste Principal de Homologação: B10,95,0,E30,2,4,30,B,"[[BARRA]]"', () => {
  const sample = 'B10,95,0,E30,2,4,30,B,"[[BARRA]]"';
  const result = PPLBParser.parse(sample);

  assert.equal(result.document.elements.length, 1);
  const el = result.document.elements[0] as BarcodeElement;

  assert.equal(el.type, 'barcode');
  assert.equal(el.sourceBarcodeType, 'E30');
  assert.equal(el.format, 'EAN13');
  assert.equal(el.narrowBarDots, 2);
  assert.equal(el.wideBarDots, 4);
  assert.equal(el.barcodeHeightDots, 30);
  assert.equal(el.showText, true);
  assert.equal(el.field, 'produto.ean');
  assert.equal(el.rotation, 0);
  assert.equal(el.x, dotsToMm(10, 203)); // 10 dots = 1.25 mm
  assert.equal(el.y, dotsToMm(95, 203)); // 95 dots = 11.89 mm

  // Geometria esperada EAN-13 (95 módulos * 2 dots = 190 dots = 23.77 mm)
  // Altura: 30 dots de barra + 12 dots legenda = 42 dots = 5.25 mm (Sem coerção arbitrária para 8mm e sem hardcode 37.5mm!)
  const geo = calculatePPLBBarcodeGeometry('E30', 2, 4, 30, '[[BARRA]]', true, 203);
  assert.equal(el.width, geo.widthMm); // 23.77 mm
  assert.equal(el.height, geo.heightMm); // 5.25 mm
  assert.equal(el.sourceReference?.state, 'unchanged');
});

test('2. Human-Readable Desligado: B10,95,0,E30,2,4,30,N,"[[BARRA]]"', () => {
  const sample = 'B10,95,0,E30,2,4,30,N,"[[BARRA]]"';
  const result = PPLBParser.parse(sample);
  const el = result.document.elements[0] as BarcodeElement;

  assert.equal(el.showText, false, 'Parâmetro N deve configurar showText=false');
  assert.equal(el.width, 23.77, 'Largura das barras deve permanecer idêntica');
  assert.equal(el.height, dotsToMm(30, 203), 'Altura sem texto deve ser exatamente 30 dots = 3.75 mm');
});

test('3. Alturas Diferentes: 30, 50 e 100 dots não afetam a largura', () => {
  const res30 = PPLBParser.parse('B10,95,0,E30,2,4,30,N,"[[BARRA]]"').document.elements[0] as BarcodeElement;
  const res50 = PPLBParser.parse('B10,95,0,E30,2,4,50,N,"[[BARRA]]"').document.elements[0] as BarcodeElement;
  const res100 = PPLBParser.parse('B10,95,0,E30,2,4,100,N,"[[BARRA]]"').document.elements[0] as BarcodeElement;

  assert.equal(res30.width, res50.width);
  assert.equal(res50.width, res100.width);

  assert.equal(res30.barcodeHeightDots, 30);
  assert.equal(res50.barcodeHeightDots, 50);
  assert.equal(res100.barcodeHeightDots, 100);

  assert.equal(res30.height, dotsToMm(30, 203));
  assert.equal(res50.height, dotsToMm(50, 203));
  assert.equal(res100.height, dotsToMm(100, 203));
});

test('4. Narrow Bar Diferentes: narrow=1, narrow=2 e narrow=3 alteram largura de forma proporcional', () => {
  const resNarrow1 = PPLBParser.parse('B10,95,0,E30,1,4,30,N,"[[BARRA]]"').document.elements[0] as BarcodeElement;
  const resNarrow2 = PPLBParser.parse('B10,95,0,E30,2,4,30,N,"[[BARRA]]"').document.elements[0] as BarcodeElement;
  const resNarrow3 = PPLBParser.parse('B10,95,0,E30,3,4,30,N,"[[BARRA]]"').document.elements[0] as BarcodeElement;

  assert.equal(resNarrow1.narrowBarDots, 1);
  assert.equal(resNarrow2.narrowBarDots, 2);
  assert.equal(resNarrow3.narrowBarDots, 3);

  // 95 módulos * 1 dot = 95 dots = 11.89 mm
  // 95 módulos * 2 dots = 190 dots = 23.77 mm
  // 95 módulos * 3 dots = 285 dots = 35.66 mm
  assert.equal(resNarrow1.width, 11.89);
  assert.equal(resNarrow2.width, 23.77);
  assert.equal(resNarrow3.width, 35.66);
});

test('5. Simbologias Suportadas: EAN-8 e Code 128 calculam módulos específicos', () => {
  // EAN-8: 67 módulos * 2 dots = 134 dots = 16.77 mm (134 * 25.4 / 203 = 16.7665)
  const resEan8 = PPLBParser.parse('B10,95,0,8,2,4,40,B,"12345670"').document.elements[0] as BarcodeElement;
  assert.equal(resEan8.format, 'EAN8');
  assert.equal(resEan8.sourceBarcodeType, '8');
  assert.equal(resEan8.width, 16.77);

  // Code 128 com 7 caracteres: (7 + 3) * 11 + 2 = 112 módulos * 2 dots = 224 dots = 28.03 mm (224 * 25.4 / 203 = 28.0275)
  const resCode128 = PPLBParser.parse('B10,95,0,1,2,4,40,B,"ABC1234"').document.elements[0] as BarcodeElement;
  assert.equal(resCode128.format, 'CODE128');
  assert.equal(resCode128.sourceBarcodeType, '1');
  assert.equal(resCode128.width, 28.03);
});

test('6. Round-Trip Editável: Modificação localizada de altura preserva todos os outros parâmetros', () => {
  const sample = 'B80,110,0,E30,2,4,30,B,"[[BARRA]]"';
  const importResult = PPLBParser.parse(sample);
  const barcode = importResult.document.elements[0] as BarcodeElement;

  // 1. Sem alteração -> Diff Zero
  const compileClean = LegacyCompiler.compile(importResult.document);
  assert.equal(compileClean.diffSummary.modifiedCount, 0);

  // 2. Modificar apenas a altura para 50 dots
  barcode.barcodeHeightDots = 50;
  barcode.height = dotsToMm(50, 203);
  if (barcode.sourceReference) {
    barcode.sourceReference.state = 'modified';
  }

  const compileModified = LegacyCompiler.compile(importResult.document);
  assert.equal(compileModified.diffSummary.modifiedCount, 1);
  assert.ok(
    compileModified.compiledCode.includes('B80,110,0,E30,2,4,50,B,"[[BARRA]]"'),
    `Esperado novo comando com altura 50, obtido: ${compileModified.compiledCode}`
  );
});

test('7. Round-Trip Editável: Modificação localizada de ShowText preserva parâmetros', () => {
  const sample = 'B80,110,0,E30,2,4,30,B,"[[BARRA]]"';
  const importResult = PPLBParser.parse(sample);
  const barcode = importResult.document.elements[0] as BarcodeElement;

  barcode.showText = false;
  if (barcode.sourceReference) {
    barcode.sourceReference.state = 'modified';
  }

  const compiled = LegacyCompiler.compile(importResult.document);
  assert.ok(
    compiled.compiledCode.includes('B80,110,0,E30,2,4,30,N,"[[BARRA]]"'),
    `Esperado parâmetro N para showText=false, obtido: ${compiled.compiledCode}`
  );
});
