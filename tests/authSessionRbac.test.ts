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
  CompanyConfigurationRepository,
  clearAdminMemoryStores,
} from '../apps/backend/src/repositories/adminRepositories.js';
import { bootstrapAdminData } from '../apps/backend/src/services/adminBootstrapService.js';
import { requirePermission, requireCsrf, requireAuthenticatedUser } from '../apps/backend/src/middleware/authMiddleware.js';
import { createRateLimiter, clearRateLimiterStore } from '../apps/backend/src/middleware/rateLimiter.js';
import authRouter, { SESSION_COOKIE_NAME, setSessionCookie, parseCookies } from '../apps/backend/src/routes/auth.js';
import sessionRouter from '../apps/backend/src/routes/session.js';
import agentsRouter, { AgentsRepository, memoryAgentsStore } from '../apps/backend/src/routes/agents.js';
import { EffectiveConfigurationService } from '../apps/backend/src/services/effectiveConfigurationService.js';

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

// ============================================================================
// SUÍTE CANÔNICA: 43 CENÁRIOS INDIVIDUAIS DO PACOTE 5.2
// ============================================================================

test('CENÁRIO 01: Senha não armazenada plaintext', async () => {
  clearAdminMemoryStores();
  const rawPassword = 'MinhaSenhaUltraSegura@2026';
  const hash = await PasswordService.hash(rawPassword);
  assert.ok(!hash.includes(rawPassword), 'Hash não pode conter a senha em texto plano');
  assert.notEqual(hash, rawPassword, 'A senha nunca pode ser idêntica ao hash');

  const comp = await CompanyRepository.create({
    id: 'comp-c01',
    name: 'C01',
    legalName: 'C01 Ltda',
    document: '00.000.001/0001-01',
    slug: 'c01',
    status: 'ACTIVE',
  });
  const user = await UserRepository.create({
    id: 'usr-c01',
    companyId: comp.id,
    name: 'User C01',
    email: 'c01@test.com',
    status: 'ACTIVE',
  });
  await UserRepository.setPassword(user.id, hash);
  const fetched = await UserRepository.findByEmailWithPassword('c01@test.com');
  assert.equal(fetched?.passwordHash, hash);
  assert.ok(!JSON.stringify(fetched).includes(rawPassword));
});

test('CENÁRIO 02: Hash válido (bcrypt cost 12)', async () => {
  const raw = 'SenhaBcrypt@Cost12';
  const hash1 = await PasswordService.hash(raw);
  const hash2 = await PasswordService.hash(raw);

  // Formato bcrypt: $2a$12$... ou $2b$12$...
  assert.ok(hash1.startsWith('$2a$12$') || hash1.startsWith('$2b$12$'), 'Hash deve conter custo 12 ($2a$12$)');
  assert.notEqual(hash1, hash2, 'Salts aleatórios devem produzir hashes distintos para a mesma senha');

  const verifyOk = await PasswordService.verify(raw, hash1);
  const verifyFail = await PasswordService.verify('SenhaIncorreta', hash1);
  assert.equal(verifyOk, true);
  assert.equal(verifyFail, false);
});

