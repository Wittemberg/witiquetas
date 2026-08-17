import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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
  type AgentRecord,
} from '../apps/backend/src/routes/agents.js';
import { printersStore } from '../apps/backend/src/routes/printers.js';

// Helper: Executa a cadeia de handlers de rota (incluindo middleware authenticateAgent)
function executeRouteChain(handlers: Function[], req: any, res: any) {
  let idx = 0;
  function next() {
    idx++;
    if (idx < handlers.length) {
      handlers[idx](req, res, next);
    }
  }
  if (handlers.length > 0) {
    handlers[0](req, res, next);
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

const heartbeatHandlers = (agentsRouter as any).routes.find(
  (r: any) => r.method === 'POST' && r.path === '/heartbeat'
).handlers;

const generatePairingCodeHandlers = (agentsRouter as any).routes.find(
  (r: any) => r.method === 'POST' && r.path === '/generate-pairing-code'
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
// BLOCO 2: DETECÇÃO DE COPY STRATEGY ESPECÍFICA POR LINGUAGEM
// ============================================================================

test('4. CopyStrategy: PPLB com comando P isolado define EMBEDDED_IN_PAYLOAD', () => {
  const pplbWithP = 'I8,A,001\nQ240,024\nq831\nA10,10,0,1,1,1,N,"PROD"\nP5\n';
  const strategy = detectCopyStrategy(pplbWithP, 'PPLB');
  assert.equal(strategy, 'EMBEDDED_IN_PAYLOAD');
});

test('5. CopyStrategy: ZPL com ^PQ define EMBEDDED_IN_PAYLOAD', () => {
  const zplWithPQ = '^XA\n^FO50,50^ADN,36,20^FDTESTE^FS\n^PQ5\n^XZ';
  const strategy = detectCopyStrategy(zplWithPQ, 'ZPL');
  assert.equal(strategy, 'EMBEDDED_IN_PAYLOAD');
});

test('6. CopyStrategy: Comando sem quantidade nativa define TRANSPORT_REPEAT', () => {
  const plainText = 'A10,10,0,1,1,1,N,"TEXTO SEM COMANDO P"';
  const strategy = detectCopyStrategy(plainText, 'PPLB');
  assert.equal(strategy, 'TRANSPORT_REPEAT');
});

// ============================================================================
// BLOCO 3: SEGURANÇA DE AUTENTICAÇÃO E TIMING SAFE EQUAL
// ============================================================================

test('7. Segurança de Token: verifyTokenHash com timingSafeEqual valida hashes com segurança', () => {
  const rawToken = 'agt_live_test_secret_12345';
  const tokenHash = hashToken(rawToken);

  assert.equal(verifyTokenHash(rawToken, tokenHash), true);
  assert.equal(verifyTokenHash('agt_live_wrong_token', tokenHash), false);
  assert.equal(verifyTokenHash('', tokenHash), false);
});

// ============================================================================
// BLOCO 4: HARDENING REAL DE ROTAS (AUTENTICAÇÃO, TENANT E LEASES)
// ============================================================================

const rawTokenMatriz = 'agt_live_matriz_secret_token_12345';
const agentMatriz: AgentRecord = {
  id: 'agent-matriz-01',
  companyId: 'comp-matriz-01',
  installationId: 'inst-matriz-01',
  machineName: 'WIN-MATRIZ',
  os: 'windows',
  architecture: 'x86_64',
  agentVersion: '0.1.0',
  status: 'ONLINE',
  lastSeenAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  tokenHash: hashToken(rawTokenMatriz),
};
agentsStore.set(agentMatriz.id, agentMatriz);

const rawTokenFilial = 'agt_live_filial_secret_token_67890';
const agentFilial: AgentRecord = {
  id: 'agent-filial-02',
  companyId: 'comp-filial-02',
  installationId: 'inst-filial-02',
  machineName: 'WIN-FILIAL',
  os: 'windows',
  architecture: 'x86_64',
  agentVersion: '0.1.0',
  status: 'ONLINE',
  lastSeenAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  tokenHash: hashToken(rawTokenFilial),
};
agentsStore.set(agentFilial.id, agentFilial);

test('8. /pending sem token retorna HTTP 401', () => {
  const { req, res } = createMockReqRes({ method: 'GET', headers: {} });
  executeRouteChain(getPendingJobsHandlers, req, res);
  assert.equal(res.getStatusCode(), 401);
});

test('9. /pending com x-agent-id ou query agentId mas sem token retorna HTTP 401 (agentId não autentica)', () => {
  const { req, res } = createMockReqRes({
    method: 'GET',
    headers: { 'x-agent-id': 'agent-matriz-01' },
    query: { agentId: 'agent-matriz-01' },
  });
  executeRouteChain(getPendingJobsHandlers, req, res);
  assert.equal(res.getStatusCode(), 401);
});

test('10. /pending com token inválido retorna HTTP 403', () => {
  const { req, res } = createMockReqRes({
    method: 'GET',
    headers: { authorization: 'Bearer agt_live_token_falso_invalido' },
  });
  executeRouteChain(getPendingJobsHandlers, req, res);
  assert.equal(res.getStatusCode(), 403);
});

test('11. /pending com token do tenant correto retorna sucesso e isola jobs de outros tenants', () => {
  // Cadastrar impressora e job para Matriz
  printersStore.set('prn-matriz-l42', {
    id: 'prn-matriz-l42',
    companyId: 'comp-matriz-01',
    name: 'Elgin L42 Matriz',
    protocol: 'RAW_TCP',
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

  executeRouteChain(getPendingJobsHandlers, req, res);
  assert.equal(res.getStatusCode(), 200);

  const data = res.getData();
  const claimedFilialJob = data.jobs.find((j: any) => j.jobId === 'job-filial-test-02');
  assert.equal(claimedFilialJob, undefined, 'Filial 02 job não pode ser entregue para Matriz');

  const claimedMatrizJob = data.jobs.find((j: any) => j.jobId === 'job-matriz-test-01');
  assert.ok(claimedMatrizJob, 'Job da Matriz deve ser entregue com claim atômico');
  assert.ok(claimedMatrizJob.leaseId.startsWith('lease-'));
  assert.ok(claimedMatrizJob.attemptId.startsWith('att-'));
});

test('12. Heartbeat sem token retorna HTTP 401', () => {
  const { req, res } = createMockReqRes({ method: 'POST', body: { status: 'ONLINE' } });
  executeRouteChain(heartbeatHandlers, req, res);
  assert.equal(res.getStatusCode(), 401);
});

test('13. Heartbeat com body.agentId apenas (sem token) retorna HTTP 401', () => {
  const { req, res } = createMockReqRes({
    method: 'POST',
    body: { agentId: 'agent-matriz-01', status: 'ONLINE' },
  });
  executeRouteChain(heartbeatHandlers, req, res);
  assert.equal(res.getStatusCode(), 401);
});

test('14. Status update sem token retorna HTTP 401', () => {
  const { req, res } = createMockReqRes({
    method: 'PATCH',
    params: { id: 'job-matriz-test-01' },
    body: { status: 'DELIVERING' },
  });
  executeRouteChain(patchJobStatusHandlers, req, res);
  assert.equal(res.getStatusCode(), 401);
});

test('15. Status update sem leaseId em job claimed retorna HTTP 400', () => {
  const job = printJobsStore.get('job-matriz-test-01')!;
  const { req, res } = createMockReqRes({
    method: 'PATCH',
    params: { id: job.id },
    headers: { authorization: `Bearer ${rawTokenMatriz}` },
    body: {
      status: 'DELIVERING',
      attemptId: job.attemptId,
      // leaseId omitido propositalmente
    },
  });
  executeRouteChain(patchJobStatusHandlers, req, res);
  assert.equal(res.getStatusCode(), 400);
  assert.ok(res.getData().error.includes('leaseId é obrigatório'));
});

test('16. Status update sem attemptId para tentativa física retorna HTTP 400', () => {
  const job = printJobsStore.get('job-matriz-test-01')!;
  const { req, res } = createMockReqRes({
    method: 'PATCH',
    params: { id: job.id },
    headers: { authorization: `Bearer ${rawTokenMatriz}` },
    body: {
      status: 'DELIVERING',
      leaseId: job.leaseId,
      // attemptId omitido propositalmente
    },
  });
  executeRouteChain(patchJobStatusHandlers, req, res);
  assert.equal(res.getStatusCode(), 400);
  assert.ok(res.getData().error.includes('attemptId é obrigatório'));
});

test('17. Status update com leaseId incorreto retorna HTTP 409', () => {
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
  executeRouteChain(patchJobStatusHandlers, req, res);
  assert.equal(res.getStatusCode(), 409);
});

test('18. Status update com attemptId incorreto retorna HTTP 409', () => {
  const job = printJobsStore.get('job-matriz-test-01')!;
  const { req, res } = createMockReqRes({
    method: 'PATCH',
    params: { id: job.id },
    headers: { authorization: `Bearer ${rawTokenMatriz}` },
    body: {
      status: 'DELIVERING',
      leaseId: job.leaseId,
      attemptId: 'att-falsa-999',
    },
  });
  executeRouteChain(patchJobStatusHandlers, req, res);
  assert.equal(res.getStatusCode(), 409);
});

test('19. Agent B tentando atualizar job do Agent A retorna HTTP 403', () => {
  const job = printJobsStore.get('job-matriz-test-01')!;
  // Agent Filial 02 tentando atualizar job claimed pelo Agent Matriz 01
  const { req, res } = createMockReqRes({
    method: 'PATCH',
    params: { id: job.id },
    headers: { authorization: `Bearer ${rawTokenFilial}` },
    body: {
      status: 'DELIVERING',
      leaseId: job.leaseId,
      attemptId: job.attemptId,
    },
  });
  executeRouteChain(patchJobStatusHandlers, req, res);
  assert.equal(res.getStatusCode(), 403);
});

test('20. Status update com lease expirado retorna HTTP 409', () => {
  const job = printJobsStore.get('job-matriz-test-01')!;
  // Simular expiração do lease
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
  executeRouteChain(patchJobStatusHandlers, req, res);
  assert.equal(res.getStatusCode(), 409);
  assert.ok(res.getData().error.includes('Lease expirado'));
});

test('21. attempts >= maxAttempts impede novo claim e transiciona para FAILED', () => {
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
    attempts: 3, // Já atingiu maxAttempts = 3
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

test('22. Geração de pairing code em produção exige autenticação administrativa', () => {
  const originalEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    const { req, res } = createMockReqRes({ method: 'POST', headers: {}, body: {} });
    executeRouteChain(generatePairingCodeHandlers, req, res);
    assert.equal(res.getStatusCode(), 401);
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});
