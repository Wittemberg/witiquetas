import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPriceVisualGeometry, getElementBoundingBox, clampElementToMedia, computeTextLines } from '../bounds.js';
import type { PriceElement } from '@witiquetas/label-schema';
import fs from 'node:fs';
import path from 'node:path';

describe('FASE 3.5 — PATCH 3.2.2 SUITE DE TESTES', () => {
  describe('1. Price Geometry - Geometria Visual Isolada', () => {
    it('deve calcular a caixa visual do PriceElement sem alterar a largura e altura persistidas', () => {
      const priceElem: PriceElement = {
        id: 'p1',
        type: 'price',
        x: 10,
        y: 10,
        width: 35,
        height: 15,
        sampleValue: '9.99',
        prefix: 'R$',
        reducedCents: true,
        locked: false,
        visible: true,
      };

      const visualGeom = getPriceVisualGeometry(priceElem, 203);
      assert.equal(priceElem.width, 35);
      assert.equal(priceElem.height, 15);
      assert.equal(visualGeom.width, 35);
      assert.ok(visualGeom.height < 15, 'Altura visual deve ser menor que a caixa inflada de 15mm');
      assert.ok(visualGeom.y > 10, 'Y visual deve incluir o offset de centralização vertical');
    });

    it('deve permitir arrasto vertical do PriceElement sem falso travamento em 15mm', () => {
      const priceElem: PriceElement = {
        id: 'p1',
        type: 'price',
        x: 10,
        y: 20,
        width: 35,
        height: 8,
        sampleValue: '9.99',
        prefix: 'R$',
        reducedCents: true,
        locked: false,
        visible: true,
      };

      const dimensions = { widthMm: 100, heightMm: 30 };
      const clamped = clampElementToMedia(priceElem, dimensions);

      assert.equal(clamped.y, 20, 'PriceElement com height 8mm posicionado em y=20mm não deve ser travado em 15mm');
      assert.equal(clamped.width, 35);
      assert.equal(clamped.height, 8);
    });

    it('não deve disparar alerta de Safe Area para PriceElement centralizado', () => {
      const priceElem: PriceElement = {
        id: 'p1',
        type: 'price',
        x: 10,
        y: 10,
        width: 35,
        height: 15,
        sampleValue: '9.99',
        prefix: 'R$',
        reducedCents: true,
        locked: false,
        visible: true,
      };

      const bbox = getElementBoundingBox(priceElem);
      const safeMargin = 1.0;
      const isBeyondSafe = bbox.minX < safeMargin || bbox.minY < safeMargin || bbox.maxX > 100 - safeMargin || bbox.maxY > 30 - safeMargin;

      assert.equal(isBeyondSafe, false, 'Preço centralizado não deve ultrapassar a margem segura de 1mm');
    });
  });

  describe('2. Second Line Wrap - Algoritmo Determinístico de Linhas', () => {
    it('deve separar parágrafos por \\n de forma determinística', () => {
      const text = 'Linha 1\nLinha 2\nLinha 3';
      const lines = computeTextLines(text, 'Roboto', 16, 'normal', 200);

      assert.equal(lines.length, 3);
      assert.equal(lines[0], 'Linha 1');
      assert.equal(lines[1], 'Linha 2');
      assert.equal(lines[2], 'Linha 3');
    });

    it('deve aplicar quebra de palavras quando o texto exceder a largura', () => {
      const longText = 'Este eh um texto muito longo para testar a quebra automatica de palavras por largura';
      const lines = computeTextLines(longText, 'Roboto', 16, 'normal', 80);

      assert.ok(lines.length > 1, 'Texto longo em largura estreita deve gerar múltiplas linhas');
    });
  });

  describe('3. Dashboard Responsivo & CSS Rules', () => {
    it('deve conter a regra white-space: nowrap e flex-shrink: 0 na classe .badge', () => {
      const cssPath = path.resolve(process.cwd(), 'apps/frontend/src/index.css');
      const cssContent = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(cssContent.includes('white-space: nowrap;'), 'index.css deve conter white-space: nowrap em .badge');
      assert.ok(cssContent.includes('flex-shrink: 0;'), 'index.css deve conter flex-shrink: 0 em .badge');
    });
  });
});