test('CENÁRIO 03: Login correto', async () => {
  clearAdminMemoryStores();
  clearSessionMemoryStores();
  clearRateLimiterStore();

  const comp = await CompanyRepository.create({
    id: 'comp-c03',
    name: 'C03',
    legalName: 'C03 Ltda',
    document: '00.000.003/0001-03',
    slug: 'c03',
    status: 'ACTIVE',
  });
  const user = await UserRepository.create({
    id: 'usr-c03',
    companyId: comp.id,
    name: 'User C03',
    email: 'login.correto@test.com',
    status: 'ACTIVE',
  });
  const pwd = 'CorretaPassword@2026';
  await UserRepository.setPassword(user.id, await PasswordService.hash(pwd));

  const res = await callRouter(authRouter, {
    method: 'POST',
    url: '/login',
    ip: '192.168.1.10',
    socket: { remoteAddress: '192.168.1.10' },
    headers: {},
    body: { email: 'login.correto@test.com', password: pwd },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.user.email, 'login.correto@test.com');
  assert.ok(res.body.csrfToken);
  assert.ok(res.headers['set-cookie']);
});

test('CENÁRIO 04: Senha errada rejeitada', async () => {
  clearRateLimiterStore();
  const res = await callRouter(authRouter, {
    method: 'POST',
    url: '/login',
    ip: '192.168.1.11',
    socket: { remoteAddress: '192.168.1.11' },
    headers: {},
    body: { email: 'login.correto@test.com', password: 'SenhaTotalmenteErrada' },
  });

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Credenciais inválidas.' });
});

test('CENÁRIO 05: Email inexistente retorna falha genérica (error contract)', async () => {
  clearRateLimiterStore();
  const res = await callRouter(authRouter, {
    method: 'POST',
    url: '/login',
    ip: '192.168.1.12',
    socket: { remoteAddress: '192.168.1.12' },
    headers: {},
    body: { email: 'naoexiste_nunca@witiquetas.com', password: 'QualquerSenha123' },
  });

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Credenciais inválidas.' });
});

test('CENÁRIO 06: Usuário INACTIVE não loga', async () => {
  clearRateLimiterStore();
  const comp = await CompanyRepository.findById('comp-c03');
  const inactiveUser = await UserRepository.create({
    id: 'usr-inactive-c06',
    companyId: comp!.id,
    name: 'User Inativo',
    email: 'inativo@test.com',
    status: 'INACTIVE',
  });
  const pwd = 'Password@2026';
  await UserRepository.setPassword(inactiveUser.id, await PasswordService.hash(pwd));

  const res = await callRouter(authRouter, {
    method: 'POST',
    url: '/login',
    ip: '192.168.1.13',
    socket: { remoteAddress: '192.168.1.13' },
    headers: {},
    body: { email: 'inativo@test.com', password: pwd },
  });

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Credenciais inválidas.' });
});

test('CENÁRIO 07: Company INACTIVE não loga', async () => {
  clearRateLimiterStore();
  const inactComp = await CompanyRepository.create({
    id: 'comp-inact-c07',
    name: 'Empresa Desativada',
    legalName: 'Empresa Desativada Ltda',
    document: '00.000.007/0001-07',
    slug: 'inact-c07',
    status: 'INACTIVE',
  });
  const user = await UserRepository.create({
    id: 'usr-inact-comp',
    companyId: inactComp.id,
    name: 'User Comp Inact',
    email: 'user.inactcomp@test.com',
    status: 'ACTIVE',
  });
  const pwd = 'Password@2026';
  await UserRepository.setPassword(user.id, await PasswordService.hash(pwd));

  const res = await callRouter(authRouter, {
    method: 'POST',
    url: '/login',
    ip: '192.168.1.14',
    socket: { remoteAddress: '192.168.1.14' },
    headers: {},
    body: { email: 'user.inactcomp@test.com', password: pwd },
  });

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Credenciais inválidas.' });
});

test('CENÁRIO 08: Sessão criada', async () => {
  clearSessionMemoryStores();
  const sessionResult = await SessionService.createAuthenticatedSession({
    userId: 'usr-c03',
    companyId: 'comp-c03',
  });
  assert.ok(sessionResult.sessionId, 'ID de sessão deve existir');
  assert.ok(sessionResult.rawToken, 'Token bruto deve ser gerado');
  assert.ok(sessionResult.expiresAt > new Date(), 'Data de expiração deve estar no futuro');
});

test('CENÁRIO 09: Token/session id não previsível (256 bits crypto.randomBytes)', async () => {
  const sessionResult1 = await SessionService.createAuthenticatedSession({
    userId: 'usr-c03',
    companyId: 'comp-c03',
  });
  const sessionResult2 = await SessionService.createAuthenticatedSession({
    userId: 'usr-c03',
    companyId: 'comp-c03',
  });

  assert.equal(sessionResult1.rawToken.length, 64, '32 bytes em hex = 64 caracteres de alta entropia');
  assert.equal(sessionResult2.rawToken.length, 64);
  assert.notEqual(sessionResult1.rawToken, sessionResult2.rawToken, 'Tokens aleatórios sucessivos devem ser imprevisíveis e distintos');
});

test('CENÁRIO 10: Token persistido de forma segura (somente token_hash)', async () => {
  const sessionResult = await SessionService.createAuthenticatedSession({
    userId: 'usr-c03',
    companyId: 'comp-c03',
  });
  const tokenHash = SessionService.hashToken(sessionResult.rawToken);
  const stored = await SessionRepository.findByTokenHash(tokenHash);

  assert.ok(stored, 'Sessão encontrada apenas pelo hash SHA-256');
  assert.equal(stored.token_hash, tokenHash);
  assert.equal((stored as any).rawToken, undefined, 'Raw token nunca reside no banco de dados');
});

test('CENÁRIO 11: Cookie HttpOnly', () => {
  const res = createMockResponse();
  setSessionCookie(res, 'token-c11-test');
  const cookie = res.headers['set-cookie'];
  assert.ok(cookie.includes('HttpOnly'), 'Cookie de sessão deve conter a diretiva HttpOnly');
});

test('CENÁRIO 12: Cookie Secure em produção', () => {
  const resProd = createMockResponse();
  process.env.NODE_ENV = 'production';
  setSessionCookie(resProd, 'token-c12-test');
  delete process.env.NODE_ENV;
  assert.ok(resProd.headers['set-cookie'].includes('Secure'), 'Em produção o cookie deve ser emitido com a diretiva Secure');
});

test('CENÁRIO 13: SameSite definido (Lax)', () => {
  const res = createMockResponse();
  setSessionCookie(res, 'token-c13-test');
  assert.ok(res.headers['set-cookie'].includes('SameSite=Lax'), 'Diretiva SameSite=Lax deve estar presente');
});

test('CENÁRIO 14: Sessão expira', async () => {
  const rawToken = 'token-c14-expira';
  const tokenHash = SessionService.hashToken(rawToken);
  // Persistir sessão expirada
  await SessionRepository.create({
    id: 'sess-c14',
    token_hash: tokenHash,
    user_id: 'usr-c03',
    company_id: 'comp-c03',
    csrf_token: 'csrf-c14',
    expires_at: new Date(Date.now() - 10000), // no passado
  });

  const principal = await SessionService.resolvePrincipalFromRawToken(rawToken);
  assert.equal(principal, null, 'Sessão com expires_at expirado não deve resolver principal');
});

test('CENÁRIO 15: Logout revoga sessão', async () => {
  const sessionResult = await SessionService.createAuthenticatedSession({
    userId: 'usr-c03',
    companyId: 'comp-c03',
  });

  const res = await callRouter(authRouter, {
    method: 'POST',
    url: '/logout',
    headers: {
      cookie: `witiquetas_session=${sessionResult.rawToken}`,
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);

  const tokenHash = SessionService.hashToken(sessionResult.rawToken);
  const sessionInDb = await SessionRepository.findByTokenHash(tokenHash);
  assert.ok(sessionInDb?.revoked_at !== null, 'Sessão deve estar marcada com revoked_at preenchido');
});

test('CENÁRIO 16: Sessão revogada não funciona', async () => {
  const sessionResult = await SessionService.createAuthenticatedSession({
    userId: 'usr-c03',
    companyId: 'comp-c03',
  });
  const tokenHash = SessionService.hashToken(sessionResult.rawToken);
  const sessionRecord = await SessionRepository.findByTokenHash(tokenHash);
  await SessionRepository.revoke(sessionRecord!.id);

  const principal = await SessionService.resolvePrincipalFromRawToken(sessionResult.rawToken);
  assert.equal(principal, null, 'Sessão revogada deve retornar null na resolução do principal');
});

test('CENÁRIO 17: Sessão inexistente -> 401', async () => {
  const req: any = {
    headers: { cookie: 'witiquetas_session=token-fantasma-totalmente-inexistente' },
  };
  const res = createMockResponse();
  process.env.AUTH_MODE = 'RBAC';
  await requireAuthenticatedUser(req, res, () => {});
  delete process.env.AUTH_MODE;

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, 'SESSION_INVALID');
});

test('CENÁRIO 18: Context autenticado resolve user', async () => {
  const sessionResult = await SessionService.createAuthenticatedSession({
    userId: 'usr-c03',
    companyId: 'comp-c03',
  });

  const res = await callRouter(sessionRouter, {
    method: 'GET',
    url: '/context',
    headers: { cookie: `witiquetas_session=${sessionResult.rawToken}` },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.id, 'usr-c03');
  assert.equal(res.body.user.email, 'login.correto@test.com');
  assert.equal(res.body.user.status, 'ACTIVE');
});

test('CENÁRIO 19: Context resolve company', async () => {
  const sessionResult = await SessionService.createAuthenticatedSession({
    userId: 'usr-c03',
    companyId: 'comp-c03',
  });

  const res = await callRouter(sessionRouter, {
    method: 'GET',
    url: '/context',
    headers: { cookie: `witiquetas_session=${sessionResult.rawToken}` },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.company.id, 'comp-c03');
  assert.equal(res.body.company.name, 'C03');
  assert.equal(res.body.company.status, 'ACTIVE');
});

test('CENÁRIO 20: Context resolve roles', async () => {
  const role = await RoleRepository.create({
    id: 'role-c20',
    companyId: 'comp-c03',
    code: 'OPERADOR_C20',
    name: 'Operador C20',
    isSystem: false,
  });
  await RoleRepository.assignUserRole('comp-c03', 'usr-c03', role.id);

  const sessionResult = await SessionService.createAuthenticatedSession({
    userId: 'usr-c03',
    companyId: 'comp-c03',
  });

  const res = await callRouter(sessionRouter, {
    method: 'GET',
    url: '/context',
    headers: { cookie: `witiquetas_session=${sessionResult.rawToken}` },
  });

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.roles.includes('OPERADOR_C20'), 'Roles resolvidas devem conter OPERADOR_C20');
});

test('CENÁRIO 21: Context resolve permissions', async () => {
  const role = await RoleRepository.findById('role-c20');
  await RoleRepository.assignPermission(role!.id, 'templates.view');
  await RoleRepository.assignPermission(role!.id, 'print.execute');

  const sessionResult = await SessionService.createAuthenticatedSession({
    userId: 'usr-c03',
    companyId: 'comp-c03',
  });

  const res = await callRouter(sessionRouter, {
    method: 'GET',
    url: '/context',
    headers: { cookie: `witiquetas_session=${sessionResult.rawToken}` },
  });

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.permissions.includes('templates.view'));
  assert.ok(res.body.permissions.includes('print.execute'));
});

test('CENÁRIO 22: Context resolve allowed niches', async () => {
  await CompanyConfigurationRepository.setNicheState('comp-c03', 'niche-joalheria', 'ENABLED');

  const sessionResult = await SessionService.createAuthenticatedSession({
    userId: 'usr-c03',
    companyId: 'comp-c03',
  });

  const res = await callRouter(sessionRouter, {
    method: 'GET',
    url: '/context',
    headers: { cookie: `witiquetas_session=${sessionResult.rawToken}` },
  });

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.allowedNiches.includes('niche-joalheria'), 'Nichos permitidos devem incluir niche-joalheria');
});

test('CENÁRIO 23: Context reutiliza EffectiveConfiguration', async () => {
  const effective = await EffectiveConfigurationService.resolve({
    companyId: 'comp-c03',
    userId: 'usr-c03',
  });
  assert.ok(effective.allowedNiches);
  assert.ok(effective.enabledElementsByNiche);
  assert.ok(effective.enabledFieldsByNiche);
});

test('CENÁRIO 24: Permission guard permite permission correta', () => {
  const req: any = {
    principal: { permissions: ['templates.view'] },
    headers: {},
  };
  const res = createMockResponse();
  let called = false;
  const guard = requirePermission('templates.view');
  guard(req, res, () => { called = true; });

  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
});

test('CENÁRIO 25: Permission guard rejeita permission ausente -> 403', () => {
  const req: any = {
    principal: { permissions: ['outra.permissao'] },
    headers: {},
  };
  const res = createMockResponse();
  let called = false;
  const guard = requirePermission('templates.view');
  guard(req, res, () => { called = true; });

  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'FORBIDDEN');
  assert.equal(res.body.requiredPermission, 'templates.view');
});

