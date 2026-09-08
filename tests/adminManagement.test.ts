import test from 'node:test';
import assert from 'node:assert/strict';
import { PasswordService } from '../apps/backend/src/services/passwordService.js';
import {
  SessionService,
  SessionRepository,
  clearSessionMemoryStores,
} from '../apps/backend/src/services/sessionService.js';
import {
  CompanyRepository,
  UserRepository,
  RoleRepository,
  CANONICAL_PERMISSIONS,
  clearAdminMemoryStores,
} from '../apps/backend/src/repositories/adminRepositories.js';
import adminRouter from '../apps/backend/src/routes/admin.js';
import { SESSION_COOKIE_NAME } from '../apps/backend/src/routes/auth.js';

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

function callAdminRouter(req: any): Promise<any> {
  const handler = typeof adminRouter === 'function' ? adminRouter : ((adminRouter as any)?.default || adminRouter);
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

// Helpers para setup de testes
async function setupTestTenant(prefix: string) {
  const comp = await CompanyRepository.create({
    id: `comp-${prefix}`,
    name: `Empresa ${prefix}`,
    legalName: `Empresa ${prefix} Ltda`,
    document: `00.000.000/0001-${prefix.slice(-2).padStart(2, '0')}`,
    slug: `slug-${prefix.toLowerCase()}`,
    status: 'ACTIVE',
  });

  // Criar perfis ADMIN e OPERATOR
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
    'templates.create',
    'print.execute',
  ]);

  // Criar Usuário Admin
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

  // Criar Usuário Operador
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

  // Criar Sessões
  const adminSession = await SessionService.createAuthenticatedSession({
    userId: adminUser.id,
    companyId: comp.id,
  });

  const opSession = await SessionService.createAuthenticatedSession({
    userId: opUser.id,
    companyId: comp.id,
  });

  return {
    company: comp,
    adminRole,
    opRole,
    adminUser,
    opUser,
    adminSession,
    opSession,
  };
}

// ============================================================================
// SUÍTE CANÔNICA DE TESTES — PACOTE 5.3: ADMINISTRAÇÃO E RBAC
// ============================================================================

test('CENÁRIO 01: [Company] GET /company sem autenticação retorna 401 UNAUTHENTICATED', async () => {
  clearAdminMemoryStores();
  clearSessionMemoryStores();
  const res = await callAdminRouter({
    method: 'GET',
    url: '/company',
    headers: {},
  });

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, 'UNAUTHENTICATED');
});

test('CENÁRIO 02: [Company] GET /company com perfil sem permissão company.view retorna 403 FORBIDDEN', async () => {
  const tenant = await setupTestTenant('T02');
  const res = await callAdminRouter({
    method: 'GET',
    url: '/company',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.opSession.rawToken}`,
    },
  });

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'FORBIDDEN');
  assert.equal(res.body.requiredPermission, 'company.view');
});

test('CENÁRIO 03: [Company] GET /company com company.view retorna dados canônicos da empresa', async () => {
  const tenant = await setupTestTenant('T03');
  const res = await callAdminRouter({
    method: 'GET',
    url: '/company',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.id, tenant.company.id);
  assert.equal(res.body.name, tenant.company.name);
  assert.equal(res.body.slug, tenant.company.slug);
  assert.equal(res.body.status, 'ACTIVE');
});

test('CENÁRIO 04: [Company] PUT /company sem CSRF token em mutação com cookie retorna 403 CSRF_TOKEN_MISSING', async () => {
  const tenant = await setupTestTenant('T04');
  const res = await callAdminRouter({
    method: 'PUT',
    url: '/company',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
    },
    body: { name: 'Novo Nome da Empresa' },
  });

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'CSRF_TOKEN_MISSING');
});

test('CENÁRIO 05: [Company] PUT /company com CSRF token inválido retorna 403 CSRF_TOKEN_INVALID', async () => {
  const tenant = await setupTestTenant('T05');
  const res = await callAdminRouter({
    method: 'PUT',
    url: '/company',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': 'token-csrf-completamente-falso',
    },
    body: { name: 'Novo Nome da Empresa' },
  });

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'CSRF_TOKEN_INVALID');
});

test('CENÁRIO 06: [Company] PUT /company com perfil sem permissão company.manage retorna 403 FORBIDDEN', async () => {
  const tenant = await setupTestTenant('T06');
  const res = await callAdminRouter({
    method: 'PUT',
    url: '/company',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.opSession.rawToken}`,
      'x-csrf-token': tenant.opSession.csrfToken,
    },
    body: { name: 'Novo Nome' },
  });

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'FORBIDDEN');
  assert.equal(res.body.requiredPermission, 'company.manage');
});

