import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Ler arquivos de estilo e componentes do frontend
const indexCssPath = path.resolve('apps/frontend/src/index.css');
const indexCssContent = fs.readFileSync(indexCssPath, 'utf8');

const appTsxPath = path.resolve('apps/frontend/src/App.tsx');
const appTsxContent = fs.readFileSync(appTsxPath, 'utf8');

// ============================================================================
// SUÍTE DE TESTES: DESIGN CONTRACT PERMANENTE PARA CARDS E AÇÕES
// ============================================================================

test('1. Design System: .card possui min-width: 0 e max-width: 100% para evitar overflow horizontal', () => {
  const cardBlockMatch = indexCssContent.match(/\.card\s*\{([\s\S]*?)\}/);
  assert.ok(cardBlockMatch, '.card deve estar definido em index.css');
  const cardCss = cardBlockMatch[1];

  assert.ok(cardCss.includes('min-width: 0;'), '.card deve conter min-width: 0;');
  assert.ok(cardCss.includes('max-width: 100%;'), '.card deve conter max-width: 100%;');
  assert.ok(cardCss.includes('container-type: inline-size;'), '.card deve suportar container queries');
});

test('2. Design System: .card-actions define grid de 2 colunas com suporte a container/media query', () => {
  const actionsBlockMatch = indexCssContent.match(/\.card-actions\s*\{([\s\S]*?)\}/);
  assert.ok(actionsBlockMatch, '.card-actions deve estar definido em index.css');
  const actionsCss = actionsBlockMatch[1];

  assert.ok(actionsCss.includes('display: grid;'), '.card-actions deve ser display: grid');
  assert.ok(actionsCss.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'), '.card-actions deve usar 2 colunas proporcionais');
  assert.ok(actionsCss.includes('width: 100%;'), '.card-actions deve ter width: 100%');

  // Verificar regras responsivas de empilhamento para telas/cards estreitos
  assert.ok(indexCssContent.includes('@container (max-width: 340px)'), 'Deve conter container query para empilhar ações em 1 coluna');
  assert.ok(indexCssContent.includes('@media (max-width: 480px)'), 'Deve conter media query para empilhar ações em 1 coluna');
});

test('3. Design System: Botões dentro de .card-actions possuem altura uniforme (38px) e min-width: 0', () => {
  const btnActionsMatch = indexCssContent.match(/\.card-actions\s+\.btn\s*\{([\s\S]*?)\}/);
  assert.ok(btnActionsMatch, '.card-actions .btn deve estar definido em index.css');
  const btnCss = btnActionsMatch[1];

  assert.ok(btnCss.includes('height: 38px;'), 'Botões de ação devem ter altura fixa idêntica de 38px');
  assert.ok(btnCss.includes('min-width: 0;'), 'Botões de ação devem conter min-width: 0');
  assert.ok(btnCss.includes('justify-content: center;'), 'Botões de ação devem centralizar conteúdo');
});

test('4. Dashboard App.tsx: O Card do Agent utiliza a classe .card-actions padronizada', () => {
  assert.ok(appTsxContent.includes('<div className="card-actions">'), 'Card do Agent deve usar <div className="card-actions">');
  assert.ok(appTsxContent.includes('<span>Conectar Agent</span>'), 'Deve conter botão Conectar Agent');
  assert.ok(appTsxContent.includes('<span>Baixar Agent</span>'), 'Deve conter botão Baixar Agent');
});