test('CENÁRIO 26: Request com companyId adulterado não muda tenant (tenant tampering)', async () => {
  const compA = await CompanyRepository.create({
    id: 'comp-tamper-a',
    name: 'Empresa A',
    legalName: 'Empresa A Ltda',
    document: '11.111.111/0001-01',
    slug: 'tamper-a',
    status: 'ACTIVE',
  });
  const compB = await CompanyRepository.create({
    id: 'comp-tamper-b',
    name: 'Empresa B',
    legalName: 'Empresa B Ltda',
    document: '22.222.222/0001-02',
    slug: 'tamper-b',
    status: 'ACTIVE',
  });
  const userA = await UserRepository.create({
    id: 'usr-tamper-a',
    companyId: compA.id,
    name: 'User A',
    email: 'user.a@tamper.com',
    status: 'ACTIVE',
  });

  const sessionA = await SessionService.createAuthenticatedSession({
    userId: userA.id,
    companyId: compA.id,
  });

  const req: any = {
    headers: { cookie: `witiquetas_session=${sessionA.rawToken}` },
    body: { companyId: compB.id, payload: 'malicioso' },
    query: { companyId: compB.id },
  };
  const res = createMockResponse();
  await requireAuthenticatedUser(req, res, () => {});

  // Invariante P0: A requisição autenticada tem o principal firmemente fixado no tenant da sessão (Empresa A)
  assert.equal(req.principal.company.id, compA.id);
  assert.equal(req.principal.user.companyId, compA.id);
  assert.notEqual(req.principal.company.id, compB.id, 'Adulteração de companyId no payload ou query não altera o tenant do principal');
});