test('CENÁRIO 07: [Company] PUT /company com nome inválido (em branco) retorna 400 INVALID_NAME', async () => {
  const tenant = await setupTestTenant('T07');
  const res = await callAdminRouter({
    method: 'PUT',
    url: '/company',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': tenant.adminSession.csrfToken,
    },
    body: { name: '   ' },
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'INVALID_NAME');
});

test('CENÁRIO 08: [Company] PUT /company com dados válidos atualiza e retorna CompanyDTO', async () => {
  const tenant = await setupTestTenant('T08');
  const res = await callAdminRouter({
    method: 'PUT',
    url: '/company',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': tenant.adminSession.csrfToken,
    },
    body: { name: 'Empresa T08 Atualizada' },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.id, tenant.company.id);
  assert.equal(res.body.name, 'Empresa T08 Atualizada');
});

test('CENÁRIO 09: [Company] Tenant isolation estrito: requisição /company nunca acessa nem modifica empresa de outro tenant', async () => {
  const tenantA = await setupTestTenant('T09A');
  const tenantB = await setupTestTenant('T09B');

  const res = await callAdminRouter({
    method: 'GET',
    url: '/company',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenantA.adminSession.rawToken}`,
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.id, tenantA.company.id);
  assert.notEqual(res.body.id, tenantB.company.id);
});

test('CENÁRIO 10: [Permissions] GET /permissions retorna catálogo canônico com 25 permissões', async () => {
  const tenant = await setupTestTenant('T10');
  const res = await callAdminRouter({
    method: 'GET',
    url: '/permissions',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.body), true);
  assert.equal(res.body.length, 25);
  assert.ok(res.body.some((p: any) => p.code === 'company.manage'));
  assert.ok(res.body.some((p: any) => p.code === 'users.manage'));
  assert.ok(res.body.some((p: any) => p.code === 'roles.manage'));
});

test('CENÁRIO 11: [Users] GET /users sem autenticação retorna 401 UNAUTHENTICATED', async () => {
  const res = await callAdminRouter({
    method: 'GET',
    url: '/users',
    headers: {},
  });

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, 'UNAUTHENTICATED');
});

test('CENÁRIO 12: [Users] GET /users sem permissão users.view retorna 403 FORBIDDEN', async () => {
  const tenant = await setupTestTenant('T12');
  const res = await callAdminRouter({
    method: 'GET',
    url: '/users',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.opSession.rawToken}`,
    },
  });

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'FORBIDDEN');
  assert.equal(res.body.requiredPermission, 'users.view');
});

test('CENÁRIO 13: [Users] GET /users retorna lista de usuários com papéis e SEM passwordHash', async () => {
  const tenant = await setupTestTenant('T13');
  const res = await callAdminRouter({
    method: 'GET',
    url: '/users',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
    },
  });

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.length >= 2);
  for (const u of res.body) {
    assert.equal(u.companyId, tenant.company.id);
    assert.ok(Array.isArray(u.roles));
    assert.equal(u.passwordHash, undefined, 'passwordHash nunca deve ser exposto na API');
    assert.equal(u.password, undefined, 'password nunca deve ser exposto');
  }
});

test('CENÁRIO 14: [Users] Tenant isolation: GET /users nunca retorna usuários de outras empresas (anti-leakage)', async () => {
  const tenantA = await setupTestTenant('T14A');
  const tenantB = await setupTestTenant('T14B');

  const resA = await callAdminRouter({
    method: 'GET',
    url: '/users',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenantA.adminSession.rawToken}`,
    },
  });

  const emailsA = resA.body.map((u: any) => u.email);
  assert.ok(emailsA.includes(tenantA.adminUser.email));
  assert.ok(!emailsA.includes(tenantB.adminUser.email));
});

test('CENÁRIO 15: [Users] POST /users sem CSRF token retorna 403', async () => {
  const tenant = await setupTestTenant('T15');
  const res = await callAdminRouter({
    method: 'POST',
    url: '/users',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
    },
    body: {
      name: 'Novo Operador',
      email: 'novo.op@empresa.com',
      password: 'StrongPassword@2026',
    },
  });

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'CSRF_TOKEN_MISSING');
});

test('CENÁRIO 16: [Users] POST /users sem permissão users.manage retorna 403', async () => {
  const tenant = await setupTestTenant('T16');
  const res = await callAdminRouter({
    method: 'POST',
    url: '/users',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.opSession.rawToken}`,
      'x-csrf-token': tenant.opSession.csrfToken,
    },
    body: {
      name: 'Novo Operador',
      email: 'novo.op16@empresa.com',
      password: 'StrongPassword@2026',
    },
  });

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'FORBIDDEN');
  assert.equal(res.body.requiredPermission, 'users.manage');
});

