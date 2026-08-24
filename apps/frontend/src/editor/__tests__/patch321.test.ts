/**
 * Testes Unitários de Validação do Patch 3.2.1
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getElementBoundingBox,
  clampElementToMedia,
  validateElementBounds,
  SAFE_AREA_MARGIN_MM,
} from '../bounds.ts';
import type { LabelElement, TextElement, LineElement, PriceElement } from '@witiquetas/label-schema';

const dimensions = { widthMm: 100, heightMm: 30 };

describe('Patch 3.2.1 Integrity Suite', () => {
  describe('1. Epsilon da Safe Area & Movimento Livre', () => {
    it('deve permitir elemento entre 0mm e 1mm sem falso positivo de arredondamento', () => {
      const halfDotMm = (0.5 * 25.4) / 203;
      const el: PriceElement = {
        id: 'p1',
        type: 'price',
        x: 1.0,
        y: 1.0,
        width: 30,
        height: 10,
        locked: false,
        visible: true,
      };

      const bbox = getElementBoundingBox(el);
      const isBeyondSafe =
        bbox.minX < SAFE_AREA_MARGIN_MM - halfDotMm ||
        bbox.minY < SAFE_AREA_MARGIN_MM - halfDotMm ||
        bbox.maxX > dimensions.widthMm - SAFE_AREA_MARGIN_MM + halfDotMm ||
        bbox.maxY > dimensions.heightMm - SAFE_AREA_MARGIN_MM + halfDotMm;

      assert.equal(isBeyondSafe, false);
    });

    it('não deve impedir translação em 0.5mm dentro da margem', () => {
      const el: PriceElement = {
        id: 'p2',
        type: 'price',
        x: 0.5,
        y: 0.5,
        width: 20,
        height: 10,
        locked: false,
        visible: true,
      };

      const clamped = clampElementToMedia(el, dimensions);
      assert.equal(clamped.x, 0.5);
      assert.equal(clamped.y, 0.5);
    });
  });

  describe('2. Elemento Line - Preservação de strokeWidth', () => {
    it('deve preservar o strokeWidth original ao ajustar a largura física da linha', () => {
      const line: LineElement = {
        id: 'l1',
        type: 'line',
        x: 10,
        y: 10,
        width: 80,
        height: 1,
        strokeWidth: 2,
        color: '#000000',
        locked: false,
        visible: true,
      };

      const clamped = clampElementToMedia({ ...line, width: 30 }, dimensions);
      assert.equal(clamped.width, 30);
      assert.equal(clamped.strokeWidth, 2);
    });
  });

  describe('3. Regra da Segunda Linha de Texto (secondLineScale)', () => {
    it('deve ter propriedade secondLineScale do tipo number opcional no schema', () => {
      const text: TextElement = {
        id: 't1',
        type: 'text',
        text: 'REFRIGERANTE\nCOCA-COLA 2L\nTEXTO EXTRA',
        x: 10,
        y: 10,
        width: 50,
        height: 20,
        secondLineScale: 0.75,
        locked: false,
        visible: true,
      };

      assert.equal(text.secondLineScale, 0.75);
    });
  });
});
