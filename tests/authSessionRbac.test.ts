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
import { requirePermission, requireCsrf } from '../apps/backend/src/middleware/authMiddleware.js';
import { createRateLimiter, clearRateLimiterStore } from '../apps/backend/src/middleware/rateLimiter.js';
import authRouter, { SESSION_COOKIE_NAME } from '../apps/backend/src/routes/auth.js';
import sessionRouter from '../apps/backend/src/routes/session.js';
import agentsRouter, { AgentsRepository, memoryAgentsStore } from '../apps/backend/src/routes/agents.js';

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
// SUÍTE DE TESTES: PACOTE 5.2 — AUTENTICAÇÃO, SESSÃO E EFFECTIVE CONTEXT
// ============================================================================

test('PACOTE 5.2 - 1. Password Policy & Hashing: Validações estritas de senha e hashing seguro', async () => {
  // Senha muito curta
  assert.throws(
    () => PasswordService.validatePassword('short'),
    /A senha deve conter no mínimo 8 caracteres/
  );

  // Senha vazia
  assert.throws(
    () => PasswordService.validatePassword('   '),
    /A senha não pode estar em branco/
  );

  // Senha excessivamente longa
  assert.throws(
    () => PasswordService.validatePassword('a'.repeat(129)),
    /A senha não pode exceder 128 caracteres/
  );

  // Email inválido
  assert.throws(
    () => PasswordService.validateEmail('invalid-email'),
    /Email inválido/
  );

  // Hashing bcrypt com salt aleatório
  const raw = 'MinhaSenhaForte@2026';
  const hash1 = await PasswordService.hash(raw);
  const hash2 = await PasswordService.hash(raw);

  assert.ok(hash1.startsWith('$2'), 'Hash deve ser do formato bcrypt');
  assert.notEqual(hash1, hash2, 'Salts aleatórios devem gerar hashes distintos');

  // Verificação de senha
  const matchOk = await PasswordService.verify(raw, hash1);
  const matchErr = await PasswordService.verify('SenhaIncorreta', hash1);
  assert.equal(matchOk, true, 'Senha correta deve validar com sucesso');
  assert.equal(matchErr, false, 'Senha errada deve retornar false');
});

test('PACOTE 5.2 - 2. Session Token & Entropy: Geração de 256 bits e persistência apenas de token_hash', async () => {
  clearSessionMemoryStores();
  clearAdminMemoryStores();

  const company = await CompanyRepository.create({
    id: 'comp-entropy-test',
    name: 'Empresa Entropia',
    legalName: 'Empresa Entropia Ltda',
    document: '11.111.111/0001-11',
    slug: 'entropia',
    status: 'ACTIVE',
  });

  const user = await UserRepository.create({
    id: 'usr-entropy-test',
    companyId: company.id,
    name: 'Operador Entropia',
    email: 'operador@entropia.com',
    status: 'ACTIVE',
  });

  const sessionResult = await SessionService.createAuthenticatedSession({
    userId: user.id,
    companyId: company.id,
  });

  // Token de 32 bytes (256 bits) em hex possui 64 caracteres
  assert.equal(sessionResult.rawToken.length, 64, 'Token bruto deve ter 256 bits (64 hex characters)');
  assert.equal(sessionResult.csrfToken.length, 64, 'CSRF token deve ter 256 bits (64 hex characters)');

  // O banco de sessões não deve armazenar o rawToken
  const tokenHash = SessionService.hashToken(sessionResult.rawToken);
  const storedSession = await SessionRepository.findByTokenHash(tokenHash);
  assert.ok(storedSession, 'Sessão deve ser encontrada pelo hash SHA-256');
  assert.equal(storedSession.token_hash, tokenHash);
  assert.equal((storedSession as any).rawToken, undefined, 'Raw token nunca deve residir no registro persistente');
  assert.equal(storedSession.csrf_token, sessionResult.csrfToken);

  // Resolução do principal a partir do rawToken
  const principal = await SessionService.resolvePrincipalFromRawToken(sessionResult.rawToken);
  assert.ok(principal, 'Principal deve ser resolvido a partir do rawToken válido');
  assert.equal(principal.user.id, user.id);
  assert.equal(principal.company.id, company.id);
  assert.equal(principal.csrfToken, sessionResult.csrfToken);
});

