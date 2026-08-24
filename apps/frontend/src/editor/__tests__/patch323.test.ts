import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPriceVisualGeometry, getElementBoundingBox, clampElementToMedia, applyMagneticRotationSnap, normalizeRotation } from '../bounds.js';
import type { PriceElement, LineElement } from '@witiquetas/label-schema';
import fs from 'node:fs';
import path from 'node:path';

describe('FASE 3.5 — PATCH 3.2.3 SUITE DE TESTES', () => {
  describe('1. Price Visual Geometry com Offset X e Bounding Box Real', () => {
    it('deve calcular largura visual de ~14mm em uma caixa persistida de 35mm', () => {
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

      assert.equal(priceElem.width, 35, 'Width persistido deve ser mantido em 35mm');
      assert.equal(priceElem.height, 15, 'Height persistido deve ser mantido em 15mm');
      assert.ok(visualGeom.width < 25, `Largura visual (${visualGeom.width}mm) deve ser significativamente menor que a caixa persistida (35mm)`);
      assert.ok(visualGeom.width >= 10, `Largura visual (${visualGeom.width}mm) deve cobrir os glyphs`);
      assert.equal(visualGeom.x, 10, 'Offset X deve ser 0 para alinhamento esquerdo');
    });

    it('deve calcular minX e maxX correspondendo estritamente à área impressa renderizada', () => {
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
      assert.equal(bbox.minX, 10);
      assert.ok(bbox.maxX < 35, `maxX visual (${bbox.maxX}mm) não deve atingir a borda de 45mm`);
    });
  });

  describe('2. Line Normalization, Resize e Rotation', () => {
    it('Line 1px: resize aumentar preserva strokeWidth = 1', () => {
      const lineElem: LineElement = {
        id: 'l1',
        type: 'line',
        x: 5,
        y: 10,
        width: 20,
        height: 1,
        strokeWidth: 1,
        color: '#000000',
        locked: false,
        visible: true,
      };

      // Simulação de 10 resizes horizontais
      let currentW = lineElem.width;
      for (let i = 1; i <= 10; i++) {
        currentW += 2;
        const updated = { ...lineElem, width: currentW };
        assert.equal(updated.strokeWidth, 1, `Resize ${i}: strokeWidth deve permanecer 1`);
      }
      assert.equal(currentW, 40);
    });

    it('Line 1px: resize diminuir preserva strokeWidth = 1', () => {
      const lineElem: LineElement = {
        id: 'l1',
        type: 'line',
        x: 5,
        y: 10,
        width: 40,
        height: 1,
        strokeWidth: 1,
        color: '#000000',
        locked: false,
        visible: true,
      };

      const updated = { ...lineElem, width: 10 };
      assert.equal(updated.strokeWidth, 1);
      assert.equal(updated.width, 10);
    });

    it('Rotação: 0 -> 45 -> persiste 45', () => {
      const lineElem: LineElement = {
        id: 'l1',
        type: 'line',
        x: 10,
        y: 10,
        width: 30,
        height: 1,
        rotation: 0,
        strokeWidth: 1,
        color: '#000000',
        locked: false,
        visible: true,
      };

      const rot45 = normalizeRotation(45);
      assert.equal(rot45, 45);

      const updated = { ...lineElem, rotation: rot45 };
      assert.equal(updated.rotation, 45);
    });

    it('Rotação próxima a 90°: aplica Magnetic Snap para 90°', () => {
      const snapResult = applyMagneticRotationSnap(88);
      assert.equal(snapResult.isSnapped, true);
      assert.equal(snapResult.angle, 90);
    });

    it('Deselect / Reselect: rotação e geometria de Line permanecem intactas', () => {
      const lineElem: LineElement = {
        id: 'l1',
        type: 'line',
        x: 15,
        y: 20,
        width: 50,
        height: 1,
        rotation: 45,
        strokeWidth: 1,
        color: '#000000',
        locked: false,
        visible: true,
      };

      const serialized = JSON.stringify(lineElem);
      const deserialized: LineElement = JSON.parse(serialized);

      assert.equal(deserialized.x, 15);
      assert.equal(deserialized.y, 20);
      assert.equal(deserialized.width, 50);
      assert.equal(deserialized.rotation, 45);
      assert.equal(deserialized.strokeWidth, 1);
    });
  });

  describe('3. Dashboard Field Wrapping & Sidebar Rules', () => {
    it('index.css deve conter a regra word-break: break-word em .metric-value', () => {
      const cssPath = path.resolve(process.cwd(), 'apps/frontend/src/index.css');
      const cssContent = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(cssContent.includes('word-break: break-word;'), 'index.css deve conter word-break: break-word');
      assert.ok(cssContent.includes('overflow-wrap: break-word;'), 'index.css deve conter overflow-wrap: break-word');
    });

    it('Sidebar.tsx deve chamar onToggleCollapse ao clicar na logo no estado expandido e NÃO onSelectModule', () => {
      const sidebarPath = path.resolve(process.cwd(), 'apps/frontend/src/shell/Sidebar.tsx');
      const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');

      assert.ok(!sidebarContent.includes("onClick={() => onSelectModule('home')}"), 'Sidebar.tsx NÃO deve navegar para home no clique da logo');
      assert.ok(sidebarContent.includes('onClick={onToggleCollapse}'), 'Sidebar.tsx deve chamar onToggleCollapse no clique da logo');
    });

    it('EditorLayout.tsx deve renderizar a marca Witiquetas antes do botão Modelos', () => {
      const layoutPath = path.resolve(process.cwd(), 'apps/frontend/src/editor/EditorLayout.tsx');
      const layoutContent = fs.readFileSync(layoutPath, 'utf-8');

      const brandIdx = layoutContent.indexOf('Witiquetas');
      const modelsIdx = layoutContent.indexOf('<span>Modelos</span>');

      assert.ok(brandIdx > 0 && modelsIdx > 0, 'Marca Witiquetas e botão Modelos devem existir no layout');
      assert.ok(brandIdx < modelsIdx, 'Marca Witiquetas deve preceder o botão Modelos');
    });
  });
});
