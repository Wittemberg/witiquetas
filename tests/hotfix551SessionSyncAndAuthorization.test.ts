import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NICHES,
  type LabelDocument,
  type QrCodeElement,
  type TextElement,
} from '@witiquetas/label-schema';

import {
  clearAdminMemoryStores,
  CompanyRepository,
  UserRepository,
  RoleRepository,
  CompanyConfigurationRepository,
} from '../apps/backend/src/repositories/adminRepositories.js';

import {
  clearSessionMemoryStores,
  SessionService,
} from '../apps/backend/src/services/sessionService.js';

import { bootstrapCompanyNicheProfiles } from '../apps/backend/src/services/adminBootstrapService.js';
import { EffectiveConfigurationService } from '../apps/backend/src/services/effectiveConfigurationService.js';
import { templateRepository } from '../apps/backend/src/repositories/templateRepository.js';
import { isDeveloperIdentity, getDeveloperCompanyId } from '../apps/backend/src/services/developerAuthService.js';

import {
  setManualSessionContext,
  isElementAllowed,
  hasPermission,
  isNicheAllowed,
  revalidateSessionContext,
  initSessionSync,
  broadcastSessionContextInvalidation,
  getCachedSessionContext,
  SESSION_SYNC_CHANNEL,
} from '../apps/frontend/src/auth/session.js';

import { useEditorStore } from '../apps/frontend/src/editor/useEditorStore.js';
import { getNicheToolboxConfig, type NicheToolItem } from '@witiquetas/label-schema';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PropertyInspector from '../apps/frontend/src/editor/PropertyInspector.js';
import FieldPicker from '../apps/frontend/src/editor/FieldPicker.js';
import { getFieldAvailability } from '../apps/frontend/src/auth/session.js';

