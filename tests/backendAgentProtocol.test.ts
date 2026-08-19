import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  PairAgentResponseDTO,
  AgentHeartbeatResponseDTO,
  PrintJobDTO,
  PrintJobDeliveryStatus,
  CopyStrategy,
} from '../packages/contracts/src/index.js';
import {
  encodeWindows1252,
  decodeWindows1252,
  encodePayload,
  decodePayload,
} from '../packages/contracts/src/encoding.js';
import printJobsRouter, {
  printJobsStore,
  claimPendingJobsForAgent,
  VALID_DELIVERY_STATUSES,
  isValidStatusTransition,
  detectCopyStrategy,
  DEFAULT_PRINT_JOB_MAX_ATTEMPTS,
} from '../apps/backend/src/routes/printJobs.js';
import agentsRouter, {
  DEFAULT_AGENT_POLL_INTERVAL_SECONDS,
  agentsStore,
  hashToken,
  verifyTokenHash,
  verifyWebUserToken,
  type AgentRecord,
  type AuthWebUser,
} from '../apps/backend/src/routes/agents.js';
import { printersStore } from '../apps/backend/src/routes/printers.js';

// Setup de chaves administrativas dinâmicas injetadas via ENV para os testes (sem hardcode)
const testAdminKeyMatriz = `test_adm_matriz_${crypto.randomBytes(16).toString('hex')}`;
const testSuperAdminKey = `test_super_adm_${crypto.randomBytes(16).toString('hex')}`;

process.env.ADMIN_API_KEY = testAdminKeyMatriz;
process.env.ADMIN_COMPANY_ID = 'comp-matriz-01';
process.env.SUPER_ADMIN_API_KEY = testSuperAdminKey;

// Helper: Executa a cadeia de handlers de rota (incluindo middlewares de autenticação)
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

// Helper: Cria objetos mock de request e response
function createMockReqRes(options: {
  method?: string;
  body?: any;
  params?: any;
  query?: any;
  headers?: any;
  agent?: any;
  user?: any;
}) {
  let statusCode = 200;
  let responseData: any = null;

  const req: any = {
    method: options.method || 'GET',
    body: options.body || {},
    params: options.params || {},
    query: options.query || {},
    headers: options.headers || {},
    agent: options.agent,
    user: options.user,
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
    getStatusCode() {
      return statusCode;
    },
    getData() {
      return responseData;
    },
  };

  return { req, res };
}

// Obter cadeias de handlers das rotas do Router Express
const postJobHandlers = (printJobsRouter as any).routes.find(
  (r: any) => r.method === 'POST' && r.path === '/'
).handlers;

const getPendingJobsHandlers = (printJobsRouter as any).routes.find(
  (r: any) => r.method === 'GET' && r.path === '/pending'
).handlers;

const patchJobStatusHandlers = (printJobsRouter as any).routes.find(
  (r: any) => r.method === 'PATCH' && r.path === '/:id/status'
).handlers;

const getPrintJobsHistoryHandlers = (printJobsRouter as any).routes.find(
  (r: any) => r.method === 'GET' && r.path === '/'
).handlers;

const heartbeatHandlers = (agentsRouter as any).routes.find(
  (r: any) => r.method === 'POST' && r.path === '/heartbeat'
).handlers;

const generatePairingCodeHandlers = (agentsRouter as any).routes.find(
  (r: any) => r.method === 'POST' && r.path === '/generate-pairing-code'
).handlers;

const getAgentsHandlers = (agentsRouter as any).routes.find(
  (r: any) => r.method === 'GET' && r.path === '/'
).handlers;

// ============================================================================
// BLOCO 1: CODIFICAÇÃO CP1252 REAL vs LATIN1 vs UTF-8
// ============================================================================

