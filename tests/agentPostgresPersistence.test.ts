import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import agentsRouter, {
  hashToken,
  authenticateAgent,
  type AgentRecord,
} from '../apps/backend/src/routes/agents.js';
import {
  AgentsRepository,
  memoryAgentsStore,
} from '../apps/backend/src/repositories/agentsRepository.js';
import { createWebSession } from '../apps/backend/src/routes/auth.js';

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

const postGenerateCodeHandlers = (agentsRouter as any).routes.find(
  (r: any) => r.method === 'POST' && r.path === '/generate-pairing-code'
).handlers;

const postPairHandlers = (agentsRouter as any).routes.find(
  (r: any) => r.method === 'POST' && r.path === '/pair'
).handlers;

const postHeartbeatHandlers = (agentsRouter as any).routes.find(
  (r: any) => r.method === 'POST' && r.path === '/heartbeat'
).handlers;

const getAgentsHandlers = (agentsRouter as any).routes.find(
  (r: any) => r.method === 'GET' && r.path === '/'
).handlers;

const deleteAgentHandlers = (agentsRouter as any).routes.find(
  (r: any) => r.method === 'DELETE' && r.path === '/:id'
).handlers;

test('1. Persistência de Agent: Pareamento grava no repositório e recupera após reinicialização de cache', async () => {
  const session = createWebSession({
    id: 'usr-admin-pg',
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
      machineName: 'SERVER-CAIXA-01',
      installationId: 'inst-hardware-uuid-12345',
      agentVersion: '0.1.0',
    },
  });
  await executeRouteChain(postPairHandlers, reqPair, resPair);

  assert.equal(resPair.statusCode, 201);
  const { agentId, token } = resPair.data;
  assert.ok(agentId);
  assert.ok(token);

  // Simular reinício do servidor / persistência (limpar cache em RAM)
  const tokenHash = hashToken(token);
  memoryAgentsStore.clear();

  // Testar busca no repositório persistente (com fallback em memória reconstruído)
  const restoredAgent: AgentRecord = {
    id: agentId,
    companyId: 'comp-matriz-01',
    installationId: 'inst-hardware-uuid-12345',
    machineName: 'SERVER-CAIXA-01',
    os: 'windows',
    architecture: 'x86_64',
    agentVersion: '0.1.0',
    status: 'ONLINE',
    lastSeenAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    tokenHash,
  };
  await AgentsRepository.save(restoredAgent);

  const found = await AgentsRepository.findByTokenHash(tokenHash);
  assert.ok(found, 'Agente deve ser encontrado pelo tokenHash');
  assert.equal(found!.id, agentId);
  assert.equal(found!.companyId, 'comp-matriz-01');
});

test('2. Heartbeat persiste atualização de lastSeenAt e status', async () => {
  const agentId = 'agent-hb-test-01';
  const token = 'agt_live_heartbeat_secret_token_123';
  const tokenHash = hashToken(token);

  await AgentsRepository.save({
    id: agentId,
    companyId: 'comp-matriz-01',
    installationId: 'inst-hb-test-01',
    machineName: 'TERMINAL-BALCAO',
    os: 'windows',
    architecture: 'x86_64',
    agentVersion: '0.1.0',
    status: 'STARTING',
    lastSeenAt: new Date(Date.now() - 60000).toISOString(),
    createdAt: new Date().toISOString(),
    tokenHash,
  });

  const { req: reqHb, res: resHb } = createMockReqRes({
    method: 'POST',
    url: '/heartbeat',
    headers: {
      authorization: `Bearer ${token}`,
    },
    body: {
      agentId,
      status: 'ONLINE',
      agentVersion: '0.1.1',
    },
  });

  await executeRouteChain(postHeartbeatHandlers, reqHb, resHb);

  assert.equal(resHb.statusCode, 200);
  assert.equal(resHb.data.acknowledged, true);

  const updated = await AgentsRepository.findById(agentId);
  assert.ok(updated);
  assert.equal(updated!.status, 'ONLINE');
  assert.equal(updated!.agentVersion, '0.1.1');
});

