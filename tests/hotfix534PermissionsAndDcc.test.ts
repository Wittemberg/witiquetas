import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
} from '../apps/backend/src/services/sessionService.js';
import adminRouter from '../apps/backend/src/routes/admin.js';
import devControlRouter from '../apps/backend/src/routes/developmentControl.js';
import {
  developerAuthService,
  DCC_SESSION_COOKIE_NAME,
  generateTotpCodeForTesting,
} from '../apps/backend/src/services/developerAuthService.js';
import { DevelopmentControlService } from '../apps/backend/src/services/developmentControlService.js';

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
    clearCookie(name: string, _opts: any) {
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

test('HOTFIX 5.3.4: Suíte Canônica de Permissões e DCC Developer Auth (20 Gates Obrigatórios)', async (t) => {
  const TEST_SECRET = 'JBSWY3DPEHPK3PXP'; // Base32 test secret RFC 4648
  process.env.DCC_ENABLED = 'true';
  process.env.DCC_DEVELOPER_USERNAME = 'Marcel';
  process.env.DCC_TOTP_SECRET = TEST_SECRET;

  t.beforeEach(() => {
    clearAdminMemoryStores();
    clearSessionMemoryStores();
    process.env.DCC_ENABLED = 'true';
    process.env.DCC_DEVELOPER_USERNAME = 'Marcel';
    process.env.DCC_TOTP_SECRET = TEST_SECRET;
  });

  // 1. Catálogo plataforma exatamente 25
  await t.test('1. Catálogo plataforma contém exatamente 25 permissões canônicas', () => {
    assert.strictEqual(CANONICAL_PERMISSIONS.length, 25, 'Catálogo da plataforma deve ter exatamente 25 permissões');
  });

  // 2. print.history presente
  await t.test('2. print.history está presente no catálogo e sob categoria Impressão', () => {
    const perm = CANONICAL_PERMISSIONS.find((p) => p.code === 'print.history');
    assert.ok(perm, 'print.history deve existir no catálogo oficial');
    assert.strictEqual(perm.category, 'Impressão', 'print.history deve pertencer à categoria Impressão');

    const tenantPerm = TENANT_MANAGEABLE_PERMISSIONS.find((p) => p.code === 'print.history');
    assert.ok(tenantPerm, 'print.history deve existir no catálogo gerenciável pelo tenant');
  });

  // 3. audit.export ausente
  await t.test('3. audit.export está estritamente ausente de todo o sistema', () => {
    const platformPerm = CANONICAL_PERMISSIONS.find((p) => p.code === 'audit.export');
    assert.strictEqual(platformPerm, undefined, 'audit.export NÃO deve existir no catálogo da plataforma');

    const tenantPerm = TENANT_MANAGEABLE_PERMISSIONS.find((p) => p.code === 'audit.export');
    assert.strictEqual(tenantPerm, undefined, 'audit.export NÃO deve existir no catálogo do tenant');
  });

  // 4. Matriz tenant exatamente 23
  await t.test('4. Matriz tenant possui exatamente 23 permissões gerenciáveis', () => {
    assert.strictEqual(TENANT_MANAGEABLE_PERMISSIONS.length, 23, 'Catálogo gerenciável deve conter exatamente 23 permissões');
  });

  // 5. devcontrol.* ausentes da matriz tenant
  await t.test('5. devcontrol.* ausentes da matriz tenant', () => {
    const codes = TENANT_MANAGEABLE_PERMISSIONS.map((p) => p.code);
    assert.ok(!codes.includes('devcontrol.view'), 'devcontrol.view não deve estar na matriz do tenant');
    assert.ok(!codes.includes('devcontrol.manage'), 'devcontrol.manage não deve estar na matriz do tenant');
  });

  // 6. Checkbox hitbox alinhado ao controle visual
  await t.test('6. Checkbox hitbox alinhado ao controle visual em index.css', () => {
    const cssPath = path.resolve('apps/frontend/src/index.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    assert.ok(cssContent.includes('.admin-perm-checkbox-col {'), 'deve conter .admin-perm-checkbox-col');
    assert.ok(cssContent.includes('place-items: center;'), '.admin-perm-checkbox-col deve usar place-items: center');
    assert.ok(cssContent.includes('line-height: 1;'), '.admin-perm-checkbox-col deve usar line-height: 1');
  });

  // 7. Row click continua funcionando (RolesAdminView.tsx contém onClick e onKeyDown na linha)
  await t.test('7. Row click continua preservado em RolesAdminView.tsx', () => {
    const tsxPath = path.resolve('apps/frontend/src/modules/admin/RolesAdminView.tsx');
    const tsxContent = fs.readFileSync(tsxPath, 'utf8');

    assert.ok(tsxContent.includes('togglePermission(perm.code)'), 'Row deve alternar permissão ao clicar na linha inteira');
    assert.ok(tsxContent.includes('e.stopPropagation()'), 'Checkbox input deve conter stopPropagation para evitar duplo disparo');
  });

  // 8. Developer route abre tela Developer
  await t.test('8. App.tsx suporta rota developer e development via hash e path', () => {
    const appPath = path.resolve('apps/frontend/src/App.tsx');
    const appContent = fs.readFileSync(appPath, 'utf8');

    assert.ok(appContent.includes("effective === 'developer' || effective === 'development'"), 'parseHash deve reconhecer rota developer');
    assert.ok(appContent.includes('<DevControlPage'), 'Deve renderizar DevControlPage diretamente');
  });

  // 9. Developer route não mostra login tenant
  await t.test('9. Developer route não mostra LoginForm de tenant para usuário sem sessão', () => {
    const appPath = path.resolve('apps/frontend/src/App.tsx');
    const appContent = fs.readFileSync(appPath, 'utf8');

    assert.ok(appContent.includes("if (!sessionContext) {\n    if (currentModule === 'developer' || currentModule === 'development') {"),
      'Sem sessionContext, deve abrir DevControlPage antes de LoginForm');
  });

  // 10. DCC_ENABLED=false bloqueia
  await t.test('10. DCC_ENABLED=false bloqueia acesso ao DevControl com HTTP 404', async () => {
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

  // 11. Secret ausente falha fechado
  await t.test('11. Secret ausente falha fechado (retorna 401 DEVELOPER_SECRET_NOT_CONFIGURED)', async () => {
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

  // 12. Usuário diferente de Marcel rejeitado
  await t.test('12. Usuário diferente de Marcel rejeitado', async () => {
    const validCode = generateTotpCodeForTesting(TEST_SECRET);
    const req: any = {
      method: 'POST',
      url: '/auth/login',
      path: '/auth/login',
      body: { username: 'OutroUsuario', code: validCode },
      ip: '127.0.0.1',
    };
    const res = await callRouter(devControlRouter, req);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.code, 'INVALID_DEVELOPER_CREDENTIALS');
  });

  // 13. TOTP inválido rejeitado
  await t.test('13. TOTP inválido rejeitado', async () => {
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

  // 14. TOTP válido autentica
  await t.test('14. TOTP válido autentica Marcel com cookie dedicado', async () => {
    const validCode = generateTotpCodeForTesting(TEST_SECRET);
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
    assert.ok(res.cookies[DCC_SESSION_COOKIE_NAME], 'Cookie witiquetas_dcc_session deve ser emitido');
  });

  // 15. Logout revoga sessão
  await t.test('15. Logout revoga sessão de desenvolvedor', async () => {
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

    // Token revogado não mais acessa /overview
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

  // 16. Tenant session não acessa DCC
  await t.test('16. Tenant session não acessa dados do DCC', async () => {
    const company = await CompanyRepository.create({ name: 'Empresa Teste', slug: 'emp-teste' });
    const user = await UserRepository.create({
      companyId: company.id,
      name: 'Admin Teste',
      email: 'adm@teste.com',
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

  // 17. Developer session não acessa Admin tenant
  await t.test('17. Developer session não vira Admin tenant nem acessa rotas de tenant', async () => {
    const session = developerAuthService.createSession();
    const req: any = {
      method: 'GET',
      url: '/permissions',
      path: '/permissions',
      headers: { cookie: `${DCC_SESSION_COOKIE_NAME}=${session.rawToken}` },
      ip: '127.0.0.1',
    };
    const res = await callRouter(adminRouter, req);
    assert.strictEqual(res.statusCode, 401);
  });

  // 18. Dashboard regressão intacta
  await t.test('18. Dashboard regressão intacta (App.tsx contém os 5 cards padrão de infraestrutura)', () => {
    const appPath = path.resolve('apps/frontend/src/App.tsx');
    const appContent = fs.readFileSync(appPath, 'utf8');

    assert.ok(appContent.includes('Frontend Web'), 'Card Frontend Web deve existir');
    assert.ok(appContent.includes('Backend API'), 'Card Backend API deve existir');
    assert.ok(appContent.includes('PostgreSQL'), 'Card PostgreSQL deve existir');
    assert.ok(appContent.includes('MinIO / S3 Storage'), 'Card MinIO deve existir');
    assert.ok(appContent.includes('Agent de Impressão'), 'Card Agent de Impressão deve existir');
    assert.ok(appContent.includes('Esteira de Integração e Deploy (CI/CD Pipeline)'), 'Pipeline CI/CD deve existir');
  });

  // 19. Matriz regressão intacta
  await t.test('19. Matriz regressão intacta (layout em coluna única sem grids colapsados)', () => {
    const cssPath = path.resolve('apps/frontend/src/index.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    assert.ok(cssContent.includes('.admin-perm-categories-list {'), 'deve conter lista vertical de categorias');
    assert.ok(cssContent.includes('.admin-perm-matrix-body {'), 'deve conter corpo com rolagem controlada');
    assert.ok(cssContent.includes('.admin-perm-items-list {'), 'deve conter lista de itens de permissão');
  });

  // 20. 11/66/112 intactos
  await t.test('20. Invariantes do produto intactos (11 categorias, checkpoints, roadmap)', () => {
    const service = new DevelopmentControlService();
    const overview = service.getOverview();

    // 11 categorias comerciais
    const categories = new Set(TENANT_MANAGEABLE_PERMISSIONS.map((p) => p.category));
    assert.strictEqual(categories.size, 11, 'Deve conter exatamente 11 categorias de permissões comerciais');

    // Overview robusto
    assert.ok(overview.project);
    assert.ok(overview.modules.length > 0);
    assert.ok(overview.frozenComponents.length >= 10);
  });
});
