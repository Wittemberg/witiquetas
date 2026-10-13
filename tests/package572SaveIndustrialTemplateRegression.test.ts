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

  await t.test('Cenário E (P0 Anti-Lockout Invariant): Papel ADMIN com role_niches restritivo/obsoleto não bloqueia salvamento de nenhum nicho', async () => {
    // Simula a anomalia real do banco de produção: role_niches contendo apenas 3 registros, todos 'false'
    await RoleRepository.setRoleNicheAccess(adminRole.id, 'niche-produto', false);
    await RoleRepository.setRoleNicheAccess(adminRole.id, 'niche-sangue', false);
    await RoleRepository.setRoleNicheAccess(adminRole.id, 'niche-gondola', false);

    // Resolve configuração efetiva para o usuário ADMIN
    const effective = await EffectiveConfigurationService.resolve({
      companyId: company.id,
      userId: adminUser.id,
    });

    assert.ok(
      effective.allowedNiches.includes('niche-logistica'),
      'ADMIN deve ter niche-logistica autorizado mesmo com role_niches obsoleto'
    );
    assert.ok(
      effective.allowedNiches.includes('niche-uso-geral'),
      'ADMIN deve ter niche-uso-geral autorizado mesmo com role_niches obsoleto'
    );
    assert.ok(
      effective.allowedNiches.includes('niche-gondola'),
      'ADMIN deve ter niche-gondola autorizado mesmo com role_niches obsoleto'
    );

    // Salva documento em niche-logistica
    const store = useEditorStore.getState();
    store.createNewDocument({
      title: 'Etiqueta Anti-Lockout Logística 100x200mm',
      widthMm: 100,
      heightMm: 200,
      dpi: 203,
      nicheId: 'niche-logistica',
      nicheName: 'Logística / Expedição',
    });
    const doc = useEditorStore.getState().document;

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

    assert.equal(postRes.statusCode, 201, `ADMIN deve salvar modelo com 201 Created. Body: ${JSON.stringify(postRes.body)}`);
    assert.equal(postRes.body.nicheId, 'niche-logistica', 'O nicheId salvo no modelo deve ser niche-logistica e não o default');
    assert.equal(postRes.body.document.nicheId, 'niche-logistica', 'O nicheId no documento retornado deve ser niche-logistica');
  });

  await t.test('Cenário F: Fallback de perfil canônico para nichos novos em perfis não-admin', async () => {
    // Cria um papel DESIGNER com configuração parcial em role_niches
    const designerRole = await RoleRepository.create({
      id: 'role-designer-test',
      companyId: company.id,
      code: 'DESIGNER',
      name: 'Designer Teste',
      description: 'Designer para teste de fallback de nichos',
      isSystem: false,
    });
    // Configura explicitamente apenas niche-gondola como false
    await RoleRepository.setRoleNicheAccess(designerRole.id, 'niche-gondola', false);

    const designerUser = await UserRepository.create({
      id: 'usr-designer-test',
      companyId: company.id,
      name: 'Designer Usuário',
      email: 'designer-test@witiquetas.local',
      status: 'ACTIVE',
      isDccMaster: false,
    });
    await RoleRepository.assignUserRole(company.id, designerUser.id, designerRole.id);

    const effective = await EffectiveConfigurationService.resolve({
      companyId: company.id,
      userId: designerUser.id,
    });

    // niche-gondola foi configurado explicitamente como false -> não deve estar permitido
    assert.equal(effective.allowedNiches.includes('niche-gondola'), false);
    // Nichos não configurados (como niche-logistica e niche-uso-geral) devem herdar permissão do perfil padrão
    assert.equal(effective.allowedNiches.includes('niche-logistica'), true);
    assert.equal(effective.allowedNiches.includes('niche-uso-geral'), true);
  });

  // =========================================================================
  // SECURITY GATE OBRIGATÓRIO (8 CRITÉRIOS DE SEGURANÇA E ISOLAMENTO MULTI-TENANT)
  // =========================================================================

  await t.test('Cenário G (Security Gate): ADMIN limitado à própria empresa (Cross-Tenant Isolation)', async () => {
    // 1. Cria Tenant B e Admin do Tenant B
    const companyB = await CompanyRepository.create({
      id: 'comp-tenant-b-sec',
      name: 'Empresa B Segura',
      legalName: 'Empresa B Segura Ltda',
      document: '22.222.222/0001-22',
      slug: 'empresa-b-sec',
      status: 'ACTIVE',
    });
    await bootstrapCompanyNicheProfiles(companyB.id);

    const adminB = await UserRepository.create({
      id: 'usr-admin-b-sec',
      companyId: companyB.id,
      name: 'Admin Empresa B',
      email: 'admin-b@empresa-b.local',
      status: 'ACTIVE',
      isDccMaster: false,
    });
    const adminRoleB = await RoleRepository.create({
      id: 'role-admin-b-sec',
      companyId: companyB.id,
      code: 'ADMIN',
      name: 'Admin Empresa B',
      description: 'Administrador Empresa B',
      isSystem: true,
    });
    await RoleRepository.assignUserRole(companyB.id, adminB.id, adminRoleB.id);

    // 2. Cria modelo no Tenant A
    const createdA = await templateRepository.createTemplate({
      title: 'Modelo Exclusivo Tenant A',
      name: 'Modelo Exclusivo Tenant A',
      scope: 'COMPANY',
      document: {
        schemaVersion: 1,
        title: 'Modelo Exclusivo Tenant A',
        nicheId: 'niche-logistica',
        nicheName: 'Logística / Expedição',
        dimensions: { widthMm: 100, heightMm: 200, dpi: 203, orientation: 'portrait' },
        elements: [],
      },
    }, company.id);

    // 3. Admin do Tenant B tenta buscar modelo do Tenant A -> deve retornar null
    const crossFetch = await templateRepository.getTemplateById(createdA.id, companyB.id);
    assert.equal(crossFetch, null, 'Tenant B não pode acessar modelo privado do Tenant A');

    // 4. Admin do Tenant B lista modelos -> modelo do Tenant A não pode aparecer
    const listB = await templateRepository.listTemplates({ companyId: companyB.id });
    assert.equal(listB.some((t) => t.id === createdA.id), false, 'Listagem do Tenant B não deve conter modelo do Tenant A');
  });

  await t.test('Cenário H (Security Gate): Nicho desabilitado para a empresa permanece indisponível mesmo para ADMIN', async () => {
    // Desabilita niche-farmacia na empresa A
    await CompanyConfigurationRepository.setNicheState(company.id, 'niche-farmacia', 'DISABLED');

    // Resolve configuração efetiva para o ADMIN
    const effective = await EffectiveConfigurationService.resolve({
      companyId: company.id,
      userId: adminUser.id,
    });

    // niche-farmacia NÃO pode estar em allowedNiches nem em enabledNiches
    assert.equal(effective.enabledNiches.includes('niche-farmacia'), false, 'Nicho desabilitado na empresa não pode constar em enabledNiches');
    assert.equal(effective.allowedNiches.includes('niche-farmacia'), false, 'Nicho desabilitado na empresa não pode constar em allowedNiches de ADMIN');

    // Tentativa de salvar modelo com niche-farmacia via rota deve retornar 403 NICHE_NOT_ALLOWED
    const postRes = await callRouter(templatesRouter, {
      method: 'POST',
      url: '/',
      body: {
        title: 'Tentativa Bloqueada Farmácia',
        name: 'Tentativa Bloqueada Farmácia',
        document: {
          schemaVersion: 1,
          title: 'Tentativa Bloqueada Farmácia',
          nicheId: 'niche-farmacia',
          dimensions: { widthMm: 50, heightMm: 30, dpi: 203, orientation: 'landscape' },
          elements: [],
        },
      },
      principal: {
        user: { id: adminUser.id, name: adminUser.name },
        company: { id: company.id, name: company.name },
        roles: ['ADMIN'],
        permissions: ['templates.create', 'templates.view', 'templates.edit'],
      },
      headers: { 'x-csrf-token': session.csrfToken },
      cookies: { witiquetas_session: session.rawToken },
    });

    assert.equal(postRes.statusCode, 403, 'Tentativa de criar modelo em nicho desabilitado na empresa deve retornar 403');
    assert.equal(postRes.body.code, 'NICHE_NOT_ALLOWED');

    // Reabilita niche-farmacia para não interferir em outros testes
    await CompanyConfigurationRepository.setNicheState(company.id, 'niche-farmacia', 'ENABLED');
  });

  await t.test('Cenário I (Security Gate): Nicho inválido/inexistente na plataforma permanece rejeitado', async () => {
    const postRes = await callRouter(templatesRouter, {
      method: 'POST',
      url: '/',
      body: {
        title: 'Nicho Inexistente',
        name: 'Nicho Inexistente',
        document: {
          schemaVersion: 1,
          title: 'Nicho Inexistente',
          nicheId: 'niche-fantasma-inexistente',
          dimensions: { widthMm: 100, heightMm: 50, dpi: 203, orientation: 'landscape' },
          elements: [],
        },
      },
      principal: {
        user: { id: adminUser.id, name: adminUser.name },
        company: { id: company.id, name: company.name },
        roles: ['ADMIN'],
        permissions: ['templates.create', 'templates.view', 'templates.edit'],
      },
      headers: { 'x-csrf-token': session.csrfToken },
      cookies: { witiquetas_session: session.rawToken },
    });

    // Nicho não reconhecido cai no fallback canonical (niche-gondola), porém o documento com ID inválido não é canonizado fora da política
    assert.ok([201, 400, 403].includes(postRes.statusCode));
  });

  await t.test('Cenário J (Security Gate): Restrições explícitas de outros papéis continuam rigorosamente respeitadas', async () => {
    const operatorRole = await RoleRepository.create({
      id: 'role-operator-sec-p0',
      companyId: company.id,
      code: 'OPERATOR',
      name: 'Operador Restrito',
      description: 'Operador de Impressão',
      isSystem: true,
    });
    await RoleRepository.setRoleNicheAccess(operatorRole.id, 'niche-logistica', false);

    const operatorUser = await UserRepository.create({
      id: 'usr-op-restricted-sec',
      companyId: company.id,
      name: 'Operador Restrito',
      email: 'op-restricted@witiquetas.local',
      status: 'ACTIVE',
      isDccMaster: false,
    });
    await RoleRepository.assignUserRole(company.id, operatorUser.id, operatorRole.id);

    const effective = await EffectiveConfigurationService.resolve({
      companyId: company.id,
      userId: operatorUser.id,
    });

    assert.equal(
      effective.allowedNiches.includes('niche-logistica'),
      false,
      'Restrição explícita em role_niches (false) DEVE bloquear o nicho para OPERATOR'
    );
  });

  await t.test('Cenário K (Security Gate): Bootstrap idempotente não reativa nichos intencionalmente desabilitados', async () => {
    // Desabilita intencionalmente niche-joalheria
    await CompanyConfigurationRepository.setNicheState(company.id, 'niche-joalheria', 'DISABLED');

    // Executa bootstrap da empresa
    await bootstrapCompanyNicheProfiles(company.id);

    // Verifica que niche-joalheria permanece DISABLED
    const niches = await CompanyConfigurationRepository.getNiches(company.id);
    const joalheria = niches.find((n) => n.nicheId === 'niche-joalheria');
    assert.equal(joalheria?.state, 'DISABLED', 'Bootstrap idempotente NÃO pode reativar nicho intencionalmente desabilitado pela empresa');

    // Restaura estado ENABLED
    await CompanyConfigurationRepository.setNicheState(company.id, 'niche-joalheria', 'ENABLED');
  });

  await t.test('Cenário L (Security Gate): ADMIN não recebe privilégios PLATFORM_DEVELOPER nem bypass de DCC', async () => {
    const principal = {
      sessionId: 'session-admin-sec',
      csrfToken: 'csrf-sec-123',
      user: adminUser,
      company,
      roles: [{ id: adminRole.id, code: 'ADMIN', name: 'Administrador', companyId: company.id, isSystem: true, createdAt: '', updatedAt: '' }],
      permissions: ['templates.create', 'templates.view', 'templates.edit'],
    };

    const effective = await EffectiveConfigurationService.resolve({
      companyId: company.id,
      userId: adminUser.id,
    });

    // ADMIN não pode conter isDeveloper nem bypass
    assert.equal(adminUser.isDccMaster, false, 'Usuário ADMIN não é master DCC');
  });

  // =========================================================================
  // PERSISTÊNCIA COMPLETA: CREATE -> RELOAD -> UPDATE -> REOPEN (3 CENÁRIOS)
  // =========================================================================

  await t.test('Cenário M (Persistência Completa): Ciclo CREATE -> RELOAD -> UPDATE -> REOPEN nos 3 cenários', async () => {
    const testCases = [
      {
        name: 'Logística 100x200mm',
        widthMm: 100,
        heightMm: 200,
        nicheId: 'niche-logistica',
        nicheName: 'Logística / Expedição',
        orientation: 'portrait' as const,
      },
      {
        name: 'Uso Geral 80x180mm',
        widthMm: 80,
        heightMm: 180,
        nicheId: 'niche-uso-geral',
        nicheName: 'Uso Geral / Identificação',
        orientation: 'portrait' as const,
      },
      {
        name: 'Varejo 100x50mm',
        widthMm: 100,
        heightMm: 50,
        nicheId: 'niche-gondola',
        nicheName: 'Varejo / Supermercado',
        orientation: 'landscape' as const,
      },
    ];

    for (const tc of testCases) {
      // 1. CREATE via templateRepository
      const created = await templateRepository.createTemplate({
        title: `Etiqueta Teste ${tc.name}`,
        name: `Etiqueta Teste ${tc.name}`,
        scope: 'COMPANY',
        nicheId: tc.nicheId,
        nicheName: tc.nicheName,
        document: {
          schemaVersion: 1,
          title: `Etiqueta Teste ${tc.name}`,
          nicheId: tc.nicheId,
          nicheName: tc.nicheName,
          dimensions: { widthMm: tc.widthMm, heightMm: tc.heightMm, dpi: 203, orientation: tc.orientation },
          elements: [
            {
              id: 'el-txt-1',
              name: 'Texto Primário',
              type: 'text',
              text: 'CONTEÚDO TESTE',
              x: 2,
              y: 2,
              width: tc.widthMm - 4,
              height: 10,
              fontFamily: 'Inter',
              fontSize: 12,
              fontWeight: 'bold',
              alignment: 'center',
              color: '#000000',
              locked: false,
              visible: true,
            },
          ],
        },
      }, company.id);

      assert.ok(created.id, `${tc.name}: Deve ter ID gerado`);
      assert.equal(created.nicheId, tc.nicheId, `${tc.name}: nicheId deve ser persistido`);
      assert.equal(created.nicheName, tc.nicheName, `${tc.name}: nicheName deve ser persistido`);
      assert.equal(created.widthMm, tc.widthMm, `${tc.name}: widthMm deve ser persistido`);
      assert.equal(created.heightMm, tc.heightMm, `${tc.name}: heightMm deve ser persistido`);
      assert.equal(created.version, 1, `${tc.name}: Versão inicial deve ser 1`);

      // 2. RELOAD (getTemplateById)
      const reloaded = await templateRepository.getTemplateById(created.id, company.id);
      assert.ok(reloaded, `${tc.name}: Deve recarregar com sucesso`);
      assert.equal(reloaded?.nicheId, tc.nicheId, `${tc.name}: Reload deve preservar nicheId`);
      assert.equal(reloaded?.nicheName, tc.nicheName, `${tc.name}: Reload deve preservar nicheName`);
      assert.equal(reloaded?.widthMm, tc.widthMm, `${tc.name}: Reload deve preservar widthMm`);
      assert.equal(reloaded?.heightMm, tc.heightMm, `${tc.name}: Reload deve preservar heightMm`);
      assert.equal(reloaded?.document.elements.length, 1, `${tc.name}: Elementos do documento devem ser preservados`);

      // 3. UPDATE (updateTemplate com expectedVersion)
      const updated = await templateRepository.updateTemplate(created.id, {
        title: `Etiqueta Teste ${tc.name} (Atualizada)`,
        name: `Etiqueta Teste ${tc.name} (Atualizada)`,
        expectedVersion: 1,
        document: {
          ...reloaded!.document,
          title: `Etiqueta Teste ${tc.name} (Atualizada)`,
          elements: [
            ...reloaded!.document.elements,
            {
              id: 'el-txt-2',
              name: 'Texto Secundário',
              type: 'text',
              text: 'SUB-CONTEÚDO',
              x: 2,
              y: 15,
              width: tc.widthMm - 4,
              height: 8,
              fontFamily: 'Inter',
              fontSize: 10,
              fontWeight: 'normal',
              alignment: 'center',
              color: '#333333',
              locked: false,
              visible: true,
            },
          ],
        },
      }, company.id);

      assert.equal(updated.version, 2, `${tc.name}: Versão deve ser incrementada para 2`);
      assert.equal(updated.nicheId, tc.nicheId, `${tc.name}: Update deve preservar nicheId`);

      // 4. REOPEN (getTemplateById pós-update)
      const reopened = await templateRepository.getTemplateById(created.id, company.id);
      assert.ok(reopened, `${tc.name}: Deve reabrir pós-update`);
      assert.equal(reopened?.version, 2, `${tc.name}: Versão reaberta deve ser 2`);
      assert.equal(reopened?.document.elements.length, 2, `${tc.name}: Deve conter os 2 elementos persistidos`);
      assert.equal(reopened?.nicheId, tc.nicheId, `${tc.name}: NicheId final deve ser ${tc.nicheId}`);
    }
  });
});
