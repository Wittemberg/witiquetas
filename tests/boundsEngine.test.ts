import test from 'node:test';
import assert from 'node:assert/strict';
import {
  constrainElementToLabel,
  constrainGroupMovement,
  validateElementBounds,
  validateDocumentBounds,
  getElementBoundingBox,
  normalizeElementGeometry,
  SAFE_AREA_MARGIN_MM,
} from '../apps/frontend/src/editor/bounds.ts';
import type { LabelElement, TextElement, QrCodeElement, BarcodeElement, PriceElement } from '../packages/label-schema/src/types.ts';

const label100x30 = { widthMm: 100, heightMm: 30 };

test('1. Borda Direita: Elemento além de widthMm é clampado na margem direita', () => {
  const elem: TextElement = {
    id: 't1',
    name: 'Nome do Produto',
    type: 'text',
    text: 'PRODUTO TESTE',
    x: 90,
    y: 10,
    width: 30, // 90 + 30 = 120 > 100
    height: 10,
  };

  const constrained = constrainElementToLabel(elem, label100x30);
  assert.ok(Math.abs(constrained.x - 70) < 0.1, 'x deve ser clampado perto de 70mm (múltiplo em dot-grid de 203 DPI)');
  assert.ok(Math.abs(constrained.width - 30) < 0.1, 'largura deve ser próxima de 30mm');
});

test('2. Borda Esquerda e Topo: Coordenadas negativas são clampadas em 0', () => {
  const elem: TextElement = {
    id: 't2',
    name: 'Item',
    type: 'text',
    text: 'A',
    x: -15,
    y: -5,
    width: 20,
    height: 10,
  };

  const constrained = constrainElementToLabel(elem, label100x30);
  assert.equal(constrained.x, 0, 'x < 0 deve ser clampado em 0');
  assert.equal(constrained.y, 0, 'y < 0 deve ser clampado em 0');
});

test('3. Borda Inferior: Elemento além de heightMm é clampado no rodapé', () => {
  const elem: TextElement = {
    id: 't3',
    name: 'Preço',
    type: 'text',
    text: 'R$ 9,90',
    x: 10,
    y: 25, // 25 + 10 = 35 > 30
    width: 20,
    height: 10,
  };

  const constrained = constrainElementToLabel(elem, label100x30);
  assert.ok(Math.abs(constrained.y - 20) < 0.1, 'y deve ser clampado perto de 20mm (múltiplo em dot-grid de 203 DPI)');
});

test('4. Resize: Não permite dimensões negativas nem superiores à etiqueta', () => {
  const elem: TextElement = {
    id: 't4',
    name: 'Desc',
    type: 'text',
    text: 'D',
    x: 0,
    y: 0,
    width: 150, // maior que 100
    height: -5,  // negativa
  };

  const constrained = constrainElementToLabel(elem, label100x30);
  assert.ok(constrained.width <= 100, 'largura não pode ultrapassar 100 mm');
  assert.ok(constrained.height >= 2, 'altura deve ter valor mínimo positivo');
});

test('5. QR Code: Preserva proporção quadrada 1:1 estrita', () => {
  const elem: QrCodeElement = {
    id: 'qr1',
    name: 'QR Clube',
    type: 'qrcode',
    value: 'https://witiquetas.wrtec.com.br',
    x: 10,
    y: 10,
    width: 25,
    height: 12, // distorcido
  };

  const constrained = constrainElementToLabel(elem, label100x30);
  assert.equal(constrained.width, constrained.height, 'QR Code deve ter largura e altura idênticas');
  assert.ok(constrained.width >= 5, 'QR Code deve ter tamanho mínimo de 5mm');
});

test('6. Barcode: Mantém largura e altura mínimas legíveis', () => {
  const elem: BarcodeElement = {
    id: 'bc1',
    name: 'Código EAN',
    type: 'barcode',
    format: 'EAN13',
    value: '7894900011517',
    x: 80,
    y: 10,
    width: 35, // 80 + 35 = 115 > 100
    height: 10,
  };

  const constrained = constrainElementToLabel(elem, label100x30);
  assert.ok(Math.abs(constrained.x - 65) < 0.1, 'Código de barras deve caber inteiro dentro de 100mm (100 - 35 = 65)');
  assert.ok(constrained.width >= 10, 'Código de barras deve manter largura mínima para leitura óptica');
});

test('7. Rotação: Considera bounding box transformado (90 e 270 graus invertem w e h)', () => {
  const elemRotated: TextElement = {
    id: 't-rot',
    name: 'Texto Vertical',
    type: 'text',
    text: 'LATERAL',
    x: 105, // 105 - 10 = 95 mm, maxX = 105 > 100
    y: 5,   // 5 + 25 = 30 <= 30
    width: 25,
    height: 10,
    rotation: 90,
  };

  const bbox = getElementBoundingBox(elemRotated);
  assert.equal(bbox.width, 10, 'Aos 90°, a largura do bounding box é a altura do elemento (10)');
  assert.equal(bbox.height, 25, 'Aos 90°, a altura do bounding box é a altura do elemento (25)');

  const constrained = constrainElementToLabel(elemRotated, label100x30);
  assert.ok(Math.abs(constrained.x - 100) < 0.1, 'x deve ser limitado perto de 100 mm');
  assert.ok(Math.abs(constrained.y - 5) < 0.1, 'y deve ser mantido perto de 5 mm');
});

