import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearAdminMemoryStores,
  CompanyRepository,
  UserRepository,
  RoleRepository,
  CANONICAL_PERMISSIONS,
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
import { developerAuthService } from '../apps/backend/src/services/developerAuthService.js';
import { SESSION_COOKIE_NAME } from '../apps/backend/src/routes/auth.js';
import { getEffectiveNavigation, BASE_NAV_ITEMS } from '../apps/frontend/src/shell/navigation.js';

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

// Setup de inquilino para testes
async function setupTenant(prefix: string) {
  const comp = await CompanyRepository.create({
    id: `comp-hotfix-${prefix}`,
    name: `Empresa Hotfix ${prefix}`,
    legalName: `Empresa Hotfix ${prefix} Ltda`,
    slug: `hotfix-${prefix.toLowerCase()}`,
    status: 'ACTIVE',
  });

  const adminRole = await RoleRepository.create({
    id: `role-admin-${prefix}`,
    companyId: comp.id,
    code: 'ADMIN',
    name: 'Administrador',
    isSystem: true,
  });
  await RoleRepository.setRolePermissions(
    adminRole.id,
    CANONICAL_PERMISSIONS.map((p) => p.code)
  );

  const opRole = await RoleRepository.create({
    id: `role-op-${prefix}`,
    companyId: comp.id,
    code: 'OPERATOR',
    name: 'Operador',
    isSystem: true,
  });
  await RoleRepository.setRolePermissions(opRole.id, [
    'templates.view',
    'print.execute',
  ]);

  const adminUser = await UserRepository.create({
    id: `usr-admin-${prefix}`,
    companyId: comp.id,
    name: `Admin ${prefix}`,
    email: `admin.${prefix.toLowerCase()}@empresa.com`,
    status: 'ACTIVE',
  });
  await UserRepository.setPassword(
    adminUser.id,
    await PasswordService.hash('AdminPassword@2026')
  );
  await RoleRepository.assignUserRole(comp.id, adminUser.id, adminRole.id);

  const opUser = await UserRepository.create({
    id: `usr-op-${prefix}`,
    companyId: comp.id,
    name: `Operador ${prefix}`,
    email: `op.${prefix.toLowerCase()}@empresa.com`,
    status: 'ACTIVE',
  });
  await UserRepository.setPassword(
    opUser.id,
    await PasswordService.hash('OperatorPassword@2026')
  );
  await RoleRepository.assignUserRole(comp.id, opUser.id, opRole.id);

  const adminSession = await SessionService.createAuthenticatedSession({
    userId: adminUser.id,
    companyId: comp.id,
  });

  const opSession = await SessionService.createAuthenticatedSession({
    userId: opUser.id,
    companyId: comp.id,
  });

  return { comp, adminRole, opRole, adminUser, opUser, adminSession, opSession };
}

// ============================================================================
// SUÍTE CANÔNICA DE TESTES — HOTFIX 5.3.1
// ============================================================================

test('HOTFIX 5.3.1: Catálogo canônico possui exatamente 25 permissões', () => {
  assert.equal(CANONICAL_PERMISSIONS.length, 25, 'Catálogo deve ter exatamente 25 permissões');
});

test('HOTFIX 5.3.1: devcontrol.view e devcontrol.manage continuam presentes no catálogo oficial', () => {
  const codes = CANONICAL_PERMISSIONS.map((p) => p.code);
  assert.ok(codes.includes('devcontrol.view'), 'devcontrol.view deve existir');
  assert.ok(codes.includes('devcontrol.manage'), 'devcontrol.manage deve existir');
});

test('HOTFIX 5.3.1: Permissões inventadas ou não-canônicas não existem no catálogo', () => {
  const codes = CANONICAL_PERMISSIONS.map((p) => p.code);
  assert.ok(!codes.includes('print.view'), 'print.view não deve existir');
  assert.ok(!codes.includes('history.view'), 'history.view não deve existir');
  assert.ok(!codes.includes('templates.manage'), 'templates.manage não deve existir');
  assert.ok(!codes.includes('printers.execute'), 'printers.execute não deve existir');
  assert.ok(!codes.includes('users.delete'), 'users.delete não deve existir');
  assert.ok(!codes.includes('admin.access'), 'admin.access não deve existir');
});