test('PACOTE 5.2 - 3. Session Invalidation: Revogação imediata no banco se usuário ou empresa inativar', async () => {
  clearSessionMemoryStores();
  clearAdminMemoryStores();

  const company = await CompanyRepository.create({
    id: 'comp-inval-test',
    name: 'Empresa Invalidação',
    legalName: 'Empresa Invalidação Ltda',
    document: '22.222.222/0001-22',
    slug: 'inval',
    status: 'ACTIVE',
  });

  const user = await UserRepository.create({
    id: 'usr-inval-test',
    companyId: company.id,
    name: 'Usuário Ativo',
    email: 'usuario@inval.com',
    status: 'ACTIVE',
  });

  const sessionResult = await SessionService.createAuthenticatedSession({
    userId: user.id,
    companyId: company.id,
  });

  // 1. Sessão ativa resolve com sucesso
  let principal = await SessionService.resolvePrincipalFromRawToken(sessionResult.rawToken);
  assert.ok(principal);

  // 2. Inativar o usuário
  await UserRepository.update(user.id, { status: 'INACTIVE' });

  // 3. Ao tentar resolver, deve revogar a sessão no banco e retornar null
  principal = await SessionService.resolvePrincipalFromRawToken(sessionResult.rawToken);
  assert.equal(principal, null, 'Usuário inativo deve impedir resolução do principal');

  // 4. Confirmar que a sessão foi efetivamente revogada no banco
  const tokenHash = SessionService.hashToken(sessionResult.rawToken);
  const revokedSession = await SessionRepository.findByTokenHash(tokenHash);
  assert.ok(revokedSession);
  assert.ok(revokedSession.revoked_at !== null, 'Sessão deve ter revoked_at preenchido imediatamente no banco');
});

test('PACOTE 5.2 - 4. Bootstrap Admin: Fail-Closed, Não Sobrescrita de Hash e Zero Reassociação', async () => {
  clearSessionMemoryStores();
  clearAdminMemoryStores();

  // Teste Fail-Closed: apenas email informado
  process.env.BOOTSTRAP_ADMIN_EMAIL = 'admin@witiquetas.com';
  delete process.env.BOOTSTRAP_ADMIN_PASSWORD;

  await assert.rejects(
    async () => bootstrapAdminData(),
    /Configuração inválida de bootstrap admin: ambos BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_PASSWORD devem ser fornecidos/
  );

  // Teste Provisionamento Inicial com ambos configurados
  process.env.BOOTSTRAP_ADMIN_PASSWORD = 'SenhaBootstrapForte@2026';
  await bootstrapAdminData();

  const adminUser = await UserRepository.findByEmail('admin@witiquetas.com');
  assert.ok(adminUser, 'Administrador bootstrap deve ser provisionado');
  assert.equal(adminUser.companyId, 'comp-default');

  const withPwd = await UserRepository.findByEmailWithPassword('admin@witiquetas.com');
  assert.ok(withPwd?.passwordHash, 'Hash de senha deve estar gravado');
  const initialHash = withPwd.passwordHash;

  // Teste Idempotência: rodar novamente não sobrescreve o hash existente
  process.env.BOOTSTRAP_ADMIN_PASSWORD = 'OutraSenhaCompletamenteDiferente';
  await bootstrapAdminData();

  const afterRebootstrap = await UserRepository.findByEmailWithPassword('admin@witiquetas.com');
  assert.equal(afterRebootstrap?.passwordHash, initialHash, 'Hash de senha não pode ser sobrescrito em inicializações subsequentes');

  // Limpeza de variáveis de ambiente
  delete process.env.BOOTSTRAP_ADMIN_EMAIL;
  delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
});