test('CENÁRIO 17: [Users] POST /users com campos obrigatórios ausentes retorna 400', async () => {
  const tenant = await setupTestTenant('T17');
  const res = await callAdminRouter({
    method: 'POST',
    url: '/users',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': tenant.adminSession.csrfToken,
    },
    body: {
      name: '',
      email: 'novo@empresa.com',
      password: 'StrongPassword@2026',
    },
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'INVALID_NAME');
});

test('CENÁRIO 18: [Users] POST /users com email malformado retorna 400', async () => {
  const tenant = await setupTestTenant('T18');
  const res = await callAdminRouter({
    method: 'POST',
    url: '/users',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': tenant.adminSession.csrfToken,
    },
    body: {
      name: 'Nome Válido',
      email: 'email_invalido_sem_arroba',
      password: 'StrongPassword@2026',
    },
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'INVALID_EMAIL');
});

test('CENÁRIO 19: [Users] POST /users com senha curta (< 8 chars) retorna 400 PASSWORD_POLICY_VIOLATION', async () => {
  const tenant = await setupTestTenant('T19');
  const res = await callAdminRouter({
    method: 'POST',
    url: '/users',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': tenant.adminSession.csrfToken,
    },
    body: {
      name: 'Nome Válido',
      email: 'novo19@empresa.com',
      password: 'curta',
    },
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'PASSWORD_POLICY_VIOLATION');
});

test('CENÁRIO 20: [Users] POST /users com email já cadastrado na plataforma retorna 409 EMAIL_ALREADY_EXISTS', async () => {
  const tenant = await setupTestTenant('T20');
  const res = await callAdminRouter({
    method: 'POST',
    url: '/users',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': tenant.adminSession.csrfToken,
    },
    body: {
      name: 'Duplicado',
      email: tenant.adminUser.email,
      password: 'StrongPassword@2026',
    },
  });

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'EMAIL_ALREADY_EXISTS');
});

test('CENÁRIO 21: [Users] POST /users com roleId de outra empresa rejeita com 400 INVALID_ROLE (Anti-IDOR)', async () => {
  const tenantA = await setupTestTenant('T21A');
  const tenantB = await setupTestTenant('T21B');

  const res = await callAdminRouter({
    method: 'POST',
    url: '/users',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenantA.adminSession.rawToken}`,
      'x-csrf-token': tenantA.adminSession.csrfToken,
    },
    body: {
      name: 'Operador Teste',
      email: 'novo21@empresa.com',
      password: 'StrongPassword@2026',
      roleIds: [tenantB.opRole.id], // Perfil da empresa B!
    },
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'INVALID_ROLE');
});

test('CENÁRIO 22: [Users] POST /users válido cria usuário com hash bcrypt 12, atribui papéis e retorna DTO seguro', async () => {
  const tenant = await setupTestTenant('T22');
  const rawPw = 'StrongPassword@2026';
  const res = await callAdminRouter({
    method: 'POST',
    url: '/users',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': tenant.adminSession.csrfToken,
    },
    body: {
      name: 'Carlos Oliveira',
      email: 'carlos.oliveira@empresa.com',
      password: rawPw,
      status: 'ACTIVE',
      roleIds: [tenant.opRole.id],
    },
  });

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.name, 'Carlos Oliveira');
  assert.equal(res.body.email, 'carlos.oliveira@empresa.com');
  assert.equal(res.body.status, 'ACTIVE');
  assert.equal(res.body.roles.length, 1);
  assert.equal(res.body.roles[0].id, tenant.opRole.id);
  assert.equal(res.body.passwordHash, undefined);

  // Verificar se o hash bcrypt foi gravado e é verificável
  const dbUser = await UserRepository.findByEmailWithPassword('carlos.oliveira@empresa.com');
  assert.ok(dbUser);
  assert.ok(dbUser.passwordHash);
  assert.equal(await PasswordService.verify(rawPw, dbUser.passwordHash), true);
});

test('CENÁRIO 23: [Users] GET /users/:id para usuário de outra empresa retorna 404 (Anti-IDOR)', async () => {
  const tenantA = await setupTestTenant('T23A');
  const tenantB = await setupTestTenant('T23B');

  const res = await callAdminRouter({
    method: 'GET',
    url: `/users/${tenantB.adminUser.id}`,
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenantA.adminSession.rawToken}`,
    },
  });

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'USER_NOT_FOUND');
});