test('1. CP1252 Real: Caractere Euro € resulta exatamente no byte 0x80 (128)', () => {
  const euroBytes = encodeWindows1252('€');
  assert.equal(euroBytes.length, 1);
  assert.equal(euroBytes[0], 0x80, 'O caractere € em CP1252 deve ser o byte 0x80 (128)');

  const decodedEuro = decodeWindows1252(euroBytes);
  assert.equal(decodedEuro, '€', 'Decodificação de 0x80 em CP1252 deve recuperar o símbolo €');
});

test('2. UTF-8 vs CP1252: UTF-8 produz 3 bytes enquanto CP1252 produz 1 byte para €', () => {
  const utf8Bytes = encodePayload('€', 'utf-8');
  const cp1252Bytes = encodePayload('€', 'windows-1252');

  assert.equal(utf8Bytes.length, 3, 'Em UTF-8, o símbolo € ocupa 3 bytes (0xE2, 0x82, 0xAC)');
  assert.equal(cp1252Bytes.length, 1, 'Em Windows-1252, o símbolo € ocupa 1 byte (0x80)');
  assert.notDeepEqual(utf8Bytes, cp1252Bytes, 'UTF-8 e CP1252 geram bytes completamente distintos para €');
});

test('3. Caracteres do Português: Acentuação e Símbolos Monetários R$', () => {
  const sample = 'A10,10,0,2,2,2,N,"PROMOÇÃO: CAFÉ & PÃO DE QUEIJO - R$ 12,50"';
  const cp1252 = encodePayload(sample, 'windows-1252');
  const decoded = decodePayload(cp1252, 'windows-1252');

  assert.equal(decoded, sample);
  assert.equal(cp1252.length, sample.length, 'Cada caractere na faixa ISO-8859-1/CP1252 ocupa 1 byte');
});

// ============================================================================
// BLOCO 2: AUDITORIA DE SEGURANÇA CONTRA SECRETS HARDCODED
// ============================================================================

test('4. Auditoria de Código-Fonte: Nenhum token administrativo literal hardcoded existe no backend', () => {
  const agentsSrc = fs.readFileSync(path.resolve('./apps/backend/src/routes/agents.ts'), 'utf8');
  const printJobsSrc = fs.readFileSync(path.resolve('./apps/backend/src/routes/printJobs.ts'), 'utf8');

  assert.equal(agentsSrc.includes('adm_secret_'), false, 'Nenhum adm_secret_ pode estar no arquivo agents.ts');
  assert.equal(printJobsSrc.includes('adm_secret_'), false, 'Nenhum adm_secret_ pode estar no arquivo printJobs.ts');
  assert.equal(agentsSrc.includes('validWebTokens'), false, 'validWebTokens hardcoded deve ser completamente removido');
});

test('5. Falha-fechada: Sem ADMIN_API_KEY no ambiente, POST /generate-pairing-code retorna HTTP 503', async () => {
  const savedAdminKey = process.env.ADMIN_API_KEY;
  const savedSuperAdminKey = process.env.SUPER_ADMIN_API_KEY;
  delete process.env.ADMIN_API_KEY;
  delete process.env.SUPER_ADMIN_API_KEY;

  const { req, res } = createMockReqRes({
    method: 'POST',
    headers: { authorization: 'Bearer qualquer_token' },
    body: {},
  });
  await executeRouteChain(generatePairingCodeHandlers, req, res);

  assert.equal(res.getStatusCode(), 503, 'Sem ADMIN_API_KEY configurada, deve falhar fechado com 503');

  // Restaurar chaves para os demais testes
  process.env.ADMIN_API_KEY = savedAdminKey;
  process.env.SUPER_ADMIN_API_KEY = savedSuperAdminKey;
});

// ============================================================================
// BLOCO 3: DETECÇÃO DE COPY STRATEGY ESPECÍFICA POR LINGUAGEM
// ============================================================================

test('6. CopyStrategy: PPLB com comando P isolado define EMBEDDED_IN_PAYLOAD', () => {
  const pplbWithP = 'I8,A,001\nQ240,024\nq831\nA10,10,0,1,1,1,N,"PROD"\nP5\n';
  const strategy = detectCopyStrategy(pplbWithP, 'PPLB');
  assert.equal(strategy, 'EMBEDDED_IN_PAYLOAD');
});

