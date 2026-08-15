import test from 'node:test';
import assert from 'node:assert/strict';

import { PPLBParser, dotsToMm } from '../apps/frontend/src/editor/importers/pplbParser.ts';
import { calculatePPLBTextGeometry, PPLB_FONT_CATALOG } from '../apps/frontend/src/editor/importers/pplbFontMetrics.ts';
import type { TextElement, PriceElement } from '../packages/label-schema/src/types.ts';

test('1. Comando A de Homologação: A10,18,0,2,2,2,N,"[[NOME,0,18]]"', () => {
  const sample = 'A10,18,0,2,2,2,N,"[[NOME,0,18]]"';
  const result = PPLBParser.parse(sample);

  assert.equal(result.document.elements.length, 1);
  const el = result.document.elements[0] as TextElement;

  assert.equal(el.type, 'text');
  assert.equal(el.x, dotsToMm(10, 203)); // 10 dots = 1.25 mm
  assert.equal(el.y, dotsToMm(18, 203)); // 18 dots = 2.25 mm
  assert.equal(el.rotation, 0);
  assert.equal(el.printerFontId, 2);
  assert.equal(el.horizontalMultiplier, 2);
  assert.equal(el.verticalMultiplier, 2);
  assert.equal(el.reversePrint, false);
  assert.equal(el.field, 'produto.descricao');
  assert.deepEqual(el.transformations, [{ type: 'substring', start: 0, length: 18 }]);

  // Geometria esperada da Font 2 (10x16 dots) com hMult=2, vMult=2 e capacidade 18 chars:
  // Largura: 10 dots * 2 * 18 chars = 360 dots = 45.06 mm
  // Altura: 16 dots * 2 = 32 dots = 4.01 mm
  const geo = calculatePPLBTextGeometry(2, 2, 2, 18, 203);
  assert.equal(el.width, geo.widthMm);
  assert.equal(el.height, geo.heightMm);
  assert.equal(el.autoFit, false, 'AutoFit deve ser false na importação inicial');
  assert.equal(el.sourceReference?.state, 'unchanged', 'Estado inicial deve ser unchanged');
});

test('2. Multiplicadores Independentes: hMult e vMult não se misturam', () => {
  // Caso 1x1
  const res1x1 = PPLBParser.parse('A10,20,0,2,1,1,N,"TESTE"');
  const el1x1 = res1x1.document.elements[0] as TextElement;
  assert.equal(el1x1.horizontalMultiplier, 1);
  assert.equal(el1x1.verticalMultiplier, 1);

  // Caso 2x1 (largura duplicada, altura padrão)
  const res2x1 = PPLBParser.parse('A10,20,0,2,2,1,N,"TESTE"');
  const el2x1 = res2x1.document.elements[0] as TextElement;
  assert.equal(el2x1.horizontalMultiplier, 2);
  assert.equal(el2x1.verticalMultiplier, 1);
  assert.equal(el2x1.height, el1x1.height, 'vMult=1 deve manter altura idêntica ao 1x1');
  assert.ok(el2x1.width > el1x1.width, 'hMult=2 deve dobrar largura');

  // Caso 1x2 (largura padrão, altura duplicada)
  const res1x2 = PPLBParser.parse('A10,20,0,2,1,2,N,"TESTE"');
  const el1x2 = res1x2.document.elements[0] as TextElement;
  assert.equal(el1x2.horizontalMultiplier, 1);
  assert.equal(el1x2.verticalMultiplier, 2);
  assert.equal(el1x2.width, el1x1.width, 'hMult=1 deve manter largura idêntica ao 1x1');
  assert.ok(el1x2.height > el1x1.height, 'vMult=2 deve dobrar altura');

  // Caso 3x2
  const res3x2 = PPLBParser.parse('A10,20,0,2,3,2,N,"TESTE"');
  const el3x2 = res3x2.document.elements[0] as TextElement;
  assert.equal(el3x2.horizontalMultiplier, 3);
  assert.equal(el3x2.verticalMultiplier, 2);
});

test('3. Catálogo de Fontes PPLB: Fontes 1, 2, 3, 4 e 5 Homologadas', () => {
  assert.equal(PPLB_FONT_CATALOG['1'].baseWidthDots, 8);
  assert.equal(PPLB_FONT_CATALOG['1'].baseHeightDots, 12);
  assert.equal(PPLB_FONT_CATALOG['1'].verified, true);

  assert.equal(PPLB_FONT_CATALOG['2'].baseWidthDots, 10);
  assert.equal(PPLB_FONT_CATALOG['2'].baseHeightDots, 16);
  assert.equal(PPLB_FONT_CATALOG['2'].verified, true);

  assert.equal(PPLB_FONT_CATALOG['3'].baseWidthDots, 12);
  assert.equal(PPLB_FONT_CATALOG['3'].baseHeightDots, 20);
  assert.equal(PPLB_FONT_CATALOG['3'].verified, true);

  assert.equal(PPLB_FONT_CATALOG['4'].baseWidthDots, 14);
  assert.equal(PPLB_FONT_CATALOG['4'].baseHeightDots, 24);
  assert.equal(PPLB_FONT_CATALOG['4'].verified, true);

  assert.equal(PPLB_FONT_CATALOG['5'].baseWidthDots, 32);
  assert.equal(PPLB_FONT_CATALOG['5'].baseHeightDots, 48);
  assert.equal(PPLB_FONT_CATALOG['5'].verified, true);
});

test('4. Literal Fixo: A10,160,0,4,2,2,N,"R$"', () => {
  const sample = 'A10,160,0,4,2,2,N,"R$"';
  const result = PPLBParser.parse(sample);
  const el = result.document.elements[0] as TextElement;

  assert.equal(el.type, 'text');
  assert.equal(el.text, 'R$');
  assert.equal(el.printerFontId, 4);
  assert.equal(el.horizontalMultiplier, 2);
  assert.equal(el.verticalMultiplier, 2);

  // Font 4 (14x24 dots), hMult=2, vMult=2, 2 caracteres = 2 * 14 * 2 = 56 dots = 7.01 mm
  const geo = calculatePPLBTextGeometry(4, 2, 2, 2, 203);
  assert.equal(el.width, geo.widthMm);
  assert.equal(el.height, geo.heightMm);
});

test('5. Impressão Reversa (Reverse Print R): A10,18,0,2,2,2,R,"INVERTIDO"', () => {
  const sample = 'A10,18,0,2,2,2,R,"INVERTIDO"';
  const result = PPLBParser.parse(sample);
  const el = result.document.elements[0] as TextElement;

  assert.equal(el.reversePrint, true, 'Parâmetro R deve configurar reversePrint=true');
});

test('6. Promoção Condicional: [[SE]]{{...}}{{A...}} preserva visibilityRule e métricas de fonte', () => {
  const sample = '[[SE]]{{[[PROMOCAO]]>0}}{{A550,45,0,4,2,2,N,"POR R$ [[PROMOCAO]]"}}';
  const result = PPLBParser.parse(sample);
  const el = result.document.elements[0] as PriceElement;

  assert.equal(el.type, 'price');
  assert.equal(el.printerFontId, 4);
  assert.equal(el.horizontalMultiplier, 2);
  assert.equal(el.verticalMultiplier, 2);
  assert.ok(el.visibilityRule);
  assert.equal(el.visibilityRule.field, 'produto.promocao.preco');
  assert.equal(el.visibilityRule.operator, '>');
});
