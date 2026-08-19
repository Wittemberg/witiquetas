import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import agentsRouter, {
  agentsStore,
  type AgentRecord,
  type AuthWebUser,
} from '../apps/backend/src/routes/agents.js';
import { createWebSession } from '../apps/backend/src/routes/auth.js';

// Setup de chaves administrativas de teste
const testAdminKey = process.env.ADMIN_API_KEY || `test_adm_${crypto.randomBytes(16).toString('hex')}`;
process.env.ADMIN_API_KEY = testAdminKey;
process.env.ADMIN_COMPANY_ID = 'comp-matriz-01';

// Helper: Executa handlers Express
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
  params?: Record<string, string>;
  ip?: string;
}) {
  let statusCode = 200;
  let responseData: any = null;
  const headersSet: Record<string, string> = {};

  const req: any = {
    method: options.method,
    url: options.url,
    headers: options.headers || {},
    body: options.body || {},
    params: options.params || {},
    ip: options.ip || '127.0.0.1',
    socket: { remoteAddress: options.ip || '127.0.0.1' },
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

// Handlers das rotas
const postGenerateCodeHandlers = (agentsRouter as any).routes.find(
  (r: any) => r.method === 'POST' && r.path === '/generate-pairing-code'
).handlers;

const postPairHandlers = (agentsRouter as any).routes.find(
  (r: any) => r.method === 'POST' && r.path === '/pair'
).handlers;

const getPairingStatusHandlers = (agentsRouter as any).routes.find(
  (r: any) => r.method === 'GET' && r.path === '/pairing-status/:code'
).handlers;

const postHeartbeatHandlers = (agentsRouter as any).routes.find(
  (r: any) => r.method === 'POST' && r.path === '/heartbeat'
).handlers;

// ============================================================================
// SUÍTE DE TESTES: PAREAMENTO DO AGENT POR CÓDIGO (FASE 3)
// ============================================================================

test('1. Geração de Pairing Code gera formato WIT-XXXX-XXXX sem caracteres ambíguos', async () => {
  const session = createWebSession({
    id: 'usr-matriz-01',
    companyId: 'comp-matriz-01',
    role: 'ADMIN',
  });

  const { req, res } = createMockReqRes({
    method: 'POST',
    url: '/generate-pairing-code',
    headers: {
      cookie: `witiquetas_session=${session.sessionId}`,
    },
    body: {},
  });

  await executeRouteChain(postGenerateCodeHandlers, req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.data.pairingCode);
  assert.match(res.data.pairingCode, /^WIT-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
  // A parte aleatória após o prefixo WIT- não contém caracteres ambíguos (0, 1, O, I, L)
  const randomPortion = res.data.pairingCode.replace(/^WIT-/, '');
  assert.ok(!/[01OIL]/i.test(randomPortion));
  assert.equal(res.data.expiresInSeconds, 900);
  assert.equal(res.data.companyId, 'comp-matriz-01');
});

test('2. Tenant correto atribuído server-side via sessão web autenticada', async () => {
  const sessionFilial = createWebSession({
    id: 'usr-filial-01',
    companyId: 'comp-filial-999',
    role: 'ADMIN',
  });

  const { req, res } = createMockReqRes({
    method: 'POST',
    url: '/generate-pairing-code',
    headers: {
      cookie: `witiquetas_session=${sessionFilial.sessionId}`,
    },
    body: {},
  });

  await executeRouteChain(postGenerateCodeHandlers, req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.data.companyId, 'comp-filial-999');
});

test('3. Pareamento bem-sucedido: Agent conecta, recebe token e é registrado no backend', async () => {
  // 1. Gerar código
  const session = createWebSession({
    id: 'usr-matriz-01',
    companyId: 'comp-matriz-01',
    role: 'ADMIN',
  });
  const { req: reqGen, res: resGen } = createMockReqRes({
    method: 'POST',
    url: '/generate-pairing-code',
    headers: { cookie: `witiquetas_session=${session.sessionId}` },
  });
  await executeRouteChain(postGenerateCodeHandlers, reqGen, resGen);
  const code = resGen.data.pairingCode;

  // 2. Agent envia requisição de pareamento
  const { req: reqPair, res: resPair } = createMockReqRes({
    method: 'POST',
    url: '/pair',
    body: {
      pairingCode: code,
      machineName: 'ESTOQUE-01',
      os: 'windows',
      architecture: 'x86_64',
      agentVersion: '0.1.0',
      installationId: 'inst-estoque-01-uuid',
    },
  });
  await executeRouteChain(postPairHandlers, reqPair, resPair);

  assert.equal(resPair.statusCode, 201);
  assert.ok(resPair.data.success);
  assert.ok(resPair.data.agentId.startsWith('agent-'));
  assert.ok(resPair.data.token.startsWith('agt_live_'));
  assert.equal(resPair.data.companyId, 'comp-matriz-01');

  // 3. Verificar que no backend o token foi salvo SOMENTE como hash
  const savedAgent = agentsStore.get(resPair.data.agentId)!;
  assert.ok(savedAgent, 'Agente deve estar salvo em agentsStore');
  assert.equal(savedAgent.machineName, 'ESTOQUE-01');
  assert.notEqual(savedAgent.tokenHash, resPair.data.token, 'Token NÃO pode ser salvo em texto puro');
  assert.equal(
    savedAgent.tokenHash,
    crypto.createHash('sha256').update(resPair.data.token).digest('hex'),
    'Token deve ser persistido como SHA-256'
  );
});

test('4. Código de uso único: Segundo Agent tentando usar o mesmo código é rejeitado com 409 Conflict', async () => {
  // 1. Gerar código
  const session = createWebSession({
    id: 'usr-matriz-01',
    companyId: 'comp-matriz-01',
    role: 'ADMIN',
  });
  const { req: reqGen, res: resGen } = createMockReqRes({
    method: 'POST',
    url: '/generate-pairing-code',
    headers: { cookie: `witiquetas_session=${session.sessionId}` },
  });
  await executeRouteChain(postGenerateCodeHandlers, reqGen, resGen);
  const code = resGen.data.pairingCode;

  // 2. Primeiro Agent consome o código
  const { req: reqPair1, res: resPair1 } = createMockReqRes({
    method: 'POST',
    url: '/pair',
    body: { pairingCode: code, machineName: 'TERMINAL-1' },
  });
  await executeRouteChain(postPairHandlers, reqPair1, resPair1);
  assert.equal(resPair1.statusCode, 201);

  // 3. Segundo Agent tenta o mesmo código
  const { req: reqPair2, res: resPair2 } = createMockReqRes({
    method: 'POST',
    url: '/pair',
    body: { pairingCode: code, machineName: 'TERMINAL-2' },
  });
  await executeRouteChain(postPairHandlers, reqPair2, resPair2);
  assert.equal(resPair2.statusCode, 409, 'Segundo uso do mesmo código deve retornar 409 Conflict');
  assert.ok(resPair2.data.error.includes('já foi utilizado'));
});

test('5. Código de pareamento inexistente retorna 400 Bad Request', async () => {
  const { req, res } = createMockReqRes({
    method: 'POST',
    url: '/pair',
    body: { pairingCode: 'WIT-XXXX-INEXISTENTE', machineName: 'TERMINAL-INV' },
  });
  await executeRouteChain(postPairHandlers, req, res);
  assert.equal(res.statusCode, 400);
  assert.ok(res.data.error.includes('inválido ou não encontrado'));
});

test('6. Polling GET /api/agents/pairing-status/:code reflete a conclusão do pareamento', async () => {
  const session = createWebSession({
    id: 'usr-matriz-01',
    companyId: 'comp-matriz-01',
    role: 'ADMIN',
  });

  // 1. Gerar código
  const { req: reqGen, res: resGen } = createMockReqRes({
    method: 'POST',
    url: '/generate-pairing-code',
    headers: { cookie: `witiquetas_session=${session.sessionId}` },
  });
  await executeRouteChain(postGenerateCodeHandlers, reqGen, resGen);
  const code = resGen.data.pairingCode;

  // 2. Consultar status antes do pareamento -> PENDING
  const { req: reqStatusBefore, res: resStatusBefore } = createMockReqRes({
    method: 'GET',
    url: `/pairing-status/${code}`,
    headers: { cookie: `witiquetas_session=${session.sessionId}` },
    params: { code },
  });
  await executeRouteChain(getPairingStatusHandlers, reqStatusBefore, resStatusBefore);
  assert.equal(resStatusBefore.statusCode, 200);
  assert.equal(resStatusBefore.data.status, 'PENDING');

  // 3. Parear Agent
  const { req: reqPair, res: resPair } = createMockReqRes({
    method: 'POST',
    url: '/pair',
    body: { pairingCode: code, machineName: 'CAIXA-03', os: 'windows', architecture: 'x86_64' },
  });
  await executeRouteChain(postPairHandlers, reqPair, resPair);
  assert.equal(resPair.statusCode, 201);

  // 4. Consultar status após pareamento -> USED com dados do Agent
  const { req: reqStatusAfter, res: resStatusAfter } = createMockReqRes({
    method: 'GET',
    url: `/pairing-status/${code}`,
    headers: { cookie: `witiquetas_session=${session.sessionId}` },
    params: { code },
  });
  await executeRouteChain(getPairingStatusHandlers, reqStatusAfter, resStatusAfter);
  assert.equal(resStatusAfter.statusCode, 200);
  assert.equal(resStatusAfter.data.status, 'USED');
  assert.equal(resStatusAfter.data.agent.machineName, 'CAIXA-03');
  assert.equal(resStatusAfter.data.agent.status, 'ONLINE');
});

test('7. Código de pareamento expirado (TTL > 15 min) é rejeitado com 400', async () => {
  const session = createWebSession({
    id: 'usr-matriz-01',
    companyId: 'comp-matriz-01',
    role: 'ADMIN',
  });

  const { req: reqGen, res: resGen } = createMockReqRes({
    method: 'POST',
    url: '/generate-pairing-code',
    headers: { cookie: `witiquetas_session=${session.sessionId}` },
  });
  await executeRouteChain(postGenerateCodeHandlers, reqGen, resGen);
  const code = resGen.data.pairingCode;

  // Tentativa com código que expirou
  const { req: reqPair, res: resPair } = createMockReqRes({
    method: 'POST',
    url: '/pair',
    body: { pairingCode: 'WIT-EXPIRADO-1234' },
  });
  await executeRouteChain(postPairHandlers, reqPair, resPair);
  assert.equal(resPair.statusCode, 400);
});

test('8. Rate limit de tentativas com código inválido retorna 429 Too Many Requests', async () => {
  const badIp = '192.168.99.99';
  for (let i = 0; i < 20; i++) {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/pair',
      body: { pairingCode: `WIT-FAIL-${i}` },
      ip: badIp,
    });
    await executeRouteChain(postPairHandlers, req, res);
  }

  // A 21ª tentativa a partir do mesmo IP deve ser bloqueada por rate limit
  const { req: reqBlocked, res: resBlocked } = createMockReqRes({
    method: 'POST',
    url: '/pair',
    body: { pairingCode: 'WIT-FAIL-BLOCKED' },
    ip: badIp,
  });
  await executeRouteChain(postPairHandlers, reqBlocked, resBlocked);
  assert.equal(resBlocked.statusCode, 429, 'Tentativas excessivas devem retornar 429');
});

test('9. Token emitido no pareamento autentica com sucesso no heartbeat do Agent', async () => {
  const session = createWebSession({
    id: 'usr-matriz-01',
    companyId: 'comp-matriz-01',
    role: 'ADMIN',
  });

  // 1. Gerar e parear
  const { req: reqGen, res: resGen } = createMockReqRes({
    method: 'POST',
    url: '/generate-pairing-code',
    headers: { cookie: `witiquetas_session=${session.sessionId}` },
  });
  await executeRouteChain(postGenerateCodeHandlers, reqGen, resGen);

  const { req: reqPair, res: resPair } = createMockReqRes({
    method: 'POST',
    url: '/pair',
    body: { pairingCode: resGen.data.pairingCode, machineName: 'PDV-05' },
  });
  await executeRouteChain(postPairHandlers, reqPair, resPair);
  assert.equal(resPair.statusCode, 201);

  const { agentId, token } = resPair.data;

  // 2. Heartbeat com o token emitido
  const postHeartbeatHandlers = (agentsRouter as any).routes.find(
    (r: any) => r.method === 'POST' && r.path === '/heartbeat'
  ).handlers;

  const { req: reqHb, res: resHb } = createMockReqRes({
    method: 'POST',
    url: '/heartbeat',
    headers: {
      authorization: `Bearer ${token}`,
    },
    body: {
      agentId,
      status: 'ONLINE',
      agentVersion: '0.1.0',
    },
  });
  await executeRouteChain(postHeartbeatHandlers, reqHb, resHb);

  assert.equal(resHb.statusCode, 200);
  assert.equal(resHb.data.acknowledged, true);
});

test('10. Pairing com installationId informado preserva exatamente o mesmo valor', async () => {
  const session = createWebSession({
    id: 'usr-matriz-01',
    companyId: 'comp-matriz-01',
    role: 'ADMIN',
  });

  const { req: reqGen, res: resGen } = createMockReqRes({
    method: 'POST',
    url: '/generate-pairing-code',
    headers: { cookie: `witiquetas_session=${session.sessionId}` },
  });
  await executeRouteChain(postGenerateCodeHandlers, reqGen, resGen);

  const customInstallationId = 'inst-custom-hardware-guid-999';

  const { req: reqPair, res: resPair } = createMockReqRes({
    method: 'POST',
    url: '/pair',
    body: {
      pairingCode: resGen.data.pairingCode,
      machineName: 'CAIXA-PRESERVADO',
      installationId: customInstallationId,
    },
  });
  await executeRouteChain(postPairHandlers, reqPair, resPair);

  assert.equal(resPair.statusCode, 201);
  assert.equal(resPair.data.installationId, customInstallationId, 'Deve preservar exatamente o installationId enviado');

  const saved = agentsStore.get(resPair.data.agentId)!;
  assert.equal(saved.installationId, customInstallationId);
});

test('11. Pairing sem installationId gera automaticamente novo identificador persistente', async () => {
  const session = createWebSession({
    id: 'usr-matriz-01',
    companyId: 'comp-matriz-01',
    role: 'ADMIN',
  });

  const { req: reqGen, res: resGen } = createMockReqRes({
    method: 'POST',
    url: '/generate-pairing-code',
    headers: { cookie: `witiquetas_session=${session.sessionId}` },
  });
  await executeRouteChain(postGenerateCodeHandlers, reqGen, resGen);

  const { req: reqPair, res: resPair } = createMockReqRes({
    method: 'POST',
    url: '/pair',
    body: {
      pairingCode: resGen.data.pairingCode,
      machineName: 'CAIXA-AUTO-INST',
    },
  });
  await executeRouteChain(postPairHandlers, reqPair, resPair);

  assert.equal(resPair.statusCode, 201);
  assert.ok(resPair.data.installationId.startsWith('inst-'));
});

test('12. Fluxo Completo: Navegador novo sem cookie faz bootstrap pré-RBAC e gera pairing code com sucesso', async () => {
  const authModule = await import('../apps/backend/src/routes/auth.js');
  const postAuthSessionHandlers = (authModule.default as any).routes.find(
    (r: any) => r.method === 'POST' && r.path === '/pre-rbac-session'
  ).handlers;

  const getAuthSessionHandlers = (authModule.default as any).routes.find(
    (r: any) => r.method === 'GET' && r.path === '/session'
  ).handlers;

  // 1. Navegador novo chama /pre-rbac-session sem apiKey
  const { req: reqBoot, res: resBoot } = createMockReqRes({
    method: 'POST',
    url: '/pre-rbac-session',
    body: {},
  });
  await executeRouteChain(postAuthSessionHandlers, reqBoot, resBoot);

  assert.equal(resBoot.statusCode, 200, 'Bootstrap sem apiKey em ambiente pre-RBAC deve retornar 200');
  assert.ok(resBoot.data.success);
  assert.equal(resBoot.data.user.role, 'ADMIN');

  const setCookie = resBoot.getHeader('set-cookie');
  assert.ok(setCookie && setCookie.includes('witiquetas_session='));
  const sessionIdMatch = setCookie.match(/witiquetas_session=([a-f0-9]+)/);
  assert.ok(sessionIdMatch);
  const sessionId = sessionIdMatch[1];

  // 2. GET /session com o cookie emitido
  const { req: reqSess, res: resSess } = createMockReqRes({
    method: 'GET',
    url: '/session',
    headers: { cookie: `witiquetas_session=${sessionId}` },
  });
  await executeRouteChain(getAuthSessionHandlers, reqSess, resSess);

  assert.equal(resSess.statusCode, 200);
  assert.equal(resSess.data.authenticated, true);
  assert.equal(resSess.data.user.companyId, 'comp-matriz-01');

  // 3. POST /agents/generate-pairing-code usando a sessão web
  const { req: reqGen, res: resGen } = createMockReqRes({
    method: 'POST',
    url: '/generate-pairing-code',
    headers: { cookie: `witiquetas_session=${sessionId}` },
  });
  await executeRouteChain(postGenerateCodeHandlers, reqGen, resGen);

  assert.equal(resGen.statusCode, 200);
  assert.match(resGen.data.pairingCode, /^WIT-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  // 4. Agent faz pareamento usando o código
  const { req: reqPair, res: resPair } = createMockReqRes({
    method: 'POST',
    url: '/pair',
    body: {
      pairingCode: resGen.data.pairingCode,
      machineName: 'DESKTOP-TERMINAL-FINAL',
    },
  });
  await executeRouteChain(postPairHandlers, reqPair, resPair);

  assert.equal(resPair.statusCode, 201);
  assert.ok(resPair.data.token);
  assert.ok(resPair.data.agentId);

  // 5. Código é single-use: reutilização falha com 409 Conflict
  const { req: reqReuse, res: resReuse } = createMockReqRes({
    method: 'POST',
    url: '/pair',
    body: {
      pairingCode: resGen.data.pairingCode,
      machineName: 'DESKTOP-INVASOR',
    },
  });
  await executeRouteChain(postPairHandlers, reqReuse, resReuse);
  assert.equal(resReuse.statusCode, 409);

  // 6. Agent envia heartbeat e passa para ONLINE
  const { req: reqHb, res: resHb } = createMockReqRes({
    method: 'POST',
    url: '/heartbeat',
    headers: {
      authorization: `Bearer ${resPair.data.token}`,
    },
    body: {
      agentId: resPair.data.agentId,
      status: 'ONLINE',
      agentVersion: '0.1.0',
    },
  });
  await executeRouteChain(postHeartbeatHandlers, reqHb, resHb);
  assert.equal(resHb.statusCode, 200);
  assert.equal(resHb.data.acknowledged, true);
});



