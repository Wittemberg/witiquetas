import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  setManualSessionContext,
  hasPermission,
  type SessionContext,
} from '../apps/frontend/src/auth/session.js';

import { useEditorStore } from '../apps/frontend/src/editor/useEditorStore.js';
import EditorLayout from '../apps/frontend/src/editor/EditorLayout.js';
import { ModelsPage } from '../apps/frontend/src/modules/models/ModelsPage.js';
import type { LabelDocument } from '@witiquetas/label-schema';

test('HOTFIX FINAL — READ-ONLY MODEL NAVIGATION (6 GATES)', async (t) => {
  const sampleDoc: LabelDocument = {
    schemaVersion: 1,
    title: 'Etiqueta Teste ReadOnly',
    dimensions: { widthMm: 100, heightMm: 30, dpi: 203, orientation: 'landscape' },
    elements: [
      {
        id: 'txt-1',
        type: 'text',
        name: 'Texto 1',
        x: 5,
        y: 5,
        width: 40,
        height: 8,
        text: 'Produto A',
      },
    ],
  };

  // =========================================================================
  // GATE 1: Usuário sem templates.edit abre modelo existente → Somente Leitura
  // =========================================================================
  await t.test('GATE 1: usuário sem templates.edit abre modelo → somente leitura', async () => {
    setManualSessionContext({
      user: { id: 'u1', companyId: 'c1', name: 'Reader', email: 'r@test.com', status: 'ACTIVE' },
      company: { id: 'c1', name: 'Company', slug: 'comp', status: 'ACTIVE' },
      roles: ['VIEWER'],
      permissions: ['templates.view'], // sem templates.edit, sem templates.create
      allowedNiches: ['gondola-supermercado'],
    });

    useEditorStore.getState().setDocument(sampleDoc, 'tpl-existente-1', 1);
    assert.equal(useEditorStore.getState().currentTemplateId, 'tpl-existente-1');

    const markup = renderToStaticMarkup(
      React.createElement(EditorLayout, {
        onBackToDashboard: () => {},
        theme: 'dark',
      })
    );

    // Deve exibir o badge/status de "Somente leitura"
    assert.ok(markup.includes('Somente leitura'), 'Deve exibir tag "Somente leitura"');
    // Não deve exibir o botão de salvar
    assert.ok(!markup.includes('>Salvar</span>'), 'Não deve exibir botão Salvar no header');
  });

  // =========================================================================
  // GATE 2: Trocar de modelo sem alterações → navega direto, sem prompt de salvar
  // =========================================================================
  await t.test('GATE 2: trocar de modelo sem alterações → navega direto, sem prompt de salvar', async () => {
    setManualSessionContext({
      user: { id: 'u1', companyId: 'c1', name: 'Reader', email: 'r@test.com', status: 'ACTIVE' },
      company: { id: 'c1', name: 'Company', slug: 'comp', status: 'ACTIVE' },
      roles: ['VIEWER'],
      permissions: ['templates.view'],
      allowedNiches: ['gondola-supermercado'],
    });

    useEditorStore.getState().setDocument(sampleDoc, 'tpl-existente-1', 1);
    assert.equal(useEditorStore.getState().isDirty, false);

    let navigatedBack = false;
    const markup = renderToStaticMarkup(
      React.createElement(EditorLayout, {
        onBackToDashboard: () => {
          navigatedBack = true;
        },
        theme: 'dark',
      })
    );

    // O modal de saída não é renderizado quando isDirty=false
    assert.ok(!markup.includes('wizard-modal-overlay'), 'Modal de confirmação não deve estar presente sem alterações');
    assert.ok(!markup.includes('Alterações não salvas'), 'Não deve exibir prompt de alterações');
    assert.ok(!markup.includes('Descartar alterações?'), 'Não deve exibir prompt de descarte');
  });

  // =========================================================================
  // GATE 3: Tentar Ctrl+S ou saveDocumentToBackend → bloqueado/ignorado
  // =========================================================================
  await t.test('GATE 3: tentar Ctrl+S / saveDocumentToBackend → bloqueado/ignorado', async () => {
    setManualSessionContext({
      user: { id: 'u1', companyId: 'c1', name: 'Reader', email: 'r@test.com', status: 'ACTIVE' },
      company: { id: 'c1', name: 'Company', slug: 'comp', status: 'ACTIVE' },
      roles: ['VIEWER'],
      permissions: ['templates.view'], // sem templates.edit
      allowedNiches: ['gondola-supermercado'],
    });

    useEditorStore.getState().setDocument(sampleDoc, 'tpl-existente-1', 1);

    // Chamada direta ao saveDocumentToBackend deve falhar com status de erro sem atualizar
    const saveResult = await useEditorStore.getState().saveDocumentToBackend();
    assert.equal(saveResult, false, 'saveDocumentToBackend deve retornar false');
    assert.equal(useEditorStore.getState().saveStatus, 'error');
    assert.equal(
      useEditorStore.getState().saveErrorMessage,
      'Você não possui permissão para editar este modelo.'
    );
  });

  // =========================================================================
  // GATE 4: Botão salvar inexistente/desabilitado conforme comportamento atual
  // =========================================================================
  await t.test('GATE 4: botão salvar inexistente em modo somente leitura mesmo se isDirty for true', async () => {
    setManualSessionContext({
      user: { id: 'u1', companyId: 'c1', name: 'Reader', email: 'r@test.com', status: 'ACTIVE' },
      company: { id: 'c1', name: 'Company', slug: 'comp', status: 'ACTIVE' },
      roles: ['VIEWER'],
      permissions: ['templates.view'], // sem templates.edit
      allowedNiches: ['gondola-supermercado'],
    });

    useEditorStore.getState().setDocument(sampleDoc, 'tpl-existente-1', 1);
    // Simula uma alteração local
    useEditorStore.setState({ isDirty: true, saveStatus: 'unsaved' });

    const markup = renderToStaticMarkup(
      React.createElement(EditorLayout, {
        onBackToDashboard: () => {},
        theme: 'dark',
      })
    );

    // Botão Salvar não deve existir no header
    assert.ok(!markup.includes('>Salvar</span>'), 'Botão Salvar nunca deve ser renderizado para usuário sem templates.edit');
    // Indicador continua mostrando "Somente leitura"
    assert.ok(markup.includes('Somente leitura'), 'Deve exibir indicador "Somente leitura"');
  });

  // =========================================================================
  // GATE 5: Usuário com templates.edit continua recebendo fluxo normal de salvar
  // =========================================================================
  await t.test('GATE 5: usuário com templates.edit continua recebendo fluxo normal de salvar', async () => {
    setManualSessionContext({
      user: { id: 'u2', companyId: 'c1', name: 'Editor', email: 'e@test.com', status: 'ACTIVE' },
      company: { id: 'c1', name: 'Company', slug: 'comp', status: 'ACTIVE' },
      roles: ['EDITOR'],
      permissions: ['templates.view', 'templates.edit'], // tem templates.edit
      allowedNiches: ['gondola-supermercado'],
    });

    useEditorStore.getState().setDocument(sampleDoc, 'tpl-existente-1', 1);
    useEditorStore.setState({ isDirty: true, saveStatus: 'unsaved' });

    const markup = renderToStaticMarkup(
      React.createElement(EditorLayout, {
        onBackToDashboard: () => {},
        theme: 'dark',
      })
    );

    // Botão Salvar deve aparecer no header
    assert.ok(markup.includes('>Salvar</span>'), 'Botão Salvar deve estar presente para usuário com templates.edit');
    // Não deve exibir tag "Somente leitura"
    assert.ok(!markup.includes('Somente leitura'), 'Não deve exibir tag "Somente leitura" para usuário com templates.edit');
  });

  // =========================================================================
  // GATE 6: Usuário com templates.create=false continua sem Nova Etiqueta
  // =========================================================================
  await t.test('GATE 6: usuário com templates.create=false continua sem Nova Etiqueta', async () => {
    setManualSessionContext({
      user: { id: 'u1', companyId: 'c1', name: 'Reader', email: 'r@test.com', status: 'ACTIVE' },
      company: { id: 'c1', name: 'Company', slug: 'comp', status: 'ACTIVE' },
      roles: ['VIEWER'],
      permissions: ['templates.view', 'templates.edit'], // templates.create = false
      allowedNiches: ['gondola-supermercado'],
    });

    assert.equal(hasPermission('templates.create'), false);

    // ModelsPage renderizada estaticamente com templates mockados
    const markup = renderToStaticMarkup(
      React.createElement(ModelsPage, {
        onOpenModel: () => {},
        onCreateNew: () => {},
      })
    );

    // Botão "Nova Etiqueta" não deve existir
    assert.ok(!markup.includes('Nova Etiqueta'), 'Botão "Nova Etiqueta" não deve estar presente sem templates.create');
    assert.ok(!markup.includes('Criar primeira etiqueta'), 'Botão "Criar primeira etiqueta" não deve estar presente');
  });
});
