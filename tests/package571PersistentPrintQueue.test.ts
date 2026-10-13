import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  PrintJobDTO,
  UpdatePrintJobStatusDTO,
} from '@witiquetas/contracts';
import {
  PrintJobRepository,
  testMemJobs,
  testMemEvents,
} from '../apps/backend/src/repositories/printJobRepository.js';
import printJobsRouter, {
  claimPendingJobsForAgent,
} from '../apps/backend/src/routes/printJobs.js';
import { printersStore } from '../apps/backend/src/routes/printers.js';
import { createWebSession } from '../apps/backend/src/routes/auth.js';

// Setup de dados de teste
const TENANT_A = 'comp-tenant-alpha';
const TENANT_B = 'comp-tenant-beta';

printersStore.set('prn-alpha-tcp', {
  id: 'prn-alpha-tcp',
  companyId: TENANT_A,
  name: 'Elgin Alpha TCP',
  model: 'L42PRO',
  protocol: 'RAW_TCP',
  host: '192.168.1.100',
  port: 9100,
  language: 'PPLB',
  dpi: 203,
  active: true,
  isDefault: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

printersStore.set('prn-beta-tcp', {
  id: 'prn-beta-tcp',
  companyId: TENANT_B,
  name: 'Zebra Beta TCP',
  model: 'ZD220',
  protocol: 'RAW_TCP',
  host: '192.168.2.100',
  port: 9100,
  language: 'ZPL',
  dpi: 203,
  active: true,
  isDefault: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

function createSampleJob(companyId: string, printerId: string, overrides: Partial<PrintJobDTO> = {}): PrintJobDTO {
  const id = `job-test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  return {
    id,
    companyId,
    printerId,
    printerName: printerId,
    status: 'PENDING',
    language: 'PPLB',
    encoding: 'windows-1252',
    copies: 1,
    copyStrategy: 'EMBEDDED_IN_PAYLOAD',
    payload: 'N\nQ200,24\nP1\n',
    payloadBase64: Buffer.from('N\nQ200,24\nP1\n').toString('base64'),
    payloadBytesLength: 12,
    checksumSha256: crypto.createHash('sha256').update('N\nQ200,24\nP1\n').digest('hex'),
    attempts: 0,
    maxAttempts: 3,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test('SUÍTE PACKAGE 5.7.1 — PERSISTENT PRINT QUEUE & LEASE SAFETY', async (t) => {
  t.beforeEach(() => {
    PrintJobRepository.clearMemory();
  });

  // =========================================================================
  // GATE 1: IDEMPOTÊNCIA POR TENANT (REGRA 6)
  // =========================================================================
  await t.test('Gate 1.1: Idempotency-Key com mesmo payload retorna job existente (HTTP 200 / replay)', async () => {
    const job = createSampleJob(TENANT_A, 'prn-alpha-tcp');
    const key = 'idem-key-trans-001';

    const first = await PrintJobRepository.createJob(job, key);
    assert.equal(first.idempotentReplay, false, 'Primeira chamada cria o job');
    assert.equal(first.job.id, job.id);

    // Segunda chamada com a mesma chave e mesmo payload
    const secondJob = createSampleJob(TENANT_A, 'prn-alpha-tcp', {
      id: 'job-outro-id',
      checksumSha256: job.checksumSha256,
    });
    const second = await PrintJobRepository.createJob(secondJob, key);
    assert.equal(second.idempotentReplay, true, 'Segunda chamada é identificada como replay');
    assert.equal(second.job.id, job.id, 'Retorna o job originalmente criado');
  });

  await t.test('Gate 1.2: Idempotency-Key com payload diferente rejeita com HTTP 409 Conflict', async () => {
    const job = createSampleJob(TENANT_A, 'prn-alpha-tcp');
    const key = 'idem-key-conflict-002';

    await PrintJobRepository.createJob(job, key);

    // Segunda chamada com a mesma chave mas payload/checksum diferente
    const conflictingJob = createSampleJob(TENANT_A, 'prn-alpha-tcp', {
      payload: 'PAYLOAD_DIFERENTE',
      checksumSha256: crypto.createHash('sha256').update('PAYLOAD_DIFERENTE').digest('hex'),
    });

    await assert.rejects(
      async () => {
        await PrintJobRepository.createJob(conflictingJob, key);
      },
      (err: any) => {
        assert.equal(err.statusCode, 409);
        assert.equal(err.code, 'IDEMPOTENCY_PAYLOAD_MISMATCH');
        return true;
      }
    );
  });

  await t.test('Gate 1.3: Idempotency-Key é isolada por tenant (mesma chave em empresas diferentes não colide)', async () => {
    const jobA = createSampleJob(TENANT_A, 'prn-alpha-tcp');
    const jobB = createSampleJob(TENANT_B, 'prn-beta-tcp');
    const key = 'shared-key-across-tenants';

    const resA = await PrintJobRepository.createJob(jobA, key);
    const resB = await PrintJobRepository.createJob(jobB, key);

    assert.equal(resA.job.companyId, TENANT_A);
    assert.equal(resB.job.companyId, TENANT_B);
    assert.notEqual(resA.job.id, resB.job.id);
  });

  // =========================================================================
  // GATE 2: CLAIM ATÔMICO E CONCESSÃO DE LEASE (REGRA 4 & 5)
  // =========================================================================
  await t.test('Gate 2.1: Claim atômico gera leaseId, attemptId e define expiração de 60s', async () => {
    const job = createSampleJob(TENANT_A, 'prn-alpha-tcp');
    await PrintJobRepository.createJob(job);

    const claimed = await PrintJobRepository.claimPendingJobsForAgent(TENANT_A, 'agt-alpha-01', 5, 60);
    assert.equal(claimed.length, 1);
    const item = claimed[0];

    assert.equal(item.jobId, job.id);
    assert.ok(item.leaseId?.startsWith('lease-'));
    assert.equal(item.attemptId, `att-${job.id}-1`);
    assert.equal(item.copies, 1);

    // Verifica estado interno do job
    const saved = await PrintJobRepository.findById(TENANT_A, job.id);
    assert.equal(saved?.status, 'CLAIMED');
    assert.equal(saved?.claimedByAgentId, 'agt-alpha-01');
    assert.equal(saved?.attempts, 1);
    assert.ok(saved?.leaseExpiresAt);
  });

  await t.test('Gate 2.2: Jobs com attempts >= maxAttempts são automaticamente marcados como FAILED no claim', async () => {
    const job = createSampleJob(TENANT_A, 'prn-alpha-tcp', {
      attempts: 3,
      maxAttempts: 3,
    });
    await PrintJobRepository.createJob(job);

    const claimed = await PrintJobRepository.claimPendingJobsForAgent(TENANT_A, 'agt-alpha-01', 5, 60);
    assert.equal(claimed.length, 0, 'Job não deve ser entregue');

    const saved = await PrintJobRepository.findById(TENANT_A, job.id);
    assert.equal(saved?.status, 'FAILED');
    assert.ok(saved?.error?.includes('Limite máximo de tentativas'));
  });

  // =========================================================================
  // GATE 3: OWNERSHIP E PROTEÇÃO CONTRA ATUALIZAÇÕES TARDIAS (REGRA 4)
  // =========================================================================
  await t.test('Gate 3.1: Agente não-proprietário tem atualização rejeitada com 403 NOT_CLAIM_HOLDER', async () => {
    const job = createSampleJob(TENANT_A, 'prn-alpha-tcp');
    await PrintJobRepository.createJob(job);
    const claimed = await PrintJobRepository.claimPendingJobsForAgent(TENANT_A, 'agt-legitimo-01');

    const item = claimed[0];
    const updateRes = await PrintJobRepository.updateJobStatus(job.id, 'agt-invasor-02', {
      status: 'DOWNLOADED',
      leaseId: item.leaseId,
      attemptId: item.attemptId,
    });

    assert.equal(updateRes.status, 403);
    assert.equal(updateRes.code, 'NOT_CLAIM_HOLDER');
  });

  await t.test('Gate 3.2: Lease ID incorreto é rejeitado com 409 LEASE_MISMATCH', async () => {
    const job = createSampleJob(TENANT_A, 'prn-alpha-tcp');
    await PrintJobRepository.createJob(job);
    const claimed = await PrintJobRepository.claimPendingJobsForAgent(TENANT_A, 'agt-legitimo-01');
    const item = claimed[0];

    const updateRes = await PrintJobRepository.updateJobStatus(job.id, 'agt-legitimo-01', {
      status: 'DOWNLOADED',
      leaseId: 'lease-falso-999',
      attemptId: item.attemptId,
    });

    assert.equal(updateRes.status, 409);
    assert.equal(updateRes.code, 'LEASE_MISMATCH');
  });

  await t.test('Gate 3.3: Attempt ID incorreto é rejeitado com 409 ATTEMPT_MISMATCH', async () => {
    const job = createSampleJob(TENANT_A, 'prn-alpha-tcp');
    await PrintJobRepository.createJob(job);
    const claimed = await PrintJobRepository.claimPendingJobsForAgent(TENANT_A, 'agt-legitimo-01');
    const item = claimed[0];

    const updateRes = await PrintJobRepository.updateJobStatus(job.id, 'agt-legitimo-01', {
      status: 'DOWNLOADED',
      leaseId: item.leaseId,
      attemptId: 'att-obsoleto-0',
    });

    assert.equal(updateRes.status, 409);
    assert.equal(updateRes.code, 'ATTEMPT_MISMATCH');
  });

  // =========================================================================
  // GATE 4: LEASE REAPER E RECUPERAÇÃO SEGURA (REGRA 2 & 3)
  // =========================================================================
  await t.test('Gate 4.1: Job em DELIVERING com lease expirado vira UNKNOWN_RESULT (nunca PENDING automático)', async () => {
    const job = createSampleJob(TENANT_A, 'prn-alpha-tcp');
    await PrintJobRepository.createJob(job);
    const claimed = await PrintJobRepository.claimPendingJobsForAgent(TENANT_A, 'agt-alpha-01');
    const item = claimed[0];

    // Avança para DOWNLOADED e depois DELIVERING
    await PrintJobRepository.updateJobStatus(job.id, 'agt-alpha-01', {
      status: 'DOWNLOADED',
      leaseId: item.leaseId,
      attemptId: item.attemptId,
    });
    await PrintJobRepository.updateJobStatus(job.id, 'agt-alpha-01', {
      status: 'DELIVERING',
      leaseId: item.leaseId,
      attemptId: item.attemptId,
    });

    // Força expiração do lease no registro
    const target = testMemJobs.get(job.id)!;
    target.leaseExpiresAt = new Date(Date.now() - 5000).toISOString();

    // Executa o sweeper
    const sweep = await PrintJobRepository.reapExpiredLeases();
    assert.equal(sweep.unknownResultCount, 1);

    const saved = await PrintJobRepository.findById(TENANT_A, job.id);
    assert.equal(saved?.status, 'UNKNOWN_RESULT', 'DELIVERING expirado DEVE transicionar para UNKNOWN_RESULT');
    assert.ok(saved?.error?.includes('Resultado ambíguo'));
  });

  await t.test('Gate 4.2: Job em CLAIMED com lease expirado vira EXPIRED_LEASE (requer evidência para retorno)', async () => {
    const job = createSampleJob(TENANT_A, 'prn-alpha-tcp');
    await PrintJobRepository.createJob(job);
    await PrintJobRepository.claimPendingJobsForAgent(TENANT_A, 'agt-alpha-01');

    // Força expiração do lease
    const target = testMemJobs.get(job.id)!;
    target.leaseExpiresAt = new Date(Date.now() - 5000).toISOString();

    const sweep = await PrintJobRepository.reapExpiredLeases();
    assert.equal(sweep.expiredCount, 1);

    const saved = await PrintJobRepository.findById(TENANT_A, job.id);
    assert.equal(saved?.status, 'EXPIRED_LEASE', 'Sem confirmação positiva, não pode voltar direto a PENDING');
  });

  await t.test('Gate 4.3: Recuperação para PENDING aceita somente com evidência positiva fundamentada', async () => {
    const job = createSampleJob(TENANT_A, 'prn-alpha-tcp', { status: 'EXPIRED_LEASE' });
    await PrintJobRepository.createJob(job);

    // Tentativa sem evidência fundamentada falha
    await assert.rejects(async () => {
      await PrintJobRepository.recoverToPendingWithPositiveEvidence(TENANT_A, job.id, '   ');
    });

    // Recuperação fundamentada tem sucesso
    const recovered = await PrintJobRepository.recoverToPendingWithPositiveEvidence(
      TENANT_A,
      job.id,
      'Conexão caiu antes do handshake socket. Impressora confirmada vazia pelo operador.'
    );

    assert.equal(recovered.status, 'PENDING');
    assert.equal(recovered.leaseId, undefined);
    assert.equal(recovered.claimedByAgentId, undefined);
  });

  // =========================================================================
  // GATE 5: SEMÂNTICA FÍSICA E AUDITORIA IMUTÁVEL (REGRA 7 & 10)
  // =========================================================================
  await t.test('Gate 5.1: DELIVERED_TO_TRANSPORT é preservado e não assume PRINTED', async () => {
    const job = createSampleJob(TENANT_A, 'prn-alpha-tcp');
    await PrintJobRepository.createJob(job);
    const claimed = await PrintJobRepository.claimPendingJobsForAgent(TENANT_A, 'agt-alpha-01');
    const item = claimed[0];

    await PrintJobRepository.updateJobStatus(job.id, 'agt-alpha-01', {
      status: 'DOWNLOADED',
      leaseId: item.leaseId,
      attemptId: item.attemptId,
    });
    await PrintJobRepository.updateJobStatus(job.id, 'agt-alpha-01', {
      status: 'DELIVERING',
      leaseId: item.leaseId,
      attemptId: item.attemptId,
    });
    const delivered = await PrintJobRepository.updateJobStatus(job.id, 'agt-alpha-01', {
      status: 'DELIVERED_TO_TRANSPORT',
      leaseId: item.leaseId,
      attemptId: item.attemptId,
      executionTimeMs: 42,
    });

    assert.equal(delivered.status, 200);
    assert.equal(delivered.job?.status, 'DELIVERED_TO_TRANSPORT');
    assert.notEqual(delivered.job?.status, 'PRINTED');
    assert.equal(delivered.job?.executionTimeMs, 42);
    assert.ok(delivered.job?.deliveredToTransportAt);
  });

  await t.test('Gate 5.2: Trilha de eventos imutável registra ciclo de vida completo', async () => {
    const job = createSampleJob(TENANT_A, 'prn-alpha-tcp');
    await PrintJobRepository.createJob(job);
    const claimed = await PrintJobRepository.claimPendingJobsForAgent(TENANT_A, 'agt-alpha-01');
    const item = claimed[0];

    await PrintJobRepository.updateJobStatus(job.id, 'agt-alpha-01', {
      status: 'DOWNLOADED',
      leaseId: item.leaseId,
      attemptId: item.attemptId,
    });
    await PrintJobRepository.updateJobStatus(job.id, 'agt-alpha-01', {
      status: 'DELIVERING',
      leaseId: item.leaseId,
      attemptId: item.attemptId,
    });
    await PrintJobRepository.updateJobStatus(job.id, 'agt-alpha-01', {
      status: 'DELIVERED_TO_TRANSPORT',
      leaseId: item.leaseId,
      attemptId: item.attemptId,
    });

    const events = await PrintJobRepository.getEventsForJob(TENANT_A, job.id);
    assert.equal(events.length, 5, 'Deve conter 5 eventos de transição gravados');

    assert.equal(events[0].toStatus, 'PENDING');
    assert.equal(events[1].toStatus, 'CLAIMED');
    assert.equal(events[2].toStatus, 'DOWNLOADED');
    assert.equal(events[3].toStatus, 'DELIVERING');
    assert.equal(events[4].toStatus, 'DELIVERED_TO_TRANSPORT');
  });

  // =========================================================================
  // GATE 6: COMPATIBILIDADE RETROATIVA COM AGENT V0.2.0 (REGRA 9)
  // =========================================================================
  await t.test('Gate 6.1: DTOs de claim contêm todos os campos esperados pelo Agent Rust v0.2.0', async () => {
    const job = createSampleJob(TENANT_A, 'prn-alpha-tcp');
    await PrintJobRepository.createJob(job);
    const claimed = await PrintJobRepository.claimPendingJobsForAgent(TENANT_A, 'agt-alpha-01');
    const item = claimed[0];

    // Validação estrita dos campos correspondentes a PrintJobItemDTO do Rust
    assert.ok(typeof item.jobId === 'string' && item.jobId.length > 0);
    assert.ok(typeof item.leaseId === 'string' && item.leaseId.length > 0);
    assert.ok(typeof item.attemptId === 'string' && item.attemptId.length > 0);
    assert.ok(typeof item.printerId === 'string' && item.printerId.length > 0);
    assert.ok(typeof item.printerName === 'string' && item.printerName.length > 0);
    assert.ok(typeof item.protocol === 'string' && item.protocol.length > 0);
    assert.ok(typeof item.language === 'string' && item.language.length > 0);
    assert.ok(typeof item.encoding === 'string' && item.encoding.length > 0);
    assert.ok(typeof item.payloadBase64 === 'string' && item.payloadBase64.length > 0);
    assert.ok(typeof item.payloadBytesLength === 'number' && item.payloadBytesLength > 0);
    assert.ok(typeof item.checksumSha256 === 'string' && item.checksumSha256.length === 64);
    assert.ok(typeof item.copyStrategy === 'string');
    assert.ok(typeof item.copies === 'number' && item.copies >= 1);
  });
});