test('PACOTE 5.2 - 5. Error Contract & Canonical Login: Respostas indistinguíveis para email inexistente, senha errada e usuário inativo', async () => {
  clearSessionMemoryStores();
  clearAdminMemoryStores();
  clearRateLimiterStore();

  const company = await CompanyRepository.create({
    id: 'comp-login-contract',
    name: 'Empresa Contrato',
    legalName: 'Empresa Contrato Ltda',
    document: '33.333.333/0001-33',
    slug: 'contrato',
    status: 'ACTIVE',
  });

  const activeUser = await UserRepository.create({
    id: 'usr-active-login',
    companyId: company.id,
    name: 'Usuário Ativo',
    email: 'ativo@contrato.com',
    status: 'ACTIVE',
  });
  const pwdHash = await PasswordService.hash('SenhaCorreta@2026');
  await UserRepository.setPassword(activeUser.id, pwdHash);

  const inactiveUser = await UserRepository.create({
    id: 'usr-inactive-login',
    companyId: company.id,
    name: 'Usuário Inativo',
    email: 'inativo@contrato.com',
    status: 'INACTIVE',
  });
  await UserRepository.setPassword(inactiveUser.id, pwdHash);

  // A. Email inexistente
  const resNonExistent = await callRouter(authRouter, {
    method: 'POST',
    url: '/login',
    ip: '192.168.1.100',
    socket: { remoteAddress: '192.168.1.100' },
    headers: {},
    body: { email: 'inexistente@contrato.com', password: 'QualquerSenha123' },
  });

  // B. Senha incorreta
  const resWrongPwd = await callRouter(authRouter, {
    method: 'POST',
    url: '/login',
    ip: '192.168.1.100',
    socket: { remoteAddress: '192.168.1.100' },
    headers: {},
    body: { email: 'ativo@contrato.com', password: 'SenhaErrada@999' },
  });

  // C. Usuário inativo
  const resInactive = await callRouter(authRouter, {
    method: 'POST',
    url: '/login',
    ip: '192.168.1.100',
    socket: { remoteAddress: '192.168.1.100' },
    headers: {},
    body: { email: 'inativo@contrato.com', password: 'SenhaCorreta@2026' },
  });

  assert.equal(resNonExistent.statusCode, 401);
  assert.equal(resWrongPwd.statusCode, 401);
  assert.equal(resInactive.statusCode, 401);

  // REFINEMENT P0 (ERROR CONTRACT): Respostas perfeitamente indistinguíveis
  assert.deepEqual(resNonExistent.body, { error: 'Credenciais inválidas.' });
  assert.deepEqual(resWrongPwd.body, { error: 'Credenciais inválidas.' });
  assert.deepEqual(resInactive.body, { error: 'Credenciais inválidas.' });

  // D. Login válido com sucesso
  const resSuccess = await callRouter(authRouter, {
    method: 'POST',
    url: '/login',
    ip: '192.168.1.100',
    socket: { remoteAddress: '192.168.1.100' },
    headers: {},
    body: { email: 'ativo@contrato.com', password: 'SenhaCorreta@2026' },
  });

  assert.equal(resSuccess.statusCode, 200);
  assert.equal(resSuccess.body.success, true);
  assert.equal(resSuccess.body.user.email, 'ativo@contrato.com');
  assert.ok(resSuccess.body.csrfToken);
  assert.ok(resSuccess.headers['set-cookie']);
  assert.ok(resSuccess.headers['set-cookie'].includes('witiquetas_session='));
  assert.ok(resSuccess.headers['set-cookie'].includes('HttpOnly'));
});

test('PACOTE 5.2 - 6. Rate Limiter: Auditoria de IP real e bloqueio 429 com Retry-After', async () => {
  clearRateLimiterStore();

  const limiter = createRateLimiter({
    windowMs: 60000,
    max: 3,
    message: 'Limite excedido.',
  });

  const ip = '203.0.113.45';
  let blocked = false;

  for (let i = 0; i < 4; i++) {
    const req: any = { ip, socket: { remoteAddress: ip } };
    const res = createMockResponse();
    let nextCalled = false;

    limiter(req, res, () => {
      nextCalled = true;
    });

    if (!nextCalled) {
      assert.equal(res.statusCode, 429);
      assert.equal(res.body.error, 'Limite excedido.');
      assert.ok(res.headers['retry-after']);
      blocked = true;
      break;
    }
  }

  assert.equal(blocked, true, 'Rate limiter deve bloquear após atingir o limite');
});

test('PACOTE 5.2 - 7. CSRF Protection: Rejeição estrita em mutações com cookie e liberação de métodos seguros', async () => {
  const reqSafe: any = {
    method: 'GET',
    principal: { csrfToken: 'token-csrf-esperado' },
    headers: {},
  };
  const resSafe = createMockResponse();
  let nextSafeCalled = false;
  requireCsrf(reqSafe, resSafe, () => {
    nextSafeCalled = true;
  });
  assert.equal(nextSafeCalled, true, 'Métodos seguros (GET) devem ignorar checagem de CSRF');

  // Mutação sem CSRF header
  const reqMutNoCsrf: any = {
    method: 'POST',
    principal: { csrfToken: 'token-csrf-esperado' },
    headers: {},
  };
  const resMutNoCsrf = createMockResponse();
  requireCsrf(reqMutNoCsrf, resMutNoCsrf, () => {});
  assert.equal(resMutNoCsrf.statusCode, 403);
  assert.equal(resMutNoCsrf.body.code, 'CSRF_TOKEN_MISSING');

  // Mutação com CSRF header incorreto
  const reqMutBadCsrf: any = {
    method: 'POST',
    principal: { csrfToken: 'token-csrf-esperado' },
    headers: { 'x-csrf-token': 'token-csrf-falso' },
  };
  const resMutBadCsrf = createMockResponse();
  requireCsrf(reqMutBadCsrf, resMutBadCsrf, () => {});
  assert.equal(resMutBadCsrf.statusCode, 403);
  assert.equal(resMutBadCsrf.body.code, 'CSRF_TOKEN_INVALID');

  // Mutação com CSRF header válido
  const reqMutOkCsrf: any = {
    method: 'POST',
    principal: { csrfToken: 'token-csrf-esperado' },
    headers: { 'x-csrf-token': 'token-csrf-esperado' },
  };
  const resMutOkCsrf = createMockResponse();
  let nextMutOkCalled = false;
  requireCsrf(reqMutOkCsrf, resMutOkCsrf, () => {
    nextMutOkCalled = true;
  });
  assert.equal(nextMutOkCalled, true, 'Mutação com CSRF válido deve prosseguir normalmente');
});