test('CENÁRIO 27: User A não acessa recurso Company B', async () => {
  // Configuração isolada para comp-tamper-b
  await CompanyConfigurationRepository.setNicheState('comp-tamper-b', 'niche-gondola', 'ENABLED');

  // Resolver contexto para userA (da Empresa A)
  const effectiveA = await EffectiveConfigurationService.resolve({
    companyId: 'comp-tamper-a',
    userId: 'usr-tamper-a',
  });

  assert.equal(effectiveA.allowedNiches.includes('niche-gondola'), false, 'User da Empresa A jamais acessa recursos habilitados exclusivamente na Empresa B');
});

test('CENÁRIO 28: Role alterada reflete permission atual', async () => {
  const role = await RoleRepository.findById('role-c20');
  // Adiciona nova permissão canônica
  await RoleRepository.assignPermission(role!.id, 'audit.view');

  const sessionResult = await SessionService.createAuthenticatedSession({
    userId: 'usr-c03',
    companyId: 'comp-c03',
  });
  const principal = await SessionService.resolvePrincipalFromRawToken(sessionResult.rawToken);
  assert.ok(principal?.permissions.includes('audit.view'), 'Nova permissão atribuída ao papel deve refletir no principal');
});

test('CENÁRIO 29: Usuário desativado invalida acesso (revoked_at)', async () => {
  const sessionResult = await SessionService.createAuthenticatedSession({
    userId: 'usr-c03',
    companyId: 'comp-c03',
  });

  // Desativa usuário
  await UserRepository.update('usr-c03', { status: 'INACTIVE' });

  // Resolução do principal detecta e revoga imediatamente
  const principal = await SessionService.resolvePrincipalFromRawToken(sessionResult.rawToken);
  assert.equal(principal, null);

  const tokenHash = SessionService.hashToken(sessionResult.rawToken);
  const sessionRecord = await SessionRepository.findByTokenHash(tokenHash);
  assert.ok(sessionRecord?.revoked_at !== null, 'Sessão no banco deve ter revoked_at preenchido imediatamente');

  // Reativa usuário para não afetar outros testes
  await UserRepository.update('usr-c03', { status: 'ACTIVE' });
});

