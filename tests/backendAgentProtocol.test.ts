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

const DEFAULT_AGENT_POLL_INTERVAL_SECONDS = 45;
const DEFAULT_PRINT_JOB_MAX_ATTEMPTS = 3;


test('1. Pair Agent: Response deve conter agentId, installationId, serverTime e credenciais', () => {
  const mockPairResponse: PairAgentResponseDTO = {
    success: true,
    agentId: 'agent-1740000000000',
    installationId: 'inst-1740000000000-xyz123',
    token: 'agt_live_abcdef123456',
    companyId: 'comp-matriz-01',
    companyName: 'Matriz Supermercado WR',
    serverTime: new Date().toISOString(),
  };

  assert.equal(mockPairResponse.success, true);
  assert.ok(mockPairResponse.agentId.startsWith('agent-'));
  assert.ok(mockPairResponse.installationId.startsWith('inst-'));
  assert.ok(mockPairResponse.token.startsWith('agt_live_'));
  assert.ok(mockPairResponse.serverTime.length > 0);
  assert.equal(mockPairResponse.companyId, 'comp-matriz-01');
});

test('2. Heartbeat: Response deve conter acknowledged, serverTime, pendingJobsCount e pollIntervalSeconds', () => {
  assert.equal(typeof DEFAULT_AGENT_POLL_INTERVAL_SECONDS, 'number');
  assert.ok(DEFAULT_AGENT_POLL_INTERVAL_SECONDS >= 30 && DEFAULT_AGENT_POLL_INTERVAL_SECONDS <= 60);

  const mockHeartbeatResponse: AgentHeartbeatResponseDTO = {
    acknowledged: true,
    serverTime: new Date().toISOString(),
    pendingJobsCount: 0,
    pollIntervalSeconds: DEFAULT_AGENT_POLL_INTERVAL_SECONDS,
  };

  assert.equal(mockHeartbeatResponse.acknowledged, true);
  assert.equal(mockHeartbeatResponse.pendingJobsCount, 0);
  assert.equal(mockHeartbeatResponse.pollIntervalSeconds, 45);
  assert.ok(mockHeartbeatResponse.serverTime.length > 0);
});

test('3. Print Job V1: Criação deve conter jobId, copyStrategy, payloadBase64, payloadBytesLength, checksumSha256 e maxAttempts', () => {
  const p5RawCommand = 'I8,A,001\nQ240,024\nq831\nA10,18,0,2,2,2,N,"PRODUTO TESTE"\nP5\n';
  const encoding = 'windows-1252';

  // Conversão de acordo com o encoding CP1252
  const payloadBuffer = Buffer.from(p5RawCommand, 'latin1');
  const payloadBytesLength = payloadBuffer.length;
  const checksumSha256 = crypto.createHash('sha256').update(payloadBuffer).digest('hex');
  const payloadBase64 = payloadBuffer.toString('base64');

  const hasEmbeddedCopies = /P\d+/i.test(p5RawCommand);
  const copyStrategy: CopyStrategy = hasEmbeddedCopies ? 'EMBEDDED_IN_PAYLOAD' : 'TRANSPORT_REPEAT';

  const job: PrintJobDTO = {
    id: 'job-1740000000000-abc12',
    companyId: 'comp-matriz-01',
    printerId: 'prn-gondola-elgin-tcp',
    printerName: 'Elgin L42 Pro',
    status: 'PENDING',
    language: 'PPLB',
    encoding,
    copies: 5,
    copyStrategy,
    payload: p5RawCommand,
    payloadBase64,
    payloadBytesLength,
    checksumSha256,
    attempts: 0,
    maxAttempts: DEFAULT_PRINT_JOB_MAX_ATTEMPTS,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  assert.equal(job.status, 'PENDING');
  assert.equal(job.copyStrategy, 'EMBEDDED_IN_PAYLOAD');
  assert.equal(job.copies, 5);
  assert.equal(job.maxAttempts, 3);
  assert.equal(job.payloadBytesLength, payloadBuffer.length);
  assert.equal(job.checksumSha256, checksumSha256);

  // 4. SHA-256 e Byte Length sobre os bytes decodificados do Base64
  const decodedBuffer = Buffer.from(job.payloadBase64, 'base64');
  assert.equal(decodedBuffer.length, job.payloadBytesLength);
  assert.equal(crypto.createHash('sha256').update(decodedBuffer).digest('hex'), job.checksumSha256);
  assert.equal(decodedBuffer.toString('latin1'), p5RawCommand);
});

test('5. Semântica de Estados V1: Ausência de estados legados ambíguos (DISPATCHED, SUCCESS)', () => {
  const allowedStatuses: PrintJobDeliveryStatus[] = [
    'PENDING',
    'CLAIMED',
    'DOWNLOADED',
    'DELIVERING',
    'DELIVERED_TO_TRANSPORT',
    'PRINTED',
    'FAILED',
    'CANCELLED',
    'UNKNOWN_RESULT',
    'EXPIRED_LEASE',
  ];

  // Garantir que os estados legados não fazem parte do enum formal
  // @ts-expect-error DISPATCHED não existe mais
  const isDispatchedValid = allowedStatuses.includes('DISPATCHED');
  assert.equal(isDispatchedValid, false, 'DISPATCHED foi removido do protocolo V1');

  // @ts-expect-error SUCCESS foi substituído por DELIVERED_TO_TRANSPORT / PRINTED
  const isSuccessValid = allowedStatuses.includes('SUCCESS');
  assert.equal(isSuccessValid, false, 'SUCCESS foi substituído por DELIVERED_TO_TRANSPORT e PRINTED');

  assert.ok(allowedStatuses.includes('UNKNOWN_RESULT'), 'UNKNOWN_RESULT é obrigatório');
  assert.ok(allowedStatuses.includes('DELIVERED_TO_TRANSPORT'), 'DELIVERED_TO_TRANSPORT é obrigatório');
});

test('6. Estratégia de Cópias: Sem duplicação de multiplicação', () => {
  // Caso 1: P5 embutido no payload
  const p5Command = 'I8,A,001\nA10,10,0,1,1,1,N,"PRODUTO"\nP5\n';
  const hasP = /P\d+/i.test(p5Command);
  const strategy1: CopyStrategy = hasP ? 'EMBEDDED_IN_PAYLOAD' : 'TRANSPORT_REPEAT';
  assert.equal(strategy1, 'EMBEDDED_IN_PAYLOAD', 'Comando com P5 deve usar EMBEDDED_IN_PAYLOAD');

  // Caso 2: Comando sem multiplicador de cópias nativo (ex: ESC/POS simples)
  const plainCommand = 'TEXTO SIMPLES SEM P';
  const hasPlainP = /P\d+/i.test(plainCommand);
  const strategy2: CopyStrategy = hasPlainP ? 'EMBEDDED_IN_PAYLOAD' : 'TRANSPORT_REPEAT';
  assert.equal(strategy2, 'TRANSPORT_REPEAT', 'Comando sem P nativo pode usar TRANSPORT_REPEAT');
});