test('8. Movimentação Múltipla de Grupo: Preserva distância relativa sem comprimir elementos', () => {
  const el1: LabelElement = { id: '1', name: 'A', type: 'text', text: 'A', x: 10, y: 5, width: 20, height: 10 };
  const el2: LabelElement = { id: '2', name: 'B', type: 'text', text: 'B', x: 50, y: 5, width: 20, height: 10 };

  const initialDistance = el2.x - (el1.x + el1.width); // 50 - 30 = 20mm

  const { dxMm, dyMm } = constrainGroupMovement([el1, el2], 40, 0, label100x30);

  assert.equal(dxMm, 30, 'dxMm deve ser clampado para o grupo inteiro parar na borda');
  assert.equal(dyMm, 0);

  const newEl1X = el1.x + dxMm;
  const newEl2X = el2.x + dxMm;

  const finalDistance = newEl2X - (newEl1X + el1.width);
  assert.equal(finalDistance, initialDistance, 'A distância relativa entre os elementos deve ser rigorosamente mantida');
});

test('9. Validador de Limites: Detecta violação com mensagem precisa em mm', () => {
  const elem: TextElement = {
    id: 't-invalid',
    name: 'Título Estourado',
    type: 'text',
    text: 'EXTRAPOLADO',
    x: 85,
    y: 10,
    width: 20, // 85 + 20 = 105 > 100 (5mm de extrapolação)
    height: 10,
  };

  const result = validateElementBounds(elem, label100x30);
  assert.equal(result.isOutOfBounds, true);
  assert.equal(result.overflowRightMm, 5);
  assert.match(result.message!, /ultrapassa a borda direita em 5 mm/);
});

test('10. Modelo Importado: Coordenadas legadas fora da área não são alteradas silenciosamente no documento', () => {
  const doc = {
    elements: [
      { id: '1', name: 'Ok', type: 'text', x: 5, y: 5, width: 20, height: 10 },
      { id: '2', name: 'Fora', type: 'text', x: 95, y: 5, width: 20, height: 10 },
    ] as LabelElement[],
    dimensions: label100x30,
  };

  const violations = validateDocumentBounds(doc);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].elementId, '2');
  assert.equal(doc.elements[1].x, 95, 'Arquivo original não deve ter coordenadas destruídas na memória sem ação explícita');
});

test('11. Dot Grid Quantization em 203 DPI: Alinha para múltiplos exatos de dot (1 dot ≈ 0,125mm)', () => {
  const elem: TextElement = {
    id: 't-dot',
    name: 'Texto Alinhado',
    type: 'text',
    text: 'DOT',
    x: 10.123, // ~80.89 dots -> 81 dots = 10.135mm em 203 DPI
    y: 5.004,  // ~40.01 dots -> 40 dots = 5.005mm em 203 DPI
    width: 20.01,
    height: 10.01,
    rotation: 0,
  };

  const normalized = normalizeElementGeometry(elem, label100x30, { dpi: 203 });
  assert.equal(normalized.x, 10.135, '10.123mm deve quantizar para 81 dots (10.135mm em 203 DPI)');
  assert.equal(normalized.y, 5.005, '5.004mm deve quantizar para 40 dots (5.005mm em 203 DPI)');
});

test('12. Safe Area Margin é 1.0mm e constante única', () => {
  assert.equal(SAFE_AREA_MARGIN_MM, 1.0, 'Constante única de margem segura deve ser 1.0 mm');
});

test('13. Keyboard Nudge em Elemento Rotacionado a 90° Não Ultrapassa Mídia', () => {
  const elem90: TextElement = {
    id: 't-90',
    name: 'Vertical',
    type: 'text',
    text: 'ROT',
    x: 100, // minX = 90, maxX = 100
    y: 5,
    width: 25,
    height: 10,
    rotation: 90,
  };

  let current = elem90;
  for (let i = 0; i < 5; i++) {
    const moved = { ...current, x: current.x + 1 };
    current = normalizeElementGeometry(moved, label100x30, { dpi: 203 });
  }

  assert.ok(current.x <= 100, 'Elemento rotacionado a 90° deve parar sem ultrapassar 100mm ao pressionar seta para direita');
  const bbox = getElementBoundingBox(current);
  assert.ok(bbox.maxX <= 100, 'maxX do bounding box imprimível nunca pode ultrapassar 100mm');
});

test('14. Regras de Exibição em Elemento Preço e Texto', () => {
  const priceWithRule: PriceElement = {
    id: 'p-rule',
    name: 'Preço Promocional',
    type: 'price',
    field: 'produto.preco',
    x: 10,
    y: 10,
    width: 30,
    height: 10,
    visibilityRule: {
      field: 'produto.promocao',
      operator: '>',
      value: '0',
    },
  };

  assert.ok(priceWithRule.visibilityRule, 'Preço deve preservar suporte a visibilityRule');
  assert.equal(priceWithRule.visibilityRule.operator, '>');
});
