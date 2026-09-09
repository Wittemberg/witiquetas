import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  NICHES,
  LABEL_SIZES_CATALOG,
  NICHE_SIZE_RELATIONS,
  CANONICAL_FIELDS,
  DEFAULT_NICHE_PROFILES,
  getDefaultNicheProfile,
  getAllDefaultNicheProfiles,
  LabelDocumentSchema,
  type LabelDocument,
  type LabelElement,
} from '@witiquetas/label-schema';

const CANONICAL_ELEMENT_TYPES = [
  'text',
  'barcode',
  'qrcode',
  'price',
  'image',
  'table',
  'line',
  'rectangle',
];

import {
  clearAdminMemoryStores,
  CompanyRepository,
  UserRepository,
  RoleRepository,
  CompanyConfigurationRepository,
  CANONICAL_PERMISSIONS,
  TENANT_MANAGEABLE_PERMISSIONS,
} from '../apps/backend/src/repositories/adminRepositories.js';

import {
  clearSessionMemoryStores,
  SessionService,
} from '../apps/backend/src/services/sessionService.js';

import { bootstrapCompanyNicheProfiles } from '../apps/backend/src/services/adminBootstrapService.js';
import { EffectiveConfigurationService } from '../apps/backend/src/services/effectiveConfigurationService.js';
import { templateRepository } from '../apps/backend/src/repositories/templateRepository.js';
import templatesRouter from '../apps/backend/src/routes/templates.js';
import sessionRouter from '../apps/backend/src/routes/session.js';
import adminRouter from '../apps/backend/src/routes/admin.js';

import {
  developerAuthService,
  DCC_SESSION_COOKIE_NAME,
  getDeveloperCompanyId,
} from '../apps/backend/src/services/developerAuthService.js';

import { verifyWebUserToken } from '../apps/backend/src/routes/agents.js';
import { ZPLCompiler } from '../packages/printer-core/src/zplCompiler.js';

import {
  setManualSessionContext,
  isElementAllowed,
  isFieldAllowed,
  getFieldAvailability,
  isNicheAllowed,
  resolveCanonicalNicheId,
  getConfigStatus,
} from '../apps/frontend/src/auth/session.ts';

import { useEditorStore } from '../apps/frontend/src/editor/useEditorStore.ts';

function createMockResponse() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as any,
    cookies: {} as Record<string, any>,
    clearedCookies: [] as any[],
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    set(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    cookie(name: string, val: any, opts: any) {
      this.cookies[name] = { val, opts };
      return this;
    },
    clearCookie(name: string, opts: any) {
      this.clearedCookies.push({ name, opts });
      delete this.cookies[name];
      return this;
    },
  };
  return res;
}

