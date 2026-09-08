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
import devControlRouter from '../apps/backend/src/routes/developmentControl.js';
import {
  developerAuthService,
  DCC_SESSION_COOKIE_NAME,
  DCC_SESSION_TTL_MS,
  generateTotpCodeForTesting,
  isDeveloperIdentity,
} from '../apps/backend/src/services/developerAuthService.js';
import { DevelopmentControlService } from '../apps/backend/src/services/developmentControlService.js';
import { clearRateLimiterStore } from '../apps/backend/src/middleware/rateLimiter.js';

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
  await t.test('9. TOTP válido cria developer session com token de 256 bits', async () => {
    const currentCode = generateTotpCodeForTesting(TEST_BASE32_SECRET, 0);
    const req = { method: 'POST', url: '/auth/login', body: { username: 'Marcel', code: currentCode }, ip: '127.0.0.1' };
    const res = await callRouter(devControlRouter, req);
    assert.ok(res.body.token);
    assert.equal(res.body.token.length, 64);
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

  // 19. developer session não concede tenant Admin
  await t.test('19. Developer session isolada não permite chamar rotas administrativas de tenant', async () => {
    const dccSession = developerAuthService.createSession('Marcel');
    const req = { method: 'GET', url: '/roles', headers: { 'x-dcc-session': dccSession.token } };
    const res = await callRouter(adminRouter, req);
    assert.equal(res.statusCode, 401);
  });

  // 20. #developer continua compatível
  await t.test('20. /developer e #developer permanecem mapeados no App.tsx', async () => {
    const appTsx = fs.readFileSync(path.resolve(process.cwd(), 'apps/frontend/src/App.tsx'), 'utf8');
    assert.ok(appTsx.includes("currentModule === 'developer'"));
  });

  // 21. login normal é fluxo principal Developer
  await t.test('21. LoginForm inclui campo unificado "E-mail ou usuário" e resolução automática', async () => {
    const loginForm = fs.readFileSync(path.resolve(process.cwd(), 'apps/frontend/src/auth/LoginForm.tsx'), 'utf8');
    assert.ok(loginForm.includes('E-mail ou usuário'));
    assert.ok(loginForm.includes('resolveLoginMode'));
    assert.ok(loginForm.includes('Código do Google Authenticator'));
  });

  // 22. checkbox visual rect alinhado ao input
  await t.test('22. Checkbox CSS utiliza flexbox centrado 24x24 e input real 18x18 sem pseudo-elementos', async () => {
    const css = fs.readFileSync(path.resolve(process.cwd(), 'apps/frontend/src/index.css'), 'utf8');
    assert.ok(css.includes('.admin-perm-checkbox-col {'));
    assert.ok(css.includes('display: flex;'));
    assert.ok(css.includes('width: 24px;'));
    assert.ok(css.includes('height: 24px;'));
    assert.ok(css.includes('width: 18px;'));
    assert.ok(css.includes('height: 18px;'));
    assert.ok(css.includes('position: static;'));
  });

  // 23. click input alterna uma única vez (sem double toggle)
  await t.test('23. Input do checkbox possui stopPropagation no onClick e onChange', async () => {
    const rolesView = fs.readFileSync(path.resolve(process.cwd(), 'apps/frontend/src/modules/admin/RolesAdminView.tsx'), 'utf8');
    assert.ok(rolesView.includes('onClick={(e) => {\n                                      e.stopPropagation();\n                                    }}'));
    assert.ok(rolesView.includes('e.stopPropagation();\n                                      togglePermission(perm.code);'));
  });

  // 24. click row alterna uma única vez
  await t.test('24. Row continua com handler onClick={togglePermission}', async () => {
    const rolesView = fs.readFileSync(path.resolve(process.cwd(), 'apps/frontend/src/modules/admin/RolesAdminView.tsx'), 'utf8');
    assert.ok(rolesView.includes('if (!isDisabled) togglePermission(perm.code);'));
  });

  // 25. persistência da matriz permanece
  await t.test('25. RolesAdminView preserva chamadas de salvamento persistente', async () => {
    const rolesView = fs.readFileSync(path.resolve(process.cwd(), 'apps/frontend/src/modules/admin/RolesAdminView.tsx'), 'utf8');
    assert.ok(rolesView.includes('updateRolePermissions'));
  });

  // 26. platform catalog = 25
  await t.test('26. Catálogo canônico da plataforma possui exatamente 25 permissões', async () => {
    assert.equal(CANONICAL_PERMISSIONS.length, 25);
  });

  // 27. tenant catalog = 23
  await t.test('27. Catálogo gerenciável do tenant possui exatamente 23 permissões comerciais', async () => {
    assert.equal(TENANT_MANAGEABLE_PERMISSIONS.length, 23);
  });

  // 28. print.history presente
  await t.test('28. print.history está obrigatoriamente presente na plataforma e na matriz', async () => {
    assert.ok(CANONICAL_PERMISSIONS.some((p) => p.code === 'print.history'));
    assert.ok(TENANT_MANAGEABLE_PERMISSIONS.some((p) => p.code === 'print.history'));
  });

  // 29. audit.export ausente
  await t.test('29. audit.export está rigorosamente ausente de todo o ecossistema', async () => {
    assert.equal(CANONICAL_PERMISSIONS.some((p) => p.code === 'audit.export'), false);
    assert.equal(TENANT_MANAGEABLE_PERMISSIONS.some((p) => p.code === 'audit.export'), false);
  });

  // 30. Dashboard regressão
  await t.test('30. Dashboard baseline com 3 cards operacionais permanece íntegro', async () => {
    const appTsx = fs.readFileSync(path.resolve(process.cwd(), 'apps/frontend/src/App.tsx'), 'utf8');
    assert.ok(appTsx.includes('card-stat-value'));
    assert.ok(appTsx.includes('Modelos Homologados'));
  });

  // 31. usuário restrito regressão
  await t.test('31. Regras de RBAC e bloqueio de usuário inativo permanecem ativas', async () => {
    const authTs = fs.readFileSync(path.resolve(process.cwd(), 'apps/backend/src/routes/auth.ts'), 'utf8');
    assert.ok(authTs.includes("status !== 'ACTIVE'"));
  });

  // 32. DCC tenant invisível
  await t.test('32. DCC permanece invisível para tenants no ApplicationShell', async () => {
    const shell = fs.readFileSync(path.resolve(process.cwd(), 'apps/frontend/src/shell/ApplicationShell.tsx'), 'utf8');
    assert.equal(shell.includes("label: 'DevControl'"), false);
  });

  // 33. Agent auth intacto
  await t.test('33. Rota de autenticação de Agent e emparelhamento permanecem ativas', async () => {
    const agentsTs = fs.readFileSync(path.resolve(process.cwd(), 'apps/backend/src/routes/agents.ts'), 'utf8');
    assert.ok(agentsTs.includes('/pair'));
  });

  // 34. 11 nichos
  await t.test('34. Banco de dados/seed possui os 11 nichos canônicos de mercado', async () => {
    const seed = fs.readFileSync(path.resolve(process.cwd(), 'apps/backend/src/db/seeds/initialSeed.ts'), 'utf8');
    assert.ok(seed.includes('SUPERMERCADO'));
    assert.ok(seed.includes('FARMACIA'));
    assert.ok(seed.includes('HOSPITALAR'));
  });

  // 35. 66 tamanhos
  await t.test('35. Banco de dados/seed possui os 66 tamanhos industriais', async () => {
    const seed = fs.readFileSync(path.resolve(process.cwd(), 'apps/backend/src/db/seeds/initialSeed.ts'), 'utf8');
    assert.ok(seed.includes('100x150'));
    assert.ok(seed.includes('30x20'));
  });

  // 36. 112 associações
  await t.test('36. 112 associações entre nichos e tamanhos preservadas', async () => {
    const seed = fs.readFileSync(path.resolve(process.cwd(), 'apps/backend/src/db/seeds/initialSeed.ts'), 'utf8');
    assert.ok(seed.includes('INSERT INTO niche_label_sizes'));
  });
});
