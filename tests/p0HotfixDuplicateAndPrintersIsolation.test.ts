import test from 'node:test';
import assert from 'node:assert/strict';
import { CompanyRepository, UserRepository, RoleRepository, clearAdminMemoryStores } from '../apps/backend/src/repositories/adminRepositories.js';
import { SessionService, clearSessionMemoryStores } from '../apps/backend/src/services/sessionService.js';
import { bootstrapCompanyNicheProfiles } from '../apps/backend/src/services/adminBootstrapService.js';
import { templateRepository } from '../apps/backend/src/repositories/templateRepository.js';
import templatesRouter from '../apps/backend/src/routes/templates.js';
import printersRouter, { printersStore } from '../apps/backend/src/routes/printers.js';
import type { LabelDocument } from '@witiquetas/label-schema';

function createMockResponse() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as any,
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
  };
  return res;
}

function callRouter(router: any, req: any): Promise<any> {
  const handler = typeof router === 'function' ? router : (router?.default || router);
  const res = createMockResponse();
  return new Promise((resolve) => {
    const origJson = res.json.bind(res);
    res.json = (data: any) => {
      origJson(data);
      resolve(res);
      return res;
    };
    const origStatus = res.status.bind(res);
    res.status = (code: number) => {
      origStatus(code);
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

const sampleDocument: LabelDocument = {
  version: '1.0',
  schemaVersion: 1,
  target: 'thermal',
  nicheId: 'niche-gondola',
  nicheName: 'Gôndola Supermercado',
  dimensions: {
    widthMm: 100,
    heightMm: 50,
    dpi: 203,
    orientation: 'portrait',
  },
  elements: [
    {
      id: 'el-text-1',
      type: 'text',
      name: 'Nome',
      field: 'product.description',
      position: { xMm: 5, yMm: 5, zIndex: 1 },
      frame: { widthMm: 80, heightMm: 10 },
      font: { family: 'Helvetica', sizePt: 12, weight: 'bold', align: 'left' },
      locked: false,
      visible: true,
      text: 'Produto Teste',
    } as any,
  ],
};

test('P0 HOTFIX — SUÍTE DE GATES DE AUTORIZAÇÃO E ISOLAMENTO MULTI-TENANT', async (t) => {
  clearAdminMemoryStores();
  clearSessionMemoryStores();

  // 1. Setup Tenant A e Tenant B
  await CompanyRepository.create({
    id: 'comp-alpha',
    name: 'Alpha Ltda',
    legalName: 'Alpha Ltda',
    document: '00.000.001/0001-01',
    slug: 'alpha',
    status: 'ACTIVE',
  });
  await CompanyRepository.create({
    id: 'comp-beta',
    name: 'Beta Ltda',
    legalName: 'Beta Ltda',
    document: '00.000.002/0001-02',
    slug: 'beta',
    status: 'ACTIVE',
  });

  await bootstrapCompanyNicheProfiles('comp-alpha');
  await bootstrapCompanyNicheProfiles('comp-beta');

  // Papel Editor Sem Create (apenas templates.view, templates.edit)
  const roleEditorOnly = await RoleRepository.create({
    id: 'role-editor-only',
    companyId: 'comp-alpha',
    name: 'Editor Sem Create',
    code: 'EDITOR_ONLY',
  });
  await RoleRepository.setRolePermissions(roleEditorOnly.id, ['templates.view', 'templates.edit']);

  // Papel Creator (templates.view, templates.create, templates.edit)
  const roleCreator = await RoleRepository.create({
    id: 'role-creator',
    companyId: 'comp-alpha',
    name: 'Creator Completo',
    code: 'CREATOR',
  });
  await RoleRepository.setRolePermissions(roleCreator.id, ['templates.view', 'templates.create', 'templates.edit']);

  // Usuário A1: Editor Sem Create
  const userA1 = await UserRepository.create({
    id: 'usr-a1-editor',
    companyId: 'comp-alpha',
    name: 'User A1 Editor',
    email: 'a1@alpha.com',
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole('comp-alpha', userA1.id, roleEditorOnly.id);
  const sessionA1 = await SessionService.createAuthenticatedSession({
    userId: userA1.id,
    companyId: 'comp-alpha',
  });

  // Usuário A2: Creator
  const userA2 = await UserRepository.create({
    id: 'usr-a2-creator',
    companyId: 'comp-alpha',
    name: 'User A2 Creator',
    email: 'a2@alpha.com',
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole('comp-alpha', userA2.id, roleCreator.id);
  const sessionA2 = await SessionService.createAuthenticatedSession({
    userId: userA2.id,
    companyId: 'comp-alpha',
  });

  // Usuário Operador Tenant A para Impressoras
  const rolePrinterManagerA = await RoleRepository.create({
    id: 'role-printer-manager-a',
    companyId: 'comp-alpha',
    name: 'Printer Manager Alpha',
    code: 'PRN_MGR_A',
  });
  await RoleRepository.setRolePermissions(rolePrinterManagerA.id, ['printers.view', 'printers.manage']);
  const userPrnA = await UserRepository.create({
    id: 'usr-prn-a',
    companyId: 'comp-alpha',
    name: 'User Printer Alpha',
    email: 'prn@alpha.com',
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole('comp-alpha', userPrnA.id, rolePrinterManagerA.id);
  const sessionPrnA = await SessionService.createAuthenticatedSession({
    userId: userPrnA.id,
    companyId: 'comp-alpha',
  });

  // Usuário Operador Tenant B para Impressoras
  const rolePrinterManagerB = await RoleRepository.create({
    id: 'role-printer-manager-b',
    companyId: 'comp-beta',
    name: 'Printer Manager Beta',
    code: 'PRN_MGR_B',
  });
  await RoleRepository.setRolePermissions(rolePrinterManagerB.id, ['printers.view', 'printers.manage']);
  const userPrnB = await UserRepository.create({
    id: 'usr-prn-b',
    companyId: 'comp-beta',
    name: 'User Printer Beta',
    email: 'prn@beta.com',
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole('comp-beta', userPrnB.id, rolePrinterManagerB.id);
  const sessionPrnB = await SessionService.createAuthenticatedSession({
    userId: userPrnB.id,
    companyId: 'comp-beta',
  });

  // Criar template base em comp-alpha
  const baseTemplate = await templateRepository.createTemplate(
    {
      title: 'Etiqueta Matriz Original',
      scope: 'COMPANY',
      nicheId: 'niche-gondola',
      document: sampleDocument,
    },
    'comp-alpha'
  );

  // =========================================================================
  // GATE 1: edit sem create → duplicate 403
  // =========================================================================
  await t.test('GATE 1: edit sem create → duplicate 403', async () => {
    const res = await callRouter(templatesRouter, {
      method: 'POST',
      url: `/${baseTemplate.id}/duplicate`,
      headers: {
        cookie: `witiquetas_session=${sessionA1.rawToken}`,
        'x-csrf-token': sessionA1.csrfToken,
      },
    });

    assert.equal(res.statusCode, 403, 'Duplicação sem permissão templates.create deve retornar 403 Forbidden');
    assert.equal(res.body?.code, 'FORBIDDEN');
    assert.equal(res.body?.requiredPermission, 'templates.create');
  });

  // =========================================================================
  // GATE 2: create → duplicate permitido (201)
  // =========================================================================
  await t.test('GATE 2: create → duplicate permitido (201)', async () => {
    const res = await callRouter(templatesRouter, {
      method: 'POST',
      url: `/${baseTemplate.id}/duplicate`,
      headers: {
        cookie: `witiquetas_session=${sessionA2.rawToken}`,
        'x-csrf-token': sessionA2.csrfToken,
      },
    });

    assert.equal(res.statusCode, 201, 'Duplicação com templates.create deve retornar 201 Created');
    assert.ok(res.body?.id, 'Deve retornar o objeto do novo modelo clonado com id');
    assert.notEqual(res.body?.id, baseTemplate.id, 'O ID clonado deve ser novo');
  });

  // =========================================================================
  // SETUP DE IMPRESSORAS TENANT A E TENANT B
  // =========================================================================
  printersStore.clear();

  // Impressora 1 do Tenant A
  printersStore.set('prn-alpha-1', {
    id: 'prn-alpha-1',
    companyId: 'comp-alpha',
    name: 'Elgin L42 Pro Alpha',
    model: 'Elgin L42 Pro',
    protocol: 'RAW_TCP',
    host: '10.0.0.10',
    port: 9100,
    language: 'PPLB',
    dpi: 203,
    active: true,
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);

  // Impressora 2 do Tenant B
  printersStore.set('prn-beta-1', {
    id: 'prn-beta-1',
    companyId: 'comp-beta',
    name: 'Zebra ZD220 Beta',
    model: 'Zebra ZD220',
    protocol: 'RAW_TCP',
    host: '10.0.1.10',
    port: 9100,
    language: 'ZPL',
    dpi: 203,
    active: true,
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);

  // =========================================================================
  // GATE 3: tenant A não lista impressora de tenant B
  // =========================================================================
  await t.test('GATE 3: tenant A não lista impressora de tenant B', async () => {
    const res = await callRouter(printersRouter, {
      method: 'GET',
      url: '/',
      headers: {
        cookie: `witiquetas_session=${sessionPrnA.rawToken}`,
      },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body?.total, 1, 'Tenant A deve listar apenas 1 impressora');
    assert.equal(res.body?.printers[0].id, 'prn-alpha-1');
    assert.equal(res.body?.printers.some((p: any) => p.id === 'prn-beta-1'), false, 'Impressora do tenant B não pode ser listada para tenant A');
  });

  // =========================================================================
  // GATE 4: GET B por tenant A → 404
  // =========================================================================
  await t.test('GATE 4: GET B por tenant A → 404', async () => {
    const res = await callRouter(printersRouter, {
      method: 'GET',
      url: '/prn-beta-1',
      headers: {
        cookie: `witiquetas_session=${sessionPrnA.rawToken}`,
      },
    });

    assert.equal(res.statusCode, 404, 'Buscar impressora de outro tenant via IDOR deve retornar 404');
    assert.equal(res.body?.error, 'Impressora não encontrada.');
  });

  // =========================================================================
  // GATE 5: PUT B por tenant A → 404
  // =========================================================================
  await t.test('GATE 5: PUT B por tenant A → 404', async () => {
    const res = await callRouter(printersRouter, {
      method: 'PUT',
      url: '/prn-beta-1',
      headers: {
        cookie: `witiquetas_session=${sessionPrnA.rawToken}`,
        'x-csrf-token': sessionPrnA.csrfToken,
      },
      body: {
        name: 'Tentativa de Hack IDOR Alpha sobre Beta',
      },
    });

    assert.equal(res.statusCode, 404, 'Alterar impressora de outro tenant deve retornar 404');
    const betaPrinter = printersStore.get('prn-beta-1');
    assert.equal(betaPrinter?.name, 'Zebra ZD220 Beta', 'Impressora de Beta não pode ter sido alterada');
  });

  // =========================================================================
  // GATE 6: DELETE B por tenant A → 404
  // =========================================================================
  await t.test('GATE 6: DELETE B por tenant A → 404', async () => {
    const res = await callRouter(printersRouter, {
      method: 'DELETE',
      url: '/prn-beta-1',
      headers: {
        cookie: `witiquetas_session=${sessionPrnA.rawToken}`,
        'x-csrf-token': sessionPrnA.csrfToken,
      },
    });

    assert.equal(res.statusCode, 404, 'Deletar impressora de outro tenant deve retornar 404');
    assert.ok(printersStore.has('prn-beta-1'), 'Impressora de Beta deve permanecer no store');
  });

  // =========================================================================
  // GATE 7: POST não aceita companyId arbitrário (INVALID_COMPANY_ID / 400)
  // =========================================================================
  await t.test('GATE 7: POST não aceita companyId arbitrário (INVALID_COMPANY_ID / 400)', async () => {
    const res = await callRouter(printersRouter, {
      method: 'POST',
      url: '/',
      headers: {
        cookie: `witiquetas_session=${sessionPrnA.rawToken}`,
        'x-csrf-token': sessionPrnA.csrfToken,
      },
      body: {
        name: 'Impressora Injetada para Beta',
        companyId: 'comp-beta', // Tentativa de forjar tenant
        protocol: 'RAW_TCP',
        language: 'PPLB',
        host: '10.0.2.1',
      },
    });

    assert.equal(res.statusCode, 400, 'POST com companyId divergente do principal deve ser rejeitado');
    assert.equal(res.body?.code, 'INVALID_COMPANY_ID');
  });

  // =========================================================================
  // GATE 8: POST sem companyId atribui tenant autenticado e preserva isDefault de outros tenants
  // =========================================================================
  await t.test('GATE 8: POST com isDefault unsetting apenas para o mesmo tenant', async () => {
    const res = await callRouter(printersRouter, {
      method: 'POST',
      url: '/',
      headers: {
        cookie: `witiquetas_session=${sessionPrnA.rawToken}`,
        'x-csrf-token': sessionPrnA.csrfToken,
      },
      body: {
        name: 'Nova Impressora Default Alpha',
        protocol: 'RAW_TCP',
        language: 'PPLB',
        host: '10.0.0.20',
        isDefault: true,
      },
    });

    assert.equal(res.statusCode, 201);
    assert.equal(res.body?.companyId, 'comp-alpha');

    // Impressora antiga de Alpha não é mais default
    const alphaOld = printersStore.get('prn-alpha-1');
    assert.equal(alphaOld?.isDefault, false, 'Impressora antiga de Alpha deve perder isDefault');

    // Impressora de Beta CONTINUA default intacta!
    const betaPrinter = printersStore.get('prn-beta-1');
    assert.equal(betaPrinter?.isDefault, true, 'Impressora de Beta não pode perder isDefault por ação de Alpha');
  });

  // =========================================================================
  // GATE 9: PUT com companyId divergente retorna 400 INVALID_COMPANY_ID
  // =========================================================================
  await t.test('GATE 9: PUT com companyId divergente retorna 400 INVALID_COMPANY_ID', async () => {
    const res = await callRouter(printersRouter, {
      method: 'PUT',
      url: '/prn-alpha-1',
      headers: {
        cookie: `witiquetas_session=${sessionPrnA.rawToken}`,
        'x-csrf-token': sessionPrnA.csrfToken,
      },
      body: {
        companyId: 'comp-beta',
      },
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body?.code, 'INVALID_COMPANY_ID');
  });
});