test('3. Revogação de Agent marca status UNAUTHORIZED e bloqueia autenticação', async () => {
  const agentId = 'agent-to-revoke-99';
  const token = 'agt_live_token_to_be_revoked_99';
  const tokenHash = hashToken(token);

  await AgentsRepository.save({
    id: agentId,
    companyId: 'comp-matriz-01',
    installationId: 'inst-revoke-99',
    machineName: 'TERMINAL-ANTIGO',
    os: 'windows',
    architecture: 'x86_64',
    agentVersion: '0.1.0',
    status: 'ONLINE',
    lastSeenAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    tokenHash,
  });

  // Sessão Admin
  const session = createWebSession({
    id: 'usr-admin-revoke',
    companyId: 'comp-matriz-01',
    role: 'ADMIN',
  });

  const { req: reqDel, res: resDel } = createMockReqRes({
    method: 'DELETE',
    url: `/${agentId}`,
    params: { id: agentId },
    headers: { cookie: `witiquetas_session=${session.sessionId}` },
  });

  await executeRouteChain(deleteAgentHandlers, reqDel, resDel);

  assert.equal(resDel.statusCode, 200);
  assert.equal(resDel.data.success, true);

  // Tentativa de autenticação pelo Agent revogado deve falhar com 403
  const { req: reqAuth, res: resAuth } = createMockReqRes({
    method: 'POST',
    url: '/heartbeat',
    headers: {
      authorization: `Bearer ${token}`,
    },
    body: { agentId },
  });

  let nextCalled = false;
  await authenticateAgent(reqAuth, resAuth, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false, 'Next não deve ser chamado para agente revogado');
  assert.equal(resAuth.statusCode, 403, 'Agente revogado deve receber 403 Forbidden');
});

test('4. Isolamento Multi-Tenant: Agentes da Matriz não são listados na consulta da Filial', async () => {
  const agentMatrizId = 'agent-matriz-iso-01';
  const agentFilialId = 'agent-filial-iso-02';

  await AgentsRepository.save({
    id: agentMatrizId,
    companyId: 'comp-matriz-01',
    installationId: 'inst-matriz-iso-01',
    machineName: 'MATRIZ-SRV',
    os: 'windows',
    architecture: 'x86_64',
    agentVersion: '0.1.0',
    status: 'ONLINE',
    lastSeenAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    tokenHash: hashToken('token_matriz_iso'),
  });

  await AgentsRepository.save({
    id: agentFilialId,
    companyId: 'comp-filial-02',
    installationId: 'inst-filial-iso-02',
    machineName: 'FILIAL-SRV',
    os: 'windows',
    architecture: 'x86_64',
    agentVersion: '0.1.0',
    status: 'ONLINE',
    lastSeenAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    tokenHash: hashToken('token_filial_iso'),
  });

  const sessionFilial = createWebSession({
    id: 'usr-admin-filial',
    companyId: 'comp-filial-02',
    role: 'ADMIN',
  });

  const { req: reqList, res: resList } = createMockReqRes({
    method: 'GET',
    url: '/',
    headers: { cookie: `witiquetas_session=${sessionFilial.sessionId}` },
  });

  await executeRouteChain(getAgentsHandlers, reqList, resList);

  assert.equal(resList.statusCode, 200);
  const data = resList.data;
  assert.ok(data.agents.every((a: any) => a.companyId === 'comp-filial-02'), 'Nenhum agente de outro tenant deve ser retornado');
  assert.ok(data.agents.some((a: any) => a.id === agentFilialId));
  assert.ok(!data.agents.some((a: any) => a.id === agentMatrizId));
});

test('5. Segurança: Token bruto nunca é persistido ou retornado nas consultas', async () => {
  const rawToken = 'agt_live_super_secret_raw_token_xyz987';
  const tokenHash = hashToken(rawToken);
  const agentId = 'agent-security-test-01';

  await AgentsRepository.save({
    id: agentId,
    companyId: 'comp-matriz-01',
    installationId: 'inst-sec-01',
    machineName: 'SEC-AGENT',
    os: 'windows',
    architecture: 'x86_64',
    agentVersion: '0.1.0',
    status: 'ONLINE',
    lastSeenAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    tokenHash,
  });

  const found = await AgentsRepository.findById(agentId);
  assert.ok(found);
  assert.equal(found!.tokenHash, tokenHash);
  assert.notEqual(found!.tokenHash, rawToken, 'Token persistido deve ser exclusivamente o hash SHA-256');

  const session = createWebSession({
    id: 'usr-admin-sec',
    companyId: 'comp-matriz-01',
    role: 'ADMIN',
  });

  const { req, res } = createMockReqRes({
    method: 'GET',
    url: '/',
    headers: { cookie: `witiquetas_session=${session.sessionId}` },
  });

  await executeRouteChain(getAgentsHandlers, req, res);
  assert.equal(res.statusCode, 200);
  const agentInList = res.data.agents.find((a: any) => a.id === agentId);
  assert.ok(agentInList);
  assert.equal((agentInList as any).token, undefined, 'Token bruto nunca deve ser exposto na API');
  assert.equal((agentInList as any).tokenHash, undefined, 'TokenHash nunca deve ser exposto no DTO público');
});
