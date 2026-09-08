import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearAdminMemoryStores,
  CompanyRepository,
  UserRepository,
  RoleRepository,
  CANONICAL_PERMISSIONS,
  TENANT_MANAGEABLE_PERMISSIONS,
} from '../apps/backend/src/repositories/adminRepositories.js';
import {
  clearSessionMemoryStores,
  SessionService,
  SessionRepository,
} from '../apps/backend/src/services/sessionService.js';
import { PasswordService } from '../apps/backend/src/services/passwordService.js';
import adminRouter from '../apps/backend/src/routes/admin.js';
import sessionRouter from '../apps/backend/src/routes/session.js';
import devControlRouter from '../apps/backend/src/routes/developmentControl.js';
import {
  developerAuthService,
  DCC_SESSION_COOKIE_NAME,
  generateTotpCodeForTesting,
} from '../apps/backend/src/services/developerAuthService.js';
import { getEffectiveNavigation, BASE_NAV_ITEMS } from '../apps/frontend/src/shell/navigation.js';

function createMockResponse() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as any,
    cookies: {} as Record<string, any>,
    clearedCookies: [] as string[],
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
      this.clearedCookies.push(name);
      delete this.cookies[name];
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
    handler(req, res, (err?: any) => {
      if (err) {
        res.statusCode = 500;
        res.body = { error: err.message };
      }
      resolve(res);
    });
  });
}

// Helper para criar tenant com papel ADMIN e permissões canônicas completas
async function createTestAdmin(prefix: string) {
  const company = await CompanyRepository.create({
    id: `comp-${prefix.toLowerCase()}`,
    name: `Empresa ${prefix}`,
    slug: `emp-${prefix.toLowerCase()}`,
    status: 'ACTIVE',
  });

  const adminRole = await RoleRepository.create({
    id: `role-admin-${prefix.toLowerCase()}`,
    companyId: company.id,
    code: 'ADMIN',
    name: 'Administrador',
    isSystem: true,
  });

  await RoleRepository.setRolePermissions(
    adminRole.id,
    CANONICAL_PERMISSIONS.map((p) => p.code)
  );

  const adminUser = await UserRepository.create({
    id: `usr-admin-${prefix.toLowerCase()}`,
    companyId: company.id,
    name: `Admin ${prefix}`,
    email: `admin.${prefix.toLowerCase()}@empresa.com`,
    status: 'ACTIVE',
  });

  await UserRepository.setPassword(
    adminUser.id,
    await PasswordService.hash('AdminPassword@2026')
  );

  await RoleRepository.assignUserRole(company.id, adminUser.id, adminRole.id);

  const session = await SessionService.createAuthenticatedSession({
    userId: adminUser.id,
    companyId: company.id,
    authMethod: 'password',
  });

  return { company, adminRole, adminUser, session };
}

