import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPriceVisualGeometry, getElementBoundingBox, SAFE_AREA_MARGIN_MM } from '../bounds.js';
import type { PriceElement, TextElement, BarcodeElement } from '@witiquetas/label-schema';
import fs from 'node:fs';
import path from 'node:path';

describe('FASE 3.5 — PATCH 3.2.4 SUITE DE TESTES', () => {
  describe('1. Price Physical Bounds Warning baseado em Bounding Box Efetiva', () => {
    it('Price com persisted width=35mm, mas visual width~14mm centralizado NÃO deve gerar aviso físico falso', () => {
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

      const labelWidthMm = 40;
      const labelHeightMm = 30;

      // Cálculo canônico do Bounding Box efetivo
      const bbox = getElementBoundingBox(priceElem);

      const isPhysical =
        bbox.minX < -0.05 ||
        bbox.minY < -0.05 ||
        bbox.maxX > (labelWidthMm + 0.05) ||
        bbox.maxY > (labelHeightMm + 0.05);

      assert.equal(isPhysical, false, 'Preço visualmente centralizado NÃO deve ser considerado parcialmente fora da etiqueta');
    });

    it('Price a 0.5mm da margem de 1mm pode gerar aviso de safeArea mas NÃO de physical bounds', () => {
      const priceElem: PriceElement = {
        id: 'p1',
        type: 'price',
        x: 0.5,
        y: 5,
        width: 35,
        height: 15,
        sampleValue: '9.99',
        prefix: 'R$',
        reducedCents: true,
        locked: false,
        visible: true,
      };

      const labelWidthMm = 40;
      const labelHeightMm = 30;
      const bbox = getElementBoundingBox(priceElem);

      const isPhysical =
        bbox.minX < -0.05 ||
        bbox.minY < -0.05 ||
        bbox.maxX > (labelWidthMm + 0.05) ||
        bbox.maxY > (labelHeightMm + 0.05);

      const halfDotMm = (0.5 * 25.4) / 203;
      const isBeyondSafe =
        bbox.minX < SAFE_AREA_MARGIN_MM - halfDotMm ||
        bbox.minY < SAFE_AREA_MARGIN_MM - halfDotMm ||
        bbox.maxX > labelWidthMm - SAFE_AREA_MARGIN_MM + halfDotMm ||
        bbox.maxY > labelHeightMm - SAFE_AREA_MARGIN_MM + halfDotMm;

      assert.equal(isPhysical, false, 'Preço a x=0.5mm não ultrapassa a borda física');
      assert.equal(isBeyondSafe, true, 'Preço a x=0.5mm ultrapassa a margem segura de 1mm');
    });

    it('Price realmente fora da mídia física (x = -5mm) DEVE gerar aviso físico', () => {
      const priceElem: PriceElement = {
        id: 'p1',
        type: 'price',
        x: -5,
        y: 10,
        width: 35,
        height: 15,
        sampleValue: '9.99',
        prefix: 'R$',
        reducedCents: true,
        locked: false,
        visible: true,
      };

      const labelWidthMm = 40;
      const labelHeightMm = 30;
      const bbox = getElementBoundingBox(priceElem);

      const isPhysical =
        bbox.minX < -0.05 ||
        bbox.minY < -0.05 ||
        bbox.maxX > (labelWidthMm + 0.05) ||
        bbox.maxY > (labelHeightMm + 0.05);

      assert.equal(isPhysical, true, 'Preço a x=-5mm DEVE disparar o aviso de parcialmente fora da etiqueta');
    });

    it('Elementos não-Price (Text, Barcode) mantêm comportamento físico AABB idêntico', () => {
      const textElem: TextElement = {
        id: 't1',
        type: 'text',
        x: 35,
        y: 10,
        width: 20,
        height: 10,
        text: 'Teste',
        fontSize: 12,
        fontFamily: 'Roboto',
        locked: false,
        visible: true,
      };

      const labelWidthMm = 40;
      const labelHeightMm = 30;
      const bbox = getElementBoundingBox(textElem);

      const isPhysical =
        bbox.minX < -0.05 ||
        bbox.minY < -0.05 ||
        bbox.maxX > (labelWidthMm + 0.05) ||
        bbox.maxY > (labelHeightMm + 0.05);

      assert.equal(isPhysical, true, 'Texto com x=35mm e w=20mm em etiqueta de 40mm ultrapassa a borda (55mm > 40.05mm)');
    });
  });

  describe('2. Dashboard Responsive Metrics & Container Query Rules', () => {
    it('index.css deve declarar container-type: inline-size na classe .card', () => {
      const cssPath = path.resolve(process.cwd(), 'apps/frontend/src/index.css');
      const cssContent = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(cssContent.includes('container-type: inline-size;'), 'index.css deve conter container-type: inline-size em .card');
    });

    it('index.css deve possuir container query para .metrics em 1 coluna em cards estreitos', () => {
      const cssPath = path.resolve(process.cwd(), 'apps/frontend/src/index.css');
      const cssContent = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(cssContent.includes('@container (max-width:'), 'index.css deve declarar container query em .metrics');
    });

    it('index.css deve definir word-break: normal e overflow-wrap em .metric-value', () => {
      const cssPath = path.resolve(process.cwd(), 'apps/frontend/src/index.css');
      const cssContent = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(cssContent.includes('word-break: normal;'), 'index.css deve conter word-break: normal em .metric-value');
      assert.ok(cssContent.includes('overflow-wrap:'), 'index.css deve conter overflow-wrap em .metric-value');
    });
  });
});