test('PACOTE 5.2 - 8. Agent Machine Auth vs Human User Auth: Preservação de fronteiras independentes', async () => {
  memoryAgentsStore.clear();

  const rawToken = 'agt_live_test_token_12345';
  const tokenHash = SessionService.hashToken(rawToken);

  await AgentsRepository.save({
    id: 'agent-machine-01',
    companyId: 'comp-default',
    installationId: 'inst-machine-01',
    machineName: 'PRINTER-DAEMON-PC',
    os: 'windows',
    architecture: 'x86_64',
    agentVersion: '0.1.0',
    status: 'ONLINE',
    lastSeenAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    tokenHash,
  });

  // 1. Rota de daemon (POST /heartbeat) com x-agent-token -> NÃO exige cookie humano
  const resDaemon = await callRouter(agentsRouter, {
    method: 'POST',
    url: '/heartbeat',
    headers: {
      'x-agent-token': rawToken,
    },
    body: {
      agentId: 'agent-machine-01',
      version: '0.1.0',
    },
  });

  assert.equal(resDaemon.statusCode, 200, 'Daemon com x-agent-token válido deve autenticar com sucesso sem cookie');

  // 2. Rota administrativa de humano (POST /generate-pairing-code) sem sessão nem permissão
  process.env.AUTH_MODE = 'RBAC';
  const resHumanNoAuth = await callRouter(agentsRouter, {
    method: 'POST',
    url: '/generate-pairing-code',
    headers: {},
    body: {},
  });

  assert.equal(resHumanNoAuth.statusCode, 401, 'Rota administrativa deve rejeitar acesso sem autenticação de usuário');
  delete process.env.AUTH_MODE;
});

test('PACOTE 5.2 - 9. Canonical GET /api/session/context: Retorna contexto efetivo completo com permissões e nichos', async () => {
  clearSessionMemoryStores();
  clearAdminMemoryStores();

  const company = await CompanyRepository.create({
    id: 'comp-context-test',
    name: 'Empresa Contexto',
    legalName: 'Empresa Contexto Ltda',
    document: '44.444.444/0001-44',
    slug: 'contexto',
    status: 'ACTIVE',
  });

  const user = await UserRepository.create({
    id: 'usr-context-test',
    companyId: company.id,
    name: 'Usuário Contexto',
    email: 'contexto@witiquetas.com',
    status: 'ACTIVE',
  });

  const role = await RoleRepository.create({
    id: 'role-context-test',
    companyId: company.id,
    code: 'TEST_ADMIN',
    name: 'Admin de Teste',
    isSystem: false,
  });

  await RoleRepository.assignPermission(role.id, 'templates.view');
  await RoleRepository.assignPermission(role.id, 'print.execute');
  await RoleRepository.assignUserRole(company.id, user.id, role.id);
  await CompanyConfigurationRepository.setNicheState(company.id, 'niche-joalheria', 'ENABLED');

  const sessionResult = await SessionService.createAuthenticatedSession({
    userId: user.id,
    companyId: company.id,
  });

  const res = await callRouter(sessionRouter, {
    method: 'GET',
    url: '/context',
    headers: {
      cookie: `witiquetas_session=${sessionResult.rawToken}`,
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.id, user.id);
  assert.equal(res.body.company.id, company.id);
  assert.ok(res.body.roles.includes('TEST_ADMIN'));
  assert.ok(res.body.permissions.includes('templates.view'));
  assert.ok(res.body.permissions.includes('print.execute'));
  assert.ok(res.body.allowedNiches.includes('niche-joalheria'));
  assert.ok(res.body.csrfToken === sessionResult.csrfToken);
});

test('PACOTE 5.2 - 10. Authorization Guard: Bloqueio estrito de templates sem a respectiva permissão', async () => {
  const reqNoPerm: any = {
    method: 'GET',
    url: '/',
    principal: {
      permissions: ['outra.permissao'],
    },
    headers: {},
  };
  const resNoPerm = createMockResponse();

  const guard = requirePermission('templates.view');
  guard(reqNoPerm, resNoPerm, () => {});

  assert.equal(resNoPerm.statusCode, 403);
  assert.equal(resNoPerm.body.code, 'FORBIDDEN');
  assert.equal(resNoPerm.body.requiredPermission, 'templates.view');

  const reqWithPerm: any = {
    method: 'GET',
    url: '/',
    principal: {
      permissions: ['templates.view'],
    },
    headers: {},
  };
  const resWithPerm = createMockResponse();
  let nextCalled = false;
  guard(reqWithPerm, resWithPerm, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true, 'Com a permissão correta, a requisição deve prosseguir');
});
