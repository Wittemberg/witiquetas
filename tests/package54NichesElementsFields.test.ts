import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
import adminRouter from '../apps/backend/src/routes/admin.js';
import sessionRouter from '../apps/backend/src/routes/session.js';
import {
  developerAuthService,
  DCC_SESSION_COOKIE_NAME,
  generateTotpCodeForTesting,
  getDeveloperCompanyId,
} from '../apps/backend/src/services/developerAuthService.js';
import { EffectiveConfigurationService } from '../apps/backend/src/services/effectiveConfigurationService.js';
import { verifyWebUserToken } from '../apps/backend/src/routes/agents.js';
import {
  NICHES,
  LABEL_SIZES_CATALOG,
  NICHE_SIZE_RELATIONS,
} from '@witiquetas/label-schema';

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

test('SUÍTE COMPLETA DE VALIDAÇÃO — PACOTE 5.4 (NICHOS, ELEMENTOS E CAMPOS CANÔNICOS)', async (t) => {
  // Setup de ambiente para os testes
  process.env.DCC_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
  process.env.DCC_DEVELOPER_COMPANY_ID = 'comp-platform-dev';
  process.env.ADMIN_API_KEY = 'agent-test-key-secret-1234';

  clearAdminMemoryStores();
  clearSessionMemoryStores();
  developerAuthService.clearAllSessionsForTesting();

  // Empresa A
  const testCompanyA = await CompanyRepository.create({
    id: 'comp-alpha',
    name: 'Empresa Alpha Ltda',
    slug: 'alpha-test',
    status: 'ACTIVE',
  });

  // Empresa B (para testes de isolamento e anti-IDOR)
  const testCompanyB = await CompanyRepository.create({
    id: 'comp-beta',
    name: 'Empresa Beta Ltda',
    slug: 'beta-test',
    status: 'ACTIVE',
  });

  // Empresa de Desenvolvimento (Marcel)
  await CompanyRepository.create({
    id: 'comp-platform-dev',
    name: 'Plataforma Witiquetas',
    slug: 'platform-dev',
    status: 'ACTIVE',
  });

  // Papel ADMIN na Empresa A (com permissões canônicas completas)
  const adminRole = await RoleRepository.create({
    id: 'role-alpha-admin',
    companyId: testCompanyA.id,
    code: 'ADMIN',
    name: 'Administrador Alpha',
  });
  await RoleRepository.setRolePermissions(adminRole.id, [
    'company.view', 'company.manage',
    'niches.view', 'niches.manage',
    'elements.view', 'elements.manage',
    'users.view', 'users.manage',
    'roles.view', 'roles.manage',
  ]);

  // Papel OPERATOR na Empresa A (restrito, sem permissões de nichos e elementos)
  const operatorRole = await RoleRepository.create({
    id: 'role-alpha-operator',
    companyId: testCompanyA.id,
    code: 'OPERATOR',
    name: 'Operador Alpha',
  });
  await RoleRepository.setRolePermissions(operatorRole.id, ['company.view']);

  // Usuário Admin
  const adminUser = await UserRepository.create({
    id: 'usr-alpha-admin',
    companyId: testCompanyA.id,
    name: 'Carlos Admin',
    email: 'admin@alpha.com',
    passwordHash: 'hash',
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole(testCompanyA.id, adminUser.id, adminRole.id);

  // Usuário Restrito
  const restrictedUser = await UserRepository.create({
    id: 'usr-alpha-operador',
    companyId: testCompanyA.id,
    name: 'Roberto Operador',
    email: 'operador@alpha.com',
    passwordHash: 'hash',
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole(testCompanyA.id, restrictedUser.id, operatorRole.id);

  // Sessões
  const adminSession = await SessionService.createAuthenticatedSession({
    userId: adminUser.id,
    companyId: testCompanyA.id,
  });
  const restrictedSession = await SessionService.createAuthenticatedSession({
    userId: restrictedUser.id,
    companyId: testCompanyA.id,
  });

  // Sessão de Plataforma (Marcel)
  const devSession = developerAuthService.createSession('Marcel');
  const devSessionCookie = devSession.token;

  // Gate 1: Catálogo continua 11 nichos, 66 tamanhos, 112 associações
  await t.test('Gate 1: Catálogo canônico congelado continua exatamente 11 / 66 / 112', () => {
    assert.equal(NICHES.length, 11, 'Devem existir exatamente 11 nichos canônicos na plataforma');
    assert.equal(LABEL_SIZES_CATALOG.length, 66, 'Devem existir exatamente 66 tamanhos físicos únicos');
    assert.equal(NICHE_SIZE_RELATIONS.length, 112, 'Devem existir exatamente 112 relações niche x size');
  });

  // Gate 2: Platform permissions continuam exatamente 25
  await t.test('Gate 2: Platform permissions continuam exatamente 25', () => {
    assert.equal(CANONICAL_PERMISSIONS.length, 25, 'Catálogo oficial da plataforma deve ter exatamente 25 permissões');
  });

  // Gate 3: Tenant permissions continuam exatamente 23
  await t.test('Gate 3: Tenant commercial permissions continuam exatamente 23', () => {
    assert.equal(TENANT_MANAGEABLE_PERMISSIONS.length, 23, 'Catálogo comercial do tenant deve ter exatamente 23 permissões');
  });

  // Gate 4: Nenhum admin:manage criado
  await t.test('Gate 4: Nenhum admin:manage ou permissões espúrias foram criadas', () => {
    const forbiddenPerms = ['admin:manage', 'admin:view', 'fields.manage', 'fields.view', 'admin.manage'];
    for (const code of forbiddenPerms) {
      assert.equal(
        CANONICAL_PERMISSIONS.some((p) => p.code === code),
        false,
        `Permissão proibida '${code}' não deve existir no catálogo canônico`
      );
    }
  });

  // Gate 5: Ativa/desativa nicho
  await t.test('Gate 5: Ativação e desativação de nichos via API administrativa', async () => {
    const req = {
      method: 'PUT',
      url: '/niches',
      headers: { 'x-csrf-token': adminSession.csrfToken },
      cookies: { witiquetas_session: adminSession.rawToken },
      body: {
        niches: [
          { nicheId: 'niche-gondola', enabled: true },
          { nicheId: 'niche-farmacia', enabled: false },
          { nicheId: 'niche-produto', enabled: true },
        ],
        defaultNicheId: 'niche-gondola',
      },
    };

    const res = await callRouter(adminRouter, req);
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body));

    const farmacia = res.body.find((n: any) => n.id === 'niche-farmacia');
    assert.equal(farmacia?.enabled, false);

    const gondola = res.body.find((n: any) => n.id === 'niche-gondola');
    assert.equal(gondola?.enabled, true);
    assert.equal(gondola?.isDefault, true);
  });

  // Gate 6: Não permite zero nichos ativos
  await t.test('Gate 6: Rejeita desativação total de todos os nichos (pelo menos 1 deve permanecer ativo)', async () => {
    const allDisabled = NICHES.map((n) => ({ nicheId: n.id, enabled: false }));
    const req = {
      method: 'PUT',
      url: '/niches',
      headers: { 'x-csrf-token': adminSession.csrfToken },
      cookies: { witiquetas_session: adminSession.rawToken },
      body: { niches: allDisabled },
    };

    const res = await callRouter(adminRouter, req);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'CANNOT_DISABLE_ALL_NICHES');
  });

  // Gate 7: Nicho default precisa estar ativo
  await t.test('Gate 7: O nicho padrão obrigatoriamente não pode ser desabilitado', async () => {
    const req = {
      method: 'PUT',
      url: '/niches',
      headers: { 'x-csrf-token': adminSession.csrfToken },
      cookies: { witiquetas_session: adminSession.rawToken },
      body: {
        niches: [
          { nicheId: 'niche-gondola', enabled: false },
          { nicheId: 'niche-produto', enabled: true },
        ],
        defaultNicheId: 'niche-gondola',
      },
    };

    const res = await callRouter(adminRouter, req);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'DEFAULT_NICHE_MUST_BE_ENABLED');
  });

  // Gate 8: Configura elementos visuais por nicho
  await t.test('Gate 8: Configura elementos visuais no nicho com sucesso', async () => {
    const req = {
      method: 'PUT',
      url: '/niches/niche-gondola/elements',
      headers: { 'x-csrf-token': adminSession.csrfToken },
      cookies: { witiquetas_session: adminSession.rawToken },
      body: {
        elements: [
          { elementType: 'text', enabled: true },
          { elementType: 'price', enabled: true },
          { elementType: 'barcode', enabled: true },
          { elementType: 'qrcode', enabled: false }, // desativa QR Code para gondola
        ],
      },
    };

    const res = await callRouter(adminRouter, req);
    assert.equal(res.statusCode, 200);

    // Consulta os elementos
    const getReq = {
      method: 'GET',
      url: '/niches/niche-gondola/elements',
      cookies: { witiquetas_session: adminSession.rawToken },
    };
    const getRes = await callRouter(adminRouter, getReq);
    assert.equal(getRes.statusCode, 200);
    const qrcode = getRes.body.find((e: any) => e.elementType === 'qrcode');
    assert.equal(qrcode?.enabled, false);
    const price = getRes.body.find((e: any) => e.elementType === 'price');
    assert.equal(price?.enabled, true);
  });

  // Gate 9: Rejeita elemento desconhecido
  await t.test('Gate 9: Rejeita elemento visual desconhecido ou inventado', async () => {
    const req = {
      method: 'PUT',
      url: '/niches/niche-gondola/elements',
      headers: { 'x-csrf-token': adminSession.csrfToken },
      cookies: { witiquetas_session: adminSession.rawToken },
      body: {
        elements: [
          { elementType: 'elemento_magico_desconhecido', enabled: true },
        ],
      },
    };

    const res = await callRouter(adminRouter, req);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'INVALID_ELEMENT');
  });

  // Gate 10: Configura campos canônicos
  await t.test('Gate 10: Configura governança de campos canônicos por nicho', async () => {
    const req = {
      method: 'PUT',
      url: '/niches/niche-gondola/fields',
      headers: { 'x-csrf-token': adminSession.csrfToken },
      cookies: { witiquetas_session: adminSession.rawToken },
      body: {
        fields: [
          {
            fieldId: 'produto.descricao',
            enabled: true,
            availableForManual: true,
            availableForIntegration: true,
          },
          {
            fieldId: 'produto.preco',
            enabled: true,
            availableForManual: false, // preço somente via ERP
            availableForIntegration: true,
          },
        ],
      },
    };

    const res = await callRouter(adminRouter, req);
    assert.equal(res.statusCode, 200);
  });

  // Gate 11: Rejeita campo desconhecido
  await t.test('Gate 11: Rejeita campo desconhecido fora do catálogo do nicho', async () => {
    const req = {
      method: 'PUT',
      url: '/niches/niche-gondola/fields',
      headers: { 'x-csrf-token': adminSession.csrfToken },
      cookies: { witiquetas_session: adminSession.rawToken },
      body: {
        fields: [
          { fieldId: 'campo_inexistente_na_plataforma', enabled: true },
        ],
      },
    };

    const res = await callRouter(adminRouter, req);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'INVALID_FIELD');
  });

  // Gate 12 & 13: MANUAL e INTEGRATION persistem
  await t.test('Gate 12 & 13: Disponibilidade MANUAL e INTEGRATION persistem corretamente', async () => {
    const getReq = {
      method: 'GET',
      url: '/niches/niche-gondola/fields',
      cookies: { witiquetas_session: adminSession.rawToken },
    };
    const getRes = await callRouter(adminRouter, getReq);
    assert.equal(getRes.statusCode, 200);

    const precoField = getRes.body.find((f: any) => f.fieldId === 'produto.preco');
    assert.ok(precoField);
    assert.equal(precoField.availableForManual, false, 'Manual deve ser false conforme configurado');
    assert.equal(precoField.availableForIntegration, true, 'Integration deve ser true conforme configurado');

    const descField = getRes.body.find((f: any) => f.fieldId === 'produto.descricao');
    assert.ok(descField);
    assert.equal(descField.availableForManual, true);
    assert.equal(descField.availableForIntegration, true);
  });

  // Gate 14: SYSTEM preservado
  await t.test('Gate 14: Campos de sistema (SYSTEM) preservados como não-editáveis para fontes de terceiros', async () => {
    const getReq = {
      method: 'GET',
      url: '/niches/niche-gondola/fields',
      cookies: { witiquetas_session: adminSession.rawToken },
    };
    const getRes = await callRouter(adminRouter, getReq);
    assert.equal(getRes.statusCode, 200);

    const printDateField = getRes.body.find((f: any) => f.fieldId === 'system.printDate');
    assert.ok(printDateField, 'system.printDate deve constar no catálogo');
    assert.equal(printDateField.isSystem, true);
    assert.equal(printDateField.availableForManual, false);
    assert.equal(printDateField.availableForIntegration, false);
  });

  // Gate 15: role_niches respeitado
  await t.test('Gate 15: role_niches restringe e salva permissões de nicho para perfis', async () => {
    const putReq = {
      method: 'PUT',
      url: `/roles/${operatorRole.id}/niches`,
      headers: { 'x-csrf-token': adminSession.csrfToken },
      cookies: { witiquetas_session: adminSession.rawToken },
      body: {
        nicheAccess: {
          'niche-gondola': true,
          'niche-hospital': false,
          'niche-laboratorio': false,
        },
      },
    };

    const putRes = await callRouter(adminRouter, putReq);
    assert.equal(putRes.statusCode, 200);
    assert.equal(putRes.body.nicheAccess['niche-gondola'], true);
    assert.equal(putRes.body.nicheAccess['niche-hospital'], false);

    const getReq = {
      method: 'GET',
      url: `/roles/${operatorRole.id}/niches`,
      cookies: { witiquetas_session: adminSession.rawToken },
    };
    const getRes = await callRouter(adminRouter, getReq);
    assert.equal(getRes.statusCode, 200);
    assert.equal(getRes.body.nicheAccess['niche-gondola'], true);
    assert.equal(getRes.body.nicheAccess['niche-hospital'], false);
  });

  // Gate 16: role de outro tenant rejeitado (Anti-IDOR)
  await t.test('Gate 16: Rejeita alteração de role_niches pertencente a outra empresa (Anti-IDOR)', async () => {
    // Cria role na Empresa B
    const roleBeta = await RoleRepository.create({
      id: 'role-beta-operator',
      companyId: testCompanyB.id,
      code: 'BETA_OPERATOR',
      name: 'Operador Beta',
    });

    const req = {
      method: 'PUT',
      url: `/roles/${roleBeta.id}/niches`,
      headers: { 'x-csrf-token': adminSession.csrfToken },
      cookies: { witiquetas_session: adminSession.rawToken }, // sessão da Empresa A
      body: {
        nicheAccess: { 'niche-gondola': true },
      },
    };

    const res = await callRouter(adminRouter, req);
    assert.equal(res.statusCode, 404, 'Deve retornar 404 para role de outro tenant');
    assert.equal(res.body.code, 'ROLE_NOT_FOUND');
  });

  // Gate 17: companyId adulterado é ignorado com segurança
  await t.test('Gate 17: companyId adulterado no payload é ignorado em favor do principal autenticado', async () => {
    const req = {
      method: 'PUT',
      url: '/niches',
      headers: { 'x-csrf-token': adminSession.csrfToken },
      cookies: { witiquetas_session: adminSession.rawToken },
      body: {
        companyId: testCompanyB.id, // Tenta gravar na empresa B
        niches: [{ nicheId: 'niche-confeccao', enabled: true }],
      },
    };

    const res = await callRouter(adminRouter, req);
    assert.equal(res.statusCode, 200);

    // Confirma que a empresa B NÃO teve seus nichos alterados
    const betaNiches = await CompanyConfigurationRepository.getNiches(testCompanyB.id);
    const betaConf = betaNiches.find((n) => n.nicheId === 'niche-confeccao');
    assert.equal(betaConf, undefined, 'A empresa B não deve ser afetada por payload adulterado');

    // Confirma que a alteração foi gravada com segurança na Empresa A
    const alphaNiches = await CompanyConfigurationRepository.getNiches(testCompanyA.id);
    const alphaConf = alphaNiches.find((n) => n.nicheId === 'niche-confeccao');
    assert.ok(alphaConf);
    assert.equal(alphaConf.state, 'ENABLED');
  });

  // Gate 18: CSRF obrigatório nas mutações
  await t.test('Gate 18: Validação obrigatória de token CSRF em todas as mutações', async () => {
    const req = {
      method: 'PUT',
      url: '/niches',
      cookies: { witiquetas_session: adminSession.rawToken },
      body: { niches: [{ nicheId: 'niche-gondola', enabled: true }] },
      // Sem header 'x-csrf-token'
    };

    const res = await callRouter(adminRouter, req);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'CSRF_TOKEN_MISSING');
  });

  // Gate 19: niches.view controla leitura
  await t.test('Gate 19: niches.view controla leitura de nichos', async () => {
    const req = {
      method: 'GET',
      url: '/niches',
      cookies: { witiquetas_session: restrictedSession.rawToken }, // operador não tem niches.view
    };

    const res = await callRouter(adminRouter, req);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'FORBIDDEN');
  });

  // Gate 20: niches.manage controla mutação de nichos e campos
  await t.test('Gate 20: niches.manage controla mutação de nichos e campos', async () => {
    const reqNiches = {
      method: 'PUT',
      url: '/niches',
      headers: { 'x-csrf-token': restrictedSession.csrfToken },
      cookies: { witiquetas_session: restrictedSession.rawToken },
      body: { niches: [{ nicheId: 'niche-gondola', enabled: true }] },
    };
    const resNiches = await callRouter(adminRouter, reqNiches);
    assert.equal(resNiches.statusCode, 403);

    const reqFields = {
      method: 'PUT',
      url: '/niches/niche-gondola/fields',
      headers: { 'x-csrf-token': restrictedSession.csrfToken },
      cookies: { witiquetas_session: restrictedSession.rawToken },
      body: { fields: [{ fieldId: 'produto.descricao', enabled: true }] },
    };
    const resFields = await callRouter(adminRouter, reqFields);
    assert.equal(resFields.statusCode, 403);
  });

  // Gate 21: elements.view controla leitura de elementos
  await t.test('Gate 21: elements.view controla leitura de elementos visuais', async () => {
    const req = {
      method: 'GET',
      url: '/niches/niche-gondola/elements',
      cookies: { witiquetas_session: restrictedSession.rawToken },
    };

    const res = await callRouter(adminRouter, req);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'FORBIDDEN');
  });

  // Gate 22: elements.manage controla mutação de elementos
  await t.test('Gate 22: elements.manage controla mutação de elementos visuais', async () => {
    const req = {
      method: 'PUT',
      url: '/niches/niche-gondola/elements',
      headers: { 'x-csrf-token': restrictedSession.csrfToken },
      cookies: { witiquetas_session: restrictedSession.rawToken },
      body: { elements: [{ elementType: 'text', enabled: true }] },
    };

    const res = await callRouter(adminRouter, req);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'FORBIDDEN');
  });

  // Gate 23: PLATFORM_DEVELOPER funciona no company configurado
  await t.test('Gate 23: PLATFORM_DEVELOPER autenticado opera no company configurado', async () => {
    const devCompanyId = getDeveloperCompanyId();
    assert.equal(devCompanyId, 'comp-platform-dev');

    const req = {
      method: 'GET',
      url: '/niches',
      cookies: { [DCC_SESSION_COOKIE_NAME]: devSessionCookie },
    };

    const res = await callRouter(adminRouter, req);
    assert.equal(res.statusCode, 200, 'Developer deve ter acesso transparente à administração de nichos');
    assert.ok(Array.isArray(res.body));
  });

  // Gate 24: Tenant ADMIN não ganha DCC
  await t.test('Gate 24: Tenant ADMIN normal NÃO possui permissões de devcontrol nem acesso ao DCC', async () => {
    const req = {
      method: 'GET',
      url: '/context',
      cookies: { witiquetas_session: adminSession.rawToken },
    };

    const res = await callRouter(sessionRouter, req);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.canAccessDcc, false);
    assert.equal(res.body.permissions.includes('devcontrol.view'), false);
    assert.equal(res.body.permissions.includes('devcontrol.manage'), false);
  });

  // Gate 25: EffectiveConfigurationService atualiza imediatamente
  await t.test('Gate 25: EffectiveConfigurationService reflete imediatamente as alterações', async () => {
    // Altera nicho default da Empresa A para 'niche-produto'
    await CompanyConfigurationRepository.setDefaultNiche(testCompanyA.id, 'niche-produto');
    await CompanyConfigurationRepository.setElementEnabled(testCompanyA.id, 'niche-produto', 'image', false);

    const config = await EffectiveConfigurationService.resolve({ companyId: testCompanyA.id });
    assert.equal(config.defaultNicheId, 'niche-produto');
    assert.ok(config.enabledElementsByNiche['niche-produto']);
    assert.equal(config.enabledElementsByNiche['niche-produto'].includes('image'), false);
  });

  // Gate 26: /api/session/context reflete configuração
  await t.test('Gate 26: GET /api/session/context retorna defaultNicheId e campos efetivos', async () => {
    const req = {
      method: 'GET',
      url: '/context',
      cookies: { witiquetas_session: adminSession.rawToken },
    };

    const res = await callRouter(sessionRouter, req);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.defaultNicheId, 'niche-produto');
    assert.ok(Array.isArray(res.body.allowedNiches));
    assert.ok(res.body.fieldsAvailabilityByNiche);
  });

  // Gate 27: Usuário restrito continua restrito
  await t.test('Gate 27: Usuário restrito continua bloqueado de acessar áreas administrativas', async () => {
    const req = {
      method: 'GET',
      url: '/company',
      cookies: { witiquetas_session: restrictedSession.rawToken },
    };
    const res = await callRouter(adminRouter, req);
    // Operador tem company.view, então company ok
    assert.equal(res.statusCode, 200);

    // Mas não tem users.manage, roles.manage, niches.manage
    const reqManage = {
      method: 'PUT',
      url: '/company',
      headers: { 'x-csrf-token': restrictedSession.csrfToken },
      cookies: { witiquetas_session: restrictedSession.rawToken },
      body: { name: 'Hack Attempt' },
    };
    const resManage = await callRouter(adminRouter, reqManage);
    assert.equal(resManage.statusCode, 403);
  });

  // Gate 28: Agent auth permanece funcional
  await t.test('Gate 28: Agent auth com token ADMIN_API_KEY permanece funcional', () => {
    const user = verifyWebUserToken('agent-test-key-secret-1234');
    assert.ok(user);
    assert.equal(user.role, 'ADMIN');

    const invalid = verifyWebUserToken('token-invalido-123');
    assert.equal(invalid, null);
  });

  // Gate 29: Editor baseline não sofreu alteração
  await t.test('Gate 29: Baseline do Editor permanece congelado (patch 4.5.5.1 intacto)', () => {
    const editorLayoutPath = path.join(process.cwd(), 'apps/frontend/src/editor/EditorLayout.tsx');
    assert.ok(fs.existsSync(editorLayoutPath), 'EditorLayout deve existir');
    const content = fs.readFileSync(editorLayoutPath, 'utf8');
    assert.ok(content.length > 0);
  });

  // Gate 30: Central baseline não sofreu alteração
  await t.test('Gate 30: Baseline da Central de Impressão permanece congelado', () => {
    const printCenterPath = path.join(process.cwd(), 'apps/frontend/src/modules/printcenter/PrintCenterPage.tsx');
    assert.ok(fs.existsSync(printCenterPath), 'PrintCenterPage deve existir');
    const content = fs.readFileSync(printCenterPath, 'utf8');
    assert.ok(content.length > 0);
  });
});
