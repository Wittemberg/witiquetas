import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('1. FRONTEND CSS SMOKE TEST: index.css Contém Todos os Módulos do Design System Global', () => {
  const cssPath = path.resolve('apps/frontend/src/index.css');
  assert.ok(fs.existsSync(cssPath), 'Arquivo apps/frontend/src/index.css deve existir');

  const cssCode = fs.readFileSync(cssPath, 'utf8');

  // 1. Garantir que a regressão de redução drástica de linhas não ocorra (Mínimo de 800 linhas)
  const lineCount = cssCode.split('\n').length;
  assert.ok(lineCount >= 800, `apps/frontend/src/index.css deve conter pelo menos 800 linhas. Atual: ${lineCount}`);

  // 2. Tokens de Design System e Temas (Modo Claro e Modo Escuro)
  assert.ok(cssCode.includes(':root'), 'Deve conter tokens em :root');
  assert.ok(cssCode.includes('[data-theme="light"]') || cssCode.includes("[data-theme='light']"), 'Deve conter tokens do Modo Claro [data-theme=light]');

  // 3. Dashboard e Métricas
  assert.ok(cssCode.includes('.container') || cssCode.includes('.editor-root-container'), 'Deve conter container do dashboard/editor');
  assert.ok(cssCode.includes('.card'), 'Deve conter a classe .card');
  assert.ok(cssCode.includes('.card-actions'), 'Deve conter a classe .card-actions');
  assert.ok(cssCode.includes('.card-header'), 'Deve conter a classe .card-header');
  assert.ok(cssCode.includes('.metric-value'), 'Deve conter a classe .metric-value');

  // 4. Wizard e Modais
  assert.ok(cssCode.includes('.wizard-modal-overlay') || cssCode.includes('.modal-backdrop'), 'Deve conter classes de modais e overlays');
  assert.ok(cssCode.includes('.wizard-modal-content'), 'Deve conter conteúdo do wizard modal');
  assert.ok(cssCode.includes('.niche-grid') || cssCode.includes('.wizard-size-grid'), 'Deve conter grids do wizard');
  assert.ok(cssCode.includes('.wizard-size-card'), 'Deve conter .wizard-size-card do novo seletor de formatos');
  assert.ok(cssCode.includes('.wizard-format-panel'), 'Deve conter .wizard-format-panel do painel formato selecionado');

  // 5. Botões, Controles e Agent Card
  assert.ok(cssCode.includes('.btn'), 'Deve conter a classe .btn');
  assert.ok(cssCode.includes('.btn-primary'), 'Deve conter a classe .btn-primary');
  assert.ok(cssCode.includes('.btn-theme-toggle'), 'Deve conter botão de alternância de tema');
  assert.ok(cssCode.includes('.badge-tag') || cssCode.includes('.badge-success'), 'Deve conter badges de estado e tag');

  // 6. Editor e Canvas Layout
  assert.ok(cssCode.includes('.editor-header'), 'Deve conter .editor-header');
  assert.ok(cssCode.includes('.editor-workspace'), 'Deve conter .editor-workspace');
  assert.ok(cssCode.includes('.editor-sidebar-left'), 'Deve conter .editor-sidebar-left');
  assert.ok(cssCode.includes('.editor-sidebar-right'), 'Deve conter .editor-sidebar-right');
  assert.ok(cssCode.includes('.editor-canvas-container') || cssCode.includes('.editor-workspace-row'), 'Deve conter container do workspace canvas');

  // 7. Preservação do Patch Responsivo do PropertyInspector (Commit 224599d)
  assert.ok(cssCode.includes('.inspector-section'), 'Deve conter .inspector-section');
  assert.ok(cssCode.includes('overflow-x: hidden !important'), 'Deve preservar overflow-x: hidden no .editor-sidebar-right');
  assert.ok(cssCode.includes('min-width: 0'), 'Deve conter min-width: 0 para evitar overflow horizontal');
  assert.ok(cssCode.includes('max-width: 100%'), 'Deve conter max-width: 100%');
});

test('2. COMPILED CSS BUNDLE SMOKE TEST: Bundle CSS Compilado Contém o Design System Global', () => {
  const distDir = path.resolve('apps/frontend/dist/assets');
  assert.ok(fs.existsSync(distDir), 'Diretório dist/assets do frontend deve existir. Execute vite build.');

  const cssFiles = fs.readdirSync(distDir).filter((f) => f.endsWith('.css'));
  assert.ok(cssFiles.length > 0, 'Deve existir pelo menos um arquivo .css compilado em dist/assets');

  const compiledCssPath = path.join(distDir, cssFiles[0]);
  const compiledCss = fs.readFileSync(compiledCssPath, 'utf8');

  // Validação de presença das regras minificadas no bundle de produção
  assert.ok(compiledCss.includes('.card'), 'Bundle compilado deve conter a classe .card');
  assert.ok(compiledCss.includes('.btn'), 'Bundle compilado deve conter a classe .btn');
  assert.ok(compiledCss.includes('.inspector-section'), 'Bundle compilado deve conter a classe .inspector-section');
  assert.ok(compiledCss.includes('min-width:0') || compiledCss.includes('min-width: 0'), 'Bundle compilado deve conter min-width: 0');
});

test('3. DESIGN CONTRACTS AUDIT (COMMITS b2d63e0, 224599d, b2aeac8): Preservação dos Patches Visuais Homologados', () => {
  const cssPath = path.resolve('apps/frontend/src/index.css');
  const cssCode = fs.readFileSync(cssPath, 'utf8');

  // b2d63e0: Card Design Contract (container-type: inline-size, 2-column grid, 38px button height, word-break & overflow-wrap for long domains like witiquetas.wrtec.com.br)
  assert.ok(cssCode.includes('container-type: inline-size') || cssCode.includes('container-type:inline-size'), 'b2d63e0: .card deve definir container-type: inline-size');
  assert.ok(cssCode.includes('grid-template-columns: repeat(2, minmax(0, 1fr))') || cssCode.includes('grid-template-columns:repeat(2,minmax(0,1fr))'), 'b2d63e0: .card-actions deve definir grid simétrico de 2 colunas');
  assert.ok(cssCode.includes('height: 38px') || cssCode.includes('height:38px'), 'b2d63e0: .card-actions .btn deve possuir altura de 38px');
  assert.ok(cssCode.includes('overflow-wrap: anywhere') || cssCode.includes('overflow-wrap:anywhere'), 'b2d63e0: deve conter overflow-wrap: anywhere para prevenir estourar colunas com URLs/domínios longos');
  assert.ok(cssCode.includes('word-break: break-word') || cssCode.includes('word-break:break-word'), 'b2d63e0: deve conter word-break: break-word');

  // 224599d: Inspector Responsivo (overflow-x: hidden !important, max-width: 100%, min-width: 0)
  assert.ok(cssCode.includes('overflow-x: hidden !important') || cssCode.includes('overflow-x:hidden!important'), '224599d: .editor-sidebar-right deve conter overflow-x: hidden !important');
  assert.ok(cssCode.includes('.inspector-section'), '224599d: deve conter .inspector-section');

  // b2aeac8: Viewport / Zoom (overflow: auto !important no container do viewport do editor)
  assert.ok(cssCode.includes('overflow: auto !important') || cssCode.includes('overflow:auto!important'), 'b2aeac8: .editor-canvas-container / .editor-workspace-row deve conter overflow: auto !important');
});
