import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Carregar arquivos fonte para auditoria visual estrutural
const printCenterPagePath = path.resolve('apps/frontend/src/modules/printcenter/PrintCenterPage.tsx');
const printCenterPageContent = fs.readFileSync(printCenterPagePath, 'utf8');

const printCenterGridPath = path.resolve('apps/frontend/src/modules/printcenter/PrintCenterGrid.tsx');
const printCenterGridContent = fs.readFileSync(printCenterGridPath, 'utf8');

const indexCssPath = path.resolve('apps/frontend/src/index.css');
const indexCssContent = fs.readFileSync(indexCssPath, 'utf8');

const packageJsonPath = path.resolve('package.json');
const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');

// Lista de padrões de classes utilitárias do Tailwind que NÃO PODEM existir no JSX da Central
const TAILWIND_CLASS_PATTERNS = [
  /className="[^"]*\bp-6\b[^"]*"/,
  /className="[^"]*\bmax-w-7xl\b[^"]*"/,
  /className="[^"]*\bmx-auto\b[^"]*"/,
  /className="[^"]*\bspace-y-6\b[^"]*"/,
  /className="[^"]*\btext-gray-\d+\b[^"]*"/,
  /className="[^"]*\bbg-gray-\d+\b[^"]*"/,
  /className="[^"]*\bborder-gray-\d+\b[^"]*"/,
  /className="[^"]*\brounded-lg\b[^"]*"/,
  /className="[^"]*\bgrid-cols-\d+\b[^"]*"/,
  /className="[^"]*\bmd:flex-row\b[^"]*"/,
  /className="[^"]*\blg:grid-cols-\d+\b[^"]*"/,
  /className="[^"]*\bhover:bg-gray-\d+\b[^"]*"/,
  /className="[^"]*\bfont-mono\b[^"]*"/,
  /className="[^"]*\bw-full\b[^"]*"/,
];

// ============================================================================
// SUÍTE DE TESTES VISUAIS ESTRUTURAIS: CENTRAL DE IMPRESSÃO (HOTFIX 4.1.2)
// ============================================================================

test('VISUAL A & B: Nenhuma classe utilitária Tailwind permanece em PrintCenterPage.tsx ou PrintCenterGrid.tsx', () => {
  for (const pattern of TAILWIND_CLASS_PATTERNS) {
    assert.ok(
      !pattern.test(printCenterPageContent),
      `PrintCenterPage.tsx não deve conter a classe Tailwind matching: ${pattern}`
    );
    assert.ok(
      !pattern.test(printCenterGridContent),
      `PrintCenterGrid.tsx não deve conter a classe Tailwind matching: ${pattern}`
    );
  }
});

test('VISUAL C: Classes de namespace .print-center-* existem e são utilizadas nos componentes', () => {
  const requiredClasses = [
    '.print-center-page',
    '.print-center-header',
    '.print-center-config-card',
    '.print-center-toolbar',
    '.print-center-content-grid',
    '.print-center-table-wrapper',
    '.print-center-table',
    '.print-center-card',
    '.print-center-preview-box',
    '.print-center-badge-online',
    '.print-center-badge-offline',
  ];

  for (const cls of requiredClasses) {
    assert.ok(
      indexCssContent.includes(cls),
      `index.css deve conter a regra CSS canônica: ${cls}`
    );
  }

  assert.ok(
    printCenterPageContent.includes('className="print-center-page"'),
    'PrintCenterPage.tsx deve utilizar className="print-center-page"'
  );
  assert.ok(
    printCenterGridContent.includes('className="print-center-table-wrapper"'),
    'PrintCenterGrid.tsx deve utilizar className="print-center-table-wrapper"'
  );
});

test('VISUAL D & J: Configuração superior possui layout responsivo (grid-template-columns e suporte a 1366px)', () => {
  assert.ok(
    indexCssContent.includes('.print-center-config-card') &&
      indexCssContent.includes('grid-template-columns: repeat(3, 1fr)'),
    'Config card superior deve ser 3 colunas em telas amplas'
  );
  assert.ok(
    indexCssContent.includes('@media (max-width: 1200px)') ||
      indexCssContent.includes('@media (max-width: 1280px)'),
    'Deve haver breakpoint responsivo para telas médias (ex: 1366px / 1280px)'
  );
});

test('VISUAL E, F & G: Grid, Preview e Resumo utilizam containers e cards dedicados do Design System', () => {
  assert.ok(
    printCenterGridContent.includes('print-center-table-wrapper'),
    'Grid deve utilizar container print-center-table-wrapper'
  );
  assert.ok(
    printCenterPageContent.includes('print-center-preview-box'),
    'Preview contextual deve utilizar card/box próprio print-center-preview-box'
  );
  assert.ok(
    printCenterPageContent.includes('Resumo da Seleção'),
    'Resumo da seleção deve estar contido em card próprio com título Resumo da Seleção'
  );
});

test('VISUAL H: Status Online/Offline do Agent não está concatenado indevidamente com o label Impressora Destino', () => {
  assert.ok(
    !printCenterPageContent.includes('Impressora DestinoRAW TCP Online') &&
      !printCenterPageContent.includes('Impressora DestinoOnline'),
    'O status do agent/impressora não pode estar concatenado com a string do label'
  );
  assert.ok(
    printCenterPageContent.includes('Impressora Destino') &&
      printCenterPageContent.includes('print-center-badge'),
    'Status do agent/impressora deve ser renderizado como badge separado'
  );
});

test('VISUAL I: Botão de ação (Imprimir Seleção) possui estilo canônico de estado disabled', () => {
  assert.ok(
    indexCssContent.includes('.print-center-btn-primary:disabled'),
    'index.css deve ter regra explícita para botão primary disabled'
  );
});

test('VISUAL K & L: Tabela possui container com overflow-x auto interno e zero overflow horizontal global', () => {
  assert.ok(
    indexCssContent.includes('.print-center-table-wrapper') &&
      indexCssContent.includes('overflow-x: auto'),
    'O wrapper da tabela deve ter overflow-x: auto para rolagem interna'
  );
  assert.ok(
    indexCssContent.includes('.print-center-page') &&
      indexCssContent.includes('box-sizing: border-box'),
    'A página da central deve ter box-sizing: border-box para evitar overflow no Shell'
  );
});

test('VISUAL M: CSS da Central consome tokens globais de CSS do Witiquetas (var(--...))', () => {
  const requiredTokens = [
    'var(--bg-primary)',
    'var(--bg-card)',
    'var(--border-color)',
    'var(--text-primary)',
    'var(--text-secondary)',
    'var(--accent-blue)',
    'var(--status-success)',
    'var(--status-danger)',
  ];

  for (const token of requiredTokens) {
    assert.ok(
      indexCssContent.includes(token),
      `CSS da Central deve consumir o token do design system: ${token}`
    );
  }
});

test('VISUAL N: Nenhum framework CSS novo (como tailwindcss, bootstrap) foi adicionado às dependências', () => {
  assert.ok(
    !packageJsonContent.includes('"tailwindcss"'),
    'package.json não deve incluir a dependência tailwindcss'
  );
  assert.ok(
    !packageJsonContent.includes('"bootstrap"'),
    'package.json não deve incluir a dependência bootstrap'
  );
});
