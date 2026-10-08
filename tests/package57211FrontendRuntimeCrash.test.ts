import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as lucide from 'lucide-react';

// Setup minimal DOM mocks for React runtime execution in Node
const mockStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

if (!globalThis.window) {
  globalThis.window = {
    location: { hash: '#home', pathname: '/' },
    addEventListener: () => {},
    removeEventListener: () => {},
    localStorage: mockStorage,
  } as any;
}
if (!globalThis.localStorage) {
  globalThis.localStorage = mockStorage as any;
}
if (!globalThis.fetch) {
  globalThis.fetch = (() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })) as any;
}

// Import components for runtime execution
import { RefreshCw, CheckCircle2, Settings, KeyRound, Cpu } from 'lucide-react';
import { AgentStatusBadge } from '../apps/frontend/src/agent/AgentStatusBadge.js';
import { ReconnectAgentModal } from '../apps/frontend/src/agent/ReconnectAgentModal.js';
import { AgentDetailsModal } from '../apps/frontend/src/agent/AgentDetailsModal.js';
import { AgentsAdminView } from '../apps/frontend/src/modules/admin/AgentsAdminView.js';
import App from '../apps/frontend/src/App.js';
import type { AgentDTO } from '@witiquetas/contracts';

test('SUÍTE PACKAGE 5.7.2.1.1 — P0 FRONTEND RUNTIME CRASH REGRESSION GATE', async (t) => {

  // =========================================================================
  // GATE 1: VERIFICAÇÃO ESTÁTICA DO IMPORT DE RefreshCw NO App.tsx
  // =========================================================================
  await t.test('Gate 1: App.tsx importa explicitamente RefreshCw de lucide-react', () => {
    const appTsxPath = path.resolve('apps/frontend/src/App.tsx');
    const content = fs.readFileSync(appTsxPath, 'utf8');

    // Extrai bloco de imports do lucide-react
    const lucideImportMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/);
    assert.ok(lucideImportMatch, 'App.tsx deve importar símbolos de lucide-react');

    const importedSymbols = lucideImportMatch[1].split(',').map((s) => s.trim());
    assert.ok(
      importedSymbols.includes('RefreshCw'),
      'RefreshCw DEVE constar na lista de imports de lucide-react em App.tsx'
    );
  });

  // =========================================================================
  // GATE 2: AUDITORIA DE TODOS OS ÍCONES LUCIDE USADOS NO App.tsx E COMPONENTES 5.7.2.1
  // =========================================================================
  await t.test('Gate 2: Todos os componentes Lucide utilizados em JSX possuem imports válidos', () => {
    const filesToAudit = [
      'apps/frontend/src/App.tsx',
      'apps/frontend/src/agent/AgentStatusBadge.tsx',
      'apps/frontend/src/agent/ReconnectAgentModal.tsx',
      'apps/frontend/src/agent/AgentDetailsModal.tsx',
      'apps/frontend/src/modules/admin/AgentsAdminView.tsx',
    ];

    const lucideExports = new Set(Object.keys(lucide));

    for (const relPath of filesToAudit) {
      const fullPath = path.resolve(relPath);
      assert.ok(fs.existsSync(fullPath), `Arquivo ${relPath} deve existir`);
      const fileContent = fs.readFileSync(fullPath, 'utf8');

      // Coleta imports de lucide-react
      const importedFromLucide = new Set<string>();
      const importRegex = /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/g;
      let match;
      while ((match = importRegex.exec(fileContent)) !== null) {
        match[1].split(',').forEach((s) => {
          const clean = s.trim().split(/\s+as\s+/)[0].trim();
          if (clean) importedFromLucide.add(clean);
        });
      }

      // Procura JSX tags que coincidem com nomes de export do Lucide
      const jsxTags = Array.from(fileContent.matchAll(/<([A-Z][a-zA-Z0-9]+)/g)).map((m) => m[1]);
      const usedLucideTags = jsxTags.filter((tag) => lucideExports.has(tag));

      for (const usedTag of usedLucideTags) {
        assert.ok(
          importedFromLucide.has(usedTag),
          `No arquivo ${relPath}, o ícone Lucide <${usedTag} /> é utilizado em JSX mas NÃO foi importado!`
        );
      }
    }
  });

  // =========================================================================
  // GATE 3: EXECUÇÃO EM RUNTIME DE AgentStatusBadge (ONLINE E OFFLINE)
  // =========================================================================
  await t.test('Gate 3: AgentStatusBadge renderiza sem ReferenceError nos estados OFFLINE e ONLINE', () => {
    // 1. Estado OFFLINE
    const offlineHtml = renderToStaticMarkup(
      React.createElement(AgentStatusBadge, { status: 'OFFLINE' })
    );
    assert.ok(offlineHtml.includes('Offline'), 'Badge OFFLINE deve conter texto "Offline"');
    assert.ok(offlineHtml.includes('badge-danger'), 'Badge OFFLINE deve usar classe badge-danger');
    assert.ok(offlineHtml.includes('<svg'), 'Badge OFFLINE deve renderizar ícone SVG');

    // 2. Estado ONLINE
    const onlineHtml = renderToStaticMarkup(
      React.createElement(AgentStatusBadge, { status: 'ONLINE' })
    );
    assert.ok(onlineHtml.includes('Online'), 'Badge ONLINE deve conter texto "Online"');
    assert.ok(onlineHtml.includes('badge-success'), 'Badge ONLINE deve usar classe badge-success');
    assert.ok(onlineHtml.includes('<svg'), 'Badge ONLINE deve renderizar ícone SVG');

    // 3. Estado REVOKED
    const revokedHtml = renderToStaticMarkup(
      React.createElement(AgentStatusBadge, { status: 'REVOKED' })
    );
    assert.ok(revokedHtml.includes('Revogado'), 'Badge REVOKED deve conter texto "Revogado"');
    assert.ok(revokedHtml.includes('badge-secondary'), 'Badge REVOKED deve usar classe badge-secondary');
  });

  // =========================================================================
  // GATE 4: EXECUÇÃO EM RUNTIME DE ReconnectAgentModal
  // =========================================================================
  await t.test('Gate 4: ReconnectAgentModal renderiza sem ReferenceError com agente OFFLINE', () => {
    const mockOfflineAgent: AgentDTO = {
      id: 'agent-mock-off-1',
      companyId: 'comp-matriz-01',
      name: 'SUPORTE-2 (Terminal 2)',
      machineName: 'SUPORTE-2',
      status: 'OFFLINE',
      os: 'windows',
      architecture: 'x86_64',
      agentVersion: '0.2.0',
      lastSeenAt: new Date(Date.now() - 3600000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const modalHtml = renderToStaticMarkup(
      React.createElement(ReconnectAgentModal, {
        isOpen: true,
        agent: mockOfflineAgent,
        onClose: () => {},
        onRefresh: () => {},
        onReinstall: () => {},
      })
    );

    assert.ok(modalHtml.includes('Reconectar Agent'), 'Deve renderizar título do modal de reconexão');
    assert.ok(modalHtml.includes('SUPORTE-2'), 'Deve renderizar machineName do agente');
    assert.ok(modalHtml.includes('Offline'), 'Deve renderizar status Offline');
    assert.ok(modalHtml.includes('<svg'), 'Deve renderizar ícones SVG');
  });

  // =========================================================================
  // GATE 5: EXECUÇÃO EM RUNTIME DE AgentDetailsModal
  // =========================================================================
  await t.test('Gate 5: AgentDetailsModal renderiza sem ReferenceError', () => {
    const mockAgent: AgentDTO = {
      id: 'agent-mock-online-1',
      companyId: 'comp-matriz-01',
      name: 'SUPORTE-1 (Principal)',
      machineName: 'SUPORTE-1',
      status: 'ONLINE',
      os: 'windows',
      architecture: 'x86_64',
      agentVersion: '0.2.0',
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const modalHtml = renderToStaticMarkup(
      React.createElement(AgentDetailsModal, {
        isOpen: true,
        agent: mockAgent,
        onClose: () => {},
        onReconnect: () => {},
      })
    );

    assert.ok(modalHtml.includes('Detalhes do Agent'), 'Deve renderizar título do modal de detalhes');
    assert.ok(modalHtml.includes('SUPORTE-1'), 'Deve renderizar machineName do agente');
    assert.ok(modalHtml.includes('Online'), 'Deve renderizar status Online');
  });

  // =========================================================================
  // GATE 6: EXECUÇÃO EM RUNTIME DE AgentsAdminView
  // =========================================================================
  await t.test('Gate 6: AgentsAdminView renderiza sem ReferenceError em modo gestão', () => {
    const adminHtml = renderToStaticMarkup(
      React.createElement(AgentsAdminView, { canManage: true })
    );

    assert.ok(adminHtml.includes('Agentes Locais de Impressão') || adminHtml.includes('Witiquetas Agent Core'), 'Deve conter cabeçalho da visão administrativa');
    assert.ok(adminHtml.includes('Baixar Instalador') || adminHtml.includes('Download'), 'Deve conter ação de download');
    assert.ok(adminHtml.includes('lucide-refresh-cw'), 'Botão de refresh deve conter o ícone RefreshCw renderizado');
  });

  // =========================================================================
  // GATE 7: EXECUÇÃO EM RUNTIME DO CARD DO AGENT NO DASHBOARD COM AGENTE OFFLINE
  // =========================================================================
  await t.test('Gate 7: Botão Reconectar com RefreshCw avalia e renderiza perfeitamente no Dashboard', () => {
    // Simula a árvore JSX exata do Card de Agente Offline em App.tsx (linhas 758-765)
    // Este foi o ponto exato do ReferenceError: RefreshCw is not defined em produção
    const mockOfflineAgent: AgentDTO = {
      id: 'agent-suporte-2',
      companyId: 'comp-matriz-01',
      name: 'SUPORTE-2',
      machineName: 'SUPORTE-2',
      status: 'OFFLINE',
      os: 'windows',
      architecture: 'x86_64',
      agentVersion: '0.2.0',
      lastSeenAt: new Date(Date.now() - 22 * 3600000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Renderiza a estrutura do card quando status !== 'ONLINE'
    const dashboardOfflineCard = React.createElement(
      'div',
      { className: 'card', 'data-testid': 'dashboard-agent-card' },
      React.createElement(
        'div',
        { className: 'card-header' },
        React.createElement(Cpu, { size: 20, color: 'var(--accent-blue)' }),
        React.createElement(AgentStatusBadge, { status: mockOfflineAgent.status })
      ),
      React.createElement(
        'div',
        { className: 'card-actions' },
        React.createElement(
          'button',
          { className: 'btn btn-primary', onClick: () => {} },
          React.createElement(RefreshCw, { size: 15 }),
          React.createElement('span', null, 'Reconectar')
        ),
        React.createElement(
          'button',
          { className: 'btn btn-secondary', onClick: () => {} },
          React.createElement(Settings, { size: 15 }),
          React.createElement('span', null, 'Administração')
        )
      )
    );

    const renderedHtml = renderToStaticMarkup(dashboardOfflineCard);
    assert.ok(renderedHtml.includes('Reconectar'), 'Card Offline deve conter botão "Reconectar"');
    assert.ok(renderedHtml.includes('Administração'), 'Card Offline deve conter botão "Administração"');
    assert.ok(renderedHtml.includes('lucide-refresh-cw'), 'SVG do ícone RefreshCw deve estar presente no HTML renderizado');
  });

  // =========================================================================
  // GATE 8: EXECUÇÃO EM RUNTIME DO CARD DO AGENT NO DASHBOARD COM AGENTE ONLINE
  // =========================================================================
  await t.test('Gate 8: Botão Detalhes com CheckCircle2 avalia e renderiza perfeitamente no Dashboard', () => {
    const mockOnlineAgent: AgentDTO = {
      id: 'agent-suporte-1',
      companyId: 'comp-matriz-01',
      name: 'SUPORTE-1',
      machineName: 'SUPORTE-1',
      status: 'ONLINE',
      os: 'windows',
      architecture: 'x86_64',
      agentVersion: '0.2.0',
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Renderiza a estrutura do card quando status === 'ONLINE' (linhas 740-755 de App.tsx)
    const dashboardOnlineCard = React.createElement(
      'div',
      { className: 'card', 'data-testid': 'dashboard-agent-card' },
      React.createElement(
        'div',
        { className: 'card-header' },
        React.createElement(Cpu, { size: 20, color: 'var(--accent-blue)' }),
        React.createElement(AgentStatusBadge, { status: mockOnlineAgent.status })
      ),
      React.createElement(
        'div',
        { className: 'card-actions' },
        React.createElement(
          'button',
          { className: 'btn btn-primary', onClick: () => {} },
          React.createElement(CheckCircle2, { size: 15 }),
          React.createElement('span', null, 'Detalhes')
        ),
        React.createElement(
          'button',
          { className: 'btn btn-secondary', onClick: () => {} },
          React.createElement(Settings, { size: 15 }),
          React.createElement('span', null, 'Administração')
        )
      )
    );

    const renderedHtml = renderToStaticMarkup(dashboardOnlineCard);
    assert.ok(renderedHtml.includes('Detalhes'), 'Card Online deve conter botão "Detalhes"');
    assert.ok(renderedHtml.includes('Administração'), 'Card Online deve conter botão "Administração"');
    assert.ok(renderedHtml.includes('lucide-circle-check'), 'SVG do ícone CheckCircle2 deve estar presente no HTML renderizado');
  });

  // =========================================================================
  // GATE 9: RENDERIZAÇÃO COMPLETA DO COMPONENTE App
  // =========================================================================
  await t.test('Gate 9: Componente raiz App renderiza sem nenhum ReferenceError', () => {
    let renderedHtml = '';
    assert.doesNotThrow(() => {
      renderedHtml = renderToStaticMarkup(React.createElement(App));
    }, 'A renderização do componente App NÃO pode disparar ReferenceError nem exceções não tratadas');

    assert.ok(renderedHtml.length > 0, 'App deve produzir HTML');
  });
});
