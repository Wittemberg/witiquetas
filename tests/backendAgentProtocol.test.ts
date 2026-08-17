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
  VALID_DELIVERY_STATUSES,
  isValidStatusTransition,
  detectCopyStrategy,
  DEFAULT_PRINT_JOB_MAX_ATTEMPTS,
} from '../apps/backend/src/routes/printJobs.js';
import {
  DEFAULT_AGENT_POLL_INTERVAL_SECONDS,
  agentsStore,
  hashToken,
  type AgentRecord,
} from '../apps/backend/src/routes/agents.js';
import { printersStore } from '../apps/backend/src/routes/printers.js';

// Helper: Cria objetos mock de request e response para testes de integração de rota
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

// Obter handlers reais do Router Express
const postJobHandler = (printJobsRouter as any).routes.find(
  (r: any) => r.method === 'POST' && r.path === '/'
).handlers[0];

const getPendingJobsHandler = (printJobsRouter as any).routes.find(
  (r: any) => r.method === 'GET' && r.path === '/pending'
).handlers[0];

const patchJobStatusHandler = (printJobsRouter as any).routes.find(
  (r: any) => r.method === 'PATCH' && r.path === '/:id/status'
).handlers[0];

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
// BLOCO 3: SEGURANÇA DE AUTENTICAÇÃO E HEARTBEAT
// ============================================================================

test('7. Segurança de Token: hashToken gera hash SHA-256 consistente', () => {
  const rawToken = 'agt_live_test_secret_12345';
  const hash1 = hashToken(rawToken);
  const hash2 = crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');

  assert.equal(hash1, hash2);
  assert.notEqual(hash1, rawToken);
  assert.equal(hash1.length, 64);
});

test('8. Heartbeat: Retorna intervalo padrão documentado (45s) e timestamp', () => {
  assert.equal(DEFAULT_AGENT_POLL_INTERVAL_SECONDS, 45);
  const response: AgentHeartbeatResponseDTO = {
    acknowledged: true,
    serverTime: new Date().toISOString(),
    pendingJobsCount: 0,
    pollIntervalSeconds: DEFAULT_AGENT_POLL_INTERVAL_SECONDS,
  };
  assert.equal(response.acknowledged, true);
  assert.equal(response.pollIntervalSeconds, 45);
});

// ============================================================================
// BLOCO 4: TESTES DE INTEGRAÇÃO DAS ROTAS REAIS (POST, GET /pending, PATCH /status)
// ============================================================================

test('9. Rota Real POST /print-jobs: Cria Job com DTO v1 completo, Base64 e SHA-256 sobre CP1252', () => {
  // Garantir impressora padrão cadastrada
  printersStore.set('prn-test-elgin', {
    id: 'prn-test-elgin',
    companyId: 'comp-matriz-01',
    name: 'Elgin L42 Pro Test',
    protocol: 'RAW_TCP',
    language: 'PPLB',
    active: true,
  } as any);

  const rawPplb = 'I8,A,001\nQ240,024\nq831\nA10,18,0,2,2,2,N,"PRODUTO € 9,90"\nP3\n';

  const { req, res } = createMockReqRes({
    method: 'POST',
    body: {
      printerId: 'prn-test-elgin',
      compiledCommand: rawPplb,
      encoding: 'windows-1252',
      copies: 3,
    },
  });

  postJobHandler(req, res);

  assert.equal(res.getStatusCode(), 201);
  const data = res.getData();
  assert.equal(data.success, true);
  assert.ok(data.job);

  const job: PrintJobDTO = data.job;
  assert.equal(job.status, 'PENDING');
  assert.equal(job.copyStrategy, 'EMBEDDED_IN_PAYLOAD');
  assert.equal(job.maxAttempts, 3);
  assert.equal(job.attempts, 0);

  // Validar bytes reais do Base64
  const expectedBytes = encodePayload(rawPplb, 'windows-1252');
  assert.equal(job.payloadBytesLength, expectedBytes.length);
  assert.equal(job.payloadBase64, Buffer.from(expectedBytes).toString('base64'));
  assert.equal(
    job.checksumSha256,
    crypto.createHash('sha256').update(Buffer.from(expectedBytes)).digest('hex')
  );
});