test('HOTFIX 5.3.1 / 5.3.2: GET /api/admin/permissions retorna exatamente as 23 permissões gerenciáveis pelo tenant', async () => {
  clearAdminMemoryStores();
  clearSessionMemoryStores();
  const tenant = await setupTenant('PERMS');

  const res = await callRouter(adminRouter, {
    method: 'GET',
    url: '/permissions',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 23);
  for (const item of res.body) {
    assert.ok(item.code, 'Permissão deve ter código');
    assert.ok(item.name, 'Permissão deve ter nome');
    assert.ok(item.description, 'Permissão deve ter descrição amigável');
    assert.ok(item.category, 'Permissão deve ter categoria');
    assert.ok(!item.code.startsWith('devcontrol.'), 'devcontrol.* não deve estar na matriz do tenant');
  }
});

test('HOTFIX 5.3.1: is_dcc_master é atributo de plataforma e não existe nos DTOs de tenant admin', async () => {
  const tenant = await setupTenant('DCCSEC');

  // Listagem de usuários
  const listRes = await callRouter(adminRouter, {
    method: 'GET',
    url: '/users',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
    },
  });

  assert.equal(listRes.statusCode, 200);
  for (const u of listRes.body) {
    assert.equal(u.isDccMaster, undefined, 'isDccMaster não deve vazar em listByCompany');
    assert.equal(u.is_dcc_master, undefined, 'is_dcc_master não deve vazar em listByCompany');
  }

  // Detalhe de usuário
  const detailRes = await callRouter(adminRouter, {
    method: 'GET',
    url: `/users/${tenant.adminUser.id}`,
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
    },
  });

  assert.equal(detailRes.statusCode, 200);
  assert.equal(detailRes.body.isDccMaster, undefined, 'isDccMaster não deve vazar em detalhe');
  assert.equal(detailRes.body.is_dcc_master, undefined, 'is_dcc_master não deve vazar em detalhe');
});

test('HOTFIX 5.3.1 / 5.3.2: POST /api/admin/users ignora silenciosamente is_dcc_master sem vazar no DTO', async () => {
  const tenant = await setupTenant('POSTELEV');

  const res = await callRouter(adminRouter, {
    method: 'POST',
    url: '/users',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': tenant.adminSession.csrfToken,
    },
    body: {
      name: 'Hacker',
      email: 'hacker@empresa.com',
      password: 'StrongPassword@2026',
      is_dcc_master: true,
    },
  });

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.isDccMaster, undefined);
});

test('HOTFIX 5.3.1 / 5.3.2: PUT /api/admin/users/:id ignora silenciosamente tentativas de alterar is_dcc_master', async () => {
  const tenant = await setupTenant('PUTELEV');

  const res = await callRouter(adminRouter, {
    method: 'PUT',
    url: `/users/${tenant.opUser.id}`,
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': tenant.adminSession.csrfToken,
    },
    body: {
      isDccMaster: true,
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.isDccMaster, undefined);
});

test('HOTFIX 5.3.1: Ter devcontrol.view ou devcontrol.manage NÃO torna o usuário Master DCC', async () => {
  const tenant = await setupTenant('NODCC');

  // Criar role com devcontrol.* e atribuir ao opUser
  const devRole = await RoleRepository.create({
    id: 'role-dev-test',
    companyId: tenant.comp.id,
    code: 'DEV_ROLE',
    name: 'Dev Role',
    isSystem: false,
  });
  await RoleRepository.setRolePermissions(devRole.id, ['devcontrol.view', 'devcontrol.manage']);
  await RoleRepository.assignUserRole(tenant.comp.id, tenant.opUser.id, devRole.id);

  // Resolver principal
  const principal = await SessionService.resolvePrincipalFromRawToken(tenant.opSession.rawToken);
  assert.ok(principal);
  assert.equal(principal.user.isDccMaster, false, 'Usuário não deve ser isDccMaster mesmo com devcontrol.*');
});

test('HOTFIX 5.3.1 / 5.3.2: DevControl router bloqueia com 401 DEVELOPER_AUTH_REQUIRED qualquer sessão tenant', async () => {
  const tenant = await setupTenant('DCBLOCK');
  process.env.DCC_ENABLED = 'true';

  // Chamar overview sem sessão developer
  const res = await callRouter(devControlRouter, {
    method: 'GET',
    url: '/overview',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
    },
  });

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, 'DEVELOPER_AUTH_REQUIRED');
});

