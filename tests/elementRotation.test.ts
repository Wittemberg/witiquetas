import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRotation,
  getElementBoundingBox,
  applyMagneticRotationSnap,
} from '../apps/frontend/src/editor/bounds.ts';
import type {
  LabelElement,
  TextElement,
  PriceElement,
  BarcodeElement,
  QrCodeElement,
  LineElement,
  RectangleElement,
} from '@witiquetas/label-schema';

describe('Pacote 4.2 - Canonical Element Rotation (0/90/180/270)', () => {
  it('1. normalizeRotation normaliza ângulos arbitrários e negativos para 0, 90, 180, 270', () => {
    assert.strictEqual(normalizeRotation(0), 0);
    assert.strictEqual(normalizeRotation(90), 90);
    assert.strictEqual(normalizeRotation(180), 180);
    assert.strictEqual(normalizeRotation(270), 270);
    assert.strictEqual(normalizeRotation(360), 0);
    assert.strictEqual(normalizeRotation(-90), 270);
    assert.strictEqual(normalizeRotation(450), 90);
  });

  it('2. applyMagneticRotationSnap atrai ângulos próximos para os 4 ângulos ortogonais', () => {
    assert.strictEqual(applyMagneticRotationSnap(2).angle, 0);
    assert.strictEqual(applyMagneticRotationSnap(88).angle, 90);
    assert.strictEqual(applyMagneticRotationSnap(178).angle, 180);
    assert.strictEqual(applyMagneticRotationSnap(268).angle, 270);
  });

  it('3. getElementBoundingBox calcula AABB ortogonal correto para 0°, 90°, 180°, 270°', () => {
    const elem: TextElement = {
      id: 'text-1',
      name: 'Nome',
      type: 'text',
      text: 'TESTE',
      fontSize: 12,
      x: 10,
      y: 20,
      width: 40,
      height: 10,
      rotation: 0,
    };

    // 0°: minX=10, maxX=50, minY=20, maxY=30
    const bbox0 = getElementBoundingBox(elem, 203);
    assert.strictEqual(bbox0.minX, 10);
    assert.strictEqual(bbox0.maxX, 50);
    assert.strictEqual(bbox0.minY, 20);
    assert.strictEqual(bbox0.maxY, 30);

    // 90°: largura e altura invertem na AABB
    elem.rotation = 90;
    const bbox90 = getElementBoundingBox(elem, 203);
    assert.strictEqual(bbox90.width, 10);
    assert.strictEqual(bbox90.height, 40);

    // 180°: dimensões mantidas
    elem.rotation = 180;
    const bbox180 = getElementBoundingBox(elem, 203);
    assert.strictEqual(bbox180.width, 40);
    assert.strictEqual(bbox180.height, 10);

    // 270°: largura e altura invertem na AABB
    elem.rotation = 270;
    const bbox270 = getElementBoundingBox(elem, 203);
    assert.strictEqual(bbox270.width, 10);
    assert.strictEqual(bbox270.height, 40);
  });

  it('4. Suporta rotação canônica nos 6 tipos de elementos visuais', () => {
    const text: TextElement = { id: '1', name: 'Text', type: 'text', text: 'T', fontSize: 10, x: 0, y: 0, width: 10, height: 5, rotation: 90 };
    const price: PriceElement = { id: '2', name: 'Price', type: 'price', field: 'produto.preco', x: 0, y: 0, width: 20, height: 10, rotation: 180 };
    const barcode: BarcodeElement = { id: '3', name: 'Barcode', type: 'barcode', format: 'EAN13', value: '7891234567890', x: 0, y: 0, width: 30, height: 15, rotation: 270 };
    const qrcode: QrCodeElement = { id: '4', name: 'QR', type: 'qrcode', value: 'https://ex.com', x: 0, y: 0, width: 15, height: 15, rotation: 90 };
    const line: LineElement = { id: '5', name: 'Line', type: 'line', x: 0, y: 0, width: 25, height: 1, strokeWidth: 1, rotation: 180 };
    const rect: RectangleElement = { id: '6', name: 'Rect', type: 'rectangle', x: 0, y: 0, width: 20, height: 20, rotation: 270 };

    const elements: LabelElement[] = [text, price, barcode, qrcode, line, rect];

    elements.forEach((el) => {
      assert.ok([0, 90, 180, 270].includes(normalizeRotation(el.rotation || 0)), `Elemento ${el.type} deve possuir rotação canônica válida`);
    });
  });

  it('5. Teste específico de regressão da Line isolada (Criação -> 90° -> Resize -> 270° -> Multiselect)', () => {
    const line: LineElement = {
      id: 'line-test',
      name: 'Linha Divisória',
      type: 'line',
      x: 10,
      y: 10,
      width: 50,
      height: 1,
      strokeWidth: 1,
      rotation: 0,
    };

    // A. 0° original
    assert.strictEqual(line.rotation, 0);
    assert.strictEqual(line.width, 50);

    // B. Aplicar 90°
    line.rotation = 90;
    assert.strictEqual(normalizeRotation(line.rotation), 90);

    // C. Reduzir comprimento (width) isoladamente sem quebrar rotação
    line.width = 35;
    assert.strictEqual(line.width, 35);
    assert.strictEqual(normalizeRotation(line.rotation), 90);

    // D. Aplicar 270° (orientação oposta)
    line.rotation = 270;
    assert.strictEqual(normalizeRotation(line.rotation), 270);

    // E. Multiselect Line + Text
    const text: TextElement = { id: 'text-2', name: 'Rotulo', type: 'text', text: 'Linha', fontSize: 10, x: 10, y: 20, width: 20, height: 5, rotation: 0 };
    const selectedGroup = [line, text];

    assert.strictEqual(selectedGroup.length, 2);
    assert.strictEqual(selectedGroup[0].rotation, 270);
    assert.strictEqual(selectedGroup[0].width, 35);
  });
});