test('10. Rota Real GET /print-jobs/pending: Rejeita chamador sem autenticação com HTTP 401', () => {
  const { req, res } = createMockReqRes({
    method: 'GET',
    headers: {}, // Sem token
  });

  getPendingJobsHandler(req, res);

  assert.equal(res.getStatusCode(), 401);
  assert.ok(res.getData().error.includes('não autenticado'));
});

test('11. Rota Real GET /print-jobs/pending: Claim grava claimedByAgentId, leaseId, attemptId e isola por tenant', () => {
  const rawTokenMatriz = 'agt_live_matriz_secret_token';
  const tokenHashMatriz = hashToken(rawTokenMatriz);

  const agentMatriz: AgentRecord = {
    id: 'agent-matriz-01',
    companyId: 'comp-matriz-01',
    installationId: 'inst-01',
    machineName: 'WIN-MATRIZ',
    os: 'windows',
    architecture: 'x86_64',
    agentVersion: '0.1.0',
    status: 'ONLINE',
    lastSeenAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    tokenHash: tokenHashMatriz,
  };
  agentsStore.set(agentMatriz.id, agentMatriz);

  // Criar Job da Filial 02 (tenant diferente)
  const jobFilial: PrintJobDTO = {
    id: 'job-filial-02-isolated',
    companyId: 'comp-filial-02',
    printerId: 'prn-filial-02',
    printerName: 'Impressora Filial',
    status: 'PENDING',
    language: 'PPLB',
    encoding: 'windows-1252',
    copies: 1,
    copyStrategy: 'TRANSPORT_REPEAT',
    payload: 'TESTE',
    payloadBase64: 'VEVTVEU=',
    payloadBytesLength: 5,
    checksumSha256: 'abc',
    attempts: 0,
    maxAttempts: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  printJobsStore.set(jobFilial.id, jobFilial);

  // Requisitar pending com o token do agente da Matriz
  const { req, res } = createMockReqRes({
    method: 'GET',
    headers: { authorization: `Bearer ${rawTokenMatriz}` },
  });

  getPendingJobsHandler(req, res);

  assert.equal(res.getStatusCode(), 200);
  const data = res.getData();

  // O job da filial 02 NÃO pode ser entregue para o agente da matriz
  const claimedFilialJob = data.jobs.find((j: any) => j.jobId === 'job-filial-02-isolated');
  assert.equal(claimedFilialJob, undefined, 'Jobs de outro tenant não devem ser entregues');

  // Job da Matriz deve ser reivindicado com sucesso
  const claimedMatrizJob = data.jobs.find((j: any) => j.printerId === 'prn-test-elgin');
  if (claimedMatrizJob) {
    assert.ok(claimedMatrizJob.leaseId.startsWith('lease-'));
    assert.ok(claimedMatrizJob.attemptId.startsWith('att-'));

    const storedJob = printJobsStore.get(claimedMatrizJob.jobId)!;
    assert.equal(storedJob.status, 'CLAIMED');
    assert.equal(storedJob.claimedByAgentId, 'agent-matriz-01');
    assert.equal(storedJob.attempts, 1, 'Início de nova tentativa define attempts = 1');
  }
});

test('12. Rota Real PATCH /print-jobs/:id/status: Validações de Runtime, Lease, Attempt, Agente e Transições', () => {
  const jobId = 'job-test-status-validation';
  const testJob: PrintJobDTO = {
    id: jobId,
    companyId: 'comp-matriz-01',
    printerId: 'prn-test-elgin',
    printerName: 'Elgin L42 Pro Test',
    status: 'CLAIMED',
    claimedByAgentId: 'agent-matriz-01',
    leaseId: 'lease-correct-123',
    attemptId: 'att-job-test-status-validation-1',
    language: 'PPLB',
    encoding: 'windows-1252',
    copies: 1,
    copyStrategy: 'EMBEDDED_IN_PAYLOAD',
    payload: 'TESTE',
    payloadBase64: 'VEVTVEU=',
    payloadBytesLength: 5,
    checksumSha256: 'abc',
    attempts: 1,
    maxAttempts: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  printJobsStore.set(jobId, testJob);

  // A. Status inválido -> HTTP 400
  {
    const { req, res } = createMockReqRes({
      method: 'PATCH',
      params: { id: jobId },
      body: { status: 'STATUS_INVENTADO_INVALIDO' },
    });
    patchJobStatusHandler(req, res);
    assert.equal(res.getStatusCode(), 400, 'Status inválido deve retornar HTTP 400');
  }

  // B. Lease incorreto -> HTTP 409
  {
    const { req, res } = createMockReqRes({
      method: 'PATCH',
      params: { id: jobId },
      body: { status: 'DELIVERING', leaseId: 'lease-errado-999', attemptId: 'att-job-test-status-validation-1' },
    });
    patchJobStatusHandler(req, res);
    assert.equal(res.getStatusCode(), 409, 'Lease mismatch deve retornar HTTP 409');
  }

  // C. AttemptId incorreto -> HTTP 409
  {
    const { req, res } = createMockReqRes({
      method: 'PATCH',
      params: { id: jobId },
      body: { status: 'DELIVERING', leaseId: 'lease-correct-123', attemptId: 'att-errada-999' },
    });
    patchJobStatusHandler(req, res);
    assert.equal(res.getStatusCode(), 409, 'Attempt mismatch deve retornar HTTP 409');
  }

  // D. Agente incorreto -> HTTP 403
  {
    const { req, res } = createMockReqRes({
      method: 'PATCH',
      params: { id: jobId },
      body: { status: 'DELIVERING', agentId: 'agent-impostor-02' },
    });
    patchJobStatusHandler(req, res);
    assert.equal(res.getStatusCode(), 403, 'Agente diferente do detentor deve retornar HTTP 403');
  }

  // E. Transição Inválida (CLAIMED -> PRINTED diretamente sem envio) -> HTTP 409
  {
    const { req, res } = createMockReqRes({
      method: 'PATCH',
      params: { id: jobId },
      body: { status: 'PRINTED', leaseId: 'lease-correct-123', attemptId: 'att-job-test-status-validation-1' },
    });
    patchJobStatusHandler(req, res);
    assert.equal(res.getStatusCode(), 409, 'Transição inválida CLAIMED -> PRINTED deve retornar HTTP 409');
  }

  // F. Transição Válida (CLAIMED -> DELIVERING) -> Não incrementa attempts
  {
    const { req, res } = createMockReqRes({
      method: 'PATCH',
      params: { id: jobId },
      body: {
        status: 'DELIVERING',
        leaseId: 'lease-correct-123',
        attemptId: 'att-job-test-status-validation-1',
        agentId: 'agent-matriz-01',
      },
    });
    patchJobStatusHandler(req, res);
    assert.equal(res.getStatusCode(), 200);
    assert.equal(printJobsStore.get(jobId)!.status, 'DELIVERING');
    assert.equal(printJobsStore.get(jobId)!.attempts, 1, 'DELIVERING na mesma attempt mantém attempts = 1');
  }

  // G. Transição Válida (DELIVERING -> DELIVERED_TO_TRANSPORT) -> Grava deliveredToTransportAt e mantém attempts = 1
  {
    const { req, res } = createMockReqRes({
      method: 'PATCH',
      params: { id: jobId },
      body: {
        status: 'DELIVERED_TO_TRANSPORT',
        leaseId: 'lease-correct-123',
        attemptId: 'att-job-test-status-validation-1',
        agentId: 'agent-matriz-01',
        executionTimeMs: 145,
      },
    });
    patchJobStatusHandler(req, res);
    assert.equal(res.getStatusCode(), 200);
    const updated = printJobsStore.get(jobId)!;
    assert.equal(updated.status, 'DELIVERED_TO_TRANSPORT');
    assert.equal(updated.attempts, 1, 'DELIVERED_TO_TRANSPORT na mesma attempt mantém attempts = 1');
    assert.ok(updated.deliveredToTransportAt);
    assert.equal(updated.executionTimeMs, 145);
  }
});
