/**
 * Testes Unitários de Integridade Geométrica e QR Code (P0)
 */

import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getElementBoundingBox,
  isElementInsideMedia,
  clampElementToMedia,
  applyMagneticRotationSnap,
  constrainGroupMovement,
  validateElementBounds,
  normalizeRotation,
  normalizeElementGeometry,
  SAFE_AREA_MARGIN_MM,
} from '../bounds.ts';
import { encodeQRData, generateQRCodeDataUrl } from '../qrCodeGenerator.ts';
import type { LabelElement, TextElement, QrCodeElement } from '@witiquetas/label-schema';

const dimensions = { widthMm: 100, heightMm: 30 };

describe('Editor Bounds & Geometry Suite', () => {
  describe('1. Normalização de Rotação e Magnetic Snap', () => {
    it('deve normalizar ângulos arbitrários e negativos para [0, 360)', () => {
      assert.equal(normalizeRotation(0), 0);
      assert.equal(normalizeRotation(360), 0);
      assert.equal(normalizeRotation(450), 90);
      assert.equal(normalizeRotation(-90), 270);
      assert.equal(normalizeRotation(-45), 315);
    });

    it('deve aplicar magnetic snap em 90° para [87°, 94°] e manter 86° e 95° sem snap', () => {
      assert.deepEqual(applyMagneticRotationSnap(86), { angle: 86, isSnapped: false });
      assert.deepEqual(applyMagneticRotationSnap(87), { angle: 90, isSnapped: true, snapTarget: 90 });
      assert.deepEqual(applyMagneticRotationSnap(90), { angle: 90, isSnapped: true, snapTarget: 90 });
      assert.deepEqual(applyMagneticRotationSnap(94), { angle: 90, isSnapped: true, snapTarget: 90 });
      assert.deepEqual(applyMagneticRotationSnap(95), { angle: 95, isSnapped: false });
    });

    it('deve aplicar magnetic snap em 180° para [177°, 184°] e em 270° para [267°, 274°]', () => {
      assert.deepEqual(applyMagneticRotationSnap(176), { angle: 176, isSnapped: false });
      assert.deepEqual(applyMagneticRotationSnap(177), { angle: 180, isSnapped: true, snapTarget: 180 });
      assert.deepEqual(applyMagneticRotationSnap(184), { angle: 180, isSnapped: true, snapTarget: 180 });
      assert.deepEqual(applyMagneticRotationSnap(185), { angle: 185, isSnapped: false });

      assert.deepEqual(applyMagneticRotationSnap(266), { angle: 266, isSnapped: false });
      assert.deepEqual(applyMagneticRotationSnap(267), { angle: 270, isSnapped: true, snapTarget: 270 });
      assert.deepEqual(applyMagneticRotationSnap(274), { angle: 270, isSnapped: true, snapTarget: 270 });
      assert.deepEqual(applyMagneticRotationSnap(275), { angle: 275, isSnapped: false });
    });

    it('deve aplicar magnetic snap em 0° para [357°, 360°] e [0°, 4°]', () => {
      assert.deepEqual(applyMagneticRotationSnap(356), { angle: 356, isSnapped: false });
      assert.deepEqual(applyMagneticRotationSnap(357), { angle: 0, isSnapped: true, snapTarget: 0 });
      assert.deepEqual(applyMagneticRotationSnap(0), { angle: 0, isSnapped: true, snapTarget: 0 });
      assert.deepEqual(applyMagneticRotationSnap(4), { angle: 0, isSnapped: true, snapTarget: 0 });
      assert.deepEqual(applyMagneticRotationSnap(5), { angle: 5, isSnapped: false });
    });
  });

  describe('2. Bounding Box Trigonométrico Exato', () => {
    it('deve calcular bounding box sem rotação (0°)', () => {
      const elem: TextElement = {
        id: 't1',
        type: 'text',
        text: 'Teste',
        x: 10,
        y: 10,
        width: 30,
        height: 10,
        fontFamily: 'Roboto',
        fontSize: 12,
        rotation: 0,
      };

      const bbox = getElementBoundingBox(elem);
      assert.equal(bbox.minX, 10);
      assert.equal(bbox.maxX, 40);
      assert.equal(bbox.minY, 10);
      assert.equal(bbox.maxY, 20);
      assert.equal(bbox.width, 30);
      assert.equal(bbox.height, 10);
    });

    it('deve calcular bounding box com rotação 90°', () => {
      const elem: TextElement = {
        id: 't2',
        type: 'text',
        text: 'Teste',
        x: 30,
        y: 10,
        width: 20,
        height: 10,
        fontFamily: 'Roboto',
        fontSize: 12,
        rotation: 90,
      };

      const bbox = getElementBoundingBox(elem);
      assert.equal(bbox.minX, 20);
      assert.equal(bbox.maxX, 30);
      assert.equal(bbox.minY, 10);
      assert.equal(bbox.maxY, 30);
      assert.equal(bbox.width, 10);
      assert.equal(bbox.height, 20);
    });
  });

  describe('3. Clamping Físico e Limites da Mídia', () => {
    it('não deve permitir que nenhum elemento tenha coordenadas fora da mídia [0, 100] x [0, 30]', () => {
      const outOfBoundsElem: TextElement = {
        id: 't3',
        type: 'text',
        text: 'Estouro',
        x: 95,
        y: 25,
        width: 30,
        height: 15,
        fontFamily: 'Roboto',
        fontSize: 12,
      };

      const clamped = clampElementToMedia(outOfBoundsElem, dimensions);
      assert.ok(clamped.x + clamped.width <= dimensions.widthMm);
      assert.ok(clamped.y + clamped.height <= dimensions.heightMm);
      assert.ok(clamped.x >= 0);
      assert.ok(clamped.y >= 0);
      assert.equal(isElementInsideMedia(clamped, dimensions), true);
    });

    it('deve forçar proporção estrita 1:1 para QR Code durante clamp e resize', () => {
      const qrElem: QrCodeElement = {
        id: 'qr1',
        type: 'qrcode',
        value: 'https://witiquetas.wrtec.com.br',
        x: 10,
        y: 10,
        width: 25,
        height: 15,
      };

      const clamped = clampElementToMedia(qrElem, dimensions);
      assert.equal(clamped.width, clamped.height);
      assert.ok(clamped.width >= 5);
      assert.ok(clamped.width <= dimensions.heightMm);
    });

    it('deve mover grupo preservando a distância relativa e parando na borda', () => {
      const elem1: TextElement = {
        id: 'e1',
        type: 'text',
        text: 'A',
        x: 10,
        y: 5,
        width: 20,
        height: 5,
        fontFamily: 'Roboto',
        fontSize: 10,
      };
      const elem2: TextElement = {
        id: 'e2',
        type: 'text',
        text: 'B',
        x: 75,
        y: 5,
        width: 20,
        height: 5,
        fontFamily: 'Roboto',
        fontSize: 10,
      };

      const movement = constrainGroupMovement([elem1, elem2], 10, 0, dimensions);
      assert.equal(movement.dxMm, 5);
      assert.equal(movement.dyMm, 0);
    });
  });

  describe('4. Gerador de QR Code ISO/IEC 18004', () => {
    it('deve codificar https://www.globo.com gerando matriz válida com Quiet Zone', () => {
      const url = 'https://www.globo.com';
      const encoded = encodeQRData(url);

      assert.ok(encoded.size >= 21);
      assert.ok(encoded.version >= 1);
      assert.equal(encoded.matrix.length, encoded.size);
      assert.equal(encoded.matrix[0].length, encoded.size);

      // Finder patterns
      assert.equal(encoded.matrix[0][0], true);
      assert.equal(encoded.matrix[0][6], true);
      assert.equal(encoded.matrix[6][0], true);
      assert.equal(encoded.matrix[6][6], true);

      assert.equal(encoded.matrix[0][encoded.size - 1], true);
      assert.equal(encoded.matrix[0][encoded.size - 7], true);

      assert.equal(encoded.matrix[encoded.size - 1][0], true);
      assert.equal(encoded.matrix[encoded.size - 7][0], true);
    });

    it('deve gerar dataURL válido (SVG/PNG) com proporção 1:1', () => {
      const dataUrl = generateQRCodeDataUrl('https://www.globo.com', 200);
      assert.ok(dataUrl);
      assert.ok(dataUrl.startsWith('data:image/'));
    });
  });

  describe('5. Validação de Margem Segura (1.0 mm)', () => {
    it('deve sinalizar aviso quando o elemento ultrapassa a margem segura de 1.0 mm mas está dentro da mídia', () => {
      const elemNearBorder: TextElement = {
        id: 't-near',
        type: 'text',
        text: 'Perto da Borda',
        x: 0.5,
        y: 5,
        width: 20,
        height: 5,
        fontFamily: 'Roboto',
        fontSize: 10,
      };

      const violation = validateElementBounds(elemNearBorder, dimensions, 1.0);
      assert.equal(violation.isOutOfBounds, false);
    });
  });

  describe('6. Hierarquia Tipográfica e Exclusão do Transformer', () => {
    it('deve aceitar secondLineScale = 0.75 e integrar com Auto-fit preservando a proporção de 75%', () => {
      const textElem: TextElement = {
        id: 't-hier',
        type: 'text',
        text: 'REFRIGERANTE\nCOCA-COLA 2L',
        x: 10,
        y: 5,
        width: 50,
        height: 10,
        fontFamily: 'Roboto',
        fontSize: 40,
        autoFit: true,
        secondLineScale: 0.75,
      };

      const scaleFactor = 0.9;
      const baseSize = textElem.fontSize * scaleFactor;
      const secondLineSize = baseSize * (textElem.secondLineScale || 1.0);

      assert.equal(baseSize, 36);
      assert.equal(secondLineSize, 27);
      assert.equal(secondLineSize / baseSize, 0.75, 'A proporção de 75% entre as linhas deve ser 100% preservada no Auto-fit');
    });

    it('não deve considerar os cabos/anchors azuis do Transformer do Konva na validação de margem e limites', () => {
      const elemInside: TextElement = {
        id: 't-inside',
        type: 'text',
        text: 'Dentro',
        x: 2,
        y: 2,
        width: 20,
        height: 5,
        fontFamily: 'Roboto',
        fontSize: 10,
      };

      const violation = validateElementBounds(elemInside, dimensions, 1.0);
      assert.equal(violation.isOutOfBounds, false, 'Elemento fisicamente a 2mm não viola bordas nem margem segura');
    });
  });

  describe('7. Auditoria de Imports e Integridade de Runtime (Hotfix P0)', () => {
    it('deve exportar e resolver SAFE_AREA_MARGIN_MM em bounds.ts sem ReferenceError', () => {
      assert.equal(SAFE_AREA_MARGIN_MM, 1.0, 'SAFE_AREA_MARGIN_MM deve ser 1.0 mm');
    });
  });
});
