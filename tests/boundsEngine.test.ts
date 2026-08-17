import test from 'node:test';
import assert from 'node:assert/strict';
import {
  constrainElementToLabel,
  constrainGroupMovement,
  validateElementBounds,
  validateDocumentBounds,
  getElementBoundingBox,
} from '../apps/frontend/src/editor/bounds.ts';
import type { LabelElement, TextElement, QrCodeElement, BarcodeElement } from '../packages/label-schema/src/types.ts';

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
  assert.equal(constrained.x, 70, 'x deve ser ajustado para 100 - 30 = 70');
  assert.equal(constrained.width, 30);
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
  assert.equal(constrained.y, 20, 'y deve ser ajustado para 30 - 10 = 20');
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
  assert.equal(constrained.width, 100, 'largura não pode ultrapassar 100 mm');
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
  assert.equal(constrained.x, 65, 'Código de barras deve caber inteiro dentro de 100mm (100 - 35 = 65)');
  assert.ok(constrained.width >= 10, 'Código de barras deve manter largura mínima para leitura óptica');
});

test('7. Rotação: Considera bounding box transformado (90 e 270 graus invertem w e h)', () => {
  const elemRotated: TextElement = {
    id: 't-rot',
    name: 'Texto Vertical',
    type: 'text',
    text: 'LATERAL',
    x: 95, // 95 + bboxW(10) = 105 > 100
    y: 5,  // 5 + bboxH(25) = 30 <= 30
    width: 25,
    height: 10,
    rotation: 90,
  };

  const bbox = getElementBoundingBox(elemRotated);
  assert.equal(bbox.width, 10, 'Aos 90°, a largura do bounding box é a altura do elemento (10)');
  assert.equal(bbox.height, 25, 'Aos 90°, a altura do bounding box é a largura do elemento (25)');

  const constrained = constrainElementToLabel(elemRotated, label100x30);
  assert.equal(constrained.x, 90, 'x deve ser limitado a 100 - 10 = 90 mm');
  assert.equal(constrained.y, 5, 'y deve ser mantido em 5 mm');
});

test('8. Movimentação Múltipla de Grupo: Preserva distância relativa sem comprimir elementos', () => {
  const el1: LabelElement = { id: '1', name: 'A', type: 'text', text: 'A', x: 10, y: 5, width: 20, height: 10 };
  const el2: LabelElement = { id: '2', name: 'B', type: 'text', text: 'B', x: 50, y: 5, width: 20, height: 10 };

  const initialDistance = el2.x - (el1.x + el1.width); // 50 - 30 = 20mm

  // Tentar mover +40mm para a direita (el2 chegaria em 50+40+20 = 110mm > 100mm)
  const { dxMm, dyMm } = constrainGroupMovement([el1, el2], 40, 0, label100x30);

  // O grupo inteiro deve andar apenas 30mm (pois el2maxX = 70 + 30 = 100)
  assert.equal(dxMm, 30, 'dxMm deve ser clampado para o grupo inteiro parar na borda');
  assert.equal(dyMm, 0);

  const newEl1X = el1.x + dxMm; // 40
  const newEl2X = el2.x + dxMm; // 80

  const finalDistance = newEl2X - (newEl1X + el1.width); // 80 - (40 + 20) = 20mm
  assert.equal(finalDistance, initialDistance, 'A distância relativa entre elementos do grupo foi estritamente preservada');
});

test('9. Validador de Limites: Detecta violação com mensagem precisa em mm', () => {
  const legacyElement: TextElement = {
    id: 'leg-1',
    name: 'Nome do Produto',
    type: 'text',
    text: 'REFRIGERANTE COCA-COLA 2L',
    x: 80,
    y: 5,
    width: 22.4, // 80 + 22.4 = 102.4 mm (ultrapassa em 2.4 mm)
    height: 10,
  };

  const violation = validateElementBounds(legacyElement, label100x30);
  assert.equal(violation.isOutOfBounds, true);
  assert.equal(violation.overflowRightMm, 2.4);
  assert.equal(
    violation.message,
    '"Nome do Produto" ultrapassa a borda direita em 2,4 mm.'
  );
});

test('10. Modelo Importado: Coordenadas legadas fora da área não são alteradas silenciosamente no documento', () => {
  const importedDoc = {
    dimensions: label100x30,
    elements: [
      {
        id: 'legacy-elem',
        name: 'Preço Legado',
        type: 'price' as const,
        field: 'produto.preco',
        x: 85,
        y: 25, // 25 + 10 = 35 > 30 (ultrapassa borda inferior em 5.0 mm)
        width: 15,
        height: 10,
        sourceReference: { state: 'imported' as const, format: 'pplb' as const, rawCommand: 'A85,25...' },
      },
    ],
  };

  const violations = validateDocumentBounds(importedDoc);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].elementId, 'legacy-elem');
  assert.equal(violations[0].message, '"Preço Legado" ultrapassa a borda inferior em 5 mm.');
  assert.equal(importedDoc.elements[0].y, 25, 'y original do arquivo importado NÃO foi alterado');
});
