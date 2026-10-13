import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LabelDocumentSchema,
  type LabelDocument,
  NICHES,
  getDefaultNicheProfile,
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
import templatesRouter from '../apps/backend/src/routes/templates.js';

import {
  setManualSessionContext,
  resolveCanonicalNicheId,
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

test('REGRESSÃO P0 — PERSISTÊNCIA DE MODELOS INDUSTRIAIS E DIMENSÕES PERSONALIZADAS (100x200mm, 105x200mm, 80x180mm)', async (t) => {
  clearAdminMemoryStores();
  clearSessionMemoryStores();

  const company = await CompanyRepository.create({
    id: 'comp-industrial-p0',
    name: 'Empresa Industrial P0',
    slug: 'industrial-p0',
    status: 'ACTIVE',
  });

  await bootstrapCompanyNicheProfiles(company.id);

  const adminRole = await RoleRepository.create({
    id: 'role-admin-p0',
    companyId: company.id,
    code: 'ADMIN',
    name: 'Administrador Industrial',
  });
  await RoleRepository.setRolePermissions(adminRole.id, [
    'templates.view',
    'templates.create',
    'templates.edit',
    'templates.delete',
  ]);

  const adminUser = await UserRepository.create({
    id: 'usr-admin-p0',
    companyId: company.id,
    name: 'Admin Industrial',
    email: 'admin@industrial.com',
    passwordHash: 'hash',
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole(company.id, adminUser.id, adminRole.id);

  const session = await SessionService.createAuthenticatedSession({
    userId: adminUser.id,
    companyId: company.id,
  });

  const effectiveConfig = await EffectiveConfigurationService.resolve({
    companyId: company.id,
    userId: adminUser.id,
  });

  // Configura contexto no frontend session
  setManualSessionContext({
    user: {
      id: adminUser.id,
      companyId: company.id,
      name: adminUser.name,
      email: adminUser.email,
      status: adminUser.status,
    },
    company: {
      id: company.id,
      name: company.name,
      slug: company.slug,
      status: company.status,
    },
    roles: ['ADMIN'],
    permissions: ['templates.view', 'templates.create', 'templates.edit', 'templates.delete'],
    allowedNiches: effectiveConfig.allowedNiches,
    enabledElementsByNiche: effectiveConfig.enabledElementsByNiche,
    enabledFieldsByNiche: effectiveConfig.enabledFieldsByNiche,
    fieldsAvailabilityByNiche: effectiveConfig.fieldsAvailabilityByNiche,
    csrfToken: session.csrfToken,
  });

  await t.test('Cenário A: 100 x 200 mm em Nicho Logística / Expedição (price OFF) gera elementos compatíveis e salva com HTTP 201', async () => {
    const store = useEditorStore.getState();
    const nicheLogistica = NICHES.find((n) => n.id === 'niche-logistica')!;
    assert.ok(nicheLogistica, 'Nicho logística deve existir');

    store.createNewDocument({
      title: 'Etiqueta Logística Industrial 100x200mm',
      widthMm: 100,
      heightMm: 200,
      dpi: 203,
      nicheId: nicheLogistica.id,
      nicheName: nicheLogistica.name,
    });

    const doc = useEditorStore.getState().document;
    assert.equal(doc.dimensions.widthMm, 100);
    assert.equal(doc.dimensions.heightMm, 200);
    assert.equal(doc.nicheId, 'niche-logistica');

    // Em nicho logística, NÃO deve conter elemento price
    const hasPrice = doc.elements.some((el) => el.type === 'price');
    assert.equal(hasPrice, false, 'Em nicho de logística, createNewDocument NÃO deve injetar elemento price');

    // Validação Zod
    const zodResult = LabelDocumentSchema.safeParse(doc);
    assert.equal(zodResult.success, true, 'Documento 100x200mm gerado deve ser válido no Zod');

    // Enviar ao backend POST /api/templates
    const postRes = await callRouter(templatesRouter, {
      method: 'POST',
      url: '/',
      body: {
        title: doc.title,
        name: doc.title,
        document: doc,
      },
      principal: {
        user: { id: adminUser.id, name: adminUser.name },
        company: { id: company.id, name: company.name },
        roles: ['ADMIN'],
        permissions: ['templates.create', 'templates.view', 'templates.edit'],
      },
      headers: {
        'x-csrf-token': session.csrfToken,
      },
      cookies: {
        witiquetas_session: session.rawToken,
      },
    });

    assert.equal(postRes.statusCode, 201, `Salvamento no backend deve retornar 201 Created. Body: ${JSON.stringify(postRes.body)}`);
    assert.ok(postRes.body.id, 'Modelo salvo deve possuir ID');
    assert.equal(postRes.body.document.dimensions.widthMm, 100);
    assert.equal(postRes.body.document.dimensions.heightMm, 200);
  });

  await t.test('Cenário B: 105 x 200 mm com elemento de Texto manual adicional salva com HTTP 201', async () => {
    const store = useEditorStore.getState();
    const nichePatrimonio = NICHES.find((n) => n.id === 'niche-patrimonio')!;
    assert.ok(nichePatrimonio, 'Nicho patrimônio deve existir');

    store.createNewDocument({
      title: 'Etiqueta Patrimonial 105x200mm',
      widthMm: 105,
      heightMm: 200,
      dpi: 203,
      nicheId: nichePatrimonio.id,
      nicheName: nichePatrimonio.name,
    });

    // Adiciona texto adicional
    useEditorStore.getState().addElement('text', {
      text: 'TEXTO PERSONALIZADO INDUSTRIAL',
      x: 10,
      y: 80,
      width: 80,
      height: 10,
    });

    const doc = useEditorStore.getState().document;
    assert.equal(doc.dimensions.widthMm, 105);
    assert.equal(doc.dimensions.heightMm, 200);
    assert.equal(doc.nicheId, 'niche-patrimonio');

    const zodResult = LabelDocumentSchema.safeParse(doc);
    assert.equal(zodResult.success, true, 'Documento 105x200mm gerado deve ser válido no Zod');

    const postRes = await callRouter(templatesRouter, {
      method: 'POST',
      url: '/',
      body: {
        title: doc.title,
        name: doc.title,
        document: doc,
      },
      principal: {
        user: { id: adminUser.id, name: adminUser.name },
        company: { id: company.id, name: company.name },
        roles: ['ADMIN'],
        permissions: ['templates.create', 'templates.view', 'templates.edit'],
      },
      headers: {
        'x-csrf-token': session.csrfToken,
      },
      cookies: {
        witiquetas_session: session.rawToken,
      },
    });

    assert.equal(postRes.statusCode, 201, `Salvamento 105x200mm deve retornar 201. Body: ${JSON.stringify(postRes.body)}`);
  });

  await t.test('Cenário C: 80 x 180 mm em Nicho Uso Geral (price OFF) salva com HTTP 201', async () => {
    const store = useEditorStore.getState();
    const nicheUsoGeral = NICHES.find((n) => n.id === 'niche-uso-geral')!;
    assert.ok(nicheUsoGeral, 'Nicho uso-geral deve existir');

    store.createNewDocument({
      title: 'Etiqueta Uso Geral 80x180mm',
      widthMm: 80,
      heightMm: 180,
      dpi: 203,
      nicheId: nicheUsoGeral.id,
      nicheName: nicheUsoGeral.name,
    });

    const doc = useEditorStore.getState().document;
    assert.equal(doc.dimensions.widthMm, 80);
    assert.equal(doc.dimensions.heightMm, 180);
    assert.equal(doc.nicheId, 'niche-uso-geral');

    const postRes = await callRouter(templatesRouter, {
      method: 'POST',
      url: '/',
      body: {
        title: doc.title,
        name: doc.title,
        document: doc,
      },
      principal: {
        user: { id: adminUser.id, name: adminUser.name },
        company: { id: company.id, name: company.name },
        roles: ['ADMIN'],
        permissions: ['templates.create', 'templates.view', 'templates.edit'],
      },
      headers: {
        'x-csrf-token': session.csrfToken,
      },
      cookies: {
        witiquetas_session: session.rawToken,
      },
    });

    assert.equal(postRes.statusCode, 201, `Salvamento 80x180mm deve retornar 201. Body: ${JSON.stringify(postRes.body)}`);
  });

  await t.test('Cenário D: Compatibilidade legada com 100 x 50 mm em Nicho Varejo (Gôndola) preserva price e barcode', async () => {
    const store = useEditorStore.getState();
    const nicheGondola = NICHES.find((n) => n.id === 'niche-gondola')!;
    assert.ok(nicheGondola, 'Nicho gondola deve existir');

    store.createNewDocument({
      title: 'Etiqueta Gondola 100x50mm',
      widthMm: 100,
      heightMm: 50,
      dpi: 203,
      nicheId: nicheGondola.id,
      nicheName: nicheGondola.name,
    });

    const doc = useEditorStore.getState().document;
    assert.equal(doc.dimensions.widthMm, 100);
    assert.equal(doc.dimensions.heightMm, 50);
    assert.equal(doc.nicheId, 'niche-gondola');

    // Em varejo/gôndola, price e barcode DEVEM ser gerados
    const hasPrice = doc.elements.some((el) => el.type === 'price');
    const hasBarcode = doc.elements.some((el) => el.type === 'barcode');
    assert.equal(hasPrice, true, 'Em gôndola/varejo, elemento price deve continuar sendo gerado');
    assert.equal(hasBarcode, true, 'Em gôndola/varejo, elemento barcode deve continuar sendo gerado');

    const postRes = await callRouter(templatesRouter, {
      method: 'POST',
      url: '/',
      body: {
        title: doc.title,
        name: doc.title,
        document: doc,
      },
      principal: {
        user: { id: adminUser.id, name: adminUser.name },
        company: { id: company.id, name: company.name },
        roles: ['ADMIN'],
        permissions: ['templates.create', 'templates.view', 'templates.edit'],
      },
      headers: {
        'x-csrf-token': session.csrfToken,
      },
      cookies: {
        witiquetas_session: session.rawToken,
      },
    });

    assert.equal(postRes.statusCode, 201, `Salvamento de gôndola deve retornar 201. Body: ${JSON.stringify(postRes.body)}`);
  });
});
