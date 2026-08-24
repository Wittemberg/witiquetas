import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPriceVisualGeometry, getPriceRenderMetrics, getElementBoundingBox, SAFE_AREA_MARGIN_MM } from '../bounds.js';
import type { PriceElement } from '@witiquetas/label-schema';
import fs from 'node:fs';
import path from 'node:path';

const safeEpsilon = 0.005; // Tolerância estrita para precisão de ponto flutuante

function checkIsBeyondSafe(bbox: { minX: number; minY: number; maxX: number; maxY: number }, widthMm: number, heightMm: number): boolean {
  const safeMargin = SAFE_AREA_MARGIN_MM; // 1.0
  return (
    bbox.minX < safeMargin - safeEpsilon ||
    bbox.minY < safeMargin - safeEpsilon ||
    bbox.maxX > widthMm - safeMargin + safeEpsilon ||
    bbox.maxY > heightMm - safeMargin + safeEpsilon
  );
}

describe('FASE 3.5 — PATCH 3.2.6 SUITE DE TESTES (UNIFIED PRICE METRICS & DASHBOARD GRID)', () => {
  describe('1. Unificação Matemática do PriceElement (Renderer & Bounds)', () => {
    it('getPriceRenderMetrics e getPriceVisualGeometry produzem visualWidthMm e visualHeightMm idênticos', () => {
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

      const metrics = getPriceRenderMetrics(priceElem, 203);
      const geom = getPriceVisualGeometry(priceElem, 203);

      assert.equal(geom.width, metrics.visualWidthMm, 'visualWidthMm deve ser idêntico na renderização e na caixa delimitadora');
      assert.equal(geom.height, metrics.visualHeightMm, 'visualHeightMm deve ser idêntico na renderização e na caixa delimitadora');
      assert.equal(priceElem.width, 35, 'Largura persistida deve continuar 35mm');
      assert.equal(priceElem.height, 15, 'Altura persistida deve continuar 15mm');
    });

    it('Bounding Box na Borda Direita reflete fielmente a largura do renderer e detecta ultrapassagem da Safe Area', () => {
      const labelWidthMm = 40;
      const labelHeightMm = 30;

      // Price posicionado de forma que o renderer termine em widthMm - 0.990mm
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

      const metrics = getPriceRenderMetrics(priceElem, 203);

      // Posicionando elemento para que a borda direita fique em (widthMm - 0.990)
      priceElem.x = (labelWidthMm - 0.990) - metrics.visualWidthMm;

      const bbox = getElementBoundingBox(priceElem);
      const isBeyondSafe = checkIsBeyondSafe(bbox, labelWidthMm, labelHeightMm);

      assert.equal(isBeyondSafe, true, 'Borda direita em widthMm - 0.990mm DEVE gerar aviso de safeArea');
    });
  });

  describe('2. Validação Estrita das 4 Bordas de Safe Area (1.000mm vs 0.990mm)', () => {
    const widthMm = 40;
    const heightMm = 30;

    it('LEFT: 1.000mm => SEM warning | 0.990mm => COM safe warning', () => {
      const bboxSem = { minX: 1.000, minY: 5.0, maxX: 20.0, maxY: 15.0 };
      const bboxCom = { minX: 0.990, minY: 5.0, maxX: 20.0, maxY: 15.0 };

      assert.equal(checkIsBeyondSafe(bboxSem, widthMm, heightMm), false, 'LEFT 1.000mm = SEM warning');
      assert.equal(checkIsBeyondSafe(bboxCom, widthMm, heightMm), true, 'LEFT 0.990mm = COM warning');
    });

    it('RIGHT: width - 1.000mm => SEM warning | width - 0.990mm => COM safe warning', () => {
      const bboxSem = { minX: 5.0, minY: 5.0, maxX: widthMm - 1.000, maxY: 15.0 };
      const bboxCom = { minX: 5.0, minY: 5.0, maxX: widthMm - 0.990, maxY: 15.0 };

      assert.equal(checkIsBeyondSafe(bboxSem, widthMm, heightMm), false, 'RIGHT width - 1.000mm = SEM warning');
      assert.equal(checkIsBeyondSafe(bboxCom, widthMm, heightMm), true, 'RIGHT width - 0.990mm = COM warning');
    });

    it('TOP: 1.000mm => SEM warning | 0.990mm => COM safe warning', () => {
      const bboxSem = { minX: 5.0, minY: 1.000, maxX: 20.0, maxY: 15.0 };
      const bboxCom = { minX: 5.0, minY: 0.990, maxX: 20.0, maxY: 15.0 };

      assert.equal(checkIsBeyondSafe(bboxSem, widthMm, heightMm), false, 'TOP 1.000mm = SEM warning');
      assert.equal(checkIsBeyondSafe(bboxCom, widthMm, heightMm), true, 'TOP 0.990mm = COM warning');
    });

    it('BOTTOM: height - 1.000mm => SEM warning | height - 0.990mm => COM safe warning', () => {
      const bboxSem = { minX: 5.0, minY: 5.0, maxX: 20.0, maxY: heightMm - 1.000 };
      const bboxCom = { minX: 5.0, minY: 5.0, maxX: 20.0, maxY: heightMm - 0.990 };

      assert.equal(checkIsBeyondSafe(bboxSem, widthMm, heightMm), false, 'BOTTOM height - 1.000mm = SEM warning');
      assert.equal(checkIsBeyondSafe(bboxCom, widthMm, heightMm), true, 'BOTTOM height - 0.990mm = COM warning');
    });

    it('Price centralizado => SEM warning | Price fora da mídia => COM physical warning', () => {
      const priceElem: PriceElement = {
        id: 'p1',
        type: 'price',
        x: 3,
        y: 5,
        width: 35,
        height: 15,
        sampleValue: '9.99',
        prefix: 'R$',
        reducedCents: true,
        locked: false,
        visible: true,
      };

      const bboxCent = getElementBoundingBox(priceElem);
      assert.equal(checkIsBeyondSafe(bboxCent, widthMm, heightMm), false, 'Centralizado não tem safe warning');

      priceElem.x = -5;
      const bboxFora = getElementBoundingBox(priceElem);
      const isPhysical =
        bboxFora.minX < -0.05 ||
        bboxFora.minY < -0.05 ||
        bboxFora.maxX > (widthMm + 0.05) ||
        bboxFora.maxY > (heightMm + 0.05);

      assert.equal(isPhysical, true, 'Preço com x=-5mm DEVE disparar aviso físico');
    });
  });

  describe('3. Regras de Grid Estrutural do Dashboard', () => {
    it('index.css deve definir minmax(360px, 1fr) na classe .grid', () => {
      const cssPath = path.resolve(process.cwd(), 'apps/frontend/src/index.css');
      const cssContent = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(cssContent.includes('minmax(360px, 1fr)'), 'index.css deve declarar minmax(360px, 1fr) em .grid');
    });

    it('index.css deve possuir container query @container (max-width: 430px) em .metrics', () => {
      const cssPath = path.resolve(process.cwd(), 'apps/frontend/src/index.css');
      const cssContent = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(cssContent.includes('@container (max-width: 430px)'), 'index.css deve conter container query de max-width: 430px');
    });
  });
});
