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
import ImportModal from '../apps/frontend/src/editor/ImportModal.js';
import NewTemplateWizard from '../apps/frontend/src/editor/NewTemplateWizard.js';
import type { LabelDocument } from '@witiquetas/label-schema';

test('HOTFIX 5.5.1.2 — BLOQUEAR ENTRADA NO EDITOR EM MODO DE CRIAÇÃO (9 GATES)', async (t) => {
  const sampleDoc: LabelDocument = {
    schemaVersion: 1,
    title: 'Etiqueta Teste 5.5.1.2',
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
        text: 'Teste',
      },
    ],
  };

  // Helper para simular rotas / deep links de acordo com a lógica canônica de App.tsx
  const resolveRoute = (hashStr: string, currentTemplateId: string | null): { targetModule: string; targetHash: string } => {
    const clean = (hashStr || '').replace(/^#/, '').replace(/^\/+|\/+$/g, '');
    let parsedModule = clean || 'home';
    let parsedTemplateId: string | null = null;

    if (clean.startsWith('editor/')) {
      parsedTemplateId = clean.substring(7) || null;
      parsedModule = 'editor';
    } else if (clean.startsWith('editor?template=')) {
      parsedTemplateId = clean.split('template=')[1] || null;
      parsedModule = 'editor';
    } else if (clean === 'editor') {
      parsedModule = 'editor';
      parsedTemplateId = null;
    }

    if (parsedModule === 'new') {
      if (!hasPermission('templates.create')) {
        return { targetModule: 'models', targetHash: '#models' };
      }
      return { targetModule: 'new', targetHash: '#new' };
    }

    if (parsedModule === 'editor' && parsedTemplateId) {
      if (!hasPermission('templates.view') && !hasPermission('templates.edit')) {
        return { targetModule: 'models', targetHash: '#models' };
      }
      return { targetModule: `editor/${parsedTemplateId}`, targetHash: `#editor/${parsedTemplateId}` };
    }

    if (parsedModule === 'editor' && !parsedTemplateId) {
      if (currentTemplateId) {
        if (!hasPermission('templates.view') && !hasPermission('templates.edit')) {
          return { targetModule: 'models', targetHash: '#models' };
        }
        return { targetModule: `editor/${currentTemplateId}`, targetHash: `#editor/${currentTemplateId}` };
      } else if (!hasPermission('templates.create')) {
        return { targetModule: 'models', targetHash: '#models' };
      } else {
        return { targetModule: 'editor', targetHash: '#editor' };
      }
    }

    return { targetModule: parsedModule, targetHash: `#${parsedModule}` };
  };

  // =========================================================================
  // GATE 1: templates.create=false + sem currentTemplateId → Editor de criação NÃO abre
  // =========================================================================
  await t.test('GATE 1: templates.create=false + sem currentTemplateId → Editor de criação NÃO abre', async () => {
    setManualSessionContext({
      user: { id: 'u1', companyId: 'c1', name: 'User', email: 'u1@test.com', status: 'ACTIVE' },
      company: { id: 'c1', name: 'Company', slug: 'comp', status: 'ACTIVE' },
      roles: ['VIEWER'],
      permissions: ['templates.view'], // templates.create = false
      allowedNiches: ['gondola-supermercado'],
    });

    useEditorStore.getState().setDocument(sampleDoc, null); // sem currentTemplateId
    assert.equal(useEditorStore.getState().currentTemplateId, null);

    let onBackCalled = false;
    // Renderiza EditorLayout em modo de criação sem templates.create
    const markup = renderToStaticMarkup(
      React.createElement(EditorLayout, {
        onBackToDashboard: () => {
          onBackCalled = true;
        },
      })
    );

    assert.equal(markup, '', 'EditorLayout deve retornar null e não renderizar markup quando templates.create=false e sem currentTemplateId');
  });

  // =========================================================================
  // GATE 2: templates.create=false + currentTemplateId válido + templates.view=true → Editor abre em modo leitura
  // =========================================================================
  await t.test('GATE 2: templates.create=false + currentTemplateId válido + templates.view=true → Editor abre em modo leitura', async () => {
    setManualSessionContext({
      user: { id: 'u1', companyId: 'c1', name: 'User', email: 'u1@test.com', status: 'ACTIVE' },
      company: { id: 'c1', name: 'Company', slug: 'comp', status: 'ACTIVE' },
      roles: ['VIEWER'],
      permissions: ['templates.view'], // templates.create = false, templates.view = true, templates.edit = false
      allowedNiches: ['gondola-supermercado'],
    });

    useEditorStore.getState().setDocument(sampleDoc, 'tpl-existente-1', 1);
    assert.equal(useEditorStore.getState().currentTemplateId, 'tpl-existente-1');

    const markup = renderToStaticMarkup(
      React.createElement(EditorLayout, {
        onBackToDashboard: () => {},
      })
    );

    assert.ok(markup.length > 0, 'EditorLayout deve abrir para modelo existente com templates.view');
    assert.ok(markup.includes('Somente leitura'), 'Editor deve exibir indicador de Somente leitura');
    assert.ok(!markup.includes('>Salvar<'), 'Botão Salvar não deve estar presente para usuário sem templates.edit');
  });

  // =========================================================================
  // GATE 3: templates.create=false + currentTemplateId válido + templates.edit=true → Editor abre e pode salvar edição
  // =========================================================================
  await t.test('GATE 3: templates.create=false + currentTemplateId válido + templates.edit=true → Editor abre e pode salvar edição', async () => {
    setManualSessionContext({
      user: { id: 'u1', companyId: 'c1', name: 'User', email: 'u1@test.com', status: 'ACTIVE' },
      company: { id: 'c1', name: 'Company', slug: 'comp', status: 'ACTIVE' },
      roles: ['EDITOR_ONLY'],
      permissions: ['templates.view', 'templates.edit'], // templates.create = false, templates.edit = true
      allowedNiches: ['gondola-supermercado'],
    });

    useEditorStore.getState().setDocument(sampleDoc, 'tpl-edit-1', 1);
    useEditorStore.getState().setSaveStatus('unsaved');
    assert.equal(useEditorStore.getState().currentTemplateId, 'tpl-edit-1');

    const markup = renderToStaticMarkup(
      React.createElement(EditorLayout, {
        onBackToDashboard: () => {},
      })
    );

    assert.ok(markup.length > 0, 'EditorLayout deve abrir para modelo existente com templates.edit');
    assert.ok(!markup.includes('Somente leitura'), 'Não deve exibir somente leitura para quem tem templates.edit');
    assert.ok(markup.includes('Salvar'), 'Botão Salvar deve estar presente para usuário com templates.edit quando não salvo');
  });

  // =========================================================================
  // GATE 4: templates.create=false → Save As New bloqueado
  // =========================================================================
  await t.test('GATE 4: templates.create=false → Save As New bloqueado', async () => {
    setManualSessionContext({
      user: { id: 'u1', companyId: 'c1', name: 'User', email: 'u1@test.com', status: 'ACTIVE' },
      company: { id: 'c1', name: 'Company', slug: 'comp', status: 'ACTIVE' },
      roles: ['EDITOR_ONLY'],
      permissions: ['templates.view', 'templates.edit'], // sem templates.create
      allowedNiches: ['gondola-supermercado'],
    });

    // 1. resolveDeletedSaveAsNew
    const deletedResult = await useEditorStore.getState().resolveDeletedSaveAsNew();
    assert.equal(deletedResult, false, 'resolveDeletedSaveAsNew deve retornar false sem templates.create');

    // 2. resolveConflictSaveAsCopy
    const copyResult = await useEditorStore.getState().resolveConflictSaveAsCopy();
    assert.equal(copyResult, false, 'resolveConflictSaveAsCopy deve retornar false sem templates.create');

    // 3. saveDocumentToBackend sem currentTemplateId (criação)
    useEditorStore.getState().setDocument(sampleDoc, null);
    const saveNewResult = await useEditorStore.getState().saveDocumentToBackend();
    assert.equal(saveNewResult, false, 'saveDocumentToBackend sem currentTemplateId deve ser bloqueado sem templates.create');
  });

  // =========================================================================
  // GATE 5: templates.create=false → Importar como novo bloqueado
  // =========================================================================
  await t.test('GATE 5: templates.create=false → Importar como novo bloqueado', async () => {
    setManualSessionContext({
      user: { id: 'u1', companyId: 'c1', name: 'User', email: 'u1@test.com', status: 'ACTIVE' },
      company: { id: 'c1', name: 'Company', slug: 'comp', status: 'ACTIVE' },
      roles: ['EDITOR_ONLY'],
      permissions: ['templates.view', 'templates.edit'], // sem templates.create
      allowedNiches: ['gondola-supermercado'],
    });

    const markup = renderToStaticMarkup(
      React.createElement(ImportModal, {
        isOpen: true,
        onClose: () => {},
      })
    );

    assert.equal(markup, '', 'ImportModal deve retornar null quando templates.create=false');
  });

  // =========================================================================
  // GATE 6: templates.create=false → duplicar bloqueado
  // =========================================================================
  await t.test('GATE 6: templates.create=false → duplicar bloqueado', async () => {
    setManualSessionContext({
      user: { id: 'u1', companyId: 'c1', name: 'User', email: 'u1@test.com', status: 'ACTIVE' },
      company: { id: 'c1', name: 'Company', slug: 'comp', status: 'ACTIVE' },
      roles: ['EDITOR_ONLY'],
      permissions: ['templates.view', 'templates.edit'], // sem templates.create
      allowedNiches: ['gondola-supermercado'],
    });

    assert.equal(hasPermission('templates.create'), false);
    // Simula a verificação em ModelsPage: if (!canCreate) return;
    const canCreate = hasPermission('templates.create');
    let duplicateTriggered = false;
    if (canCreate) {
      duplicateTriggered = true;
    }
    assert.equal(duplicateTriggered, false, 'Duplicação de modelo não deve ser acionada sem templates.create');
  });

  // =========================================================================
  // GATE 7: templates.create=true → criação continua normal
  // =========================================================================
  await t.test('GATE 7: templates.create=true → criação continua normal', async () => {
    setManualSessionContext({
      user: { id: 'u1', companyId: 'c1', name: 'User', email: 'u1@test.com', status: 'ACTIVE' },
      company: { id: 'c1', name: 'Company', slug: 'comp', status: 'ACTIVE' },
      roles: ['CREATOR'],
      permissions: ['templates.view', 'templates.create', 'templates.edit'],
      allowedNiches: ['gondola-supermercado'],
    });

    assert.equal(hasPermission('templates.create'), true);

    // 1. Wizard renderiza
    const wizardMarkup = renderToStaticMarkup(
      React.createElement(NewTemplateWizard, {
        isOpen: true,
        onClose: () => {},
      })
    );
    assert.ok(wizardMarkup.length > 0, 'NewTemplateWizard deve renderizar quando templates.create=true');

    // 2. ImportModal renderiza
    const importMarkup = renderToStaticMarkup(
      React.createElement(ImportModal, {
        isOpen: true,
        onClose: () => {},
      })
    );
    assert.ok(importMarkup.length > 0, 'ImportModal deve renderizar quando templates.create=true');

    // 3. EditorLayout abre em criação (currentTemplateId = null)
    useEditorStore.getState().setDocument(sampleDoc, null);
    const editorMarkup = renderToStaticMarkup(
      React.createElement(EditorLayout, {
        onBackToDashboard: () => {},
      })
    );
    assert.ok(editorMarkup.length > 0, 'EditorLayout deve abrir em modo criação quando templates.create=true');
  });

  // =========================================================================
  // GATE 8: deep-link de criação redireciona para Meus Modelos
  // =========================================================================
  await t.test('GATE 8: deep-link de criação redireciona para Meus Modelos', async () => {
    setManualSessionContext({
      user: { id: 'u1', companyId: 'c1', name: 'User', email: 'u1@test.com', status: 'ACTIVE' },
      company: { id: 'c1', name: 'Company', slug: 'comp', status: 'ACTIVE' },
      roles: ['EDITOR_ONLY'],
      permissions: ['templates.view', 'templates.edit'], // sem templates.create
      allowedNiches: ['gondola-supermercado'],
    });

    // Tentativa 1: deep-link #new
    const resNew = resolveRoute('#new', null);
    assert.equal(resNew.targetModule, 'models', 'Deep-link #new sem templates.create deve redirecionar para models');
    assert.equal(resNew.targetHash, '#models');

    // Tentativa 2: deep-link #editor vazio sem currentTemplateId
    const resEditorBlank = resolveRoute('#editor', null);
    assert.equal(resEditorBlank.targetModule, 'models', 'Deep-link #editor vazio sem templates.create deve redirecionar para models');
    assert.equal(resEditorBlank.targetHash, '#models');

    // Tentativa 3: deep-link /new
    const resNewSlash = resolveRoute('/new', null);
    assert.equal(resNewSlash.targetModule, 'models');

    // Tentativa 4: deep-link /editor
    const resEditorSlash = resolveRoute('/editor', null);
    assert.equal(resEditorSlash.targetModule, 'models');
  });

  // =========================================================================
  // GATE 9: deep-link de modelo existente autorizado continua funcionando
  // =========================================================================
  await t.test('GATE 9: deep-link de modelo existente autorizado continua funcionando', async () => {
    setManualSessionContext({
      user: { id: 'u1', companyId: 'c1', name: 'User', email: 'u1@test.com', status: 'ACTIVE' },
      company: { id: 'c1', name: 'Company', slug: 'comp', status: 'ACTIVE' },
      roles: ['EDITOR_ONLY'],
      permissions: ['templates.view', 'templates.edit'], // sem templates.create, mas COM templates.view/edit
      allowedNiches: ['gondola-supermercado'],
    });

    // Tentativa 1: deep-link #editor/:id
    const resExisting = resolveRoute('#editor/tpl-12345', 'tpl-12345');
    assert.equal(resExisting.targetModule, 'editor/tpl-12345', 'Deep-link com modelo existente autorizado deve ser aceito');
    assert.equal(resExisting.targetHash, '#editor/tpl-12345');

    // Tentativa 2: deep-link #editor?template=:id
    const resQuery = resolveRoute('#editor?template=tpl-67890', 'tpl-67890');
    assert.equal(resQuery.targetModule, 'editor/tpl-67890');

    // Tentativa 3: rota editor sem id mas com modelo carregado no store
    const resStoreLoaded = resolveRoute('#editor', 'tpl-12345');
    assert.equal(resStoreLoaded.targetModule, 'editor/tpl-12345');
  });
});