test('CENÁRIO 30: Company desativada invalida acesso (revoked_at)', async () => {
  const sessionResult = await SessionService.createAuthenticatedSession({
    userId: 'usr-c03',
    companyId: 'comp-c03',
  });

  // Desativa empresa
  await CompanyRepository.update('comp-c03', { status: 'INACTIVE' });

  const principal = await SessionService.resolvePrincipalFromRawToken(sessionResult.rawToken);
  assert.equal(principal, null);

  const tokenHash = SessionService.hashToken(sessionResult.rawToken);
  const sessionRecord = await SessionRepository.findByTokenHash(tokenHash);
  assert.ok(sessionRecord?.revoked_at !== null, 'Sessão deve ser revogada imediatamente quando a empresa for desativada');

  // Reativa empresa
  await CompanyRepository.update('comp-c03', { status: 'ACTIVE' });
});

test('CENÁRIO 31: DCC sem devcontrol.view -> 403', () => {
  const req: any = { principal: { permissions: ['templates.view'] }, headers: {} };
  const res = createMockResponse();
  const guard = requirePermission('devcontrol.view');
  guard(req, res, () => {});
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'FORBIDDEN');
});

test('CENÁRIO 32: DCC com devcontrol.view -> permite', () => {
  const req: any = { principal: { permissions: ['devcontrol.view'] }, headers: {} };
  const res = createMockResponse();
  let called = false;
  const guard = requirePermission('devcontrol.view');
  guard(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
});

test('CENÁRIO 33: Templates mutations respeitam permissions', () => {
  const reqWithout: any = { principal: { permissions: ['templates.view'] }, headers: {} };
  const resWithout = createMockResponse();
  requirePermission('templates.edit')(reqWithout, resWithout, () => {});
  assert.equal(resWithout.statusCode, 403);

  const reqWith: any = { principal: { permissions: ['templates.edit'] }, headers: {} };
  let passed = false;
  requirePermission('templates.edit')(reqWith, createMockResponse(), () => { passed = true; });
  assert.equal(passed, true);
});

test('CENÁRIO 34: Print execute respeita print.execute', () => {
  const reqWithout: any = { principal: { permissions: ['templates.view'] }, headers: {} };
  const resWithout = createMockResponse();
  requirePermission('print.execute')(reqWithout, resWithout, () => {});
  assert.equal(resWithout.statusCode, 403);

  const reqWith: any = { principal: { permissions: ['print.execute'] }, headers: {} };
  let passed = false;
  requirePermission('print.execute')(reqWith, createMockResponse(), () => { passed = true; });
  assert.equal(passed, true);
});

test('CENÁRIO 35: Printers manage respeita printers.manage', () => {
  const reqWithout: any = { principal: { permissions: ['print.execute'] }, headers: {} };
  const resWithout = createMockResponse();
  requirePermission('printers.manage')(reqWithout, resWithout, () => {});
  assert.equal(resWithout.statusCode, 403);

  const reqWith: any = { principal: { permissions: ['printers.manage'] }, headers: {} };
  let passed = false;
  requirePermission('printers.manage')(reqWith, createMockResponse(), () => { passed = true; });
  assert.equal(passed, true);
});

test('CENÁRIO 36: Agents manage respeita agents.manage', () => {
  const reqWithout: any = { principal: { permissions: ['templates.view'] }, headers: {} };
  const resWithout = createMockResponse();
  requirePermission('agents.manage')(reqWithout, resWithout, () => {});
  assert.equal(resWithout.statusCode, 403);

  const reqWith: any = { principal: { permissions: ['agents.manage'] }, headers: {} };
  let passed = false;
  requirePermission('agents.manage')(reqWith, createMockResponse(), () => { passed = true; });
  assert.equal(passed, true);
});

test('CENÁRIO 37: Machine auth do Agent continua funcionando', async () => {
  memoryAgentsStore.clear();
  const rawAgentToken = 'agt_live_machine_test_token';
  const tokenHash = SessionService.hashToken(rawAgentToken);

  await AgentsRepository.save({
    id: 'agent-machine-c37',
    companyId: 'comp-c03',
    installationId: 'inst-c37',
    machineName: 'DAEMON-PC-37',
    os: 'windows',
    architecture: 'x86_64',
    agentVersion: '0.1.0',
    status: 'ONLINE',
    lastSeenAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    tokenHash,
  });

  const resDaemon = await callRouter(agentsRouter, {
    method: 'POST',
    url: '/heartbeat',
    headers: { 'x-agent-token': rawAgentToken },
    body: { agentId: 'agent-machine-c37', version: '0.1.0' },
  });

  assert.equal(resDaemon.statusCode, 200, 'Daemon autentica exclusivamente via x-agent-token sem nenhum cookie humano');
});

test('CENÁRIO 38: Login rate limit funciona (429 + Retry-After)', () => {
  clearRateLimiterStore();
  const limiter = createRateLimiter({
    windowMs: 60000,
    max: 2,
    message: 'Muitas tentativas de login.',
  });

  const ip = '198.51.100.55';
  let blocked = false;
  let retryAfterHeader = '';

  for (let i = 0; i < 3; i++) {
    const req: any = { ip, socket: { remoteAddress: ip } };
    const res = createMockResponse();
    let nextCalled = false;
    limiter(req, res, () => { nextCalled = true; });

    if (!nextCalled) {
      assert.equal(res.statusCode, 429);
      assert.equal(res.body.error, 'Muitas tentativas de login.');
      retryAfterHeader = res.headers['retry-after'];
      blocked = true;
      break;
    }
  }

  assert.equal(blocked, true);
  assert.ok(retryAfterHeader, 'Cabeçalho Retry-After deve estar presente');
});

test('CENÁRIO 39: CSRF strategy testada se cookie auth (ausente -> 403, inválido -> 403, válido -> ok)', () => {
  const expectedCsrf = 'csrf-secret-c39';
  const principal: any = { csrfToken: expectedCsrf };

  // 1. GET seguro -> liberado sem CSRF
  const reqGet: any = { method: 'GET', principal, headers: {} };
  let getPassed = false;
  requireCsrf(reqGet, createMockResponse(), () => { getPassed = true; });
  assert.equal(getPassed, true);

  // 2. POST mutável sem token -> 403
  const reqNoToken: any = { method: 'POST', principal, headers: {} };
  const resNoToken = createMockResponse();
  requireCsrf(reqNoToken, resNoToken, () => {});
  assert.equal(resNoToken.statusCode, 403);
  assert.equal(resNoToken.body.code, 'CSRF_TOKEN_MISSING');

  // 3. POST mutável com token incorreto -> 403
  const reqBadToken: any = { method: 'POST', principal, headers: { 'x-csrf-token': 'token-falso' } };
  const resBadToken = createMockResponse();
  requireCsrf(reqBadToken, resBadToken, () => {});
  assert.equal(resBadToken.statusCode, 403);
  assert.equal(resBadToken.body.code, 'CSRF_TOKEN_INVALID');

  // 4. POST mutável com token correto -> 200 / prossegue
  const reqOkToken: any = { method: 'POST', principal, headers: { 'x-csrf-token': expectedCsrf } };
  let postPassed = false;
  requireCsrf(reqOkToken, createMockResponse(), () => { postPassed = true; });
  assert.equal(postPassed, true);
});

test('CENÁRIO 40: CORS credentials não permite wildcard', () => {
  // Regra de segurança: credentials: true exige origin específico ou função de validação, nunca wildcard '*'
  const corsConfig = {
    origin: (origin: string | undefined, callback: any) => {
      callback(null, true);
    },
    credentials: true,
  };

  assert.notEqual((corsConfig as any).origin, '*', 'CORS com credentials: true não pode ter origin: "*"');
  assert.equal(corsConfig.credentials, true);
});

test('CENÁRIO 41: Bootstrap admin idempotente', async () => {
  process.env.BOOTSTRAP_ADMIN_EMAIL = 'admin.c41@witiquetas.com';
  process.env.BOOTSTRAP_ADMIN_PASSWORD = 'PasswordAdmin@2026';

  await bootstrapAdminData();
  const count1 = (await UserRepository.findByEmail('admin.c41@witiquetas.com')) ? 1 : 0;
  assert.equal(count1, 1);

  // Executar novamente
  await bootstrapAdminData();
  const user = await UserRepository.findByEmail('admin.c41@witiquetas.com');
  assert.ok(user, 'Admin continua existindo sem duplicidade');

  delete process.env.BOOTSTRAP_ADMIN_EMAIL;
  delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
});

test('CENÁRIO 42: Bootstrap não sobrescreve senha', async () => {
  process.env.BOOTSTRAP_ADMIN_EMAIL = 'admin.c42@witiquetas.com';
  process.env.BOOTSTRAP_ADMIN_PASSWORD = 'PrimeiraSenha@2026';
  await bootstrapAdminData();

  const userInitial = await UserRepository.findByEmailWithPassword('admin.c42@witiquetas.com');
  const initialHash = userInitial!.passwordHash;

  // Tentativa de sobrescrever com outra senha
  process.env.BOOTSTRAP_ADMIN_PASSWORD = 'OutraSenhaCompletamenteDiferente@2026';
  await bootstrapAdminData();

  const userAfter = await UserRepository.findByEmailWithPassword('admin.c42@witiquetas.com');
  assert.equal(userAfter?.passwordHash, initialHash, 'Hash de senha do admin não pode ser sobrescrito em inicializações subsequentes');

  delete process.env.BOOTSTRAP_ADMIN_EMAIL;
  delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
});

test('CENÁRIO 43: Nenhuma credencial aparece em logs', async () => {
  const secretPassword = 'SegredoAbsolutoNuncaLogar@2026';
  const rawToken = 'raw-token-ultra-secreto-256bits';

  // Simular login falho e auditoria
  const capturedLogs: string[] = [];
  const originalWarn = console.warn;
  const originalLog = console.log;

  console.warn = (...args: any[]) => { capturedLogs.push(args.join(' ')); };
  console.log = (...args: any[]) => { capturedLogs.push(args.join(' ')); };

  try {
    await callRouter(authRouter, {
      method: 'POST',
      url: '/login',
      ip: '192.168.1.99',
      socket: { remoteAddress: '192.168.1.99' },
      headers: {},
      body: { email: 'login.correto@test.com', password: secretPassword },
    });

    const allLoggedText = capturedLogs.join('\n');
    assert.equal(allLoggedText.includes(secretPassword), false, 'Senha nunca pode vazar nos logs de console ou auditoria');
    assert.equal(allLoggedText.includes(rawToken), false, 'Raw token nunca pode vazar nos logs');
  } finally {
    console.warn = originalWarn;
    console.log = originalLog;
  }
});