test('CENÁRIO 24: [Users] GET /users/:id para usuário da mesma empresa retorna detalhes com papéis', async () => {
  const tenant = await setupTestTenant('T24');
  const res = await callAdminRouter({
    method: 'GET',
    url: `/users/${tenant.opUser.id}`,
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.id, tenant.opUser.id);
  assert.equal(res.body.roles.length, 1);
  assert.equal(res.body.roles[0].code, 'OPERATOR');
  assert.equal(res.body.passwordHash, undefined);
});

test('CENÁRIO 25: [Users] PUT /users/:id para usuário de outra empresa retorna 404 (Anti-IDOR)', async () => {
  const tenantA = await setupTestTenant('T25A');
  const tenantB = await setupTestTenant('T25B');

  const res = await callAdminRouter({
    method: 'PUT',
    url: `/users/${tenantB.opUser.id}`,
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenantA.adminSession.rawToken}`,
      'x-csrf-token': tenantA.adminSession.csrfToken,
    },
    body: { name: 'Tentativa de Hack' },
  });

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'USER_NOT_FOUND');
});

test('CENÁRIO 26: [Users] PUT /users/:id atualiza nome e e-mail com sucesso', async () => {
  const tenant = await setupTestTenant('T26');
  const res = await callAdminRouter({
    method: 'PUT',
    url: `/users/${tenant.opUser.id}`,
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': tenant.adminSession.csrfToken,
    },
    body: {
      name: 'Operador Renomeado',
      email: 'op.novoemail@empresa.com',
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.name, 'Operador Renomeado');
  assert.equal(res.body.email, 'op.novoemail@empresa.com');
});

test('CENÁRIO 27: [Users] PUT /users/:id alterando e-mail para um já em uso retorna 409 EMAIL_ALREADY_EXISTS', async () => {
  const tenant = await setupTestTenant('T27');
  const res = await callAdminRouter({
    method: 'PUT',
    url: `/users/${tenant.opUser.id}`,
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': tenant.adminSession.csrfToken,
    },
    body: {
      email: tenant.adminUser.email, // Conflito com admin existente
    },
  });

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'EMAIL_ALREADY_EXISTS');
});

test('CENÁRIO 28: [Anti-Lockout P0] PUT /users/:id inativando o único administrador ativo é bloqueado (400 CANNOT_DEACTIVATE_LAST_ADMIN)', async () => {
  const tenant = await setupTestTenant('T28');
  // tenant possui apenas 1 admin ativo (adminUser)
  const res = await callAdminRouter({
    method: 'PUT',
    url: `/users/${tenant.adminUser.id}`,
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': tenant.adminSession.csrfToken,
    },
    body: {
      status: 'INACTIVE',
    },
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'CANNOT_DEACTIVATE_LAST_ADMIN');
});

test('CENÁRIO 29: [Anti-Lockout P0] PUT /users/:id inativando um admin é permitido quando existe outro admin ativo', async () => {
  const tenant = await setupTestTenant('T29');
  // Criar um segundo admin ativo
  const admin2 = await UserRepository.create({
    id: 'usr-admin-2-t29',
    companyId: tenant.company.id,
    name: 'Admin Secundário',
    email: 'admin2@empresa.com',
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole(tenant.company.id, admin2.id, tenant.adminRole.id);

  // Agora desativar o primeiro admin deve ser permitido
  const res = await callAdminRouter({
    method: 'PUT',
    url: `/users/${tenant.adminUser.id}`,
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': tenant.adminSession.csrfToken,
    },
    body: {
      status: 'INACTIVE',
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'INACTIVE');
});

test('CENÁRIO 30: [Anti-Lockout P0] PUT /users/:id removendo perfil ADMIN do único administrador ativo é bloqueado (400 CANNOT_REMOVE_LAST_ADMIN_ROLE)', async () => {
  const tenant = await setupTestTenant('T30');
  // tenant possui apenas 1 admin ativo (adminUser)
  const res = await callAdminRouter({
    method: 'PUT',
    url: `/users/${tenant.adminUser.id}`,
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': tenant.adminSession.csrfToken,
    },
    body: {
      roleIds: [tenant.opRole.id], // Removendo ADMIN e passando apenas OPERATOR
    },
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'CANNOT_REMOVE_LAST_ADMIN_ROLE');
});

test('CENÁRIO 31: [Users] PUT /users/:id inativando usuário revoga todas as sessões ativas imediatamente', async () => {
  const tenant = await setupTestTenant('T31');
  // Inativar o operador
  const res = await callAdminRouter({
    method: 'PUT',
    url: `/users/${tenant.opUser.id}`,
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': tenant.adminSession.csrfToken,
    },
    body: {
      status: 'INACTIVE',
    },
  });

  assert.equal(res.statusCode, 200);

  // Verificar se a sessão do operador foi revogada
  const resolved = await SessionService.resolvePrincipalFromRawToken(tenant.opSession.rawToken);
  assert.equal(resolved, null, 'Sessão do operador inativado deve ser nula/revogada imediatamente');
});

test('CENÁRIO 32: [Users] POST /users/:id/reset-password valida política de senha, altera hash e revoga sessões', async () => {
  const tenant = await setupTestTenant('T32');
  const newPw = 'NovaSenhaUltraForte@2026';

  const res = await callAdminRouter({
    method: 'POST',
    url: `/users/${tenant.opUser.id}/reset-password`,
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': tenant.adminSession.csrfToken,
    },
    body: {
      newPassword: newPw,
    },
  });

  assert.equal(res.statusCode, 200);

  // Verificar se nova senha é válida
  const dbUser = await UserRepository.findByEmailWithPassword(tenant.opUser.email);
  assert.ok(dbUser?.passwordHash);
  assert.equal(await PasswordService.verify(newPw, dbUser.passwordHash), true);

  // Verificar se as sessões antigas foram revogadas
  const resolved = await SessionService.resolvePrincipalFromRawToken(tenant.opSession.rawToken);
  assert.equal(resolved, null, 'Sessão anterior do usuário deve ser revogada ao resetar senha');
});

test('CENÁRIO 33: [Users] DELETE /users/:id tentando excluir o próprio usuário logado retorna 400 CANNOT_DELETE_SELF', async () => {
  const tenant = await setupTestTenant('T33');
  const res = await callAdminRouter({
    method: 'DELETE',
    url: `/users/${tenant.adminUser.id}`,
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': tenant.adminSession.csrfToken,
    },
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'CANNOT_DELETE_SELF');
});

test('CENÁRIO 34: [Anti-Lockout P0] DELETE /users/:id tentando excluir o único admin da empresa retorna 400 CANNOT_DELETE_LAST_ADMIN', async () => {
  const tenant = await setupTestTenant('T34');
  // Criar um usuário com permissão users.manage mas que não seja admin (ex: super operador)
  const managerRole = await RoleRepository.create({
    id: 'role-mgr-t34',
    companyId: tenant.company.id,
    code: 'MANAGER',
    name: 'Gerente',
  });
  await RoleRepository.setRolePermissions(managerRole.id, ['users.manage', 'users.view']);
  const managerUser = await UserRepository.create({
    id: 'usr-mgr-t34',
    companyId: tenant.company.id,
    name: 'Gerente',
    email: 'mgr@empresa.com',
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole(tenant.company.id, managerUser.id, managerRole.id);
  const mgrSession = await SessionService.createAuthenticatedSession({
    userId: managerUser.id,
    companyId: tenant.company.id,
  });

  // Gerente tenta deletar o único admin ativo
  const res = await callAdminRouter({
    method: 'DELETE',
    url: `/users/${tenant.adminUser.id}`,
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${mgrSession.rawToken}`,
      'x-csrf-token': mgrSession.csrfToken,
    },
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'CANNOT_DELETE_LAST_ADMIN');
});