test('SUÍTE DE HOMOLOGAÇÃO COMPLETA — HOTFIX 5.3.2', async (t) => {
  const originalEnv = { ...process.env };

  t.beforeEach(() => {
    clearAdminMemoryStores();
    clearSessionMemoryStores();
    developerAuthService.clearAllSessionsForTesting();
    process.env.DCC_ENABLED = 'true';
    process.env.DCC_TOTP_SECRET = 'JBSWY3DPEHPK3PXP'; // Base32 test secret
  });

  t.afterEach(() => {
    process.env = { ...originalEnv };
  });

  // =========================================================================
  // BLOCO 1: AUDITORIA DO CATÁLOGO CANÔNICO E MATRIZ DO TENANT (1 a 8)
  // =========================================================================

  await t.test('1. Plataforma mantém 25 permissões canônicas registradas', () => {
    assert.strictEqual(CANONICAL_PERMISSIONS.length, 25);
    const codes = CANONICAL_PERMISSIONS.map((p) => p.code);
    assert.ok(codes.includes('devcontrol.view'));
    assert.ok(codes.includes('devcontrol.manage'));
    assert.ok(codes.includes('company.view'));
    assert.ok(codes.includes('print.execute'));
  });

  await t.test('2. Catálogo gerenciável pelo tenant possui exatamente 23 permissões', () => {
    assert.strictEqual(TENANT_MANAGEABLE_PERMISSIONS.length, 23);
    const codes = TENANT_MANAGEABLE_PERMISSIONS.map((p) => p.code);
    assert.ok(!codes.includes('devcontrol.view'), 'devcontrol.view não deve estar no catálogo do tenant');
    assert.ok(!codes.includes('devcontrol.manage'), 'devcontrol.manage não deve estar no catálogo do tenant');
  });

  await t.test('3. GET /api/admin/permissions retorna exatamente 23 permissões', async () => {
    const { session } = await createTestAdmin('PERMS');

    const req: any = {
      method: 'GET',
      url: '/permissions',
      path: '/permissions',
      headers: { cookie: `witiquetas_session=${session.rawToken}` },
      query: {},
      ip: '127.0.0.1',
    };

    const res = await callRouter(adminRouter, req);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.length, 23);
    const returnedCodes = res.body.map((p: any) => p.code);
    assert.ok(!returnedCodes.includes('devcontrol.view'));
    assert.ok(!returnedCodes.includes('devcontrol.manage'));
  });

  await t.test('4. POST /api/admin/roles rejeita tentativa de associar devcontrol.view', async () => {
    const { session } = await createTestAdmin('ROLEHACK');

    const req: any = {
      method: 'POST',
      url: '/roles',
      path: '/roles',
      headers: {
        cookie: `witiquetas_session=${session.rawToken}`,
        'x-csrf-token': session.csrfToken,
      },
      body: {
        code: 'HACKER_ROLE',
        name: 'Tentativa Hacker',
        permissions: ['templates.view', 'devcontrol.view'],
      },
      ip: '127.0.0.1',
    };

    const res = await callRouter(adminRouter, req);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.code, 'INVALID_PERMISSION');
  });

  await t.test('5. PUT /api/admin/roles/:id/permissions rejeita tentativa de associar devcontrol.manage', async () => {
    const { company, session } = await createTestAdmin('ROLEPUT');
    const role = await RoleRepository.create({
      companyId: company.id,
      code: 'OPERADOR_TESTE',
      name: 'Operador',
      permissions: ['print.execute'],
    });

    const req: any = {
      method: 'PUT',
      url: `/roles/${role.id}/permissions`,
      path: `/roles/${role.id}/permissions`,
      params: { id: role.id },
      headers: {
        cookie: `witiquetas_session=${session.rawToken}`,
        'x-csrf-token': session.csrfToken,
      },
      body: {
        permissions: ['print.execute', 'devcontrol.manage'],
      },
      ip: '127.0.0.1',
    };

    const res = await callRouter(adminRouter, req);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.code, 'INVALID_PERMISSION');
  });

  await t.test('6. GET /api/admin/roles filtra devcontrol.* de papéis retornados', async () => {
    const { company, session } = await createTestAdmin('ROLEFILTER');
    // Simula role no banco com permissão legada interna
    const custom = await RoleRepository.create({
      companyId: company.id,
      code: 'CUSTOM_TEST',
      name: 'Custom',
    });
    await RoleRepository.setRolePermissions(custom.id, ['templates.view', 'devcontrol.view']);

    const req: any = {
      method: 'GET',
      url: '/roles',
      path: '/roles',
      headers: { cookie: `witiquetas_session=${session.rawToken}` },
      query: {},
      ip: '127.0.0.1',
    };

    const res = await callRouter(adminRouter, req);
    assert.strictEqual(res.statusCode, 200);
    const customRole = res.body.find((r: any) => r.code === 'CUSTOM_TEST');
    assert.ok(customRole);
    assert.ok(!customRole.permissions.includes('devcontrol.view'));
    assert.ok(customRole.permissions.includes('templates.view'));
  });

  await t.test('7. Anti-lockout: ADMIN impede a remoção das 6 permissões essenciais ao salvar', async () => {
    const { adminRole, session } = await createTestAdmin('ANTILOCK');

    // Tentativa de remover permissões essenciais deve ser rejeitada com 400
    const req: any = {
      method: 'PUT',
      url: `/roles/${adminRole.id}/permissions`,
      path: `/roles/${adminRole.id}/permissions`,
      params: { id: adminRole.id },
      headers: {
        cookie: `witiquetas_session=${session.rawToken}`,
        'x-csrf-token': session.csrfToken,
      },
      body: {
        permissions: ['templates.view'], // Tentando remover essenciais
      },
      ip: '127.0.0.1',
    };

    const res = await callRouter(adminRouter, req);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.code, 'CANNOT_STRIP_ESSENTIAL_ADMIN_PERMISSIONS');
    assert.ok(res.body.missingPermissions.includes('company.view'));
    assert.ok(res.body.missingPermissions.includes('roles.manage'));

    // Quando as essenciais são mantidas, o salvamento deve ser bem-sucedido (200)
    const validReq: any = {
      method: 'PUT',
      url: `/roles/${adminRole.id}/permissions`,
      path: `/roles/${adminRole.id}/permissions`,
      params: { id: adminRole.id },
      headers: {
        cookie: `witiquetas_session=${session.rawToken}`,
        'x-csrf-token': session.csrfToken,
      },
      body: {
        permissions: [
          'company.view',
          'company.manage',
          'users.view',
          'users.manage',
          'roles.view',
          'roles.manage',
          'templates.view',
        ],
      },
      ip: '127.0.0.1',
    };
    const validRes = await callRouter(adminRouter, validReq);
    assert.strictEqual(validRes.statusCode, 200);
    assert.ok(validRes.body.permissions.includes('templates.view'));
    assert.ok(validRes.body.permissions.includes('company.view'));
  });

  await t.test('8. Persistência de permissões: Salvar e consultar retorna o mesmo estado exato', async () => {
    const { company, session } = await createTestAdmin('PERSIST');
    const role = await RoleRepository.create({
      companyId: company.id,
      code: 'OPERADOR_G',
      name: 'Operador G',
      permissions: ['templates.view'],
    });

    // Salva novo conjunto
    const saveReq: any = {
      method: 'PUT',
      url: `/roles/${role.id}/permissions`,
      path: `/roles/${role.id}/permissions`,
      params: { id: role.id },
      headers: {
        cookie: `witiquetas_session=${session.rawToken}`,
        'x-csrf-token': session.csrfToken,
      },
      body: {
        permissions: ['templates.view', 'print.execute', 'printers.view'],
      },
      ip: '127.0.0.1',
    };
    const saveRes = await callRouter(adminRouter, saveReq);
    assert.strictEqual(saveRes.statusCode, 200);

    // Consulta
    const getReq: any = {
      method: 'GET',
      url: '/roles',
      path: '/roles',
      headers: { cookie: `witiquetas_session=${session.rawToken}` },
      query: {},
      ip: '127.0.0.1',
    };
    const getRes = await callRouter(adminRouter, getReq);
    assert.strictEqual(getRes.statusCode, 200);
    const persistedRole = getRes.body.find((r: any) => r.id === role.id);
    assert.deepStrictEqual(
      persistedRole.permissions.sort(),
      ['print.execute', 'printers.view', 'templates.view'].sort()
    );
  });

  // =========================================================================
  // BLOCO 2: NAVEGAÇÃO DO TENANT E OCULTAÇÃO TOTAL DO DCC (9 a 16)
  // =========================================================================

  await t.test('9. BASE_NAV_ITEMS contém 8 itens e nenhum item de desenvolvimento', () => {
    assert.strictEqual(BASE_NAV_ITEMS.length, 8);
    const ids = BASE_NAV_ITEMS.map((i) => i.id);
    assert.ok(!ids.includes('development'));
    assert.ok(!ids.includes('devcontrol'));
  });

  await t.test('10. getEffectiveNavigation para ADMIN nunca inclui DCC', () => {
    const adminCtx: any = {
      user: { id: 'u1', name: 'Admin', isDccMaster: true }, // Mesmo com flag interna antiga
      company: { id: 'c1', name: 'Empresa 1' },
      roles: ['ADMIN'],
      permissions: ['*'],
    };
    const items = getEffectiveNavigation(adminCtx);
    const ids = items.map((i) => i.id);
    assert.ok(!ids.includes('development'));
    assert.ok(ids.includes('home'));
    assert.ok(ids.includes('admin'));
  });

  await t.test('11. getEffectiveNavigation para usuário restrito exibe apenas itens permitidos', () => {
    const operatorCtx: any = {
      user: { id: 'u2', name: 'Operador', isDccMaster: false },
      company: { id: 'c1', name: 'Empresa 1' },
      roles: ['OPERATOR'],
      permissions: ['templates.view', 'print.execute'],
    };
    const items = getEffectiveNavigation(operatorCtx);
    const ids = items.map((i) => i.id);
    assert.deepStrictEqual(ids, ['home', 'models', 'print-center']);
    assert.ok(!ids.includes('admin'));
    assert.ok(!ids.includes('development'));
  });

  await t.test('12. getEffectiveNavigation não retorna itens com status bloqueado', () => {
    const ctx: any = {
      user: { id: 'u3' },
      company: { id: 'c1' },
      permissions: ['templates.view'],
    };
    const items = getEffectiveNavigation(ctx);
    for (const item of items) {
      assert.notStrictEqual((item as any).status, 'BLOCKED');
      assert.notStrictEqual((item as any).disabled, true);
    }
  });

  await t.test('13. Sessão tenant comercial GET /api/session/context não expõe canAccessDcc', async () => {
    const company = await CompanyRepository.create({ name: 'Empresa H', slug: 'emp-h' });
    const user = await UserRepository.create({
      companyId: company.id,
      name: 'User H',
      email: 'user@h.com',
      passwordHash: 'hash',
    });
    const session = await SessionService.createAuthenticatedSession({
      userId: user.id,
      companyId: company.id,
      authMethod: 'password',
    });

    const req: any = {
      method: 'GET',
      url: '/context',
      path: '/context',
      headers: { cookie: `witiquetas_session=${session.rawToken}` },
      ip: '127.0.0.1',
    };
    const res = await callRouter(sessionRouter, req);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.canAccessDcc, undefined);
    assert.strictEqual(res.body.dccEnabled, undefined);
  });

  await t.test('14. Sessão tenant não autoriza endpoints de dados do DCC (retorna 401 DEVELOPER_AUTH_REQUIRED)', async () => {
    const company = await CompanyRepository.create({ name: 'Empresa I', slug: 'emp-i' });
    const user = await UserRepository.create({
      companyId: company.id,
      name: 'Admin I',
      email: 'admin@i.com',
      passwordHash: 'hash',
    });
    const session = await SessionService.createAuthenticatedSession({
      userId: user.id,
      companyId: company.id,
      authMethod: 'password',
    });

    const req: any = {
      method: 'GET',
      url: '/overview',
      path: '/overview',
      headers: { cookie: `witiquetas_session=${session.rawToken}` }, // Sessão tenant comercial
      ip: '127.0.0.1',
    };
    const res = await callRouter(devControlRouter, req);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.code, 'DEVELOPER_AUTH_REQUIRED');
  });

  await t.test('15. Sem nenhuma sessão, DCC overview retorna 401 DEVELOPER_AUTH_REQUIRED', async () => {
    const req: any = {
      method: 'GET',
      url: '/overview',
      path: '/overview',
      headers: {},
      ip: '127.0.0.1',
    };
    const res = await callRouter(devControlRouter, req);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.code, 'DEVELOPER_AUTH_REQUIRED');
  });

  await t.test('16. Quando DCC_ENABLED=false, DCC retorna 404 DCC_DISABLED mesmo para desenvolvedor', async () => {
    process.env.DCC_ENABLED = 'false';
    const req: any = {
      method: 'GET',
      url: '/overview',
      path: '/overview',
      headers: {},
      ip: '127.0.0.1',
    };
    const res = await callRouter(devControlRouter, req);
    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res.body.code, 'DCC_DISABLED');
  });

  // =========================================================================
  // BLOCO 3: AUTENTICAÇÃO DEVELOPER RFC 6238 TOTP (MARCEL) (17 a 32)
  // =========================================================================

  await t.test('17. Login developer rejeita usuário diferente de Marcel', async () => {
    const validCode = generateTotpCodeForTesting(process.env.DCC_TOTP_SECRET!);
    const req: any = {
      method: 'POST',
      url: '/auth/login',
      path: '/auth/login',
      body: { username: 'Admin', code: validCode },
      ip: '127.0.0.1',
    };
    const res = await callRouter(devControlRouter, req);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.code, 'INVALID_DEVELOPER_CREDENTIALS');
  });

  await t.test('18. Login developer rejeita código TOTP inválido', async () => {
    const req: any = {
      method: 'POST',
      url: '/auth/login',
      path: '/auth/login',
      body: { username: 'Marcel', code: '000000' },
      ip: '127.0.0.1',
    };
    const res = await callRouter(devControlRouter, req);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.code, 'INVALID_DEVELOPER_CREDENTIALS');
  });

  await t.test('19. Login developer rejeita formato não-6 dígitos', async () => {
    const req: any = {
      method: 'POST',
      url: '/auth/login',
      path: '/auth/login',
      body: { username: 'Marcel', code: '123' },
      ip: '127.0.0.1',
    };
    const res = await callRouter(devControlRouter, req);
    assert.strictEqual(res.statusCode, 401);
  });

  await t.test('20. Login developer aceita Marcel com TOTP RFC 6238 válido', async () => {
    const validCode = generateTotpCodeForTesting(process.env.DCC_TOTP_SECRET!);
    const req: any = {
      method: 'POST',
      url: '/auth/login',
      path: '/auth/login',
      body: { username: 'Marcel', code: validCode },
      ip: '127.0.0.1',
    };
    const res = await callRouter(devControlRouter, req);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.username, 'Marcel');
    assert.ok(res.body.token);
    assert.ok(res.cookies[DCC_SESSION_COOKIE_NAME]);
  });

  await t.test('21. Validação TOTP aceita passo atual (step 0)', () => {
    const code = generateTotpCodeForTesting(process.env.DCC_TOTP_SECRET!, 0);
    const valid = developerAuthService.verifyTotpCode(code);
    assert.strictEqual(valid, true);
  });

  await t.test('22. Validação TOTP aceita passo anterior (step -1, tolerância de clock drift)', () => {
    const code = generateTotpCodeForTesting(process.env.DCC_TOTP_SECRET!, -1);
    const valid = developerAuthService.verifyTotpCode(code);
    assert.strictEqual(valid, true);
  });

  await t.test('23. Validação TOTP aceita passo posterior (step +1, tolerância de clock drift)', () => {
    const code = generateTotpCodeForTesting(process.env.DCC_TOTP_SECRET!, 1);
    const valid = developerAuthService.verifyTotpCode(code);
    assert.strictEqual(valid, true);
  });

  await t.test('24. Validação TOTP rejeita passo distante (step +2)', () => {
    const code = generateTotpCodeForTesting(process.env.DCC_TOTP_SECRET!, 2);
    const valid = developerAuthService.verifyTotpCode(code);
    assert.strictEqual(valid, false);
  });

  await t.test('25. Validação TOTP rejeita passo distante (step -2)', () => {
    const code = generateTotpCodeForTesting(process.env.DCC_TOTP_SECRET!, -2);
    const valid = developerAuthService.verifyTotpCode(code);
    assert.strictEqual(valid, false);
  });

  await t.test('26. Rate limiting bloqueia após 5 tentativas inválidas consecutivas (HTTP 429)', async () => {
    const ip = '10.0.0.99';
    for (let i = 0; i < 5; i++) {
      const req: any = {
        method: 'POST',
        url: '/auth/login',
        path: '/auth/login',
        body: { username: 'Marcel', code: '999999' },
        ip,
      };
      const res = await callRouter(devControlRouter, req);
      assert.strictEqual(res.statusCode, 401);
    }

    // 6ª tentativa deve ser bloqueada por rate limit
    const req6: any = {
      method: 'POST',
      url: '/auth/login',
      path: '/auth/login',
      body: { username: 'Marcel', code: '999999' },
      ip,
    };
    const res6 = await callRouter(devControlRouter, req6);
    assert.strictEqual(res6.statusCode, 429);
    assert.strictEqual(res6.body.code, 'DEVELOPER_AUTH_RATE_LIMITED');
  });

  await t.test('27. GET /api/development-control/auth/me retorna status autenticado após login', async () => {
    const session = developerAuthService.createSession();
    const req: any = {
      method: 'GET',
      url: '/auth/me',
      path: '/auth/me',
      headers: { cookie: `${DCC_SESSION_COOKIE_NAME}=${session.rawToken}` },
      ip: '127.0.0.1',
    };
    const res = await callRouter(devControlRouter, req);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.authenticated, true);
    assert.strictEqual(res.body.username, 'Marcel');
  });

  await t.test('28. GET /api/development-control/auth/me retorna false quando desautenticado', async () => {
    const req: any = {
      method: 'GET',
      url: '/auth/me',
      path: '/auth/me',
      headers: {},
      ip: '127.0.0.1',
    };
    const res = await callRouter(devControlRouter, req);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.authenticated, false);
  });

  await t.test('29. Sessão de desenvolvedor válida permite acessar GET /overview', async () => {
    const session = developerAuthService.createSession();
    const req: any = {
      method: 'GET',
      url: '/overview',
      path: '/overview',
      headers: { cookie: `${DCC_SESSION_COOKIE_NAME}=${session.rawToken}` },
      ip: '127.0.0.1',
    };
    const res = await callRouter(devControlRouter, req);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.project);
    assert.ok(res.body.progress);
  });

  await t.test('30. Sessão de desenvolvedor via cabeçalho x-dcc-session permite acesso a /roadmap', async () => {
    const session = developerAuthService.createSession();
    const req: any = {
      method: 'GET',
      url: '/roadmap',
      path: '/roadmap',
      headers: { 'x-dcc-session': session.rawToken },
      ip: '127.0.0.1',
    };
    const res = await callRouter(devControlRouter, req);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.phases);
  });

  await t.test('31. POST /api/development-control/auth/logout revoga a sessão de desenvolvedor', async () => {
    const session = developerAuthService.createSession();
    const logoutReq: any = {
      method: 'POST',
      url: '/auth/logout',
      path: '/auth/logout',
      headers: { cookie: `${DCC_SESSION_COOKIE_NAME}=${session.rawToken}` },
      ip: '127.0.0.1',
    };
    const logoutRes = await callRouter(devControlRouter, logoutReq);
    assert.strictEqual(logoutRes.statusCode, 200);
    assert.ok(logoutRes.clearedCookies.includes(DCC_SESSION_COOKIE_NAME));

    // Próxima requisição com mesmo token deve falhar
    const req: any = {
      method: 'GET',
      url: '/overview',
      path: '/overview',
      headers: { cookie: `${DCC_SESSION_COOKIE_NAME}=${session.rawToken}` },
      ip: '127.0.0.1',
    };
    const res = await callRouter(devControlRouter, req);
    assert.strictEqual(res.statusCode, 401);
  });

  await t.test('32. Sessão de desenvolvedor não vira automaticamente sessão de tenant (sem token tenant = 401)', async () => {
    const session = developerAuthService.createSession();
    const req: any = {
      method: 'GET',
      url: '/permissions',
      path: '/permissions',
      headers: { cookie: `${DCC_SESSION_COOKIE_NAME}=${session.rawToken}` }, // Token de dev no endpoint de tenant
      ip: '127.0.0.1',
    };
    const res = await callRouter(adminRouter, req);
    assert.strictEqual(res.statusCode, 401);
  });

  // =========================================================================
  // BLOCO 4: PRESERVAÇÃO DE SCHEMA E SEGURANÇA (33 a 42)
  // =========================================================================

  await t.test('33. Marcel não existe na lista de usuários comerciais do tenant', async () => {
    const { session } = await createTestAdmin('TENANTADMIN');

    const req: any = {
      method: 'GET',
      url: '/users',
      path: '/users',
      headers: { cookie: `witiquetas_session=${session.rawToken}` },
      query: {},
      ip: '127.0.0.1',
    };
    const res = await callRouter(adminRouter, req);
    assert.strictEqual(res.statusCode, 200);
    const users = res.body;
    const marcel = users.find((u: any) => u.name.toLowerCase() === 'marcel' || u.email?.toLowerCase().startsWith('marcel@'));
    assert.strictEqual(marcel, undefined, 'Marcel não deve existir como usuário tenant comercial');
  });

  await t.test('34. Tentativa de mass assignment de is_dcc_master em POST /api/admin/users é ignorada de forma segura', async () => {
    const { session } = await createTestAdmin('MASSASSIGNPOST');

    const req: any = {
      method: 'POST',
      url: '/users',
      path: '/users',
      headers: {
        cookie: `witiquetas_session=${session.rawToken}`,
        'x-csrf-token': session.csrfToken,
      },
      body: {
        name: 'Usuário Malicioso',
        email: 'malicioso@k.com',
        password: 'Password#1234',
        is_dcc_master: true,
        isDccMaster: true,
      },
      ip: '127.0.0.1',
    };
    const res = await callRouter(adminRouter, req);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.isDccMaster, undefined);
    assert.strictEqual(res.body.is_dcc_master, undefined);
  });

  await t.test('35. GET /api/admin/users omite is_dcc_master dos DTOs de usuários retornados', async () => {
    const { session } = await createTestAdmin('OMITLIST');

    const req: any = {
      method: 'GET',
      url: '/users',
      path: '/users',
      headers: { cookie: `witiquetas_session=${session.rawToken}` },
      query: {},
      ip: '127.0.0.1',
    };
    const res = await callRouter(adminRouter, req);
    assert.strictEqual(res.statusCode, 200);
    for (const u of res.body) {
      assert.strictEqual(u.isDccMaster, undefined);
      assert.strictEqual(u.is_dcc_master, undefined);
    }
  });

  await t.test('36. GET /api/admin/users/:id omite is_dcc_master do DTO retornado', async () => {
    const { adminUser, session } = await createTestAdmin('OMITDETAIL');

    const req: any = {
      method: 'GET',
      url: `/users/${adminUser.id}`,
      path: `/users/${adminUser.id}`,
      params: { id: adminUser.id },
      headers: { cookie: `witiquetas_session=${session.rawToken}` },
      ip: '127.0.0.1',
    };
    const res = await callRouter(adminRouter, req);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.isDccMaster, undefined);
  });

  await t.test('37. PUT /api/admin/users/:id ignora tentativas de alterar is_dcc_master', async () => {
    const { company, session } = await createTestAdmin('IGNOREREAD');
    const target = await UserRepository.create({
      companyId: company.id,
      name: 'Target N',
      email: 'target@n.com',
      passwordHash: 'hash',
    });

    const req: any = {
      method: 'PUT',
      url: `/users/${target.id}`,
      path: `/users/${target.id}`,
      params: { id: target.id },
      headers: {
        cookie: `witiquetas_session=${session.rawToken}`,
        'x-csrf-token': session.csrfToken,
      },
      body: {
        name: 'Target Atualizado',
        is_dcc_master: true,
        isDccMaster: true,
      },
      ip: '127.0.0.1',
    };
    const res = await callRouter(adminRouter, req);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.isDccMaster, undefined);
  });

  await t.test('38. Tokens de sessão developer utilizam 256 bits de entropia e são opacos', () => {
    const s1 = developerAuthService.createSession();
    const s2 = developerAuthService.createSession();
    assert.strictEqual(s1.token.length, 64); // 32 bytes hex = 64 chars
    assert.notStrictEqual(s1.token, s2.token);
    assert.ok(/^[0-9a-f]{64}$/.test(s1.token));
  });

  await t.test('39. Hash de sessão de desenvolvedor protege armazenamento contra vazamento de memória', () => {
    const session = developerAuthService.createSession();
    const validated = developerAuthService.validateSession(session.rawToken);
    assert.ok(validated);
    assert.strictEqual(validated.username, 'Marcel');
  });

  await t.test('40. DCC_TOTP_SECRET ausente em produção rejeita autenticação com erro seguro', async () => {
    delete process.env.DCC_TOTP_SECRET;
    const req: any = {
      method: 'POST',
      url: '/auth/login',
      path: '/auth/login',
      body: { username: 'Marcel', code: '123456' },
      ip: '127.0.0.1',
    };
    const res = await callRouter(devControlRouter, req);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.code, 'DEVELOPER_SECRET_NOT_CONFIGURED');
  });

  await t.test('41. DCC_ENABLED=false bloqueia rotas /auth/login e /auth/me com 404', async () => {
    process.env.DCC_ENABLED = 'false';
    const reqLogin: any = {
      method: 'POST',
      url: '/auth/login',
      path: '/auth/login',
      body: { username: 'Marcel', code: '123456' },
      ip: '127.0.0.1',
    };
    const resLogin = await callRouter(devControlRouter, reqLogin);
    assert.strictEqual(resLogin.statusCode, 404);

    const reqMe: any = {
      method: 'GET',
      url: '/auth/me',
      path: '/auth/me',
      ip: '127.0.0.1',
    };
    const resMe = await callRouter(devControlRouter, reqMe);
    assert.strictEqual(resMe.statusCode, 404);
  });

  await t.test('42. Isolamento de Domínios: Sessão de tenant não permite chamar /auth/login sem credenciais de Marcel', async () => {
    const company = await CompanyRepository.create({ name: 'Empresa O', slug: 'emp-o' });
    const user = await UserRepository.create({
      companyId: company.id,
      name: 'Admin O',
      email: 'admin@o.com',
      passwordHash: 'hash',
    });
    const session = await SessionService.createAuthenticatedSession({
      userId: user.id,
      companyId: company.id,
      authMethod: 'password',
    });

    const req: any = {
      method: 'POST',
      url: '/auth/login',
      path: '/auth/login',
      headers: { cookie: `witiquetas_session=${session.rawToken}` },
      body: { username: 'Admin O', code: '123456' },
      ip: '127.0.0.1',
    };
    const res = await callRouter(devControlRouter, req);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.code, 'INVALID_DEVELOPER_CREDENTIALS');
  });
});
