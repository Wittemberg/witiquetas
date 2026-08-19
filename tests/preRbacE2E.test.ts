import test from 'node:test';
import assert from 'node:assert/strict';
import authRouter, { parseCookies } from '../apps/backend/src/routes/auth.js';
import agentsRouter from '../apps/backend/src/routes/agents.js';

async function executeRouteChain(handlers: Function[], req: any, res: any) {
  let idx = 0;
  async function next() {
    idx++;
    if (idx < handlers.length) {
      await handlers[idx](req, res, next);
    }
  }
  if (handlers && handlers.length > 0) {
    await handlers[0](req, res, next);
  }
}

function createMockReqRes(options: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: any;
  query?: Record<string, string>;
}) {
  let statusCode = 200;
  let responseData: any = null;
  const headersSet: Record<string, string> = {};

  const req: any = {
    method: options.method,
    url: options.url,
    headers: options.headers || {},
    body: options.body || {},
    query: options.query || {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  };

  const res: any = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: any) {
      responseData = data;
      return res;
    },
    send(data: any) {
      responseData = data;
      return res;
    },
    setHeader(name: string, value: string) {
      headersSet[name.toLowerCase()] = value;
      return res;
    },
    getHeader(name: string) {
      return headersSet[name.toLowerCase()];
    },
    get statusCode() {
      return statusCode;
    },
    get data() {
      return responseData;
    },
  };

  return { req, res };
}

const getSessionHandlers = (authRouter as any).routes.find(
  (r: any) => r.method === 'GET' && r.path === '/session'
).handlers;

const postPreRbacSessionHandlers = (authRouter as any).routes.find(
  (r: any) => r.method === 'POST' && r.path === '/pre-rbac-session'
).handlers;

const getDiagnosticsHandlers = (authRouter as any).routes.find(
  (r: any) => r.method === 'GET' && r.path === '/diagnostics'
).handlers;

const postGenerateCodeHandlers = (agentsRouter as any).routes.find(
  (r: any) => r.method === 'POST' && r.path === '/generate-pairing-code'
).handlers;

const postPairHandlers = (agentsRouter as any).routes.find(
  (r: any) => r.method === 'POST' && r.path === '/pair'
).handlers;

test('E2E Pre-RBAC: 1. Navegador novo acessa GET /api/auth/session sem cookie -> recebe auto-bootstrap com Set-Cookie HttpOnly e authenticated: true', () => {
  const { req, res } = createMockReqRes({
    method: 'GET',
    url: '/session',
  });

  executeRouteChain(getSessionHandlers, req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.data.authenticated, true);
  assert.equal(res.data.user.role, 'ADMIN');
  assert.equal(res.data.user.companyId, 'comp-matriz-01');

  const setCookie = res.getHeader('set-cookie');
  assert.ok(setCookie, 'Set-Cookie deve ser emitido no primeiro acesso');
  assert.ok(setCookie.includes('witiquetas_session='));
  assert.ok(setCookie.includes('HttpOnly'));
  assert.ok(setCookie.includes('Path=/'));
  assert.ok(setCookie.includes('SameSite=Lax'));
});

test('E2E Pre-RBAC: 2. Reenvio do cookie em GET /api/auth/session mantém sessão ativa', () => {
  // Bootstrap inicial
  const { req: req1, res: res1 } = createMockReqRes({
    method: 'GET',
    url: '/session',
  });
  executeRouteChain(getSessionHandlers, req1, res1);

  const setCookie = res1.getHeader('set-cookie');
  const sessionId = setCookie.match(/witiquetas_session=([a-f0-9]+)/)![1];

  // Reenvio do cookie
  const { req: req2, res: res2 } = createMockReqRes({
    method: 'GET',
    url: '/session',
    headers: {
      cookie: `witiquetas_session=${sessionId}`,
    },
  });
  executeRouteChain(getSessionHandlers, req2, res2);

  assert.equal(res2.statusCode, 200);
  assert.equal(res2.data.authenticated, true);
  assert.equal(res2.data.user.id, 'usr-admin');
  assert.equal(res2.data.user.companyId, 'comp-matriz-01');
});

test('E2E Pre-RBAC: 3. Navegador com sessão gera código de pareamento WIT-XXXX-XXXX com sucesso', async () => {
  const { req: reqBoot, res: resBoot } = createMockReqRes({
    method: 'POST',
    url: '/pre-rbac-session',
    body: {},
  });
  await executeRouteChain(postPreRbacSessionHandlers, reqBoot, resBoot);

  const setCookie = resBoot.getHeader('set-cookie');
  const sessionId = setCookie.match(/witiquetas_session=([a-f0-9]+)/)![1];

  const { req: reqGen, res: resGen } = createMockReqRes({
    method: 'POST',
    url: '/generate-pairing-code',
    headers: {
      cookie: `witiquetas_session=${sessionId}`,
    },
  });
  await executeRouteChain(postGenerateCodeHandlers, reqGen, resGen);

  assert.equal(resGen.statusCode, 200);
  assert.match(resGen.data.pairingCode, /^WIT-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal(resGen.data.companyId, 'comp-matriz-01');

  // Pareamento com o código gerado
  const { req: reqPair, res: resPair } = createMockReqRes({
    method: 'POST',
    url: '/pair',
    body: {
      pairingCode: resGen.data.pairingCode,
      machineName: 'CAIXA-E2E-TEST',
    },
  });
  await executeRouteChain(postPairHandlers, reqPair, resPair);

  assert.equal(resPair.statusCode, 201);
  assert.ok(resPair.data.agentId);
  assert.ok(resPair.data.token);
});

test('E2E Pre-RBAC: 4. Diagnóstico de autenticação seguro reporta flags sem expor chaves', () => {
  const { req, res } = createMockReqRes({
    method: 'GET',
    url: '/diagnostics',
  });

  executeRouteChain(getDiagnosticsHandlers, req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(typeof res.data.PRE_RBAC_ENABLED, 'boolean');
  assert.equal(typeof res.data.ADMIN_API_KEY_CONFIGURED, 'boolean');
  assert.equal(typeof res.data.ADMIN_COMPANY_ID_CONFIGURED, 'boolean');
  assert.equal(res.data.SESSION_STORE_READY, true);
  // Garante que nenhum valor de token/chave vazou no payload de diagnóstico
  assert.equal(res.data.ADMIN_API_KEY, undefined);
  assert.equal(res.data.SUPER_ADMIN_API_KEY, undefined);
});
