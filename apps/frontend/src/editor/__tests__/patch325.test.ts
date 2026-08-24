import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getElementBoundingBox, SAFE_AREA_MARGIN_MM } from '../bounds.js';
import type { PriceElement } from '@witiquetas/label-schema';
import fs from 'node:fs';
import path from 'node:path';

// Tolerância estrita para precisão de ponto flutuante (0.005mm)
const SAFE_AREA_EPSILON_MM = 0.005;

function checkIsBeyondSafe(bbox: { minX: number; minY: number; maxX: number; maxY: number }, widthMm: number, heightMm: number): boolean {
  const safeMargin = SAFE_AREA_MARGIN_MM; // 1.0
  return (
    bbox.minX < safeMargin - SAFE_AREA_EPSILON_MM ||
    bbox.minY < safeMargin - SAFE_AREA_EPSILON_MM ||
    bbox.maxX > widthMm - safeMargin + SAFE_AREA_EPSILON_MM ||
    bbox.maxY > heightMm - safeMargin + SAFE_AREA_EPSILON_MM
  );
}

describe('FASE 3.5 — PATCH 3.2.5 SUITE DE TESTES (SAFE AREA PRECISION & DASHBOARD)', () => {
  describe('1. Safe Area Precision Testes com Margem Exata de 1.000mm', () => {
    const widthMm = 40;
    const heightMm = 30;

    it('CASO A: bbox minX = 1.000 mm DEVE retornar isBeyondSafe = false (SEM WARNING)', () => {
      const bbox = { minX: 1.000, minY: 5.0, maxX: 20.0, maxY: 15.0 };
      const isBeyondSafe = checkIsBeyondSafe(bbox, widthMm, heightMm);
      assert.equal(isBeyondSafe, false, 'Elemento exatamente em 1.000mm não deve gerar aviso de safeArea');
    });

    it('CASO B: bbox minX = 0.990 mm DEVE retornar isBeyondSafe = true (COM WARNING)', () => {
      const bbox = { minX: 0.990, minY: 5.0, maxX: 20.0, maxY: 15.0 };
      const isBeyondSafe = checkIsBeyondSafe(bbox, widthMm, heightMm);
      assert.equal(isBeyondSafe, true, 'Elemento em 0.990mm DEVE gerar aviso de safeArea');
    });

    it('CASO C: bbox maxX = widthMm - 1.000 mm DEVE retornar isBeyondSafe = false (SEM WARNING)', () => {
      const bbox = { minX: 5.0, minY: 5.0, maxX: widthMm - 1.000, maxY: 15.0 };
      const isBeyondSafe = checkIsBeyondSafe(bbox, widthMm, heightMm);
      assert.equal(isBeyondSafe, false, 'Elemento terminando em widthMm - 1.000mm não deve gerar aviso');
    });

    it('CASO D: bbox maxX = widthMm - 0.990 mm DEVE retornar isBeyondSafe = true (COM WARNING)', () => {
      const bbox = { minX: 5.0, minY: 5.0, maxX: widthMm - 0.990, maxY: 15.0 };
      const isBeyondSafe = checkIsBeyondSafe(bbox, widthMm, heightMm);
      assert.equal(isBeyondSafe, true, 'Elemento terminando em widthMm - 0.990mm DEVE gerar aviso');
    });

    it('CASO E: bbox minY = 1.000 mm DEVE retornar isBeyondSafe = false (SEM WARNING)', () => {
      const bbox = { minX: 5.0, minY: 1.000, maxX: 20.0, maxY: 15.0 };
      const isBeyondSafe = checkIsBeyondSafe(bbox, widthMm, heightMm);
      assert.equal(isBeyondSafe, false, 'Elemento em minY = 1.000mm não deve gerar aviso');
    });

    it('CASO F: bbox minY = 0.990 mm DEVE retornar isBeyondSafe = true (COM WARNING)', () => {
      const bbox = { minX: 5.0, minY: 0.990, maxX: 20.0, maxY: 15.0 };
      const isBeyondSafe = checkIsBeyondSafe(bbox, widthMm, heightMm);
      assert.equal(isBeyondSafe, true, 'Elemento em minY = 0.990mm DEVE gerar aviso');
    });

    it('CASO G: bbox maxY = heightMm - 1.000 mm DEVE retornar isBeyondSafe = false (SEM WARNING)', () => {
      const bbox = { minX: 5.0, minY: 5.0, maxX: 20.0, maxY: heightMm - 1.000 };
      const isBeyondSafe = checkIsBeyondSafe(bbox, widthMm, heightMm);
      assert.equal(isBeyondSafe, false, 'Elemento em maxY = heightMm - 1.000mm não deve gerar aviso');
    });

    it('CASO H: bbox maxY = heightMm - 0.990 mm DEVE retornar isBeyondSafe = true (COM WARNING)', () => {
      const bbox = { minX: 5.0, minY: 5.0, maxX: 20.0, maxY: heightMm - 0.990 };
      const isBeyondSafe = checkIsBeyondSafe(bbox, widthMm, heightMm);
      assert.equal(isBeyondSafe, true, 'Elemento em maxY = heightMm - 0.990mm DEVE gerar aviso');
    });

    it('Price centralizado não gera safeArea e nem physical warning', () => {
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

      const isPhysical =
        bbox.minX < -0.05 ||
        bbox.minY < -0.05 ||
        bbox.maxX > (widthMm + 0.05) ||
        bbox.maxY > (heightMm + 0.05);

      const isBeyondSafe = checkIsBeyondSafe(bbox, widthMm, heightMm);

      assert.equal(isPhysical, false, 'Preço centralizado não deve ter aviso físico');
      assert.equal(isBeyondSafe, false, 'Preço centralizado não deve ter aviso de safeArea');
    });
  });

  describe('2. Dashboard Responsiveness & CSS Rules Audit', () => {
    it('index.css deve conter container-type: inline-size em .card', () => {
      const cssPath = path.resolve(process.cwd(), 'apps/frontend/src/index.css');
      const cssContent = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(cssContent.includes('container-type: inline-size;'), 'index.css deve conter container-type: inline-size');
    });

    it('index.css deve possuir container query de no mínimo 450px para .metrics', () => {
      const cssPath = path.resolve(process.cwd(), 'apps/frontend/src/index.css');
      const cssContent = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(cssContent.includes('@container (max-width: 450px)'), 'index.css deve conter container query de max-width: 450px');
    });

    it('index.css deve definir word-break: normal e overflow-wrap: anywhere em .metric-value', () => {
      const cssPath = path.resolve(process.cwd(), 'apps/frontend/src/index.css');
      const cssContent = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(cssContent.includes('word-break: normal;'), 'index.css deve conter word-break: normal');
      assert.ok(cssContent.includes('overflow-wrap: anywhere;'), 'index.css deve conter overflow-wrap: anywhere');
    });
  });
});
