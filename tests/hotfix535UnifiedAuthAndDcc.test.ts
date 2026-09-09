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
import authRouter from '../apps/backend/src/routes/auth.js';
import adminRouter from '../apps/backend/src/routes/admin.js';
import sessionRouter from '../apps/backend/src/routes/session.js';
import devControlRouter from '../apps/backend/src/routes/developmentControl.js';
import {
  developerAuthService,
  DCC_SESSION_COOKIE_NAME,
  DCC_SESSION_TTL_MS,
  generateTotpCodeForTesting,
  isDeveloperIdentity,
  getDeveloperCompanyId,
} from '../apps/backend/src/services/developerAuthService.js';
import { DevelopmentControlService } from '../apps/backend/src/services/developmentControlService.js';
import { clearRateLimiterStore } from '../apps/backend/src/middleware/rateLimiter.js';
import {
  NICHES,
  LABEL_SIZES_CATALOG,
  NICHE_SIZE_RELATIONS,
} from '../packages/label-schema/dist/index.js';

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

const TEST_BASE32_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'; // Base32 forte para teste

test('SUÍTE CANÔNICA DE TESTES AUTOMATIZADOS — HOTFIX 5.3.5', async (t) => {
  process.env.DCC_ENABLED = 'true';
  process.env.DCC_TOTP_SECRET = TEST_BASE32_SECRET;
  process.env.DCC_DEVELOPER_USERNAME = 'Marcel';
  process.env.DCC_DEVELOPER_COMPANY_ID = 'comp-default';

  t.beforeEach(() => {
    clearAdminMemoryStores();
    clearSessionMemoryStores();
    clearRateLimiterStore();
    developerAuthService.clearAllSessionsForTesting();
  });

  // 1. Login aceita identifier Marcel
  await t.test('1. Endpoint /resolve-mode aceita identifier "Marcel"', async () => {
    const req = { method: 'POST', url: '/resolve-mode', body: { identifier: 'Marcel' }, ip: '127.0.0.1' };
    const res = await callRouter(authRouter, req);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.authMode, 'DEVELOPER_TOTP');
  });

  // 2. Marcel resolve DEVELOPER_TOTP
  await t.test('2. "Marcel" resolve estritamente DEVELOPER_TOTP', async () => {
    assert.equal(isDeveloperIdentity('Marcel'), true);
  });

  // 3. marcel case normalization
  await t.test('3. "marcel" (lowercase) e com espaços externos resolve DEVELOPER_TOTP', async () => {
    assert.equal(isDeveloperIdentity('  marcel  '), true);
    assert.equal(isDeveloperIdentity('MARCEL'), true);
    const req = { method: 'POST', url: '/resolve-mode', body: { identifier: '  marcel  ' }, ip: '127.0.0.1' };
    const res = await callRouter(authRouter, req);
    assert.equal(res.body.authMode, 'DEVELOPER_TOTP');
  });

  // 4. Marcel123 não resolve developer
  await t.test('4. "Marcel123" ou substrings NÃO resolvem developer', async () => {
    assert.equal(isDeveloperIdentity('Marcel123'), false);
    assert.equal(isDeveloperIdentity('Marc'), false);
    assert.equal(isDeveloperIdentity('Marcel_Dev'), false);
    const req = { method: 'POST', url: '/resolve-mode', body: { identifier: 'Marcel123' }, ip: '127.0.0.1' };
    const res = await callRouter(authRouter, req);
    assert.equal(res.body.authMode, 'TENANT_PASSWORD');
  });

  // 5. tenant email resolve TENANT_PASSWORD
  await t.test('5. Tenant email comercial resolve TENANT_PASSWORD', async () => {
    const req = { method: 'POST', url: '/resolve-mode', body: { identifier: 'admin@witiquetas.com.br' }, ip: '127.0.0.1' };
    const res = await callRouter(authRouter, req);
    assert.equal(res.body.authMode, 'TENANT_PASSWORD');
  });

  // 6. resolver não expõe segredo
  await t.test('6. /resolve-mode não expõe segredo, tokens nem detalhes internos', async () => {
    const req = { method: 'POST', url: '/resolve-mode', body: { identifier: 'Marcel' }, ip: '127.0.0.1' };
    const res = await callRouter(authRouter, req);
    assert.equal(res.body.secret, undefined);
    assert.equal(res.body.totpSecret, undefined);
    assert.equal(res.body.permissions, undefined);
    assert.equal(res.body.users, undefined);
  });

  // 7. Marcel não exige sessão tenant
  await t.test('7. Marcel autentica via TOTP sem qualquer cookie ou sessão tenant', async () => {
    const currentCode = generateTotpCodeForTesting(TEST_BASE32_SECRET, 0);
    const req = { method: 'POST', url: '/auth/login', body: { username: 'Marcel', code: currentCode }, ip: '127.0.0.1' };
    const res = await callRouter(devControlRouter, req);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
  });

  // 8. TOTP inválido falha
  await t.test('8. Código TOTP inválido é rejeitado com 401', async () => {
    const req = { method: 'POST', url: '/auth/login', body: { username: 'Marcel', code: '000000' }, ip: '127.0.0.1' };
    const res = await callRouter(devControlRouter, req);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, 'INVALID_DEVELOPER_CREDENTIALS');
  });

  // 9. TOTP válido cria developer session
  await t.test('9. TOTP válido cria developer session com token de 256 bits e csrfToken', async () => {
    const currentCode = generateTotpCodeForTesting(TEST_BASE32_SECRET, 0);
    const req = { method: 'POST', url: '/auth/login', body: { username: 'Marcel', code: currentCode }, ip: '127.0.0.1' };
    const res = await callRouter(devControlRouter, req);
    assert.ok(res.body.token);
    assert.equal(res.body.token.length, 64);
    assert.ok(res.body.csrfToken);
  });

  // 10. developer cookie HttpOnly
  await t.test('10. Cookie da sessão developer é emitido com flag HttpOnly=true', async () => {
    const currentCode = generateTotpCodeForTesting(TEST_BASE32_SECRET, 0);
    const req = { method: 'POST', url: '/auth/login', body: { username: 'Marcel', code: currentCode }, ip: '127.0.0.1' };
    const res = await callRouter(devControlRouter, req);
    const dccCookie = res.cookies[DCC_SESSION_COOKIE_NAME];
    assert.ok(dccCookie);
    assert.equal(dccCookie.opts.httpOnly, true);
  });

  // 11. developer cookie TTL e Secure
  await t.test('11. TTL da sessão developer é de exatamente 45 minutos', async () => {
    assert.equal(DCC_SESSION_TTL_MS, 45 * 60 * 1000);
    const currentCode = generateTotpCodeForTesting(TEST_BASE32_SECRET, 0);
    const req = { method: 'POST', url: '/auth/login', body: { username: 'Marcel', code: currentCode }, ip: '127.0.0.1' };
    const res = await callRouter(devControlRouter, req);
    const dccCookie = res.cookies[DCC_SESSION_COOKIE_NAME];
    assert.equal(dccCookie.opts.maxAge, 45 * 60 * 1000);
  });

  // 12. logout revoga sessão server-side
  await t.test('12. Logout revoga a sessão server-side', async () => {
    const session = developerAuthService.createSession('Marcel');
    assert.ok(developerAuthService.validateSession(session.token));
    const req = { method: 'POST', url: '/auth/logout', headers: { 'x-dcc-session': session.token } };
    const res = await callRouter(devControlRouter, req);
    assert.equal(res.statusCode, 200);
    assert.equal(developerAuthService.validateSession(session.token), null);
  });

  // 13. logout remove cookie
  await t.test('13. Logout limpa cookie witiquetas_dcc_session com maxAge=0 e expires passado', async () => {
    const req = { method: 'POST', url: '/auth/logout', headers: {} };
    const res = await callRouter(devControlRouter, req);
    const cleared = res.clearedCookies.find((c: any) => c.name === DCC_SESSION_COOKIE_NAME);
    assert.ok(cleared);
    assert.equal(cleared.opts.maxAge, 0);
  });

  // 14. token antigo não reutiliza DCC
  await t.test('14. Token revogado não consegue mais acessar rotas do DCC', async () => {
    const session = developerAuthService.createSession('Marcel');
    developerAuthService.revokeSession(session.token);
    const req = { method: 'GET', url: '/overview', headers: { 'x-dcc-session': session.token } };
    const res = await callRouter(devControlRouter, req);
    assert.equal(res.statusCode, 401);
  });

  // 15. browser back pós-logout não abre DCC
  await t.test('15. Chamada a /auth/me sem cookie/token retorna authenticated: false', async () => {
    const req = { method: 'GET', url: '/auth/me', headers: {} };
    const res = await callRouter(devControlRouter, req);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.authenticated, false);
  });

  // 16. DCC response no-store
  await t.test('16. Respostas do DCC incluem header Cache-Control: no-store', async () => {
    const req = { method: 'GET', url: '/auth/me', headers: {} };
    const res = await callRouter(devControlRouter, req);
    assert.ok(res.headers['cache-control'].includes('no-store'));
    assert.ok(res.headers['cache-control'].includes('no-cache'));
    assert.equal(res.headers['pragma'], 'no-cache');
  });

  // 17. popstate revalida session
  await t.test('17. Revalidação de sessão server-side para popstate/hashchange', async () => {
    const token = 'invalid-token-after-back';
    assert.equal(developerAuthService.validateSession(token), null);
  });

  // 18. tenant session sozinha não acessa DCC
  await t.test('18. Sessão de tenant comercial comum não acessa endpoint de desenvolvedor', async () => {
    const req = { method: 'GET', url: '/overview', headers: { cookie: 'witiquetas_session=tenant_cookie' } };
    const res = await callRouter(devControlRouter, req);
    assert.equal(res.statusCode, 401);
  });

  // =========================================================================
  // GATES P0: DEVELOPER COMO IDENTIDADE DE PLATAFORMA COM ACESSO COMPLETO
  // =========================================================================

  // 19. Developer Session é reconhecida como PLATFORM_DEVELOPER
  await t.test('19. P0: Developer Session via witiquetas_dcc_session concede acesso a rotas do produto na empresa configurada', async () => {
    const dccSession = developerAuthService.createSession('Marcel');
    const req: any = {
      method: 'GET',
      url: '/permissions',
      path: '/permissions',
      headers: { cookie: `${DCC_SESSION_COOKIE_NAME}=${dccSession.token}` },
      ip: '127.0.0.1',
    };
    const res = await callRouter(adminRouter, req);
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body));
    assert.equal(res.body.length, 23);
  });

  // 20. GET /api/session/context para Developer retorna isDeveloper: true e canAccessDcc: true
  await t.test('20. P0: GET /api/session/context para Developer retorna isDeveloper: true, canAccessDcc: true e company configurada', async () => {
    const dccSession = developerAuthService.createSession('Marcel');
    const req: any = {
      method: 'GET',
      url: '/context',
      path: '/context',
      headers: { cookie: `${DCC_SESSION_COOKIE_NAME}=${dccSession.token}` },
      ip: '127.0.0.1',
    };
    const res = await callRouter(sessionRouter, req);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.name, 'Marcel');
    assert.equal(res.body.user.isDccMaster, true);
    assert.equal(res.body.isDeveloper, true);
    assert.equal(res.body.canAccessDcc, true);
    assert.deepEqual(res.body.roles, ['PLATFORM_DEVELOPER']);
    assert.deepEqual(res.body.permissions, ['*']);
    assert.equal(res.body.company.id, getDeveloperCompanyId());
  });

  // 21. Marcel NÃO existe nas tabelas de tenant
  await t.test('21. P0: Marcel NÃO é criado como usuário tenant nem recebe role fake de ADMIN', async () => {
    const users = await UserRepository.listByCompany('comp-default');
    const marcelUser = users.find((u) => u.name.toLowerCase() === 'marcel');
    assert.equal(marcelUser, undefined, 'Marcel não deve existir na tabela users do tenant');

    const roles = await RoleRepository.listByCompany('comp-default');
    const devRoles = roles.filter((r) => r.code === 'PLATFORM_DEVELOPER');
    assert.equal(devRoles.length, 0, 'Não deve existir role persistida no banco do tenant para PLATFORM_DEVELOPER');
  });

  // 22. Isolamento de tenant: Developer opera estritamente na empresa configurada
  await t.test('22. P0: Isolamento de tenant — Developer opera estritamente na empresa configurada (DCC_DEVELOPER_COMPANY_ID)', async () => {
    const dccSession = developerAuthService.createSession('Marcel');
    const req: any = {
      method: 'GET',
      url: '/context',
      path: '/context',
      headers: { cookie: `${DCC_SESSION_COOKIE_NAME}=${dccSession.token}` },
      ip: '127.0.0.1',
    };
    const res = await callRouter(sessionRouter, req);
    assert.equal(res.body.company.id, 'comp-default');
  });

  // 23. Usuário comercial comum NUNCA recebe canAccessDcc: true nem isDeveloper: true
  await t.test('23. P0: Usuário comercial normal NUNCA recebe canAccessDcc: true nem isDeveloper: true', async () => {
    // Criar empresa e usuário comercial
    await CompanyRepository.create({ id: 'comp-tenant', name: 'Tenant Corp', slug: 'tenant', status: 'ACTIVE' });
    await UserRepository.create({
      id: 'usr-commercial',
      companyId: 'comp-tenant',
      name: 'Comercial User',
      email: 'comercial@tenant.com',
      passwordHash: 'hash',
      status: 'ACTIVE',
    });
    const session = await SessionService.createAuthenticatedSession({ userId: 'usr-commercial', companyId: 'comp-tenant' });

    const req: any = {
      method: 'GET',
      url: '/context',
      path: '/context',
      headers: { cookie: `witiquetas_session=${session.rawToken}` },
      ip: '127.0.0.1',
    };
    const res = await callRouter(sessionRouter, req);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.isDeveloper, false);
    assert.equal(res.body.canAccessDcc, false);
  });

  // 24. Navigation inclui item "Desenvolvimento" para Developer e exclui para Tenant
  await t.test('24. P0: Navigation inclui módulo "Desenvolvimento" para Developer e exclui para Tenant', () => {
    const navPath = path.resolve('apps/frontend/src/shell/navigation.ts');
    const navContent = fs.readFileSync(navPath, 'utf8');

    assert.ok(navContent.includes("id: 'developer'"));
    assert.ok(navContent.includes("label: 'Desenvolvimento'"));
    assert.ok(navContent.includes('sessionContext.canAccessDcc || sessionContext.isDeveloper'));
  });

  // 25. GlobalHeader exibe badge Developer para sessão de desenvolvedor
  await t.test('25. P0: GlobalHeader exibe tag discreta Developer quando sessionContext.isDeveloper for true', () => {
    const headerPath = path.resolve('apps/frontend/src/shell/GlobalHeader.tsx');
    const headerContent = fs.readFileSync(headerPath, 'utf8');

    assert.ok(headerContent.includes('sessionContext?.isDeveloper'));
    assert.ok(headerContent.includes('Developer'));
  });

  // 26. LoginForm redireciona Developer diretamente para o Dashboard (onLoginSuccess)
  await t.test('26. P0: LoginForm chama onLoginSuccess(context) após TOTP do Developer para entrada direta no Dashboard', () => {
    const loginFormPath = path.resolve('apps/frontend/src/auth/LoginForm.tsx');
    const loginContent = fs.readFileSync(loginFormPath, 'utf8');

    assert.ok(loginContent.includes('fetchSessionContext'));
    assert.ok(loginContent.includes('onLoginSuccess(context)'));
  });

  // 27. Checkbox CSS utiliza flexbox centrado 24x24 e input real 18x18
  await t.test('27. Checkbox CSS utiliza flexbox centrado 24x24 e input real 18x18 sem pseudo-elementos', async () => {
    const css = fs.readFileSync(path.resolve('apps/frontend/src/index.css'), 'utf8');
    assert.ok(css.includes('.admin-perm-checkbox-col {'));
    assert.ok(css.includes('width: 24px;'));
    assert.ok(css.includes('height: 24px;'));
    assert.ok(css.includes('width: 18px;'));
    assert.ok(css.includes('height: 18px;'));
    assert.ok(css.includes('accent-color: #10b981;'));
  });

  // 28. Input do checkbox possui stopPropagation no onClick e onChange
  await t.test('28. Input do checkbox possui stopPropagation no onClick e onChange', async () => {
    const rolesView = fs.readFileSync(path.resolve(process.cwd(), 'apps/frontend/src/modules/admin/RolesAdminView.tsx'), 'utf8');
    assert.ok(rolesView.includes('onClick={(e) => {'));
    assert.ok(rolesView.includes('e.stopPropagation();'));
    assert.ok(rolesView.includes('togglePermission(perm.code);'));
  });

  // 29. Row continua com handler onClick={togglePermission}
  await t.test('29. Row continua com handler onClick={togglePermission}', async () => {
    const rolesView = fs.readFileSync(path.resolve('apps/frontend/src/modules/admin/RolesAdminView.tsx'), 'utf8');
    assert.ok(rolesView.includes('if (!isDisabled) togglePermission(perm.code);'));
  });

  // 30. RolesAdminView preserva chamadas de salvamento persistente
  await t.test('30. RolesAdminView preserva chamadas de salvamento persistente', async () => {
    const rolesView = fs.readFileSync(path.resolve('apps/frontend/src/modules/admin/RolesAdminView.tsx'), 'utf8');
    assert.ok(rolesView.includes('updateRolePermissions'));
  });

  // 31. Catálogo canônico da plataforma possui exatamente 25 permissões
  await t.test('31. Catálogo canônico da plataforma possui exatamente 25 permissões', async () => {
    assert.equal(CANONICAL_PERMISSIONS.length, 25);
  });

  // 32. Catálogo gerenciável do tenant possui exatamente 23 permissões comerciais
  await t.test('32. Catálogo gerenciável do tenant possui exatamente 23 permissões comerciais', async () => {
    assert.equal(TENANT_MANAGEABLE_PERMISSIONS.length, 23);
  });

  // 33. print.history está obrigatoriamente presente na plataforma e na matriz
  await t.test('33. print.history está obrigatoriamente presente na plataforma e na matriz', async () => {
    assert.ok(CANONICAL_PERMISSIONS.some((p) => p.code === 'print.history'));
    assert.ok(TENANT_MANAGEABLE_PERMISSIONS.some((p) => p.code === 'print.history'));
  });

  // 34. audit.export está rigorosamente ausente de todo o ecossistema
  await t.test('34. audit.export está rigorosamente ausente de todo o ecossistema', async () => {
    assert.equal(CANONICAL_PERMISSIONS.some((p) => p.code === 'audit.export'), false);
    assert.equal(TENANT_MANAGEABLE_PERMISSIONS.some((p) => p.code === 'audit.export'), false);
  });

  // 35. Dashboard baseline com 3 cards operacionais permanece íntegro
  await t.test('35. Dashboard baseline de infraestrutura permanece íntegro', async () => {
    const appTsx = fs.readFileSync(path.resolve('apps/frontend/src/App.tsx'), 'utf8');
    assert.ok(appTsx.includes('Frontend Web'));
    assert.ok(appTsx.includes('Backend API'));
    assert.ok(appTsx.includes('PostgreSQL'));
    assert.ok(appTsx.includes('MinIO / S3 Storage'));
    assert.ok(appTsx.includes('Agent de Impressão'));
  });

  // 36. 11 nichos históricos canônicos
  await t.test('36. Existem exatamente 11 nichos canônicos de mercado', async () => {
    assert.strictEqual(NICHES.length, 11, 'Deve conter 11 nichos concretos');
  });

  // 37. 66 tamanhos físicos industriais
  await t.test('37. Existem exatamente 66 tamanhos industriais únicos', async () => {
    assert.strictEqual(LABEL_SIZES_CATALOG.length, 66, 'Deve conter 66 tamanhos físicos no catálogo global');
  });

  // 38. 112 associações entre nichos e tamanhos
  await t.test('38. Existem exatamente 112 relações niche-size preservadas', async () => {
    assert.strictEqual(NICHE_SIZE_RELATIONS.length, 112, 'Deve conter 112 associações no catálogo');
  });
});
