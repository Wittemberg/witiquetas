import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type {
  AgentMessageEnvelope,
  AgentCapabilitiesReportDTO,
  PrintJobDTO,
  PrintJobDeliveryStatus,
  CopyStrategy,
  CompiledPrintPayload,
} from '../packages/contracts/src/index.js';

test('1. Agent Protocol v1: Envelope de Mensagem com Versionamento Estrito', () => {
  const envelope: AgentMessageEnvelope<{ reason: string }> = {
    protocolVersion: 1,
    messageId: 'msg_01JABCDEF1234567890',
    agentId: 'agt_01JABCDEF1234567890',
    installationId: 'inst_01JABCDEF1234567890',
    timestamp: new Date().toISOString(),
    type: 'AGENT_HEARTBEAT',
    payload: { reason: 'periodic_heartbeat' },
  };

  assert.equal(envelope.protocolVersion, 1);
  assert.equal(envelope.type, 'AGENT_HEARTBEAT');
  assert.ok(envelope.messageId.startsWith('msg_'));
  assert.ok(envelope.payload.reason === 'periodic_heartbeat');
});

test('2. Semântica de Estados do Print Job: Suporte a UNKNOWN_RESULT e DELIVERED_TO_TRANSPORT', () => {
  const validStatuses: PrintJobDeliveryStatus[] = [
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

  assert.equal(validStatuses.length, 10);
  assert.ok(validStatuses.includes('UNKNOWN_RESULT'));
  assert.ok(validStatuses.includes('DELIVERED_TO_TRANSPORT'));
  assert.ok(validStatuses.includes('EXPIRED_LEASE'));
});

test('3. Capability Negotiation: Relatório de Capacidades do Agente Headless', () => {
  const capabilities: AgentCapabilitiesReportDTO = {
    protocolVersion: 1,
    agentId: 'agt_win_01',
    installationId: 'inst_win_01',
    agentVersion: '0.3.0',
    os: 'windows',
    osVersion: '10.0.22631',
    architecture: 'x86_64',
    serviceMode: 'SERVICE',
    transports: ['RAW_TCP', 'WINDOWS_SPOOLER', 'SERIAL'],
    printers: [
      {
        printerIdLocal: 'prn_gondola_01',
        name: 'Argox OS-214 Plus (Rede)',
        transportType: 'RAW_TCP',
        address: '192.168.1.150:9100',
        dpi: 203,
        supportedLanguages: ['PPLB'],
        status: 'ONLINE',
        isDefault: true,
      },
      {
        printerIdLocal: 'prn_balcao_02',
        name: 'Zebra ZD220 (USB Spooler)',
        transportType: 'WINDOWS_SPOOLER',
        address: 'ZDesigner ZD220-203dpi ZPL',
        dpi: 203,
        supportedLanguages: ['ZPL'],
        status: 'ONLINE',
      },
    ],
    features: {
      canQueryStatus: true,
      supportsLocalSpooling: true,
      maxPayloadBytes: 10 * 1024 * 1024, // 10 MB
    },
  };

  assert.equal(capabilities.protocolVersion, 1);
  assert.equal(capabilities.serviceMode, 'SERVICE');
  assert.equal(capabilities.transports.length, 3);
  assert.equal(capabilities.printers.length, 2);
  assert.equal(capabilities.printers[0].transportType, 'RAW_TCP');
  assert.equal(capabilities.printers[1].transportType, 'WINDOWS_SPOOLER');
});

test('4. Estratégia de Cópias e Idempotência: EMBEDDED_IN_PAYLOAD vs TRANSPORT_REPEAT', () => {
  const payloadString = 'I8,A,001\nQ240,024\nq831\nA10,18,0,2,2,2,N,"TESTE"\nP5\n';
  const payloadBuffer = Buffer.from(payloadString, 'latin1');
  const sha256 = crypto.createHash('sha256').update(payloadBuffer).digest('hex');

  const compiled: CompiledPrintPayload = {
    language: 'PPLB',
    encoding: 'windows-1252',
    payloadBase64: payloadBuffer.toString('base64'),
    payloadBytesLength: payloadBuffer.length,
    checksumSha256: sha256,
    copies: 5,
    copyStrategy: 'EMBEDDED_IN_PAYLOAD',
    dpi: 203,
    metadata: {
      templateTitle: 'Gondola 100x30',
      dimensionsMm: { width: 100, height: 30, gap: 3 },
    },
  };

  assert.equal(compiled.copyStrategy, 'EMBEDDED_IN_PAYLOAD');
  assert.equal(compiled.copies, 5);
  assert.equal(compiled.checksumSha256, sha256);

  // O payload Base64 quando decodificado é exatamente igual ao buffer original
  const decoded = Buffer.from(compiled.payloadBase64, 'base64');
  assert.equal(decoded.length, compiled.payloadBytesLength);
  assert.equal(crypto.createHash('sha256').update(decoded).digest('hex'), sha256);
});

test('5. PrintJobDTO: Rastreabilidade com LeaseId, AttemptId e SHA-256', () => {
  const job: PrintJobDTO = {
    id: 'job_01JABCDEF1234567890',
    companyId: 'comp_matriz_01',
    printerId: 'prn_gondola_01',
    printerName: 'Argox Gôndola 01',
    status: 'CLAIMED',
    language: 'PPLB',
    encoding: 'windows-1252',
    copies: 1,
    copyStrategy: 'EMBEDDED_IN_PAYLOAD',
    payload: 'A10,10,0,1,1,1,N,"SAMPLE"',
    payloadBase64: Buffer.from('A10,10,0,1,1,1,N,"SAMPLE"').toString('base64'),
    payloadBytesLength: 25,
    checksumSha256: crypto.createHash('sha256').update('A10,10,0,1,1,1,N,"SAMPLE"').digest('hex'),
    attempts: 1,
    maxAttempts: 3,
    leaseId: 'lease_01JABCDEF1234567890',
    claimedByAgentId: 'agt_win_01',
    claimedAt: new Date().toISOString(),
    leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
    attemptId: 'att_01JABCDEF1234567890_1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  assert.equal(job.status, 'CLAIMED');
  assert.ok(job.leaseId?.startsWith('lease_'));
  assert.ok(job.attemptId?.startsWith('att_'));
  assert.equal(job.checksumSha256.length, 64);
});
