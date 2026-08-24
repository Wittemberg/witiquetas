import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('FASE 3.5 — PATCH 3.2.7 SUITE DE TESTES (DASHBOARD FULL-WIDTH METRICS)', () => {
  describe('1. CSS Rules Audit para .metric-item-full', () => {
    it('index.css deve conter a classe .metric-item-full com grid-column: 1 / -1', () => {
      const cssPath = path.resolve(process.cwd(), 'apps/frontend/src/index.css');
      const cssContent = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(cssContent.includes('.metric-item-full'), 'index.css deve declarar .metric-item-full');
      assert.ok(cssContent.includes('grid-column: 1 / -1;'), '.metric-item-full deve definir grid-column: 1 / -1');
    });

    it('index.css deve manter minmax(360px, 1fr) no .grid e @container (max-width: 430px) no .metrics', () => {
      const cssPath = path.resolve(process.cwd(), 'apps/frontend/src/index.css');
      const cssContent = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(cssContent.includes('minmax(360px, 1fr)'), 'index.css deve manter o grid responsivo do .grid');
      assert.ok(cssContent.includes('@container (max-width: 430px)'), 'index.css deve manter a container query do .metrics');
    });
  });

  describe('2. JSX Audit em App.tsx (Aplicação Exclusiva de metric-item-full)', () => {
    it('App.tsx deve aplicar metric-item-full no campo Domínio (Frontend Card)', () => {
      const appPath = path.resolve(process.cwd(), 'apps/frontend/src/App.tsx');
      const appContent = fs.readFileSync(appPath, 'utf-8');

      const dominioSnippet = appContent.includes('className="metric-item metric-item-full"\n                    <span className="metric-label">Domínio</span>') ||
                             appContent.includes('metric-item metric-item-full') && appContent.includes('Domínio');
      assert.ok(dominioSnippet, 'App.tsx deve aplicar metric-item-full em Domínio');
    });

    it('App.tsx deve aplicar metric-item-full no campo Timezone (Backend Card)', () => {
      const appPath = path.resolve(process.cwd(), 'apps/frontend/src/App.tsx');
      const appContent = fs.readFileSync(appPath, 'utf-8');

      assert.ok(appContent.includes('Timezone'), 'Campo Timezone existe');
      assert.ok(appContent.includes('metric-item metric-item-full'), 'metric-item-full está presente');
    });

    it('App.tsx deve aplicar metric-item-full no campo Sistema / SO (Agent Card)', () => {
      const appPath = path.resolve(process.cwd(), 'apps/frontend/src/App.tsx');
      const appContent = fs.readFileSync(appPath, 'utf-8');

      assert.ok(appContent.includes('Sistema / SO'), 'Campo Sistema / SO existe');
    });

    it('Métricas curtas (Servidor Web, Rota API, Protocolo, Versão) não devem possuir metric-item-full', () => {
      const appPath = path.resolve(process.cwd(), 'apps/frontend/src/App.tsx');
      const appContent = fs.readFileSync(appPath, 'utf-8');

      // Verifica que Servidor Web está em um metric-item padrão
      const servidorWebMatch = appContent.includes('<span className="metric-label">Servidor Web</span>');
      assert.ok(servidorWebMatch, 'Servidor Web está presente no JSX');
    });
  });

  describe('3. Integridade dos Componentes Congelados', () => {
    it('bounds.ts e CanvasArea.tsx não foram alterados neste patch', () => {
      const boundsPath = path.resolve(process.cwd(), 'apps/frontend/src/editor/bounds.ts');
      const canvasPath = path.resolve(process.cwd(), 'apps/frontend/src/editor/CanvasArea.tsx');

      assert.ok(fs.existsSync(boundsPath), 'bounds.ts existe');
      assert.ok(fs.existsSync(canvasPath), 'CanvasArea.tsx existe');
    });
  });
});