test('7. CopyStrategy: ZPL com ^PQ define EMBEDDED_IN_PAYLOAD', () => {
  const zplWithPQ = '^XA\n^FO50,50^ADN,36,20^FDTESTE^FS\n^PQ5\n^XZ';
  const strategy = detectCopyStrategy(zplWithPQ, 'ZPL');
  assert.equal(strategy, 'EMBEDDED_IN_PAYLOAD');
});

test('8. CopyStrategy: Comando sem quantidade nativa define TRANSPORT_REPEAT', () => {
  const plainText = 'A10,10,0,1,1,1,N,"TEXTO SEM COMANDO P"';
  const strategy = detectCopyStrategy(plainText, 'PPLB');
  assert.equal(strategy, 'TRANSPORT_REPEAT');
});

// ============================================================================
// BLOCO 4: SEGURANÇA DE AUTENTICAÇÃO E TIMING SAFE EQUAL
// ============================================================================

test('9. verifyTokenHash: Rejeita strings com timing seguro e não estoura exceção em tamanhos diferentes', () => {
  const secret = 'agt_live_secret_sample_key';
  const validHash = hashToken(secret);

  assert.equal(verifyTokenHash(secret, validHash), true);
  assert.equal(verifyTokenHash('agt_live_wrong', validHash), false);
  assert.equal(verifyTokenHash('', validHash), false);
  assert.equal(verifyTokenHash(secret, ''), false);
  assert.equal(verifyTokenHash(secret, 'hash_invalido_curto'), false);
});

// ============================================================================
// BLOCO 5: ISOLAMENTO RIGOROSO DE TOKENS (AGENT vs WEB USER)
// ============================================================================

// Registrar agentes simulados no store
const rawTokenMatriz = 'agt_live_matriz_secret_token_123456';
const agentMatriz: AgentRecord = {
  id: 'agent-matriz-01',
  companyId: 'comp-matriz-01',
  installationId: 'inst-matriz-01',
  machineName: 'MATRIZ-SRV-PRINT',
  os: 'windows',
  architecture: 'x86_64',
  agentVersion: '0.1.0',
  status: 'ONLINE',
  lastSeenAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  tokenHash: hashToken(rawTokenMatriz),
};
agentsStore.set(agentMatriz.id, agentMatriz);

const rawTokenFilial = 'agt_live_filial_secret_token_654321';
const agentFilial: AgentRecord = {
  id: 'agent-filial-02',
  companyId: 'comp-filial-02',
  installationId: 'inst-filial-02',
  machineName: 'FILIAL-SRV-PRINT',
  os: 'linux',
  architecture: 'x86_64',
  agentVersion: '0.1.0',
  status: 'ONLINE',
  lastSeenAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  tokenHash: hashToken(rawTokenFilial),
};
agentsStore.set(agentFilial.id, agentFilial);

test('10. Agent token em POST /print-jobs é rejeitado com HTTP 403 (Agent NÃO cria job)', async () => {
  const { req, res } = createMockReqRes({
    method: 'POST',
    headers: { authorization: `Bearer ${rawTokenMatriz}` },
    body: { printerId: 'prn-matriz-l42', compiledCommand: 'TESTE' },
  });
  await executeRouteChain(postJobHandlers, req, res);
  assert.equal(res.getStatusCode(), 403);
});

test('11. Agent token em POST /generate-pairing-code é rejeitado com HTTP 403', async () => {
  const { req, res } = createMockReqRes({
    method: 'POST',
    headers: { authorization: `Bearer ${rawTokenMatriz}` },
    body: {},
  });
  await executeRouteChain(generatePairingCodeHandlers, req, res);
  assert.equal(res.getStatusCode(), 403);
});

