import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

import {
  clearAdminMemoryStores,
  CompanyRepository,
  UserRepository,
  RoleRepository,
} from '../apps/backend/src/repositories/adminRepositories.js';
import {
  clearSessionMemoryStores,
  SessionService,
} from '../apps/backend/src/services/sessionService.js';
import {
  AgentsRepository,
  memoryAgentsStore,
} from '../apps/backend/src/repositories/agentsRepository.js';
import { PrintersRepository } from '../apps/backend/src/repositories/printersRepository.js';
import { templateRepository } from '../apps/backend/src/repositories/templateRepository.js';

import authRouter from '../apps/backend/src/routes/auth.js';
import devControlRouter from '../apps/backend/src/routes/developmentControl.js';
import sessionRouter from '../apps/backend/src/routes/session.js';
import agentsRouter, { authenticateWebUser, authenticateAgent } from '../apps/backend/src/routes/agents.js';
import printersRouter from '../apps/backend/src/routes/printers.js';
import templatesRouter from '../apps/backend/src/routes/templates.js';
import adminRouter from '../apps/backend/src/routes/admin.js';
import printJobsRouter from '../apps/backend/src/routes/printJobs.js';

import {
  developerAuthService,
  DCC_SESSION_COOKIE_NAME,
  DCC_SESSION_TTL_MS,
  generateTotpCodeForTesting,
} from '../apps/backend/src/services/developerAuthService.js';

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

const TEST_BASE32_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

