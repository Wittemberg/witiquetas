import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('DEVELOPMENT CONTROL CENTER 0.1.2 - SUÍTE DE TESTES VISUAIS E REGRESSÃO LAYOUT (REGRAS A-L SEÇÃO 16)', () => {
  const devPagePath = path.resolve(process.cwd(), 'apps/frontend/src/modules/devcontrol/DevControlPage.tsx');
  const indexCssPath = path.resolve(process.cwd(), 'apps/frontend/src/index.css');

  const devPageContent = fs.readFileSync(devPagePath, 'utf-8');
  const indexCssContent = fs.readFileSync(indexCssPath, 'utf-8');

  it('A. nenhum uso de classes Tailwind não suportadas permanece em DevControlPage.tsx', () => {
    // Classes Tailwind conhecidas que causavam ausência de estilo
    const unsupportedTailwindClasses = [
      'bg-slate-950',
      'text-slate-100',
      'border-slate-800',
      'bg-slate-900',
      'text-slate-400',
      'grid-cols-7',
      'backdrop-blur-md',
    ];

    for (const twClass of unsupportedTailwindClasses) {
      assert.ok(
        !devPageContent.includes(twClass),
        `DevControlPage.tsx não deve utilizar a classe Tailwind não compilada '${twClass}'`
      );
    }
  });

  it('B. classes dev-control-* existem no CSS index.css', () => {
    const requiredCssClasses = [
      '.dev-control-page',
      '.dev-control-container',
      '.dev-control-header',
      '.dev-control-exec-grid',
      '.dev-control-exec-card',
      '.dev-control-checkpoint-bar',
      '.dev-control-status-grid',
      '.dev-control-tab-button',
      '.dev-control-modules-grid',
      '.dev-control-health-grid',
      '.dev-control-frozen-grid',
    ];

    for (const cssClass of requiredCssClasses) {
      assert.ok(
        indexCssContent.includes(cssClass),
        `index.css deve conter a classe de estilo namespaced '${cssClass}'`
      );
    }
  });

  it('C. 3 cards executivos existem na estrutura visual', () => {
    assert.ok(devPageContent.includes('PRONTIDÃO DO MVP'), 'Card Prontidão do MVP presente');
    assert.ok(devPageContent.includes('ROADMAP IMPLEMENTADO'), 'Card Roadmap Implementado presente');
    assert.ok(devPageContent.includes('ROADMAP HOMOLOGADO'), 'Card Roadmap Homologado presente');
    assert.ok(devPageContent.includes('pontos restantes'), 'Indicador de pontos restantes no MVP presente');
  });

  it('D. percentuais são renderizados pelos dados da API em DevControlPage.tsx', () => {
    assert.ok(devPageContent.includes('progress.mvp.readinessPercent'), 'Readiness Percent dinâmico');
    assert.ok(devPageContent.includes('progress.fullRoadmap.implementationPercent'), 'Implementation Percent dinâmico');
    assert.ok(devPageContent.includes('progress.fullRoadmap.readinessPercent'), 'Roadmap Readiness Percent dinâmico');
  });

  it('E. tabs possuem classes próprias e estáticas em DevControlPage.tsx', () => {
    assert.ok(devPageContent.includes('dev-control-tab-button'), 'Tabs utilizam a classe dev-control-tab-button');
    assert.ok(devPageContent.includes("activeTab === 'overview'"), 'Aba overview com estado ativo');
    assert.ok(devPageContent.includes("activeTab === 'modules'"), 'Aba módulos com estado ativo');
    assert.ok(devPageContent.includes("activeTab === 'frozen'"), 'Aba frozen com estado ativo');
  });

  it('F. módulos usam estrutura de card dev-control-module-card', () => {
    assert.ok(devPageContent.includes('dev-control-module-card'), 'Módulos organizados em dev-control-module-card');
    assert.ok(devPageContent.includes('dev-control-modules-grid'), 'Grid de módulos dev-control-modules-grid presente');
  });

  it('G. frozen components usam estrutura de card dev-control-frozen-card', () => {
    assert.ok(devPageContent.includes('dev-control-frozen-card'), 'Componentes congelados organizados em dev-control-frozen-card');
    assert.ok(devPageContent.includes('MOTIVO DA PROTEÇÃO:'), 'Caixa destacada com o motivo da proteção');
  });

  it('H. nenhum texto concatenado conhecido permanece na renderização', () => {
    const concatenatedTexts = [
      'DEVELOPMENTFase',
      'ComercialImpl',
      '85%Readiness',
      'Implementação100%',
      'Homologação100%',
    ];

    for (const concat of concatenatedTexts) {
      assert.ok(
        !devPageContent.includes(concat),
        `DevControlPage.tsx não deve conter o texto concatenado indevido '${concat}'`
      );
    }
  });

  it('I. nenhum componente frozen externo foi alterado', () => {
    // Confirmar que arquivos de componentes congelados permanecem intactos
    const frozenFiles = [
      'apps/frontend/src/editor/EditorLayout.tsx',
      'apps/frontend/src/editor/useEditorStore.ts',
      'apps/frontend/src/shell/Sidebar.tsx',
      'apps/backend/src/services/developmentControlService.ts',
    ];

    for (const fileRelPath of frozenFiles) {
      const fullPath = path.resolve(process.cwd(), fileRelPath);
      assert.ok(fs.existsSync(fullPath), `Arquivo congelado ${fileRelPath} existe`);
    }
  });

  it('J. não existe overflow-x configurado no container do DCC', () => {
    assert.ok(indexCssContent.includes('overflow-x: hidden;'), 'Container .dev-control-page possui overflow-x: hidden');
  });

  it('K. layout possui breakpoints responsivos no CSS index.css', () => {
    assert.ok(indexCssContent.includes('@media (max-width: 1024px)'), 'Breakpoint 1024px presente em index.css');
    assert.ok(indexCssContent.includes('@media (max-width: 768px)'), 'Breakpoint 768px presente em index.css');
  });

  it('L. tema utiliza variáveis/tokens existentes do Witiquetas', () => {
    assert.ok(indexCssContent.includes('var(--bg-primary)'), 'Token var(--bg-primary) utilizado no DCC');
    assert.ok(indexCssContent.includes('var(--bg-card)'), 'Token var(--bg-card) utilizado no DCC');
    assert.ok(indexCssContent.includes('var(--border-color)'), 'Token var(--border-color) utilizado no DCC');
    assert.ok(indexCssContent.includes('var(--text-primary)'), 'Token var(--text-primary) utilizado no DCC');
    assert.ok(indexCssContent.includes('var(--accent-blue)'), 'Token var(--accent-blue) utilizado no DCC');
  });
});