test('12. Agent token em GET /agents é rejeitado com HTTP 403', async () => {
  const { req, res } = createMockReqRes({
    method: 'GET',
    headers: { authorization: `Bearer ${rawTokenMatriz}` },
  });
  await executeRouteChain(getAgentsHandlers, req, res);
  assert.equal(res.getStatusCode(), 403);
});

test('13. Web token em POST /agents/heartbeat é rejeitado com HTTP 403 (Web user não é daemon)', async () => {
  const { req, res } = createMockReqRes({
    method: 'POST',
    headers: { authorization: `Bearer ${testAdminKeyMatriz}` },
    body: { status: 'ONLINE' },
  });
  await executeRouteChain(heartbeatHandlers, req, res);
  assert.equal(res.getStatusCode(), 403);
});

test('14. Web token em PATCH /print-jobs/:id/status é rejeitado com HTTP 403 (Web user não atualiza execução física)', async () => {
  const { req, res } = createMockReqRes({
    method: 'PATCH',
    params: { id: 'job-matriz-test-01' },
    headers: { authorization: `Bearer ${testAdminKeyMatriz}` },
    body: { status: 'PRINTED' },
  });
  await executeRouteChain(patchJobStatusHandlers, req, res);
  assert.equal(res.getStatusCode(), 403);
});

// ============================================================================
// BLOCO 6: ROTAS OPERACIONAIS DO AGENT (PENDING, CLAIM, STATUS, HEARTBEAT)
// ============================================================================

test('15. /pending sem token retorna HTTP 401', async () => {
  const { req, res } = createMockReqRes({ method: 'GET', headers: {} });
  await executeRouteChain(getPendingJobsHandlers, req, res);
  assert.equal(res.getStatusCode(), 401);
});

test('16. /pending com x-agent-id ou query agentId mas sem token retorna HTTP 401 (agentId não autentica)', async () => {
  const { req, res } = createMockReqRes({
    method: 'GET',
    headers: { 'x-agent-id': 'agent-matriz-01' },
    query: { agentId: 'agent-matriz-01' },
  });
  await executeRouteChain(getPendingJobsHandlers, req, res);
  assert.equal(res.getStatusCode(), 401);
});

test('17. /pending com token inválido retorna HTTP 403', async () => {
  const { req, res } = createMockReqRes({
    method: 'GET',
    headers: { authorization: 'Bearer agt_live_token_falso_invalido' },
  });
  await executeRouteChain(getPendingJobsHandlers, req, res);
  assert.equal(res.getStatusCode(), 403);
});

