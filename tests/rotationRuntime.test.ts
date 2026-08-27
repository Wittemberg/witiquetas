import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeRotation } from '../apps/frontend/src/editor/bounds.js';

describe('FASE 4 — HOTFIX 4.2.1 ROTATION RUNTIME & INTEGRITY SUITE', () => {
  it('1. normalizeRotation comporta-se de forma determinística para todas as rotações', () => {
    assert.strictEqual(normalizeRotation(undefined as any), 0);
    assert.strictEqual(normalizeRotation(null as any), 0);
    assert.strictEqual(normalizeRotation(0), 0);
    assert.strictEqual(normalizeRotation(90), 90);
    assert.strictEqual(normalizeRotation(180), 180);
    assert.strictEqual(normalizeRotation(270), 270);
    assert.strictEqual(normalizeRotation(360), 0);
    assert.strictEqual(normalizeRotation(-90), 270);
    assert.strictEqual(normalizeRotation(450), 90);
  });

  it('2. PropertyInspector.tsx possui import explícito de normalizeRotation de ./bounds', () => {
    const inspectorPath = path.resolve(process.cwd(), 'apps/frontend/src/editor/PropertyInspector.tsx');
    const content = fs.readFileSync(inspectorPath, 'utf8');

    assert.ok(
      content.includes("import { normalizeRotation } from './bounds'") ||
      content.includes("normalizeRotation"),
      'PropertyInspector.tsx deve obrigatoriamente referenciar e importar normalizeRotation'
    );

    const hasImport = /import\s*\{[^}]*normalizeRotation[^}]*\}\s*from\s*['"]\.\/bounds['"]/.test(content);
    assert.ok(hasImport, 'PropertyInspector.tsx deve importar normalizeRotation de ./bounds');
  });

  it('3. CanvasArea.tsx possui import explícito de normalizeRotation de ./bounds', () => {
    const canvasPath = path.resolve(process.cwd(), 'apps/frontend/src/editor/CanvasArea.tsx');
    const content = fs.readFileSync(canvasPath, 'utf8');

    const hasImport = /import\s*\{[^}]*normalizeRotation[^}]*\}\s*from\s*['"]\.\/bounds['"]/.test(content);
    assert.ok(hasImport, 'CanvasArea.tsx deve importar normalizeRotation de ./bounds');
  });

  it('4. PrintPreview.tsx possui import explícito de normalizeRotation de bounds.js', () => {
    const previewPath = path.resolve(process.cwd(), 'apps/frontend/src/modules/printcenter/PrintPreview.tsx');
    const content = fs.readFileSync(previewPath, 'utf8');

    const hasImport = /import\s*\{[^}]*normalizeRotation[^}]*\}\s*from\s*['"].*bounds(\.js)?['"]/.test(content);
    assert.ok(hasImport, 'PrintPreview.tsx deve importar normalizeRotation de bounds');
  });

  it('5. Nenhum componente frontend invoca normalizeRotation sem a devida declaração/import', () => {
    const srcDir = path.resolve(process.cwd(), 'apps/frontend/src');
    
    function scanDir(dir: string) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          scanDir(fullPath);
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
          const code = fs.readFileSync(fullPath, 'utf8');
          if (code.includes('normalizeRotation')) {
            const isBoundsDef = fullPath.endsWith('bounds.ts') && code.includes('export function normalizeRotation');
            const isImported = /import\s*\{[^}]*normalizeRotation[^}]*\}/.test(code);
            assert.ok(
              isBoundsDef || isImported,
              `Arquivo ${file} chama ou menciona normalizeRotation mas não o importa nem o declara!`
            );
          }
        }
      }
    }

    scanDir(srcDir);
  });
});
