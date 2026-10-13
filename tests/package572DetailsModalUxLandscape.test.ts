import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Minimal DOM mocks for React runtime execution in Node
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

import { AgentDetailsModal } from '../apps/frontend/src/agent/AgentDetailsModal.js';
import { AgentStatusBadge } from '../apps/frontend/src/agent/AgentStatusBadge.js';
import type { AgentDTO } from '@witiquetas/contracts';

test('TRACK A — AGENT DETAILS MODAL UX LANDSCAPE & THEME CONTRAST', async (t) => {
  const mockOnlineAgent: AgentDTO = {
    id: 'agent-suporte-2-live',
    companyId: 'comp-matriz-01',
    name: 'SUPORTE-2',
    machineName: 'SUPORTE-2',
    status: 'ONLINE',
    os: 'windows',
    architecture: 'x86_64',
    agentVersion: '0.2.0',
    lastSeenAt: new Date(Date.now() - 5000).toISOString(),
    installationId: 'inst-98f23a10-44be-419b-a012-78d123456789',
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockOfflineAgent: AgentDTO = {
    ...mockOnlineAgent,
    status: 'OFFLINE',
    lastSeenAt: new Date(Date.now() - 3600000 * 5).toISOString(),
  };

  const mockRevokedAgent: AgentDTO = {
    ...mockOnlineAgent,
    status: 'REVOKED',
  };

  await t.test('1. Layout Landscape: modal usa largura min(95vw, 980px) e grid de 2 colunas', () => {
    const componentPath = path.resolve('apps/frontend/src/agent/AgentDetailsModal.tsx');
    const content = fs.readFileSync(componentPath, 'utf8');

    // 1. Largura landscape (alvo: 980px)
    assert.ok(
      content.includes('maxWidth: \'980px\'') || content.includes('min(95vw, 980px)'),
      'AgentDetailsModal deve possuir largura landscape de 980px'
    );

    // 2. Grid de 2 colunas
    assert.ok(
      content.includes('agent-details-modal-grid') || content.includes('minmax(280px, 340px) 1fr'),
      'AgentDetailsModal deve definir estrutura de 2 colunas (coluna esquerda metadados e coluna direita telemetria/diagnóstico)'
    );

    // 3. Responsividade para telas estreitas <= 800px
    assert.ok(
      content.includes('@media (max-width: 800px)'),
      'AgentDetailsModal deve conter media query responsiva para mobile/tablet'
    );
  });

  await t.test('2. Design System Tokens: eliminação de background escuro hardcoded (#182234)', () => {
    const componentPath = path.resolve('apps/frontend/src/agent/AgentDetailsModal.tsx');
    const content = fs.readFileSync(componentPath, 'utf8');

    assert.equal(
      content.includes('#182234'),
      false,
      'AgentDetailsModal NÃO pode conter #182234 hardcoded (causa do erro de contraste no tema claro)'
    );

    assert.ok(content.includes('var(--modal-bg'), 'Deve usar --modal-bg para background');
    assert.ok(content.includes('var(--text-primary)'), 'Deve usar --text-primary para textos principais');
    assert.ok(content.includes('var(--border-color)'), 'Deve usar --border-color para bordas');
  });

  await t.test('3. Integridade dos Metadados: status, heartbeat, versão, protocolo, SO, arquitetura e instalação', () => {
    const htmlOnline = renderToStaticMarkup(
      React.createElement(AgentDetailsModal, {
        isOpen: true,
        agent: mockOnlineAgent,
        onClose: () => {},
      })
    );

    assert.ok(htmlOnline.includes('SUPORTE-2'), 'Deve exibir nome da máquina');
    assert.ok(htmlOnline.includes('windows'), 'Deve exibir sistema operacional');
    assert.ok(htmlOnline.includes('x86_64'), 'Deve exibir arquitetura');
    assert.ok(htmlOnline.includes('v0.2.0'), 'Deve exibir versão do Agent Core');
    assert.ok(htmlOnline.includes('Agent Protocol v1'), 'Deve exibir versão do protocolo');
    assert.ok(htmlOnline.includes('inst-98f23a10'), 'Deve exibir ID de instalação');
    assert.ok(htmlOnline.includes('Agent Operacional e Pronto'), 'Deve diagnosticar status ONLINE corretamente');
  });

  await t.test('4. Estabilidade Dimensional: diagnóstico estável nos estados ONLINE, OFFLINE e REVOKED', () => {
    const htmlOffline = renderToStaticMarkup(
      React.createElement(AgentDetailsModal, {
        isOpen: true,
        agent: mockOfflineAgent,
        onClose: () => {},
        onReconnect: () => {},
      })
    );

    assert.ok(htmlOffline.includes('Agente Sem Comunicação Recente'), 'Deve diagnosticar ausência de heartbeat recente');
    assert.ok(htmlOffline.includes('Abrir Diagnóstico de Reconexão'), 'Deve exibir botão para abrir reconectar quando offline');

    const htmlRevoked = renderToStaticMarkup(
      React.createElement(AgentDetailsModal, {
        isOpen: true,
        agent: mockRevokedAgent,
        onClose: () => {},
      })
    );

    assert.ok(htmlRevoked.includes('Credencial do Agente Revogada'), 'Deve diagnosticar status REVOKED com transparência');
  });

  await t.test('5. Renderização em todas as resoluções (1920x1080, 1600x900, 1366x768, 1280x720)', () => {
    const resolutions = [1920, 1600, 1366, 1280];

    for (const width of resolutions) {
      (globalThis.window as any).innerWidth = width;
      (globalThis.window as any).innerHeight = Math.round(width * 0.5625);

      const html = renderToStaticMarkup(
        React.createElement(AgentDetailsModal, {
          isOpen: true,
          agent: mockOnlineAgent,
          onClose: () => {},
          onReconnect: () => {},
        })
      );

      assert.ok(html.length > 500, `AgentDetailsModal deve renderizar para largura ${width}px`);
      assert.ok(html.includes('SUPORTE-2'));
      assert.ok(html.includes('Fechar'));
    }
  });
});
