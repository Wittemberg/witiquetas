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

import { ReconnectAgentModal } from '../apps/frontend/src/agent/ReconnectAgentModal.js';
import { AgentDetailsModal } from '../apps/frontend/src/agent/AgentDetailsModal.js';
import { AgentStatusBadge } from '../apps/frontend/src/agent/AgentStatusBadge.js';
import { AgentsAdminView } from '../apps/frontend/src/modules/admin/AgentsAdminView.js';
import App from '../apps/frontend/src/App.js';
import type { AgentDTO } from '@witiquetas/contracts';

test('SUÍTE PACKAGE 5.7.2.1.2 — RECONNECT UX LANDSCAPE, THEMES & OFFLINE DIAGNOSTICS', async (t) => {

  const mockOfflineAgent: AgentDTO = {
    id: 'agent-suporte-2-live',
    companyId: 'comp-matriz-01',
    name: 'SUPORTE-2',
    machineName: 'SUPORTE-2',
    status: 'OFFLINE',
    os: 'windows',
    architecture: 'x86_64',
    agentVersion: '0.2.0',
    lastSeenAt: new Date(Date.now() - 22 * 3600000).toISOString(),
    installationId: 'inst-98f23a10-44be-419b-a012-78d123456789',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockOnlineAgent: AgentDTO = {
    ...mockOfflineAgent,
    id: 'agent-suporte-1-live',
    name: 'SUPORTE-1',
    machineName: 'SUPORTE-1',
    status: 'ONLINE',
    lastSeenAt: new Date(Date.now() - 15000).toISOString(),
  };

  const mockRevokedAgent: AgentDTO = {
    ...mockOfflineAgent,
    id: 'agent-suporte-revoked',
    name: 'SUPORTE-REVOKED',
    machineName: 'SUPORTE-REVOKED',
    status: 'REVOKED',
  };

  // =========================================================================
  // GATE 1: TRACK A — MODAL LANDSCAPE (900-1050px) & LAYOUT 2 COLUNAS
  // =========================================================================
  await t.test('Gate 1: Modal possui largura landscape (900-1050px) e estrutura de 2 colunas', () => {
    const modalPath = path.resolve('apps/frontend/src/agent/ReconnectAgentModal.tsx');
    const modalContent = fs.readFileSync(modalPath, 'utf8');

    // 1. Largura landscape (900-1050px)
    assert.ok(
      modalContent.includes('maxWidth: \'980px\'') || modalContent.includes('maxWidth: "980px"') ||
      modalContent.includes('min(95vw, 980px)') || modalContent.includes('max-width: 980px'),
      'Modal deve estar na faixa landscape de 900-1050px (alvo: 980px)'
    );

    // 2. Grid de 2 colunas no desktop
    assert.ok(
      modalContent.includes('reconnect-modal-grid') || modalContent.includes('gridTemplateColumns'),
      'Modal deve possuir classe ou estilo de grid para 2 colunas'
    );
    assert.ok(
      modalContent.includes('minmax(280px, 340px) 1fr') || modalContent.includes('minmax('),
      'Grid desktop deve definir coluna esquerda de metadados e coluna direita de diagnósticos'
    );

    // 3. Responsividade para telas menores (<= 800px)
    assert.ok(
      modalContent.includes('@media (max-width: 800px)') || modalContent.includes('max-width: 800px'),
      'Deve conter media query para colapsar em 1 coluna em telas menores'
    );

    // 4. Execução em runtime
    const html = renderToStaticMarkup(
      React.createElement(ReconnectAgentModal, {
        isOpen: true,
        agent: mockOfflineAgent,
        onClose: () => {},
        onReinstall: () => {},
      })
    );
    assert.ok(html.includes('reconnect-modal-grid'), 'HTML renderizado deve conter o container do grid');
    assert.ok(html.includes('SUPORTE-2'), 'Deve conter nome do computador na coluna esquerda');
  });

  // =========================================================================
  // GATE 2: TRACK B — DESIGN TOKENS LIGHT & DARK (ZERO DARK FALLBACK HARDCODED)
  // =========================================================================
  await t.test('Gate 2: Eliminação de background escuro hardcoded (#182234) e conformidade de temas', () => {
    const modalPath = path.resolve('apps/frontend/src/agent/ReconnectAgentModal.tsx');
    const modalContent = fs.readFileSync(modalPath, 'utf8');

    // 1. Não pode conter fallback hardcoded #182234 que quebra o tema claro
    assert.equal(
      modalContent.includes('#182234'),
      false,
      'ReconnectAgentModal NÃO pode conter #182234 hardcoded (causa do bug de contraste no tema claro)'
    );

    // 2. Deve utilizar tokens semânticos do Design System
    assert.ok(modalContent.includes('var(--modal-bg'), 'Deve usar token --modal-bg para background');
    assert.ok(modalContent.includes('var(--text-primary)'), 'Deve usar token --text-primary para textos principais');
    assert.ok(modalContent.includes('var(--border-color)'), 'Deve usar token --border-color para bordas');

    // 3. Verifica tokens no CSS raiz
    const cssPath = path.resolve('apps/frontend/src/index.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    assert.ok(cssContent.includes('[data-theme="light"]'), 'CSS deve declarar tokens para light theme');
    assert.ok(cssContent.includes('--modal-bg: #ffffff;'), 'Tema claro deve ter --modal-bg como #ffffff');
  });

  // =========================================================================
  // GATE 3: TRACK C — DIAGNÓSTICO HONESTO & DETERMINÍSTICO (OFFLINE / AUTH / ONLINE)
  // =========================================================================
  await t.test('Gate 3: Diagnóstico distingue corretamente OFFLINE, AUTH_ERROR e ONLINE sem inferências falsas', () => {
    // 1. Agente OFFLINE por ausência de heartbeat
    const offlineHtml = renderToStaticMarkup(
      React.createElement(ReconnectAgentModal, {
        isOpen: true,
        agent: mockOfflineAgent,
        onClose: () => {},
      })
    );
    assert.ok(offlineHtml.includes('Sem Heartbeat Recente') || offlineHtml.includes('Offline'), 'Deve indicar ausência de heartbeat recente');
    assert.ok(offlineHtml.includes('2 minutos'), 'Deve esclarecer que não recebe sinal há mais de 2 minutos');

    // 2. Agente REVOKED
    const revokedHtml = renderToStaticMarkup(
      React.createElement(ReconnectAgentModal, {
        isOpen: true,
        agent: mockRevokedAgent,
        onClose: () => {},
      })
    );
    assert.ok(revokedHtml.includes('Credencial Revogada') || revokedHtml.includes('Acesso desautorizado'), 'Deve identificar credencial revogada');

    // 3. Agente ONLINE
    const onlineHtml = renderToStaticMarkup(
      React.createElement(ReconnectAgentModal, {
        isOpen: true,
        agent: mockOnlineAgent,
        onClose: () => {},
      })
    );
    assert.ok(onlineHtml.includes('Operacional') || onlineHtml.includes('Serviço ativo'), 'Deve indicar serviço operacional');
  });

  // =========================================================================
  // GATE 4: TRACK D — UX HONESTA (EXPLICAR QUE VERIFICAÇÃO CONSULTA SERVIDOR)
  // =========================================================================
  await t.test('Gate 4: Modal esclarece que "Verificar" consulta a nuvem e não liga o computador remotamente', () => {
    const modalPath = path.resolve('apps/frontend/src/agent/ReconnectAgentModal.tsx');
    const modalContent = fs.readFileSync(modalPath, 'utf8');

    // 1. Explicação honesta da verificação
    assert.ok(
      modalContent.includes('Transparência da Verificação') || modalContent.includes('consulta os servidores da nuvem'),
      'Modal deve explicar honestamente como a verificação funciona'
    );
    assert.ok(
      modalContent.includes('não emite comandos remotos') || modalContent.includes('não liga o computador'),
      'Modal deve esclarecer que não emite comandos remotos para ligar a máquina'
    );

    // 2. Informação sobre Tray Companion na evolução do produto
    assert.ok(
      modalContent.includes('Tray Companion') || modalContent.includes('bandeja do sistema'),
      'Modal deve mencionar o Tray Companion em desenvolvimento'
    );

    // 3. Orientações sem exigir PowerShell/CMD
    assert.equal(modalContent.includes('Abra PowerShell'), false);
    assert.equal(modalContent.includes('Execute CMD'), false);
  });

  // =========================================================================
  // GATE 5: TRACK E — REGRESSÃO & RENDERIZAÇÃO REAL EM DIVERSAS RESOLUÇÕES
  // =========================================================================
  await t.test('Gate 5: Componentes renderizam sem quebra em simulação de resoluções (1920, 1600, 1366, 1280)', () => {
    const resolutions = [1920, 1600, 1366, 1280];

    for (const width of resolutions) {
      // Simula resolução no ambiente window
      (globalThis.window as any).innerWidth = width;
      (globalThis.window as any).innerHeight = Math.round(width * 0.5625);

      // 1. ReconnectAgentModal
      const reconnectHtml = renderToStaticMarkup(
        React.createElement(ReconnectAgentModal, {
          isOpen: true,
          agent: mockOfflineAgent,
          onClose: () => {},
          onReinstall: () => {},
        })
      );
      assert.ok(reconnectHtml.length > 500, `ReconnectAgentModal deve renderizar para largura ${width}px`);
      assert.ok(reconnectHtml.includes('Verificar Conexão Agora'), 'Deve conter botão primário');
      assert.ok(reconnectHtml.includes('Reinstalar / Novo Pareamento'), 'Deve conter ação secundária');
      assert.ok(reconnectHtml.includes('Fechar'), 'Deve conter botão de fechar');

      // 2. AgentDetailsModal
      const detailsHtml = renderToStaticMarkup(
        React.createElement(AgentDetailsModal, {
          isOpen: true,
          agent: mockOfflineAgent,
          onClose: () => {},
          onReconnect: () => {},
        })
      );
      assert.ok(detailsHtml.length > 500, `AgentDetailsModal deve renderizar para largura ${width}px`);

      // 3. AgentStatusBadge
      const badgeHtml = renderToStaticMarkup(
        React.createElement(AgentStatusBadge, { status: 'OFFLINE' })
      );
      assert.ok(badgeHtml.includes('Offline'));

      // 4. AgentsAdminView
      const adminHtml = renderToStaticMarkup(
        React.createElement(AgentsAdminView, { canManage: true })
      );
      assert.ok(adminHtml.length > 500);

      // 5. Dashboard App raiz
      const appHtml = renderToStaticMarkup(React.createElement(App));
      assert.ok(appHtml.length > 200);
    }
  });

  // =========================================================================
  // GATE 6: TRACK A (FOLLOW-UP) — ATUALIZAÇÃO IN-PLACE SEM SALTO VERTICAL
  // =========================================================================
  await t.test('Gate 6: Diagnóstico atualiza in-place sem caixa separada appended e suporta 5 estados', () => {
    const modalPath = path.resolve('apps/frontend/src/agent/ReconnectAgentModal.tsx');
    const modalContent = fs.readFileSync(modalPath, 'utf8');

    // 1. Suporte aos 5 estados de verificação
    assert.ok(modalContent.includes('IDLE'), 'Deve definir estado IDLE');
    assert.ok(modalContent.includes('CHECKING'), 'Deve definir estado CHECKING');
    assert.ok(modalContent.includes('OFFLINE_RESULT'), 'Deve definir estado OFFLINE_RESULT');
    assert.ok(modalContent.includes('ONLINE_RESULT'), 'Deve definir estado ONLINE_RESULT');
    assert.ok(modalContent.includes('ERROR_RESULT'), 'Deve definir estado ERROR_RESULT');

    // 2. Não possui bloco separado {feedback && ...} que gerava expansão vertical e scroll
    assert.equal(
      modalContent.includes('{feedback &&'),
      false,
      'Não deve injetar caixa de feedback separada que expande a altura do modal'
    );

    // 3. Painel de diagnóstico possui id de teste e minHeight para estabilidade visual
    assert.ok(
      modalContent.includes('data-testid="reconnect-diagnostic-panel"'),
      'Deve possuir container de diagnóstico identificado'
    );
    assert.ok(
      modalContent.includes('minHeight: \'82px\'') || modalContent.includes('minHeight'),
      'Deve possuir minHeight para garantir estabilidade dimensional sem layout shift'
    );

    // 4. Renderização do painel no estado inicial
    const html = renderToStaticMarkup(
      React.createElement(ReconnectAgentModal, {
        isOpen: true,
        agent: mockOfflineAgent,
        onClose: () => {},
      })
    );
    assert.ok(html.includes('data-testid="reconnect-diagnostic-panel"'));
    assert.ok(html.includes('Verificar Conexão Agora'));
  });
});