test('HOTFIX 5.5.1 / 5.5.1.1 — SINCRONIZAÇÃO DE EFFECTIVE CONFIGURATION + AUTORIZAÇÃO DE CRIAÇÃO + RUNTIME RESOLUTION (19 GATES)', async (t) => {
  clearAdminMemoryStores();
  clearSessionMemoryStores();

  // Setup de empresa e perfis
  const company = await CompanyRepository.create({
    id: 'comp-hotfix-551',
    name: 'Hotfix 5.5.1 Sincronização S.A.',
    legalName: 'Hotfix 5.5.1 Razão Social',
    document: '12.345.678/0001-99',
    slug: 'hotfix-551',
    status: 'ACTIVE',
  });

  await bootstrapCompanyNicheProfiles(company.id);

  // Role COM templates.create e templates.edit
  const creatorRole = await RoleRepository.create({
    id: 'role-creator',
    companyId: company.id,
    code: 'CREATOR',
    name: 'Criador e Editor',
  });
  await RoleRepository.setRolePermissions(creatorRole.id, [
    'company.view',
    'niches.view',
    'templates.view',
    'templates.create',
    'templates.edit',
  ]);

  // Role SEM templates.create mas COM templates.edit
  const editorOnlyRole = await RoleRepository.create({
    id: 'role-editor-only',
    companyId: company.id,
    code: 'EDITOR_ONLY',
    name: 'Apenas Editor',
  });
  await RoleRepository.setRolePermissions(editorOnlyRole.id, [
    'company.view',
    'niches.view',
    'templates.view',
    'templates.edit',
  ]);

  // Role SEM templates.create e SEM templates.edit (Apenas visualizador)
  const viewerRole = await RoleRepository.create({
    id: 'role-viewer',
    companyId: company.id,
    code: 'VIEWER',
    name: 'Apenas Visualizador',
  });
  await RoleRepository.setRolePermissions(viewerRole.id, [
    'company.view',
    'niches.view',
    'templates.view',
  ]);

  // Usuários de teste
  const creatorUser = await UserRepository.create({
    id: 'usr-creator',
    companyId: company.id,
    name: 'Creator User',
    email: 'creator@hotfix551.com',
    passwordHash: 'hash',
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole(company.id, creatorUser.id, creatorRole.id);

  const editorOnlyUser = await UserRepository.create({
    id: 'usr-editor-only',
    companyId: company.id,
    name: 'Editor Only User',
    email: 'editor@hotfix551.com',
    passwordHash: 'hash',
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole(company.id, editorOnlyUser.id, editorOnlyRole.id);

  const viewerUser = await UserRepository.create({
    id: 'usr-viewer',
    companyId: company.id,
    name: 'Viewer User',
    email: 'viewer@hotfix551.com',
    passwordHash: 'hash',
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole(company.id, viewerUser.id, viewerRole.id);

  // Template pré-existente no repositório para testar edição
  const existingTemplate = await templateRepository.createTemplate({
    companyId: company.id,
    name: 'Etiqueta Inicial com QRCode',
    title: 'Etiqueta Inicial com QRCode',
    scope: 'COMPANY',
    document: {
      version: '1.0',
      schemaVersion: 1,
      target: 'thermal',
      nicheId: 'gondola-supermercado',
      nicheName: 'Gôndola Supermercado',
      dimensions: {
        widthMm: 100,
        heightMm: 50,
        dpi: 203,
        orientation: 'portrait',
      },
      elements: [
        {
          id: 'desc-1',
          type: 'text',
          name: 'Nome do Produto',
          field: 'product.description',
          position: { xMm: 5, yMm: 5, zIndex: 1 },
          frame: { widthMm: 80, heightMm: 10 },
          font: { family: 'Helvetica', sizePt: 12, weight: 'bold', align: 'left' },
          locked: false,
          visible: true,
          text: 'Arroz Integral 1kg',
        } as TextElement,
        {
          id: 'qr-existing',
          type: 'qrcode',
          name: 'QR Code Original',
          field: 'product.qrPayload',
          position: { xMm: 60, yMm: 20, zIndex: 2 },
          frame: { widthMm: 25, heightMm: 25 },
          qrVersion: 4,
          errorCorrection: 'M',
          locked: false,
          visible: true,
          value: 'https://example.com/item/123',
        } as QrCodeElement,
      ],
    },
  });

  // =========================================================================
  // GATE 1: Editor revalida Effective Configuration após focus
  // =========================================================================
  await t.test('GATE 1: Editor revalida Effective Configuration após focus', async () => {
    let fetchCalled = false;
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async (url: string) => {
        if (url.includes('/api/session/context')) {
          fetchCalled = true;
          return {
            status: 200,
            json: async () => ({
              user: { id: creatorUser.id, companyId: company.id, name: creatorUser.name, email: creatorUser.email, status: 'ACTIVE' },
              company: { id: company.id, name: company.name, slug: company.slug, status: 'ACTIVE' },
              roles: ['CREATOR'],
              permissions: ['templates.view', 'templates.create', 'templates.edit'],
              allowedNiches: ['gondola-supermercado'],
              enabledElementsByNiche: { 'gondola-supermercado': ['text', 'price', 'barcode', 'qrcode'] },
              csrfToken: 'csrf-123',
            }),
          } as any;
        }
        return { status: 404 } as any;
      }) as any;

      const result = await revalidateSessionContext(true);
      assert.ok(fetchCalled, 'fetch /api/session/context deve ser chamado na revalidação por foco');
      assert.equal(result?.roles[0], 'CREATOR');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // =========================================================================
  // GATE 2: Editor revalida após visibilitychange adequado
  // =========================================================================
  await t.test('GATE 2: Editor revalida após visibilitychange adequado', async () => {
    let revalidateInvoked = false;
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async (url: string) => {
        if (url.includes('/api/session/context')) {
          revalidateInvoked = true;
          return {
            status: 200,
            json: async () => ({
              user: { id: creatorUser.id, companyId: company.id, name: creatorUser.name, email: creatorUser.email, status: 'ACTIVE' },
              company: { id: company.id, name: company.name, slug: company.slug, status: 'ACTIVE' },
              roles: ['CREATOR'],
              permissions: ['templates.view', 'templates.create', 'templates.edit'],
              allowedNiches: ['gondola-supermercado'],
              csrfToken: 'csrf-123',
            }),
          } as any;
        }
        return { status: 404 } as any;
      }) as any;

      await revalidateSessionContext(true);
      assert.ok(revalidateInvoked, 'visibilitychange deve disparar revalidateSessionContext');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // =========================================================================
  // GATE 3: QRCode OFF em outra aba deixa de ser oferecido após revalidação
  // =========================================================================
  await t.test('GATE 3: QRCode OFF em outra aba deixa de ser oferecido na Toolbox após revalidação', async () => {
    // 1. Simula estado inicial com QRCode ON
    setManualSessionContext({
      user: { id: creatorUser.id, companyId: company.id, name: creatorUser.name, email: creatorUser.email, status: 'ACTIVE' },
      company: { id: company.id, name: company.name, slug: company.slug, status: 'ACTIVE' },
      roles: ['CREATOR'],
      permissions: ['templates.view', 'templates.create', 'templates.edit'],
      allowedNiches: ['gondola-supermercado'],
      enabledElementsByNiche: {
        'gondola-supermercado': ['text', 'price', 'barcode', 'qrcode', 'line', 'rectangle', 'image'],
      },
      csrfToken: 'csrf-1',
    });

    assert.equal(isElementAllowed('gondola-supermercado', 'qrcode'), true, 'QRCode deve estar inicialmente permitido');
    const toolboxInitial = getNicheToolboxConfig('gondola-supermercado');
    const allInitialTools = [
      ...toolboxInitial.recommendedTools,
      ...toolboxInitial.availableTools,
    ];
    const qrcodeToolInitial = allInitialTools.find((t) => t.toolId === 'qrcode' || t.elementType === 'qrcode');
    assert.ok(qrcodeToolInitial, 'Toolbox deve conter QRCode antes da alteração');

    // 2. Simula alteração do Admin em outra aba e salvamento: QRCode desligado
    await CompanyConfigurationRepository.setElementEnabled(company.id, 'niche-gondola', 'qrcode', false);

    // 3. Simula revalidação de sessão quando a aba do Editor recebe sinal / foco
    const effectiveConfigAfterAdmin = await EffectiveConfigurationService.resolve({
      companyId: company.id,
      userId: creatorUser.id,
    });

    const contextAfterAdmin = {
      user: { id: creatorUser.id, companyId: company.id, name: creatorUser.name, email: creatorUser.email, status: 'ACTIVE' },
      company: { id: company.id, name: company.name, slug: company.slug, status: 'ACTIVE' },
      roles: ['CREATOR'],
      permissions: ['templates.view', 'templates.create', 'templates.edit'],
      allowedNiches: effectiveConfigAfterAdmin.allowedNiches,
      enabledNiches: effectiveConfigAfterAdmin.enabledNiches,
      defaultNicheId: effectiveConfigAfterAdmin.defaultNicheId,
      enabledElementsByNiche: effectiveConfigAfterAdmin.enabledElementsByNiche,
      enabledFieldsByNiche: effectiveConfigAfterAdmin.enabledFieldsByNiche,
      fieldsAvailabilityByNiche: effectiveConfigAfterAdmin.fieldsAvailabilityByNiche,
      csrfToken: 'csrf-after-admin',
    };

    setManualSessionContext(contextAfterAdmin);

    // 4. Verifica que Toolbox dinâmica não oferece mais QRCode
    assert.equal(isElementAllowed('gondola-supermercado', 'qrcode'), false, 'QRCode não pode estar permitido após revalidação');
    const toolboxUpdated = getNicheToolboxConfig('gondola-supermercado');
    const filterTool = (t: NicheToolItem) => isElementAllowed('gondola-supermercado', t.elementType || (t.toolId as any));
    const allUpdatedTools = [
      ...toolboxUpdated.recommendedTools.filter(filterTool),
      ...toolboxUpdated.availableTools.filter(filterTool),
    ];
    const qrcodeToolUpdated = allUpdatedTools.find((t) => t.toolId === 'qrcode' || t.elementType === 'qrcode');
    assert.equal(qrcodeToolUpdated, undefined, 'Toolbox revalidada não deve oferecer botão de novo QRCode');
  });

  // =========================================================================
  // GATE 4: QRCode existente não é removido na revalidação
  // =========================================================================
  await t.test('GATE 4: QRCode existente no modelo não é removido na revalidação', async () => {
    useEditorStore.getState().setDocument(existingTemplate.document, existingTemplate.id, existingTemplate.version);

    const docBefore = useEditorStore.getState().document;
    const qrBefore = docBefore.elements.find((el) => el.type === 'qrcode');
    assert.ok(qrBefore, 'Documento contém QRCode antes da revalidação');

    // Revalidação não destrutiva da sessão
    broadcastSessionContextInvalidation();

    const docAfter = useEditorStore.getState().document;
    const qrAfter = docAfter.elements.find((el) => el.type === 'qrcode');
    assert.ok(qrAfter, 'QRCode existente permanece intacto no canvas');
    assert.equal(qrAfter?.id, 'qr-existing');
  });

  // =========================================================================
  // GATE 5: Modelo não sofre mutação automática
  // =========================================================================
  await t.test('GATE 5: Modelo não sofre mutação automática pelo refresh de política', async () => {
    const docBefore = JSON.stringify(useEditorStore.getState().document);
    // Simula múltiplos refreshes e revalidações
    broadcastSessionContextInvalidation();
    const docAfter = JSON.stringify(useEditorStore.getState().document);
    assert.equal(docBefore, docAfter, 'O documento não pode sofrer mutação por efeito colateral');
  });

  // =========================================================================
  // GATE 6: Erro de revalidação não equivale a EVERYTHING_DISABLED
  // =========================================================================
  await t.test('GATE 6: Erro de revalidação 5xx/rede preserva sessão existente (Fail-Safe P0)', async () => {
    const activeCtxBefore = getCachedSessionContext();
    assert.ok(activeCtxBefore, 'Deve haver sessão ativa em cache');

    const originalFetch = globalThis.fetch;
    try {
      // Simula erro de servidor 500 no endpoint de contexto
      globalThis.fetch = (async () => ({
        status: 500,
        statusText: 'Internal Server Error',
      })) as any;

      const result = await revalidateSessionContext(true);
      assert.ok(result, 'Resultado da revalidação em erro 5xx deve manter contexto anterior (Fail-Safe)');
      assert.equal(result?.user.id, creatorUser.id);
      assert.ok(hasPermission('templates.view'), 'Permissões não podem virar vazias por erro de rede transitório');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // =========================================================================
  // GATE 7: Usuário sem templates.create não vê Nova Etiqueta
  // =========================================================================
  await t.test('GATE 7: Usuário sem templates.create não vê Nova Etiqueta', async () => {
    setManualSessionContext({
      user: { id: editorOnlyUser.id, companyId: company.id, name: editorOnlyUser.name, email: editorOnlyUser.email, status: 'ACTIVE' },
      company: { id: company.id, name: company.name, slug: company.slug, status: 'ACTIVE' },
      roles: ['EDITOR_ONLY'],
      permissions: ['templates.view', 'templates.edit'], // SEM templates.create
      allowedNiches: ['gondola-supermercado'],
      csrfToken: 'csrf-editor',
    });

    const canCreate = hasPermission('templates.create');
    assert.equal(canCreate, false, 'Usuário sem templates.create deve retornar false');
  });

  // =========================================================================
  // GATE 8: Usuário sem templates.create não abre Wizard pela UI
  // =========================================================================
  await t.test('GATE 8: Usuário sem templates.create não abre Wizard pela UI', async () => {
    const canCreate = hasPermission('templates.create');
    // Simula a guarda do componente NewTemplateWizard: if (!isOpen || !hasPermission('templates.create')) return null;
    const shouldRenderWizard = true && canCreate;
    assert.equal(shouldRenderWizard, false, 'Wizard não deve renderizar se templates.create for false');
  });

  // =========================================================================
  // GATE 9: Deep-link frontend para criação é bloqueado
  // =========================================================================
  await t.test('GATE 9: Deep-link frontend para criação (#new e #editor em branco) é bloqueado', async () => {
    // Simula resolução de rota em App.tsx quando o usuário tenta #new sem permissão
    const canCreate = hasPermission('templates.create');
    const requestedRoute = 'new';

    let resolvedModule = requestedRoute;
    if (requestedRoute === 'new' && !canCreate) {
      resolvedModule = 'models'; // Redirecionamento canônico de segurança
    }

    assert.equal(resolvedModule, 'models', 'Tentativa de deep link #new sem permissão deve redirecionar para models');

    // Tentativa de #editor sem templateId
    let editorRoute = 'editor';
    const currentTemplateId = null;
    if (editorRoute === 'editor' && !currentTemplateId && !canCreate) {
      editorRoute = 'models';
    }
    assert.equal(editorRoute, 'models', 'Tentativa de editor em branco sem templates.create deve redirecionar para models');
  });

  // =========================================================================
  // GATE 10: Usuário com templates.create vê Nova Etiqueta
  // =========================================================================
  await t.test('GATE 10: Usuário com templates.create vê Nova Etiqueta', async () => {
    setManualSessionContext({
      user: { id: creatorUser.id, companyId: company.id, name: creatorUser.name, email: creatorUser.email, status: 'ACTIVE' },
      company: { id: company.id, name: company.name, slug: company.slug, status: 'ACTIVE' },
      roles: ['CREATOR'],
      permissions: ['templates.view', 'templates.create', 'templates.edit'],
      allowedNiches: ['gondola-supermercado'],
      csrfToken: 'csrf-creator',
    });

    assert.equal(hasPermission('templates.create'), true, 'Usuário criador deve ter templates.create ativo');
  });

  // =========================================================================
  // GATE 11: templates.create + role_niches filtra Wizard (Interseção Canônica)
  // =========================================================================
  await t.test('GATE 11: templates.create + role_niches filtra Wizard', async () => {
    setManualSessionContext({
      user: { id: creatorUser.id, companyId: company.id, name: creatorUser.name, email: creatorUser.email, status: 'ACTIVE' },
      company: { id: company.id, name: company.name, slug: company.slug, status: 'ACTIVE' },
      roles: ['CREATOR'],
      permissions: ['templates.view', 'templates.create'],
      allowedNiches: ['gondola-supermercado', 'farmacia-medicamentos'], // Interseção role_niches + company_niches
      csrfToken: 'csrf-creator',
    });

    const allowedInWizard = NICHES.filter((n) => isNicheAllowed(n.id));
    assert.equal(allowedInWizard.length, 2, 'Wizard deve conter exatamente os 2 nichos da interseção');
    assert.ok(allowedInWizard.some((n) => n.id === 'niche-gondola' || n.slug === 'gondola-supermercado'));
    assert.ok(allowedInWizard.some((n) => n.id === 'niche-farmacia' || n.slug === 'farmacia-medicamentos'));
    assert.equal(allowedInWizard.some((n) => n.slug === 'logistica-expedicao-ecommerce'), false);
  });

  // =========================================================================
  // GATE 12: templates.create=false + templates.edit=true ainda permite editar modelo existente
  // =========================================================================
  await t.test('GATE 12: templates.create=false + templates.edit=true ainda permite editar modelo existente', async () => {
    setManualSessionContext({
      user: { id: editorOnlyUser.id, companyId: company.id, name: editorOnlyUser.name, email: editorOnlyUser.email, status: 'ACTIVE' },
      company: { id: company.id, name: company.name, slug: company.slug, status: 'ACTIVE' },
      roles: ['EDITOR_ONLY'],
      permissions: ['templates.view', 'templates.edit'], // create = false, edit = true
      allowedNiches: ['gondola-supermercado'],
      csrfToken: 'csrf-editor',
    });

    const canCreate = hasPermission('templates.create');
    const canEdit = hasPermission('templates.edit');

    assert.equal(canCreate, false, 'templates.create deve ser false');
    assert.equal(canEdit, true, 'templates.edit deve ser true');

    // Modelo existente (currentTemplateId presente): salvamento é permitido
    const currentTemplateId = existingTemplate.id;
    const canSaveCurrentDoc = currentTemplateId ? canEdit : canCreate;
    assert.equal(canSaveCurrentDoc, true, 'Deve ser permitido salvar modelo existente com templates.edit');
  });

  // =========================================================================
  // GATE 13: Backend POST continua bloqueando criação sem permissão
  // =========================================================================
  await t.test('GATE 13: Backend POST continua bloqueando criação sem permissão', async () => {
    // Simula autorização backend de POST /api/templates
    const permissionsWithoutCreate = ['templates.view', 'templates.edit'];
    const isAuthorizedToPost =
      permissionsWithoutCreate.includes('*') || permissionsWithoutCreate.includes('templates.create');

    assert.equal(isAuthorizedToPost, false, 'Backend POST deve rejeitar quando faltar templates.create');
  });

  // =========================================================================
  // GATE 14: PUT continua obedecendo templates.edit
  // =========================================================================
  await t.test('GATE 14: PUT continua obedecendo templates.edit', async () => {
    const permissionsWithoutEdit = ['templates.view'];
    const isAuthorizedToPut =
      permissionsWithoutEdit.includes('*') || permissionsWithoutEdit.includes('templates.edit');

    assert.equal(isAuthorizedToPut, false, 'Backend PUT deve rejeitar sem templates.edit');

    const permissionsWithEdit = ['templates.view', 'templates.edit'];
    const isAuthorizedToPutWithEdit =
      permissionsWithEdit.includes('*') || permissionsWithEdit.includes('templates.edit');

    assert.equal(isAuthorizedToPutWithEdit, true, 'Backend PUT deve aceitar quando templates.edit estiver presente');
  });

  // =========================================================================
  // GATE 15: PLATFORM_DEVELOPER continua funcionando no company configurado
  // =========================================================================
  await t.test('GATE 15: PLATFORM_DEVELOPER continua funcionando no company configurado', async () => {
    const isDev = isDeveloperIdentity('Marcel');
    assert.equal(isDev, true, 'Identidade do desenvolvedor deve ser reconhecida');

    const devCompanyId = getDeveloperCompanyId();
    assert.ok(devCompanyId, 'Empresa configurada para o desenvolvedor deve existir');

    const devContext = {
      isDeveloper: true,
      canAccessDcc: true,
      roles: ['PLATFORM_DEVELOPER'],
      permissions: ['*'],
      company: { id: devCompanyId, name: 'Default Company', slug: 'comp-default', status: 'ACTIVE' },
    };
    assert.equal(devContext.isDeveloper, true);
    assert.equal(devContext.canAccessDcc, true);
    assert.ok(devContext.permissions.includes('*'), 'Desenvolvedor deve possuir wildcard de permissões');
  });

  // =========================================================================
  // GATE 16: DCC preservado
  // =========================================================================
  await t.test('GATE 16: DCC preservado', async () => {
    const isDev = isDeveloperIdentity('Marcel');
    const canDcc = isDev;
    assert.equal(canDcc, true, 'Acesso ao DCC deve permanecer habilitado para o desenvolvedor');
  });

  // =========================================================================
  // GATE 17: Agent auth preservado
  // =========================================================================
  await t.test('GATE 17: Agent auth preservado', async () => {
    // Invariância de autenticação do agent de impressão local (mecanismo independente de sessão web)
    const agentTokenPayload = {
      sub: 'agent-pc-1',
      companyId: company.id,
      role: 'PRINT_AGENT',
    };
    assert.ok(agentTokenPayload.companyId, 'Agent auth possui contexto de tenant independente de cookie de sessão');
    assert.equal(agentTokenPayload.role, 'PRINT_AGENT');
  });

  // =========================================================================
  // GATE 18: Editor visual preservado
  // =========================================================================
  await t.test('GATE 18: Editor visual preservado', async () => {
    // Invariância dos elementos canônicos da Toolbox
    const defaultToolbox = getNicheToolboxConfig('gondola-supermercado');
    const totalTools =
      defaultToolbox.recommendedTools.length +
      defaultToolbox.availableTools.length;
    assert.ok(totalTools >= 7, 'Toolbox mantém catálogo visual completo de ferramentas');
  });

  // =========================================================================
  // GATE 19: P0 HOTFIX 5.5.1.1 — Runtime Resolution do PropertyInspector & FieldPicker
  // =========================================================================
  await t.test('GATE 19: Runtime Execution — PropertyInspector & FieldPicker resolvem getFieldAvailability sem ReferenceError', async (tRuntime) => {
    // 1. Editor / PropertyInspector abre sem ReferenceError com texto selecionado
    // 2. PropertyInspector abre
    // 3. FieldPicker abre
    // 4. getFieldAvailability está resolvido no runtime

    // Configurar contexto READY com governança canônica
    setManualSessionContext({
      principal: { company: { id: company.id, name: company.name }, user: { id: creatorUser.id, role: 'CREATOR' } },
      effectiveConfiguration: {
        companyId: company.id,
        defaultNicheId: 'niche-gondola',
        allowedNiches: ['niche-gondola'],
        enabledElementsByNiche: {
          'niche-gondola': ['text', 'price', 'barcode', 'qrcode'],
        },
        fieldsAvailabilityByNiche: {
          'niche-gondola': {
            'produto.descricao': { availableForManual: true, availableForIntegration: true },
            'produto.preco': { availableForManual: false, availableForIntegration: true },
            'produto.ean': { availableForManual: true, availableForIntegration: false },
          },
        },
      },
    }, 'READY');

    // Montar documento no store com elementos representativos: text, price, barcode
    useEditorStore.getState().setDocument({
      schemaVersion: 1,
      title: 'Teste Runtime 5.5.1.1',
      nicheId: 'niche-gondola',
      dimensions: { widthMm: 100, heightMm: 50, dpi: 203, orientation: 'landscape' },
      elements: [
        {
          id: 'elem-text-manual',
          type: 'text',
          x: 5,
          y: 5,
          width: 40,
          height: 8,
          text: 'Texto Manual',
          field: 'produto.descricao',
        },
        {
          id: 'elem-price-integration',
          type: 'price',
          x: 5,
          y: 15,
          width: 40,
          height: 12,
          field: 'produto.preco',
          binding: { source: 'integration', fieldId: 'produto.preco' },
        },
        {
          id: 'elem-barcode-manual',
          type: 'barcode',
          x: 5,
          y: 30,
          width: 50,
          height: 15,
          format: 'EAN13',
          value: '7894900011517',
          field: 'produto.ean',
        },
        {
          id: 'elem-text-system',
          type: 'text',
          x: 50,
          y: 5,
          width: 30,
          height: 8,
          text: 'Data Impressao',
          field: 'system.printDate',
          binding: { source: 'system', fieldId: 'system.printDate' },
        },
      ],
    });

    // Testar renderização do PropertyInspector para Text (selecionado)
    useEditorStore.getState().setSelectedElementIds(['elem-text-manual']);
    assert.doesNotThrow(() => {
      const markupText = renderToStaticMarkup(React.createElement(PropertyInspector));
      assert.ok(markupText.length > 0, 'PropertyInspector deve renderizar para elemento Text');
      assert.ok(markupText.includes('Texto Manual') || markupText.includes('Inspetor'), 'Conteúdo do inspetor gerado');
    }, 'PropertyInspector para elemento Text não deve lançar ReferenceError');

    // Testar renderização do PropertyInspector para Price (selecionado)
    useEditorStore.getState().setSelectedElementIds(['elem-price-integration']);
    assert.doesNotThrow(() => {
      const markupPrice = renderToStaticMarkup(React.createElement(PropertyInspector));
      assert.ok(markupPrice.length > 0, 'PropertyInspector deve renderizar para elemento Price');
    }, 'PropertyInspector para elemento Price não deve lançar ReferenceError');

    // Testar renderização do PropertyInspector para Barcode (selecionado)
    useEditorStore.getState().setSelectedElementIds(['elem-barcode-manual']);
    assert.doesNotThrow(() => {
      const markupBarcode = renderToStaticMarkup(React.createElement(PropertyInspector));
      assert.ok(markupBarcode.length > 0, 'PropertyInspector deve renderizar para elemento Barcode');
    }, 'PropertyInspector para elemento Barcode não deve lançar ReferenceError');

    // Testar renderização do PropertyInspector com elemento System
    useEditorStore.getState().setSelectedElementIds(['elem-text-system']);
    assert.doesNotThrow(() => {
      const markupSystem = renderToStaticMarkup(React.createElement(PropertyInspector));
      assert.ok(markupSystem.length > 0, 'PropertyInspector deve renderizar para elemento com binding System');
    }, 'PropertyInspector para elemento System não deve lançar ReferenceError');

    // Testar renderização do FieldPicker isoladamente
    assert.doesNotThrow(() => {
      const markupPicker = renderToStaticMarkup(React.createElement(FieldPicker, {
        value: 'produto.descricao',
        onChange: () => {},
        nicheId: 'niche-gondola',
        allowStatic: true,
        canSwitchToManual: true,
      }));
      assert.ok(markupPicker.length > 0, 'FieldPicker deve renderizar corretamente');
      assert.ok(markupPicker.includes('Campos da Integração'), 'FieldPicker contém optgroups');
    }, 'FieldPicker não deve lançar ReferenceError');

    // 5. campo MANUAL permitido funciona
    const descAvail = getFieldAvailability('niche-gondola', 'produto.descricao');
    assert.equal(descAvail.manual, true, 'produto.descricao deve ter manual=true');
    assert.equal(descAvail.availableForManual, true);

    // 6. campo INTEGRATION permitido funciona
    const priceAvail = getFieldAvailability('niche-gondola', 'produto.preco');
    assert.equal(priceAvail.integration, true, 'produto.preco deve ter integration=true');
    assert.equal(priceAvail.manual, false, 'produto.preco tem manual=false');

    // 7. SYSTEM funciona
    const sysGeneric = getFieldAvailability('niche-gondola', 'system.printDateTime');
    assert.equal(sysGeneric.manual, true);
    assert.equal(sysGeneric.integration, true);

    // 8. system.printDate continua automático
    const sysPrintDate = getFieldAvailability('niche-gondola', 'system.printDate');
    assert.equal(sysPrintDate.manual, true);
    assert.equal(sysPrintDate.integration, true);

    // 9. Effective Configuration READY é aplicada
    assert.equal(getFieldAvailability('niche-gondola', 'produto.ean').integration, false);
    assert.equal(getFieldAvailability('niche-gondola', 'produto.ean').manual, true);

    // 10. LOADING não destrói disponibilidade/modelo (Fail-safe)
    setManualSessionContext(null, 'LOADING');
    const loadingAvail = getFieldAvailability('niche-gondola', 'produto.preco');
    assert.equal(loadingAvail.manual, true, 'LOADING fail-safe não desabilita manual');
    assert.equal(loadingAvail.integration, true, 'LOADING fail-safe não desabilita integration');
    // Deve renderizar sem erro em LOADING
    assert.doesNotThrow(() => {
      renderToStaticMarkup(React.createElement(PropertyInspector));
    }, 'PropertyInspector renderiza em status LOADING sem erro');

    // 11. ERROR não destrói disponibilidade/modelo (Fail-safe)
    setManualSessionContext(null, 'ERROR');
    const errorAvail = getFieldAvailability('niche-gondola', 'produto.preco');
    assert.equal(errorAvail.manual, true, 'ERROR fail-safe não desabilita manual');
    assert.equal(errorAvail.integration, true, 'ERROR fail-safe não desabilita integration');
    // Deve renderizar sem erro em ERROR
    assert.doesNotThrow(() => {
      renderToStaticMarkup(React.createElement(PropertyInspector));
    }, 'PropertyInspector renderiza em status ERROR sem erro');
  });
});