test('HOTFIX 5.3.1 / 5.3.2: DevControl router retorna 404 DCC_DISABLED se DCC_ENABLED for false', async () => {
  process.env.DCC_ENABLED = 'false';

  const res = await callRouter(devControlRouter, {
    method: 'GET',
    url: '/overview',
    headers: {},
  });

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'DCC_DISABLED');
});

test('HOTFIX 5.3.1 / 5.3.2: DevControl router permite acesso exclusivamente com sessão de desenvolvedor (Marcel)', async () => {
  process.env.DCC_ENABLED = 'true';
  const devSession = developerAuthService.createSession();

  const res = await callRouter(devControlRouter, {
    method: 'GET',
    url: '/overview',
    headers: {
      cookie: `witiquetas_dcc_session=${devSession.rawToken}`,
    },
  });

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.phases);
});

test('HOTFIX 5.3.1 / 5.3.2: GET /api/session/context nunca expõe dccEnabled ou canAccessDcc a tenants comerciais', async () => {
  const tenant = await setupTenant('CTX');
  process.env.DCC_ENABLED = 'true';

  const res = await callRouter(sessionRouter, {
    method: 'GET',
    url: '/context',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.dccEnabled, undefined);
  assert.equal(res.body.canAccessDcc, undefined);
});

test('HOTFIX 5.3.1: getEffectiveNavigation oculta DevControl para usuário comum e admin de empresa', () => {
  const commonUserContext: any = {
    user: { id: 'u1', name: 'User 1', email: 'u1@emp.com' },
    company: { id: 'c1', name: 'Empresa', slug: 'emp' },
    roles: ['OPERATOR'],
    permissions: ['templates.view', 'print.execute'],
  };

  const nav = getEffectiveNavigation(commonUserContext);
  assert.ok(!nav.some((item) => item.id === 'development'), 'DCC não pode aparecer para usuário comum');
  assert.ok(nav.some((item) => item.id === 'models'), 'Modelos deve aparecer');
  assert.ok(nav.some((item) => item.id === 'home'), 'Dashboard/home deve aparecer');
  assert.ok(!nav.some((item) => item.id === 'admin'), 'Admin não deve aparecer para operador');
});

test('HOTFIX 5.3.1: getEffectiveNavigation exibe Administração para admin e oculta DevControl', () => {
  const tenantAdminContext: any = {
    user: { id: 'u2', name: 'Admin', email: 'adm@emp.com' },
    company: { id: 'c1', name: 'Empresa', slug: 'emp' },
    roles: ['ADMIN'],
    permissions: CANONICAL_PERMISSIONS.map((p) => p.code),
  };

  const nav = getEffectiveNavigation(tenantAdminContext);
  assert.ok(nav.some((item) => item.id === 'admin'), 'Admin deve aparecer para admin da empresa');
  assert.ok(!nav.some((item) => item.id === 'development'), 'DCC não pode aparecer para admin comum');
});

test('HOTFIX 5.3.1 / 5.3.2: getEffectiveNavigation NUNCA inclui DevControl na navegação do tenant', () => {
  const anyContext: any = {
    user: { id: 'u3', name: 'Master', email: 'master@witiquetas.com', isDccMaster: true },
    company: { id: 'c1', name: 'Empresa', slug: 'emp' },
    roles: ['ADMIN'],
    permissions: CANONICAL_PERMISSIONS.map((p) => p.code),
  };

  const nav = getEffectiveNavigation(anyContext);
  assert.ok(!nav.some((item) => item.id === 'development'), 'DCC NUNCA deve aparecer na navegação comercial do tenant');
});