test('18. /pending com token do tenant correto retorna sucesso e isola jobs de outros tenants', async () => {
  // Cadastrar impressora e job para Matriz
  printersStore.set('prn-matriz-l42', {
    id: 'prn-matriz-l42',
    companyId: 'comp-matriz-01',
    name: 'Elgin L42 Matriz',
    protocol: 'RAW_TCP',
    host: '192.168.1.100',
    port: 9100,
    language: 'PPLB',
    active: true,
  } as any);

  const jobMatriz: PrintJobDTO = {
    id: 'job-matriz-test-01',
    companyId: 'comp-matriz-01',
    printerId: 'prn-matriz-l42',
    printerName: 'Elgin L42 Matriz',
    status: 'PENDING',
    language: 'PPLB',
    encoding: 'windows-1252',
    copies: 1,
    copyStrategy: 'EMBEDDED_IN_PAYLOAD',
    payload: 'TESTE MATRIZ',
    payloadBase64: 'VEVTVEU=',
    payloadBytesLength: 5,
    checksumSha256: 'abc',
    attempts: 0,
    maxAttempts: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  printJobsStore.set(jobMatriz.id, jobMatriz);

  // Job de outro tenant (Filial 02)
  const jobFilial: PrintJobDTO = {
    id: 'job-filial-test-02',
    companyId: 'comp-filial-02',
    printerId: 'prn-filial-l42',
    printerName: 'Elgin L42 Filial',
    status: 'PENDING',
    language: 'PPLB',
    encoding: 'windows-1252',
    copies: 1,
    copyStrategy: 'EMBEDDED_IN_PAYLOAD',
    payload: 'TESTE FILIAL',
    payloadBase64: 'VEVTVEU=',
    payloadBytesLength: 5,
    checksumSha256: 'abc',
    attempts: 0,
    maxAttempts: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  printJobsStore.set(jobFilial.id, jobFilial);

  const { req, res } = createMockReqRes({
    method: 'GET',
    headers: { authorization: `Bearer ${rawTokenMatriz}` },
  });

  await executeRouteChain(getPendingJobsHandlers, req, res);
  assert.equal(res.getStatusCode(), 200);

  const data = res.getData();
  const claimedFilialJob = data.jobs.find((j: any) => j.jobId === 'job-filial-test-02');
  assert.equal(claimedFilialJob, undefined, 'Filial 02 job não pode ser entregue para Matriz');

  const claimedMatrizJob = data.jobs.find((j: any) => j.jobId === 'job-matriz-test-01');
  assert.ok(claimedMatrizJob, 'Job da Matriz deve ser entregue com claim atômico');
  assert.ok(claimedMatrizJob.leaseId.startsWith('lease-'));
  assert.ok(claimedMatrizJob.attemptId.startsWith('att-'));
});

test('19. Heartbeat sem token retorna HTTP 401', async () => {
  const { req, res } = createMockReqRes({ method: 'POST', body: { status: 'ONLINE' } });
  await executeRouteChain(heartbeatHandlers, req, res);
  assert.equal(res.getStatusCode(), 401);
});

test('20. Status update sem leaseId em job claimed retorna HTTP 400', async () => {
  const job = printJobsStore.get('job-matriz-test-01')!;
  const { req, res } = createMockReqRes({
    method: 'PATCH',
    params: { id: job.id },
    headers: { authorization: `Bearer ${rawTokenMatriz}` },
    body: {
      status: 'DELIVERING',
      attemptId: job.attemptId,
    },
  });
  await executeRouteChain(patchJobStatusHandlers, req, res);
  assert.equal(res.getStatusCode(), 400);
  assert.ok(res.getData().error.includes('leaseId é obrigatório'));
});

test('21. Status update com leaseId incorreto retorna HTTP 409', async () => {
  const job = printJobsStore.get('job-matriz-test-01')!;
  const { req, res } = createMockReqRes({
    method: 'PATCH',
    params: { id: job.id },
    headers: { authorization: `Bearer ${rawTokenMatriz}` },
    body: {
      status: 'DELIVERING',
      leaseId: 'lease-falso-999',
      attemptId: job.attemptId,
    },
  });
  await executeRouteChain(patchJobStatusHandlers, req, res);
  assert.equal(res.getStatusCode(), 409);
});

test('22. Status update com lease expirado retorna HTTP 409', async () => {
  const job = printJobsStore.get('job-matriz-test-01')!;
  job.leaseExpiresAt = new Date(Date.now() - 5000).toISOString();

  const { req, res } = createMockReqRes({
    method: 'PATCH',
    params: { id: job.id },
    headers: { authorization: `Bearer ${rawTokenMatriz}` },
    body: {
      status: 'DELIVERING',
      leaseId: job.leaseId,
      attemptId: job.attemptId,
    },
  });
  await executeRouteChain(patchJobStatusHandlers, req, res);
  assert.equal(res.getStatusCode(), 409);
  assert.ok(res.getData().error.includes('Lease expirado'));
});

test('23. attempts >= maxAttempts impede novo claim e transiciona para FAILED', () => {
  const jobExhausted: PrintJobDTO = {
    id: 'job-exhausted-attempts',
    companyId: 'comp-matriz-01',
    printerId: 'prn-matriz-l42',
    printerName: 'Elgin L42 Matriz',
    status: 'PENDING',
    language: 'PPLB',
    encoding: 'windows-1252',
    copies: 1,
    copyStrategy: 'EMBEDDED_IN_PAYLOAD',
    payload: 'TESTE EXHAUSTED',
    payloadBase64: 'VEVTVEU=',
    payloadBytesLength: 5,
    checksumSha256: 'abc',
    attempts: 3,
    maxAttempts: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  printJobsStore.set(jobExhausted.id, jobExhausted);

  const claimed = claimPendingJobsForAgent(agentMatriz);
  const found = claimed.find((j) => j.jobId === 'job-exhausted-attempts');
  assert.equal(found, undefined, 'Job com tentativas esgotadas não pode receber novo claim');

  const updatedStoredJob = printJobsStore.get('job-exhausted-attempts')!;
  assert.equal(updatedStoredJob.status, 'FAILED');
  assert.ok(updatedStoredJob.error?.includes('Limite máximo de tentativas'));
});

// ============================================================================
// BLOCO 7: ROTAS EXCLUSIVAS DO PAINEL WEB / ADMIN (GERAR PAIRING CODE, CRIAR JOB, HISTÓRICO)
// ============================================================================

test('24. POST /generate-pairing-code com credencial administrativa de ambiente gera código com sucesso', async () => {
  const { req, res } = createMockReqRes({
    method: 'POST',
    headers: { authorization: `Bearer ${testAdminKeyMatriz}` },
    body: { companyName: 'Supermercado WR Matriz' },
  });
  await executeRouteChain(generatePairingCodeHandlers, req, res);
  assert.equal(res.getStatusCode(), 200);
  const data = res.getData();
  assert.ok(data.pairingCode.startsWith('WIT-'));
  assert.equal(data.companyId, 'comp-matriz-01');
});

test('25. POST /generate-pairing-code tentativa de geração para outro tenant retorna HTTP 403', async () => {
  const { req, res } = createMockReqRes({
    method: 'POST',
    headers: { authorization: `Bearer ${testAdminKeyMatriz}` },
    body: { companyId: 'comp-filial-02' },
  });
  await executeRouteChain(generatePairingCodeHandlers, req, res);
  assert.equal(res.getStatusCode(), 403);
  assert.ok(res.getData().error.includes('Não autorizado'));
});

test('26. GET /agents: anônimo retorna 401 e credencial válida lista apenas agentes do tenant', async () => {
  const { req, res } = createMockReqRes({
    method: 'GET',
    headers: { authorization: `Bearer ${testAdminKeyMatriz}` },
  });
  await executeRouteChain(getAgentsHandlers, req, res);
  assert.equal(res.getStatusCode(), 200);
  const data = res.getData();
  assert.ok(data.agents.length > 0);
  assert.ok(data.agents.every((a: any) => a.companyId === 'comp-matriz-01'));
});

test('27. GET /print-jobs: credencial de admin filtra histórico apenas pelo tenant autorizado', async () => {
  const { req, res } = createMockReqRes({
    method: 'GET',
    headers: { authorization: `Bearer ${testAdminKeyMatriz}` },
  });
  await executeRouteChain(getPrintJobsHistoryHandlers, req, res);
  assert.equal(res.getStatusCode(), 200);
  const data = res.getData();
  assert.ok(data.jobs.length > 0);
  assert.ok(data.jobs.every((j: any) => j.companyId === 'comp-matriz-01'));
});

test('28. POST /print-jobs: enfileiramento válido por usuário Web/Admin retorna HTTP 201', async () => {
  const { req, res } = createMockReqRes({
    method: 'POST',
    headers: { authorization: `Bearer ${testAdminKeyMatriz}` },
    body: { printerId: 'prn-matriz-l42', compiledCommand: 'I8,A,001\nP1\n', encoding: 'windows-1252' },
  });
  await executeRouteChain(postJobHandlers, req, res);
  assert.equal(res.getStatusCode(), 201);
  assert.equal(res.getData().success, true);
});