test('REGRESSION GATE — PLATFORM_DEVELOPER SESSION STABILITY & ANTI-FLAPPING', async (t) => {
  // Configuração canônica de ambiente para Developer
  process.env.DCC_ENABLED = 'true';
  process.env.DCC_TOTP_SECRET = TEST_BASE32_SECRET;
  process.env.DCC_DEVELOPER_USERNAME = 'Marcel';
  process.env.DCC_DEVELOPER_COMPANY_ID = 'comp-default';
  process.env.NODE_ENV = 'test';

  clearAdminMemoryStores();
  clearSessionMemoryStores();
  developerAuthService.clearAllSessionsForTesting();
  memoryAgentsStore.clear();

  // Garante empresa default criada
  await CompanyRepository.create({
    id: 'comp-default',
    name: 'Empresa Principal Matriz',
    slug: 'default',
    status: 'ACTIVE',
  });

  // =========================================================================
  // GATE 1: FLUXO COMPLETO DE AUTENTICAÇÃO DEVELOPER MARCEL + TOTP
  // =========================================================================
  let developerCookie = '';
  let developerRawToken = '';

  await t.test('1. Marcel autentica com TOTP válido e obtém cookie witiquetas_dcc_session', async () => {
    const validCode = generateTotpCodeForTesting(TEST_BASE32_SECRET, 0);
    const loginReq = {
      method: 'POST',
      url: '/auth/login',
      body: { username: 'Marcel', code: validCode },
      ip: '127.0.0.1',
    };
    const loginRes = await callRouter(devControlRouter, loginReq);
    assert.strictEqual(loginRes.statusCode, 200, 'Login do desenvolvedor deve retornar 200 OK');
    assert.strictEqual(loginRes.body.success, true);
    assert.ok(loginRes.body.token, 'Deve emitir session token de 256 bits');

    const cookieObj = loginRes.cookies[DCC_SESSION_COOKIE_NAME];
    assert.ok(cookieObj, 'Deve definir o cookie witiquetas_dcc_session');
    assert.strictEqual(cookieObj.opts.httpOnly, true, 'Cookie deve ser HttpOnly');
    assert.strictEqual(cookieObj.opts.maxAge, 45 * 60 * 1000, 'MaxAge deve ser 45 minutos (2.700.000 ms)');

    developerRawToken = loginRes.body.token;
    developerCookie = `${DCC_SESSION_COOKIE_NAME}=${loginRes.body.token}`;
  });

  // =========================================================================
  // GATE 2: CONTEXTO EFETIVO /api/session/context RETORNA PLATFORM_DEVELOPER
  // =========================================================================
  await t.test('2. GET /api/session/context reconhece cookie witiquetas_dcc_session como PLATFORM_DEVELOPER', async () => {
    const req = {
      method: 'GET',
      url: '/context',
      headers: {
        cookie: developerCookie,
      },
    };
    const res = await callRouter(sessionRouter, req);
    assert.strictEqual(res.statusCode, 200, 'Contexto de sessão deve retornar 200');
    assert.strictEqual(res.body.isDeveloper, true, 'isDeveloper deve ser true');
    assert.strictEqual(res.body.canAccessDcc, true, 'canAccessDcc deve ser true');
    assert.deepStrictEqual(res.body.roles, ['PLATFORM_DEVELOPER'], 'Roles deve conter PLATFORM_DEVELOPER');
    assert.deepStrictEqual(res.body.permissions, ['*'], 'Permissions deve ser wildcard [*]');
    assert.strictEqual(res.body.company.id, 'comp-default', 'Empresa deve ser a configurada para o Developer');
  });

  // =========================================================================
  // GATE 3: CORREÇÃO DO P0 — /api/agents ACEITA PLATFORM_DEVELOPER COM SUCESSO
  // =========================================================================
  await t.test('3. P0 RESOLVED: GET /api/agents aceita cookie de desenvolvedor (witiquetas_dcc_session) com HTTP 200', async () => {
    // Cadastra um agente para teste na empresa do developer
    await AgentsRepository.save({
      id: 'agt-test-dev',
      companyId: 'comp-default',
      installationId: 'inst-test-01',
      machineName: 'Terminal-Dev-01',
      os: 'windows',
      architecture: 'x86_64',
      agentVersion: '0.1.0',
      status: 'ONLINE',
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      tokenHash: 'test-hash-dev',
    });

    const req = {
      method: 'GET',
      url: '/',
      headers: {
        cookie: developerCookie,
      },
    };
    const res = await callRouter(agentsRouter, req);
    assert.strictEqual(res.statusCode, 200, 'GET /api/agents DEVE retornar 200 OK para PLATFORM_DEVELOPER');
    assert.strictEqual(typeof res.body.total, 'number');
    assert.ok(Array.isArray(res.body.agents), 'agents deve ser um array');
    assert.strictEqual(res.body.agents.length, 1);
    assert.strictEqual(res.body.agents[0].id, 'agt-test-dev');
  });

  // =========================================================================
  // GATE 4: SIMULAÇÃO DE MÚLTIPLOS CICLOS DE REFRESH (15s / 30s) SEM FLAPPING
  // =========================================================================
  await t.test('4. Simulação de 10 ciclos consecutivos de revalidação / polling (15s/30s): ZERO flapping', async () => {
    for (let cycle = 1; cycle <= 10; cycle++) {
      // 1. Polling do Dashboard (fetchData: /api/health, /api/version, /api/agents)
      const agentsReq = {
        method: 'GET',
        url: '/',
        headers: { cookie: developerCookie },
      };
      const agentsRes = await callRouter(agentsRouter, agentsReq);
      assert.strictEqual(agentsRes.statusCode, 200, `Ciclo ${cycle}: /api/agents deve permanecer 200`);

      // 2. Revalidação de Sessão (/api/session/context)
      const contextReq = {
        method: 'GET',
        url: '/context',
        headers: { cookie: developerCookie },
      };
      const contextRes = await callRouter(sessionRouter, contextReq);
      assert.strictEqual(contextRes.statusCode, 200, `Ciclo ${cycle}: /api/session/context deve permanecer 200`);
      assert.strictEqual(contextRes.body.isDeveloper, true);
    }
  });

  // =========================================================================
  // GATE 5: NAVEGAÇÃO ENTRE MÚLTIPLOS MÓDULOS SEM QUEBRA DE SESSÃO
  // =========================================================================
  await t.test('5. Navegação por todos os módulos: sessão Developer permanece válida e autorizada', async () => {
    // A. Módulo Impressoras (/api/printers)
    const printersReq = {
      method: 'GET',
      url: '/',
      headers: { cookie: developerCookie },
    };
    const printersRes = await callRouter(printersRouter, printersReq);
    assert.strictEqual(printersRes.statusCode, 200, 'Acesso ao módulo Impressoras deve ser 200 OK');

    // B. Módulo Templates (/api/templates)
    templateRepository.listTemplates = async () => [];
    const templatesReq = {
      method: 'GET',
      url: '/',
      query: {},
      headers: { cookie: developerCookie },
    };
    const templatesRes = await callRouter(templatesRouter, templatesReq);
    assert.strictEqual(templatesRes.statusCode, 200, 'Acesso ao módulo Meus Modelos deve ser 200 OK');

    // C. Módulo Central de Impressão (/api/print-jobs)
    const printJobsReq = {
      method: 'GET',
      url: '/',
      headers: { cookie: developerCookie },
    };
    const printJobsRes = await callRouter(printJobsRouter, printJobsReq);
    assert.strictEqual(printJobsRes.statusCode, 200, 'Acesso ao módulo Central de Impressão deve ser 200 OK');

    // D. Módulo DCC (/api/development-control/overview)
    const dccReq = {
      method: 'GET',
      url: '/overview',
      headers: { cookie: developerCookie },
    };
    const dccRes = await callRouter(devControlRouter, dccReq);
    assert.strictEqual(dccRes.statusCode, 200, 'Acesso ao DCC deve ser 200 OK');

    // E. Módulo Administração (/api/admin/company)
    const adminReq = {
      method: 'GET',
      url: '/company',
      headers: { cookie: developerCookie },
    };
    const adminRes = await callRouter(adminRouter, adminReq);
    assert.strictEqual(adminRes.statusCode, 200, 'Acesso à Administração deve ser 200 OK');
  });

  // =========================================================================
  // GATE 6: TOTP INVÁLIDO É REJEITADO
  // =========================================================================
  await t.test('6. TOTP inválido para Marcel é rejeitado com status 401', async () => {
    const badReq = {
      method: 'POST',
      url: '/auth/login',
      body: { username: 'Marcel', code: '999999' },
      ip: '127.0.0.1',
    };
    const badRes = await callRouter(devControlRouter, badReq);
    assert.strictEqual(badRes.statusCode, 401);
    assert.strictEqual(badRes.body.code, 'INVALID_DEVELOPER_CREDENTIALS');
  });

  // =========================================================================
  // GATE 7: TENANT NORMAL PERMANECE FUNCIONAL COM SESSÃO INDEPENDENTE
  // =========================================================================
  await t.test('7. Tenant normal comercial permanece funcional e isolado', async () => {
    // Cria empresa e usuário tenant comercial
    await CompanyRepository.create({
      id: 'comp-varejo-01',
      name: 'Supermercado Varejo',
      slug: 'varejo',
      status: 'ACTIVE',
    });

    const tenantUser = await UserRepository.create({
      companyId: 'comp-varejo-01',
      name: 'Operador Varejo',
      email: 'operador@varejo.com.br',
      passwordHash: 'dummy-hash',
      status: 'ACTIVE',
    });

    // Cria sessão comercial persistente
    const tenantSession = await SessionService.createAuthenticatedSession({
      userId: tenantUser.id,
      companyId: 'comp-varejo-01',
      userAgent: 'Mozilla/5.0',
      ipAddress: '127.0.0.1',
    });

    const tenantCookie = `witiquetas_session=${tenantSession.rawToken}`;

    // Contexto comercial não tem flags de developer
    const ctxReq = {
      method: 'GET',
      url: '/context',
      headers: { cookie: tenantCookie },
    };
    const ctxRes = await callRouter(sessionRouter, ctxReq);
    assert.strictEqual(ctxRes.statusCode, 200);
    assert.strictEqual(ctxRes.body.isDeveloper, false);
    assert.strictEqual(ctxRes.body.canAccessDcc, false);
    assert.strictEqual(ctxRes.body.company.id, 'comp-varejo-01');

    // Agentes do tenant são isolados
    const agentsReq = {
      method: 'GET',
      url: '/',
      headers: { cookie: tenantCookie },
    };
    const agentsRes = await callRouter(agentsRouter, agentsReq);
    assert.strictEqual(agentsRes.statusCode, 200);
    assert.strictEqual(agentsRes.body.total, 0, 'Tenant varejo não vê agentes da empresa comp-default');
  });

  // =========================================================================
  // GATE 8: 403 NÃO DESTROI SESSÃO VÁLIDA
  // =========================================================================
  await t.test('8. 403 (Forbidden) NÃO destrói sessão ativa no middleware e contrato de sessão', () => {
    const sessionFile = path.resolve('apps/frontend/src/auth/session.ts');
    const content = fs.readFileSync(sessionFile, 'utf-8');

    // Confirma que res.status === 403 não faz activeSessionContext = null
    assert.strictEqual(
      content.includes('if (res.status === 401 || res.status === 403)'),
      false,
      'session.ts NÃO pode agrupar 401 e 403 no mesmo bloco de logout/clear'
    );
    assert.ok(
      content.includes('if (res.status === 403)'),
      'session.ts deve tratar 403 separadamente preservando a sessão'
    );
  });

  // =========================================================================
  // GATE 9: 401 REAL DE SESSÃO EXIGE AUTENTICAÇÃO (FAIL-CLOSED)
  // =========================================================================
  await t.test('9. 401 real de sessão: requisição sem credenciais retorna 401 Fail-Closed', async () => {
    const unauthReq = {
      method: 'GET',
      url: '/context',
      headers: {},
    };
    const unauthRes = await callRouter(sessionRouter, unauthReq);
    assert.strictEqual(unauthRes.statusCode, 401);
    assert.strictEqual(unauthRes.body.code, 'UNAUTHENTICATED');
  });

  // =========================================================================
  // GATE 10: MACHINE AGENT AUTH PERMANECE TOTALMENTE INDEPENDENTE
  // =========================================================================
  await t.test('10. Machine Agent auth (daemon de hardware) permanece independente via token SHA-256', async () => {
    const rawAgentToken = 'secret-agent-daemon-token-12345';
    const tokenHash = crypto.createHash('sha256').update(rawAgentToken, 'utf8').digest('hex');

    await AgentsRepository.save({
      id: 'agt-daemon-hw',
      companyId: 'comp-default',
      installationId: 'inst-daemon-hw',
      machineName: 'PC-Daemon-HW',
      os: 'windows',
      architecture: 'x86_64',
      agentVersion: '0.1.0',
      status: 'ONLINE',
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      tokenHash,
    });

    const daemonReq = {
      headers: {
        authorization: `Bearer ${rawAgentToken}`,
        'x-agent-id': 'agt-daemon-hw',
      },
    } as any;
    let nextCalled = false;
    const daemonRes = createMockResponse();

    await authenticateAgent(daemonReq, daemonRes, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true, 'Daemon com token de agente válido deve autenticar com sucesso');
    assert.strictEqual(daemonReq.agent.id, 'agt-daemon-hw');
  });

  // =========================================================================
  // GATE 11: P0-5 BYPASS CONTINUA INEXISTENTE (FAIL-CLOSED ESTRITO EM AGENTS.TS)
  // =========================================================================
  await t.test('11. P0-5 bypass continua inexistente: requisição anônima em /api/agents recebe 401', async () => {
    const anonReq = {
      headers: {},
    } as any;
    let nextCalled = false;
    let statusCode = 0;
    let body: any = null;
    const anonRes = {
      status(code: number) {
        statusCode = code;
        return {
          json(data: any) {
            body = data;
          },
        };
      },
    } as any;

    await authenticateWebUser(anonReq, anonRes, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false, 'Requisição anônima NÃO pode passar');
    assert.strictEqual(statusCode, 401, 'Deve retornar 401 Fail-Closed');
    assert.ok(body?.error);

    // Valida no código que não existe retorno do bypass pré-RBAC
    const agentsFile = path.resolve('apps/backend/src/routes/agents.ts');
    const agentsContent = fs.readFileSync(agentsFile, 'utf-8');
    assert.strictEqual(agentsContent.includes("process.env.AUTH_MODE !== 'RBAC'"), false);
    assert.strictEqual(agentsContent.includes("process.env.RBAC_ENABLED !== 'true'"), false);
  });
});