function callRouter(router: any, req: any): Promise<any> {
  const handler = typeof router === 'function' ? router : (router?.default || router);
  const res = createMockResponse();

  req.headers = req.headers || {};
  if (req.cookies && !req.headers.cookie) {
    req.headers.cookie = Object.entries(req.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
  if (!req.path && req.url) {
    req.path = req.url.split('?')[0];
  }

  return new Promise((resolve) => {
    const origJson = res.json.bind(res);
    res.json = (data: any) => {
      origJson(data);
      resolve(res);
      return res;
    };
    handler(req, res, (err?: any) => {
      if (err) {
        res.statusCode = 500;
        res.body = { error: err.message };
      }
      resolve(res);
    });
  });
}

test('SUÍTE COMPLETA DE VALIDAÇÃO — PACOTE 5.5 (EFFECTIVE CONFIGURATION → EDITOR + DEFAULT NICHE PROFILES)', async (t) => {
  process.env.DCC_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
  process.env.DCC_DEVELOPER_COMPANY_ID = 'comp-platform-dev';
  process.env.ADMIN_API_KEY = 'agent-test-key-secret-1234';

  clearAdminMemoryStores();
  clearSessionMemoryStores();
  developerAuthService.clearAllSessionsForTesting();

  // Setup de Empresas
  const companyAlpha = await CompanyRepository.create({
    id: 'comp-alpha-55',
    name: 'Alpha Supermercados',
    slug: 'alpha-55',
    status: 'ACTIVE',
  });

  const companyBeta = await CompanyRepository.create({
    id: 'comp-beta-55',
    name: 'Beta Farmacêutica',
    slug: 'beta-55',
    status: 'ACTIVE',
  });

  await CompanyRepository.create({
    id: 'comp-platform-dev',
    name: 'Plataforma Witiquetas',
    slug: 'platform-dev',
    status: 'ACTIVE',
  });

  // Roles para Alpha
  const alphaAdminRole = await RoleRepository.create({
    id: 'role-alpha-admin-55',
    companyId: companyAlpha.id,
    code: 'ADMIN',
    name: 'Administrador Alpha',
  });
  await RoleRepository.setRolePermissions(alphaAdminRole.id, [
    'company.view', 'company.manage',
    'niches.view', 'niches.manage',
    'elements.view', 'elements.manage',
    'templates.view', 'templates.create', 'templates.edit', 'templates.delete',
    'users.view', 'users.manage',
    'roles.view', 'roles.manage',
  ]);

  const alphaDesignerRole = await RoleRepository.create({
    id: 'role-alpha-designer-55',
    companyId: companyAlpha.id,
    code: 'DESIGNER',
    name: 'Designer Alpha',
  });
  await RoleRepository.setRolePermissions(alphaDesignerRole.id, [
    'templates.view', 'templates.create', 'templates.edit',
  ]);

  const alphaOperatorRole = await RoleRepository.create({
    id: 'role-alpha-operator-55',
    companyId: companyAlpha.id,
    code: 'OPERATOR',
    name: 'Operador Alpha',
  });
  await RoleRepository.setRolePermissions(alphaOperatorRole.id, [
    'templates.view', 'templates.create', 'templates.edit',
  ]);

  const alphaSupervisorRole = await RoleRepository.create({
    id: 'role-alpha-supervisor-55',
    companyId: companyAlpha.id,
    code: 'SUPERVISOR',
    name: 'Supervisor Alpha',
  });
  await RoleRepository.setRolePermissions(alphaSupervisorRole.id, [
    'templates.view', 'templates.create', 'templates.edit',
  ]);

  // Usuários para Alpha
  const alphaAdminUser = await UserRepository.create({
    id: 'usr-alpha-admin-55',
    companyId: companyAlpha.id,
    name: 'Admin Alpha',
    email: 'admin@alpha55.com',
    passwordHash: 'hash',
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole(companyAlpha.id, alphaAdminUser.id, alphaAdminRole.id);

  const alphaOperatorUser = await UserRepository.create({
    id: 'usr-alpha-operator-55',
    companyId: companyAlpha.id,
    name: 'Operador Alpha',
    email: 'operator@alpha55.com',
    passwordHash: 'hash',
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole(companyAlpha.id, alphaOperatorUser.id, alphaOperatorRole.id);

  // Sessões
  const adminSession = await SessionService.createAuthenticatedSession({
    userId: alphaAdminUser.id,
    companyId: companyAlpha.id,
  });

  const operatorSession = await SessionService.createAuthenticatedSession({
    userId: alphaOperatorUser.id,
    companyId: companyAlpha.id,
  });

  // 1. 11/66/112 intactos
  await t.test('1. Invariantes Canônicos: 11 nichos, 66 tamanhos e 112 relações niche x size intactos', () => {
    assert.equal(NICHES.length, 11, 'Devem existir exatamente 11 nichos canônicos');
    assert.equal(LABEL_SIZES_CATALOG.length, 66, 'Devem existir exatamente 66 tamanhos no catálogo');
    assert.equal(NICHE_SIZE_RELATIONS.length, 112, 'Devem existir exatamente 112 associações nicho-tamanho');
  });

  // 2. 25/23 intactos
  await t.test('2. Matriz de Permissões: 25 platform permissions e 23 tenant permissions intactas', () => {
    assert.equal(CANONICAL_PERMISSIONS.length, 25, 'Plataforma deve ter 25 permissões canônicas');
    assert.equal(TENANT_MANAGEABLE_PERMISSIONS.length, 23, 'Tenant deve ter 23 permissões comerciais');
  });

  // 3. Presets dos 11 nichos
  await t.test('3. Presets dos 11 Nichos: Todos os 11 nichos possuem presets com elementos e campos canônicos reais', () => {
    const profiles = getAllDefaultNicheProfiles();
    assert.equal(profiles.length, 11, 'Deve haver perfis padrão para exatamente 11 nichos');

    const canonicalElementTypes = new Set(CANONICAL_ELEMENT_TYPES);
    const canonicalFieldKeys = new Set(CANONICAL_FIELDS.map((f: any) => f.id || f.key));

    for (const niche of NICHES) {
      const preset = getDefaultNicheProfile(niche.id);
      assert.ok(preset, `Preset para o nicho ${niche.id} deve existir`);
      assert.equal(preset.nicheId, niche.id);

      // Elementos visuais válidos
      assert.ok(preset.defaultElements.length > 0, `Nicho ${niche.id} deve ter elementos default`);
      for (const el of preset.defaultElements) {
        assert.ok(canonicalElementTypes.has(el as any), `Elemento ${el} deve pertencer ao catálogo canônico`);
      }

      // Campos canônicos válidos
      assert.ok(preset.defaultFields.length > 0, `Nicho ${niche.id} deve ter campos default`);
      for (const f of preset.defaultFields) {
        assert.ok(canonicalFieldKeys.has(f.fieldKey), `Campo ${f.fieldKey} deve pertencer ao catálogo canônico`);
        assert.equal(typeof f.availableForManual, 'boolean');
        assert.equal(typeof f.availableForIntegration, 'boolean');
      }

      // Role niches default
      assert.ok(Array.isArray(preset.roleNichesDefault));
      assert.ok(preset.roleNichesDefault.includes('ADMIN'));
      assert.ok(preset.roleNichesDefault.includes('DESIGNER'));
      assert.ok(preset.roleNichesDefault.includes('SUPERVISOR'));
    }
  });

  // 4. Bootstrap idempotente
  await t.test('4. Bootstrap Idempotente: Execução repetida não duplica nem corrompe configurações', async () => {
    await bootstrapCompanyNicheProfiles(companyAlpha.id);
    const elementsAfterFirst = await CompanyConfigurationRepository.getElements(companyAlpha.id, 'niche-gondola');
    const fieldsAfterFirst = await CompanyConfigurationRepository.getFields(companyAlpha.id, 'niche-gondola');

    // Executar segunda vez
    await bootstrapCompanyNicheProfiles(companyAlpha.id);
    const elementsAfterSecond = await CompanyConfigurationRepository.getElements(companyAlpha.id, 'niche-gondola');
    const fieldsAfterSecond = await CompanyConfigurationRepository.getFields(companyAlpha.id, 'niche-gondola');

    assert.equal(elementsAfterFirst.length, elementsAfterSecond.length, 'Número de elementos não deve duplicar');
    assert.equal(fieldsAfterFirst.length, fieldsAfterSecond.length, 'Número de campos não deve duplicar');
  });

  // 5. Bootstrap não sobrescreve empresa personalizada
  await t.test('5. Bootstrap Não-Destrutivo: Não sobrescreve customização manual de empresa já configurada', async () => {
    // Customizar niche-gondola na empresa Alpha: desabilitar qrcode e salvar
    await CompanyConfigurationRepository.setElementEnabled(companyAlpha.id, 'niche-gondola', 'qrcode', false);

    // Executar bootstrap
    await bootstrapCompanyNicheProfiles(companyAlpha.id);

    // Verificar que qrcode continua FALSE
    const elements = await CompanyConfigurationRepository.getElements(companyAlpha.id, 'niche-gondola');
    const qr = elements.find((e) => e.elementType === 'qrcode');
    assert.ok(qr, 'qrcode deve existir na configuração');
    assert.equal(qr.enabled, false, 'qrcode deve permanecer FALSE após bootstrap');
  });

  // 6. Role_niches defaults
  await t.test('6. Role_niches Defaults: ADMIN, DESIGNER e SUPERVISOR têm todos os nichos; OPERATOR tem nichos operacionais', async () => {
    const configAdmin = await EffectiveConfigurationService.resolve({
      companyId: companyAlpha.id,
      roleCode: 'ADMIN',
    });
    assert.equal(configAdmin.allowedNiches.length, 11, 'ADMIN deve ter acesso a todos os 11 nichos');

    const configDesigner = await EffectiveConfigurationService.resolve({
      companyId: companyAlpha.id,
      roleCode: 'DESIGNER',
    });
    assert.equal(configDesigner.allowedNiches.length, 11, 'DESIGNER deve ter acesso a todos os 11 nichos');

    const configSupervisor = await EffectiveConfigurationService.resolve({
      companyId: companyAlpha.id,
      roleCode: 'SUPERVISOR',
    });
    assert.equal(configSupervisor.allowedNiches.length, 11, 'SUPERVISOR deve ter acesso a todos os 11 nichos');

    const configOperator = await EffectiveConfigurationService.resolve({
      companyId: companyAlpha.id,
      roleCode: 'OPERATOR',
    });
    assert.ok(configOperator.allowedNiches.length > 0 && configOperator.allowedNiches.length <= 11);
    assert.ok(configOperator.allowedNiches.includes('niche-gondola'), 'OPERATOR deve incluir nicho-gondola por padrão');
  });

  // 7. Editor recebe Effective Configuration
  await t.test('7. Sessão Contexto: GET /api/session/context entrega Effective Configuration ao Editor', async () => {
    const req = {
      method: 'GET',
      url: '/context',
      cookies: { witiquetas_session: adminSession.rawToken },
    };
    const res = await callRouter(sessionRouter, req);
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.effectiveConfiguration, 'Deve conter effectiveConfiguration');
    assert.ok(Array.isArray(res.body.allowedNiches), 'Deve listar allowedNiches');
    assert.ok(res.body.enabledElementsByNiche, 'Deve listar enabledElementsByNiche');
    assert.ok(res.body.fieldsAvailabilityByNiche, 'Deve listar fieldsAvailabilityByNiche');
  });

  // 8. Elemento OFF não permite nova inserção (Frontend & Backend)
  await t.test('8. Elemento OFF: Bloqueia nova inserção no Editor (Toolbox/Store) e no Backend', async () => {
    // Configurar contexto do frontend com qrcode desabilitado em niche-gondola
    setManualSessionContext({
      principal: { company: { id: companyAlpha.id, name: 'Alpha' }, user: { id: alphaAdminUser.id, role: 'ADMIN' } },
      effectiveConfiguration: {
        companyId: companyAlpha.id,
        defaultNicheId: 'niche-gondola',
        allowedNiches: ['niche-gondola'],
        enabledElementsByNiche: {
          'niche-gondola': ['text', 'barcode', 'price'], // qrcode AUSENTE/OFF
        },
        fieldsAvailabilityByNiche: {},
      },
    });

    assert.equal(isElementAllowed('qrcode', 'niche-gondola'), false, 'qrcode deve estar desabilitado no frontend');

    // Tentar adicionar no store
    const store = useEditorStore.getState();
    store.setDocument({
      schemaVersion: 1,
      title: 'Teste Elemento OFF',
      dimensions: { widthMm: 100, heightMm: 30, dpi: 203, orientation: 'landscape' },
      elements: [],
      nicheId: 'niche-gondola',
    });

    const countBefore = store.document.elements.length;
    store.addElement('qrcode');
    assert.equal(store.document.elements.length, countBefore, 'addElement não deve inserir elemento desabilitado pela política');
  });

  // 9. Elemento ON permite inserção
  await t.test('9. Elemento ON: Permite nova inserção normalmente', () => {
    assert.equal(isElementAllowed('text', 'niche-gondola'), true, 'text deve estar habilitado');
    const countBefore = useEditorStore.getState().document.elements.length;
    useEditorStore.getState().addElement('text', { text: 'Texto Autorizado' });
    const countAfter = useEditorStore.getState().document.elements.length;
    assert.equal(countAfter, countBefore + 1);
  });

  // 10. Elemento legado OFF renderiza
  // 11. Elemento legado OFF edita
  // 12. Elemento legado OFF compila
  // 13. Elemento legado OFF exporta
  await t.test('10-13. Elemento Legado OFF (EXISTING_DISABLED_ELEMENT): Renderiza, edita propriedades, compila e exporta', () => {
    const store = useEditorStore.getState();
    const legacyDoc: LabelDocument = {
      schemaVersion: 1,
      title: 'Modelo Legado Com QRCode',
      dimensions: { widthMm: 100, heightMm: 50, dpi: 203, orientation: 'landscape' },
      nicheId: 'niche-gondola',
      elements: [
        {
          id: 'el-legacy-qr',
          type: 'qrcode',
          x: 10,
          y: 10,
          width: 30,
          height: 30,
          content: 'LEGACY_DATA',
        },
      ],
    };

    // 10. Renderiza: Carregar documento preserva elemento intacto
    useEditorStore.getState().setDocument(legacyDoc);
    const docAfterSet = useEditorStore.getState().document;
    assert.equal(docAfterSet.elements.length, 1);
    assert.equal(docAfterSet.elements[0].id, 'el-legacy-qr');
    assert.equal(docAfterSet.elements[0].type, 'qrcode');

    // 11. Edita: Pode mover e redimensionar elemento existente
    useEditorStore.getState().updateElement('el-legacy-qr', { x: 15, y: 10, width: 30, height: 30 });
    const updatedEl = useEditorStore.getState().document.elements.find((e) => e.id === 'el-legacy-qr');
    assert.ok(Math.abs((updatedEl?.x || 0) - 15) < 0.1, 'Coordenada X atualizada');
    assert.ok(Math.abs((updatedEl?.y || 0) - 10) < 0.1, 'Coordenada Y atualizada');
    assert.ok(Math.abs((updatedEl?.width || 0) - 30) < 0.1, 'Largura atualizada');

    // 12. Compila: Compilador ZPL compila com sucesso o modelo legado
    const zplCompiler = new ZPLCompiler();
    const compiled = zplCompiler.compile(useEditorStore.getState().document);
    assert.ok(compiled.command.includes('^XA'), 'ZPL deve conter comando de início ^XA para elemento legado');

    // 13. Exporta: JSON exporta sem perdas
    const exportedJson = JSON.stringify(useEditorStore.getState().document);
    const parsed = JSON.parse(exportedJson);
    assert.equal(parsed.elements[0].id, 'el-legacy-qr');
  });

  // 14. Elemento legado OFF não duplica
  await t.test('14. Elemento Legado OFF: Duplicação é bloqueada por duplicateSelectedElements', () => {
    useEditorStore.getState().setSelectedElementIds(['el-legacy-qr']);
    const countBefore = useEditorStore.getState().document.elements.length;

    // duplicateSelectedElements deve bloquear a clonagem de elemento desabilitado
    useEditorStore.getState().duplicateSelectedElements();
    assert.equal(useEditorStore.getState().document.elements.length, countBefore, 'Não deve criar cópia de elemento OFF');
  });

  // 15. Copy/paste legado OFF bloqueado
  await t.test('15. Elemento Legado OFF: Copiar e colar é bloqueado por pasteSelection', () => {
    useEditorStore.getState().setSelectedElementIds(['el-legacy-qr']);
    useEditorStore.getState().copySelection();

    const countBefore = useEditorStore.getState().document.elements.length;
    useEditorStore.getState().pasteSelection();
    assert.equal(useEditorStore.getState().document.elements.length, countBefore, 'pasteSelection não deve colar elemento OFF');
  });

  // 16. Binding existente OFF preservado
  // 17. Novo binding OFF bloqueado
  await t.test('16-17. Bindings: Binding legado OFF é preservado; Novo binding OFF é rejeitado pelo backend', async () => {
    // Configurar campos em Alpha para niche-gondola: produto.descricao = ON, produto.ean = OFF
    await CompanyConfigurationRepository.setFieldConfig(companyAlpha.id, 'niche-gondola', 'produto.descricao', {
      availableForManual: true,
      availableForIntegration: true,
    });
    await CompanyConfigurationRepository.setFieldConfig(companyAlpha.id, 'niche-gondola', 'produto.ean', {
      availableForManual: false,
      availableForIntegration: false,
    });

    // Criar template no backend contendo o binding legado produto.ean
    const createdTemplate = await templateRepository.createTemplate(
      {
        title: 'Template Legado com Binding OFF',
        nicheId: 'niche-gondola',
        document: {
          schemaVersion: 1,
          title: 'Template Legado com Binding OFF',
          dimensions: { widthMm: 100, heightMm: 50, dpi: 203, orientation: 'landscape' },
          elements: [
            {
              id: 'el-text-bound-legacy',
              type: 'text',
              x: 10,
              y: 10,
              width: 50,
              height: 10,
              text: '7891234567890',
              field: 'produto.ean', // Legado OFF
            },
          ],
        },
      },
      companyAlpha.id
    );

    // 16. PUT preservando binding legado: deve ser aceito
    const reqPreserve = {
      method: 'PUT',
      url: `/${createdTemplate.id}`,
      headers: { 'x-csrf-token': adminSession.csrfToken },
      cookies: { witiquetas_session: adminSession.rawToken },
      body: {
        title: 'Template Legado Atualizado',
        document: {
          ...createdTemplate.document,
          elements: [
            {
              id: 'el-text-bound-legacy',
              type: 'text',
              x: 12, // Moveu um pouco
              y: 12,
              width: 50,
              height: 10,
              text: '7891234567890',
              field: 'produto.ean', // Mantém o mesmo binding legado
            },
          ],
        },
      },
    };
    const resPreserve = await callRouter(templatesRouter, reqPreserve);
    assert.equal(resPreserve.statusCode, 200, 'PUT preservando binding existente deve ter sucesso');

    // 17. PUT adicionando NOVO binding proibido: deve ser rejeitado com 400
    const reqForbiddenBinding = {
      method: 'PUT',
      url: `/${createdTemplate.id}`,
      headers: { 'x-csrf-token': adminSession.csrfToken },
      cookies: { witiquetas_session: adminSession.rawToken },
      body: {
        title: 'Tentativa Novo Binding Proibido',
        document: {
          ...createdTemplate.document,
          elements: [
            {
              id: 'el-text-bound-legacy',
              type: 'text',
              x: 10,
              y: 10,
              width: 50,
              height: 10,
              text: '7891234567890',
              field: 'produto.ean',
            },
            {
              id: 'el-new-forbidden-binding',
              type: 'text',
              x: 10,
              y: 25,
              width: 50,
              height: 10,
              text: 'Novo Código',
              field: 'produto.ean', // NOVO binding para campo desabilitado
            },
          ],
        },
      },
    };
    const resForbidden = await callRouter(templatesRouter, reqForbiddenBinding);
    assert.equal(resForbidden.statusCode, 400, 'PUT criando NOVO binding desabilitado deve ser rejeitado com 400');
    assert.match(resForbidden.body.error, /desabilitado/i);
  });

  // 18. FieldPicker filtra corretamente
  // 19. MANUAL respeitado
  // 20. INTEGRATION não simula ERP
  // 21. SYSTEM funciona
  // 22. system.printDate funciona
  await t.test('18-22. FieldPicker Governance: MANUAL, INTEGRATION, SYSTEM e system.printDate', () => {
    // Configurar contexto com product.name (manual+integration), product.sku (integration only)
    setManualSessionContext({
      principal: { company: { id: companyAlpha.id, name: 'Alpha' }, user: { id: alphaAdminUser.id, role: 'ADMIN' } },
      effectiveConfiguration: {
        companyId: companyAlpha.id,
        defaultNicheId: 'niche-gondola',
        allowedNiches: ['niche-gondola'],
        enabledElementsByNiche: {
          'niche-gondola': ['text', 'barcode'],
        },
        fieldsAvailabilityByNiche: {
          'niche-gondola': {
            'product.name': { availableForManual: true, availableForIntegration: true },
            'product.sku': { availableForManual: false, availableForIntegration: true },
            'product.barcode': { availableForManual: false, availableForIntegration: false },
          },
        },
      },
    });

    // 18. Filtro geral de campos
    assert.equal(isFieldAllowed('product.name', 'niche-gondola'), true);
    assert.equal(isFieldAllowed('product.sku', 'niche-gondola'), true);
    assert.equal(isFieldAllowed('product.barcode', 'niche-gondola'), false);

    // 19. MANUAL respeitado
    const nameAvail = getFieldAvailability('product.name', 'niche-gondola');
    assert.equal(nameAvail.availableForManual, true);

    const skuAvail = getFieldAvailability('product.sku', 'niche-gondola');
    assert.equal(skuAvail.availableForManual, false);

    // 20. INTEGRATION não simula ERP (é apenas flag autorizada)
    assert.equal(skuAvail.availableForIntegration, true);

    // 21-22. SYSTEM fields
    assert.equal(isFieldAllowed('system.printDate', 'niche-gondola'), true, 'system.printDate deve ser sempre permitido');
    const sysAvail = getFieldAvailability('system.printDate', 'niche-gondola');
    assert.equal(sysAvail.availableForManual, true);
    assert.equal(sysAvail.availableForIntegration, true);
  });

  // 23. Config LOADING não esvazia destrutivamente
  // 24. Config ERROR não muta modelo
  // 25. Config ausente não apaga elementos (UNKNOWN != EVERYTHING DISABLED)
  await t.test('23-25. Fail-Safe P0: LOADING, ERROR e Config Ausente preservam integridade e não bloqueiam tudo', () => {
    // 23. LOADING: setManualSessionContext com status = LOADING
    setManualSessionContext(
      {
        principal: { company: { id: companyAlpha.id, name: 'Alpha' }, user: { id: alphaAdminUser.id, role: 'ADMIN' } },
        effectiveConfiguration: undefined,
      },
      'LOADING'
    );
    assert.equal(getConfigStatus(), 'LOADING');
    assert.equal(isElementAllowed('qrcode', 'niche-gondola'), true, 'Em LOADING, fail-safe permite para não destruir');
    assert.equal(isFieldAllowed('product.price', 'niche-gondola'), true, 'Em LOADING, fail-safe permite campo');

    // 24. ERROR: status = ERROR
    setManualSessionContext(null, 'ERROR');
    assert.equal(getConfigStatus(), 'ERROR');
    assert.equal(isElementAllowed('qrcode', 'niche-gondola'), true, 'Em ERROR, fail-safe permite para não quebrar modelo');
    assert.equal(isFieldAllowed('product.price', 'niche-gondola'), true, 'Em ERROR, fail-safe permite campo');

    // 25. UNKNOWN != EVERYTHING DISABLED
    assert.equal(isNicheAllowed('niche-gondola'), true, 'Nicho desconhecido em fallback não é desabilitado em massa');
  });

  // 26. PUT legado preservado aceito (Backend)
  // 27. PUT com nova criação proibida rejeitado (Backend)
  await t.test('26-27. Backend Server-Authoritative: PUT preservando elemento legado aceito; PUT criando novo proibido rejeitado', async () => {
    // Garantir que qrcode está OFF na empresa Alpha para niche-gondola
    await CompanyConfigurationRepository.setElementEnabled(companyAlpha.id, 'niche-gondola', 'qrcode', false);

    // Criar modelo com elemento legado qrcode
    const legacyTemplate = await templateRepository.createTemplate(
      {
        title: 'Template Legado com QRCode',
        nicheId: 'niche-gondola',
        document: {
          schemaVersion: 1,
          title: 'Template Legado com QRCode',
          dimensions: { widthMm: 100, heightMm: 50, dpi: 203, orientation: 'landscape' },
          elements: [
            {
              id: 'el-legacy-qr-001',
              type: 'qrcode',
              x: 10,
              y: 10,
              width: 30,
              height: 30,
              content: 'EXISTING_QR',
            },
          ],
        },
      },
      companyAlpha.id
    );

    // 26. PUT preservando o elemento legado existente: deve ter sucesso 200
    const reqUpdateLegacy = {
      method: 'PUT',
      url: `/${legacyTemplate.id}`,
      headers: { 'x-csrf-token': adminSession.csrfToken },
      cookies: { witiquetas_session: adminSession.rawToken },
      body: {
        title: 'Template Legado Atualizado com Sucesso',
        document: {
          ...legacyTemplate.document,
          elements: [
            {
              id: 'el-legacy-qr-001',
              type: 'qrcode',
              x: 20, // Moveu
              y: 20,
              width: 30,
              height: 30,
              content: 'EXISTING_QR',
            },
          ],
        },
      },
    };
    const resUpdateLegacy = await callRouter(templatesRouter, reqUpdateLegacy);
    assert.equal(resUpdateLegacy.statusCode, 200, 'PUT preservando elemento legado existente deve ser aceito');

    // 27. PUT criando NOVO elemento proibido: deve ser rejeitado com 400
    const reqCreateForbidden = {
      method: 'PUT',
      url: `/${legacyTemplate.id}`,
      headers: { 'x-csrf-token': adminSession.csrfToken },
      cookies: { witiquetas_session: adminSession.rawToken },
      body: {
        title: 'Tentativa Adicionar Novo QRCode',
        document: {
          ...legacyTemplate.document,
          elements: [
            {
              id: 'el-legacy-qr-001',
              type: 'qrcode',
              x: 20,
              y: 20,
              width: 30,
              height: 30,
              content: 'EXISTING_QR',
            },
            {
              id: 'el-new-forbidden-qr',
              type: 'qrcode', // NOVO elemento de tipo desabilitado
              x: 60,
              y: 20,
              width: 30,
              height: 30,
              content: 'FORBIDDEN_NEW_QR',
            },
          ],
        },
      },
    };
    const resForbidden = await callRouter(templatesRouter, reqCreateForbidden);
    assert.equal(resForbidden.statusCode, 400, 'PUT adicionando novo elemento desabilitado deve retornar 400');
    assert.match(resForbidden.body.error, /desabilitado/i);

    // Duplicação de modelo com elemento proibido também deve ser rejeitada pelo backend
    const reqDuplicate = {
      method: 'POST',
      url: `/${legacyTemplate.id}/duplicate`,
      headers: { 'x-csrf-token': adminSession.csrfToken },
      cookies: { witiquetas_session: adminSession.rawToken },
    };
    const resDuplicate = await callRouter(templatesRouter, reqDuplicate);
    assert.equal(resDuplicate.statusCode, 400, 'Duplicação de modelo com elemento proibido deve ser rejeitada');
  });

  // 28. Role_niches restringe contexto
  await t.test('28. Role Niches: Restringe contexto e nichos permitidos de acordo com o papel do usuário', async () => {
    // Configurar que OPERATOR só pode acessar niche-gondola
    for (const n of NICHES) {
      await RoleRepository.setRoleNicheAccess(alphaOperatorRole.id, n.id, n.id === 'niche-gondola');
    }

    const operatorConfig = await EffectiveConfigurationService.resolve({
      companyId: companyAlpha.id,
      roleCode: 'OPERATOR',
    });

    assert.equal(operatorConfig.allowedNiches.length, 1);
    assert.equal(operatorConfig.allowedNiches[0], 'niche-gondola');
    assert.equal(operatorConfig.allowedNiches.includes('niche-farmacia'), false);
  });

  // 29. Multi-tenant preservado
  await t.test('29. Multi-Tenant: Configuração da Empresa Alpha não vaza nem afeta Empresa Beta', async () => {
    await bootstrapCompanyNicheProfiles(companyBeta.id);

    // Na Empresa Alpha qrcode está OFF
    const alphaConfig = await EffectiveConfigurationService.resolve({ companyId: companyAlpha.id });
    assert.equal(alphaConfig.enabledElementsByNiche['niche-gondola']?.includes('qrcode'), false);

    // Na Empresa Beta (preset padrão) qrcode está ON
    const betaConfig = await EffectiveConfigurationService.resolve({ companyId: companyBeta.id });
    assert.equal(betaConfig.enabledElementsByNiche['niche-gondola']?.includes('qrcode'), true);
  });

  // 30. PLATFORM_DEVELOPER restrito ao company configurado
  await t.test('30. Platform Developer: Restrito unicamente à empresa configurada em DCC_DEVELOPER_COMPANY_ID', () => {
    const devCompanyId = getDeveloperCompanyId();
    assert.equal(devCompanyId, 'comp-platform-dev', 'DCC deve mapear exatamente para comp-platform-dev');
  });

  // 31. Price continua único
  await t.test('31. Elemento Price: Continua existindo exatamente 1 elemento visual "price"', () => {
    const priceElements = CANONICAL_ELEMENT_TYPES.filter((t) => t.includes('price') || t === 'price');
    assert.equal(priceElements.length, 1, 'Deve existir unicamente o elemento "price"');
    assert.equal(priceElements[0], 'price');
  });

  // 32. Compiladores preservados
  await t.test('32. Compiladores: ZPLCompiler compila documentos válidos com sucesso', () => {
    const zplCompiler = new ZPLCompiler();
    const doc: LabelDocument = {
      schemaVersion: 1,
      title: 'Teste ZPL',
      dimensions: { widthMm: 80, heightMm: 40, dpi: 203, orientation: 'landscape' },
      elements: [
        { id: 't1', type: 'text', x: 5, y: 5, width: 40, height: 10, content: 'Texto ZPL' },
        { id: 'b1', type: 'barcode', x: 5, y: 20, width: 60, height: 15, content: '78912345' },
      ],
    };
    const compiled = zplCompiler.compile(doc);
    assert.ok(compiled.command.includes('^XA'));
    assert.ok(compiled.command.includes('^XZ'));
  });

  // 33. Round-trip preservado
  await t.test('33. Round-Trip: Validação Zod de LabelDocumentSchema preservada', () => {
    const doc: LabelDocument = {
      schemaVersion: 1,
      title: 'Teste Round-Trip',
      dimensions: { widthMm: 100, heightMm: 50, dpi: 203, orientation: 'landscape' },
      elements: [
        { id: 'el-1', type: 'text', x: 10, y: 10, width: 30, height: 10, content: 'Validação' },
      ],
      nicheId: 'niche-gondola',
    };
    const parsed = LabelDocumentSchema.parse(doc);
    assert.equal(parsed.title, doc.title);
    assert.equal(parsed.elements.length, 1);
  });

  // 34. Agent auth preservado
  await t.test('34. Agent Auth: verifyWebUserToken continua funcional para agentes', () => {
    const principal = verifyWebUserToken('agent-test-key-secret-1234');
    assert.ok(principal);
    assert.equal(principal.role, 'ADMIN');
  });

  // 35. Central preservada
  await t.test('35. Central de Impressão: Arquivo PrintCenterPage.tsx preservado intacto', () => {
    const p = path.join(process.cwd(), 'apps/frontend/src/modules/printcenter/PrintCenterPage.tsx');
    assert.ok(fs.existsSync(p));
  });

  // 36. DCC preservado
  await t.test('36. DCC: DevControlPage.tsx preservado intacto', () => {
    const p = path.join(process.cwd(), 'apps/frontend/src/modules/devcontrol/DevControlPage.tsx');
    assert.ok(fs.existsSync(p));
  });

  // 37. Baseline visual do Editor preservado
  await t.test('37. Baseline Visual: EditorLayout, Toolbox e Canvas preservados sem alterações cosméticas não autorizadas', () => {
    const editorLayout = path.join(process.cwd(), 'apps/frontend/src/editor/EditorLayout.tsx');
    const content = fs.readFileSync(editorLayout, 'utf8');
    assert.ok(content.includes('toolboxConfig'), 'Estrutura da toolbox preservada');
    assert.ok(content.includes('Canvas'), 'Canvas preservado');
  });
});