test('CENÁRIO 35: [Users] DELETE /users/:id remove usuário válido, limpa papéis e revoga sessões', async () => {
  const tenant = await setupTestTenant('T35');
  const res = await callAdminRouter({
    method: 'DELETE',
    url: `/users/${tenant.opUser.id}`,
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': tenant.adminSession.csrfToken,
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);

  // Usuário não deve mais existir
  const deletedUser = await UserRepository.findById(tenant.opUser.id);
  assert.equal(deletedUser, null);

  // Sessão não deve mais resolver
  const resolved = await SessionService.resolvePrincipalFromRawToken(tenant.opSession.rawToken);
  assert.equal(resolved, null);
});

test('CENÁRIO 36: [Roles] GET /roles sem roles.view retorna 403 FORBIDDEN', async () => {
  const tenant = await setupTestTenant('T36');
  const res = await callAdminRouter({
    method: 'GET',
    url: '/roles',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.opSession.rawToken}`,
    },
  });

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'FORBIDDEN');
  assert.equal(res.body.requiredPermission, 'roles.view');
});

test('CENÁRIO 37: [Roles] GET /roles retorna lista de perfis com permissões associadas e userCount', async () => {
  const tenant = await setupTestTenant('T37');
  const res = await callAdminRouter({
    method: 'GET',
    url: '/roles',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
    },
  });

  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.length >= 2);
  const adminRole = res.body.find((r: any) => r.code === 'ADMIN');
  assert.ok(adminRole);
  assert.equal(adminRole.userCount, 1);
  assert.ok(adminRole.permissions.includes('users.manage'));
});

test('CENÁRIO 38: [Roles] POST /roles com código duplicado na mesma empresa retorna 409 ROLE_CODE_ALREADY_EXISTS', async () => {
  const tenant = await setupTestTenant('T38');
  const res = await callAdminRouter({
    method: 'POST',
    url: '/roles',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': tenant.adminSession.csrfToken,
    },
    body: {
      code: 'ADMIN', // Já existe na empresa
      name: 'Outro Admin',
    },
  });

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'ROLE_CODE_ALREADY_EXISTS');
});

test('CENÁRIO 39: [Roles] POST /roles com código idêntico em empresas distintas é permitido (escopo multi-tenant)', async () => {
  const tenantA = await setupTestTenant('T39A');
  const tenantB = await setupTestTenant('T39B');

  // Criar código CUSTOM na empresa A
  const resA = await callAdminRouter({
    method: 'POST',
    url: '/roles',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenantA.adminSession.rawToken}`,
      'x-csrf-token': tenantA.adminSession.csrfToken,
    },
    body: {
      code: 'CUSTOM_LEAD',
      name: 'Líder Customizado',
    },
  });
  assert.equal(resA.statusCode, 201);

  // Criar mesmo código CUSTOM_LEAD na empresa B deve ter sucesso
  const resB = await callAdminRouter({
    method: 'POST',
    url: '/roles',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenantB.adminSession.rawToken}`,
      'x-csrf-token': tenantB.adminSession.csrfToken,
    },
    body: {
      code: 'CUSTOM_LEAD',
      name: 'Líder Customizado B',
    },
  });
  assert.equal(resB.statusCode, 201);
});

test('CENÁRIO 40: [Roles] POST /roles com permissão não canônica retorna 400 INVALID_PERMISSION', async () => {
  const tenant = await setupTestTenant('T40');
  const res = await callAdminRouter({
    method: 'POST',
    url: '/roles',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': tenant.adminSession.csrfToken,
    },
    body: {
      code: 'AUDITOR',
      name: 'Auditor',
      permissions: ['permissao_que_nao_existe_no_catalogo'],
    },
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'INVALID_PERMISSION');
});

test('CENÁRIO 41: [Roles] POST /roles cria perfil personalizado com permissões válidas', async () => {
  const tenant = await setupTestTenant('T41');
  const res = await callAdminRouter({
    method: 'POST',
    url: '/roles',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': tenant.adminSession.csrfToken,
    },
    body: {
      code: 'SUPERVISOR',
      name: 'Supervisor de Turno',
      description: 'Supervisão de impressoras e histórico',
      permissions: ['printers.view', 'print.history', 'templates.view'],
    },
  });

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.code, 'SUPERVISOR');
  assert.equal(res.body.name, 'Supervisor de Turno');
  assert.equal(res.body.permissions.length, 3);
  assert.equal(res.body.userCount, 0);
});

test('CENÁRIO 42: [Roles] PUT /roles/:id atualiza nome e descrição com sucesso', async () => {
  const tenant = await setupTestTenant('T42');
  const res = await callAdminRouter({
    method: 'PUT',
    url: `/roles/${tenant.opRole.id}`,
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': tenant.adminSession.csrfToken,
    },
    body: {
      name: 'Operador Especializado',
      description: 'Operação de linha e expedição',
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.name, 'Operador Especializado');
  assert.equal(res.body.description, 'Operação de linha e expedição');
});

test('CENÁRIO 43: [Anti-Lockout P0] PUT /roles/:id/permissions removendo permissão essencial do perfil ADMIN é bloqueado (400 CANNOT_STRIP_ESSENTIAL_ADMIN_PERMISSIONS)', async () => {
  const tenant = await setupTestTenant('T43');
  // Tentar remover users.manage e roles.manage do ADMIN
  const res = await callAdminRouter({
    method: 'PUT',
    url: `/roles/${tenant.adminRole.id}/permissions`,
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': tenant.adminSession.csrfToken,
    },
    body: {
      permissions: ['templates.view', 'templates.edit', 'print.execute'],
    },
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'CANNOT_STRIP_ESSENTIAL_ADMIN_PERMISSIONS');
  assert.ok(Array.isArray(res.body.missingPermissions));
  assert.ok(res.body.missingPermissions.includes('users.manage'));
  assert.ok(res.body.missingPermissions.includes('roles.manage'));
});

test('CENÁRIO 44: [Roles] PUT /roles/:id/permissions atualizando permissões não essenciais no ADMIN é permitido', async () => {
  const tenant = await setupTestTenant('T44');
  const essentialPerms = [
    'company.view',
    'company.manage',
    'users.view',
    'users.manage',
    'roles.view',
    'roles.manage',
  ];
  const perms = [...essentialPerms, 'templates.view', 'print.execute'];

  const res = await callAdminRouter({
    method: 'PUT',
    url: `/roles/${tenant.adminRole.id}/permissions`,
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': tenant.adminSession.csrfToken,
    },
    body: {
      permissions: perms,
    },
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.permissions.sort(), perms.sort());
});

test('CENÁRIO 45: [Roles] DELETE /roles/:id para perfil de sistema (isSystem=true) retorna 400 CANNOT_DELETE_SYSTEM_ROLE', async () => {
  const tenant = await setupTestTenant('T45');
  const res = await callAdminRouter({
    method: 'DELETE',
    url: `/roles/${tenant.opRole.id}`,
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': tenant.adminSession.csrfToken,
    },
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'CANNOT_DELETE_SYSTEM_ROLE');
});

test('CENÁRIO 46: [Roles] DELETE /roles/:id para perfil associado a usuários retorna 400 ROLE_IN_USE', async () => {
  const tenant = await setupTestTenant('T46');
  // Criar perfil customizado
  const customRole = await RoleRepository.create({
    companyId: tenant.company.id,
    code: 'INSPECTOR',
    name: 'Inspetor',
  });
  // Associar ao operador
  await RoleRepository.assignUserRole(tenant.company.id, tenant.opUser.id, customRole.id);

  const res = await callAdminRouter({
    method: 'DELETE',
    url: `/roles/${customRole.id}`,
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': tenant.adminSession.csrfToken,
    },
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'ROLE_IN_USE');
  assert.equal(res.body.userCount, 1);
});

test('CENÁRIO 47: [Roles] DELETE /roles/:id para perfil personalizado sem usuários exclui com sucesso', async () => {
  const tenant = await setupTestTenant('T47');
  const customRole = await RoleRepository.create({
    companyId: tenant.company.id,
    code: 'TEMPORARY',
    name: 'Temporário',
  });

  const res = await callAdminRouter({
    method: 'DELETE',
    url: `/roles/${customRole.id}`,
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${tenant.adminSession.rawToken}`,
      'x-csrf-token': tenant.adminSession.csrfToken,
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);

  const found = await RoleRepository.findById(customRole.id);
  assert.equal(found, null);
});
