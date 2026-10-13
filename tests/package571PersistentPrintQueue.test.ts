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

  await t.test('Gate 1.4: Idempotency-Key com mesmo payload MAS printerId divergente rejeita com HTTP 409 Conflict', async () => {
    const jobOriginal = createSampleJob(TENANT_A, 'prn-alpha-tcp');
    const key = 'idem-key-diff-printer';
    await PrintJobRepository.createJob(jobOriginal, key);

    const jobDiffPrinter = createSampleJob(TENANT_A, 'prn-other-printer', {
      payload: jobOriginal.payload,
      checksumSha256: jobOriginal.checksumSha256,
    });

    await assert.rejects(
      async () => {
        await PrintJobRepository.createJob(jobDiffPrinter, key);
      },
      (err: any) => {
        assert.equal(err.statusCode, 409);
        assert.equal(err.code, 'IDEMPOTENCY_PAYLOAD_MISMATCH');
        assert.ok(err.message.includes('printerId'));
        return true;
      }
    );
  });

  await t.test('Gate 1.5: Idempotency-Key com mesmo payload MAS copies divergente rejeita com HTTP 409 Conflict', async () => {
    const jobOriginal = createSampleJob(TENANT_A, 'prn-alpha-tcp', { copies: 1 });
    const key = 'idem-key-diff-copies';
    await PrintJobRepository.createJob(jobOriginal, key);

    const jobDiffCopies = createSampleJob(TENANT_A, 'prn-alpha-tcp', {
      copies: 5,
      payload: jobOriginal.payload,
      checksumSha256: jobOriginal.checksumSha256,
    });

    await assert.rejects(
      async () => {
        await PrintJobRepository.createJob(jobDiffCopies, key);
      },
      (err: any) => {
        assert.equal(err.statusCode, 409);
        assert.equal(err.code, 'IDEMPOTENCY_PAYLOAD_MISMATCH');
        assert.ok(err.message.includes('copies'));
        return true;
      }
    );
  });

  await t.test('Gate 1.6: Idempotency-Key com mesmo payload MAS copyStrategy divergente rejeita com HTTP 409 Conflict', async () => {
    const jobOriginal = createSampleJob(TENANT_A, 'prn-alpha-tcp', { copyStrategy: 'EMBEDDED_IN_PAYLOAD' });
    const key = 'idem-key-diff-strategy';
    await PrintJobRepository.createJob(jobOriginal, key);

    const jobDiffStrategy = createSampleJob(TENANT_A, 'prn-alpha-tcp', {
      copyStrategy: 'TRANSPORT_REPEAT',
      payload: jobOriginal.payload,
      checksumSha256: jobOriginal.checksumSha256,
    });

    await assert.rejects(
      async () => {
        await PrintJobRepository.createJob(jobDiffStrategy, key);
      },
      (err: any) => {
        assert.equal(err.statusCode, 409);
        assert.equal(err.code, 'IDEMPOTENCY_PAYLOAD_MISMATCH');
        assert.ok(err.message.includes('copyStrategy'));
        return true;
      }
    );
  });

  await t.test('Gate 1.7: Idempotency-Key com mesmo payload MAS language divergente rejeita com HTTP 409 Conflict', async () => {
    const jobOriginal = createSampleJob(TENANT_A, 'prn-alpha-tcp', { language: 'PPLB' });
    const key = 'idem-key-diff-lang';
    await PrintJobRepository.createJob(jobOriginal, key);

    const jobDiffLang = createSampleJob(TENANT_A, 'prn-alpha-tcp', {
      language: 'ZPL',
      payload: jobOriginal.payload,
      checksumSha256: jobOriginal.checksumSha256,
    });

    await assert.rejects(
      async () => {
        await PrintJobRepository.createJob(jobDiffLang, key);
      },
      (err: any) => {
        assert.equal(err.statusCode, 409);
        assert.equal(err.code, 'IDEMPOTENCY_PAYLOAD_MISMATCH');
        assert.ok(err.message.includes('language'));
        return true;
      }
    );
  });

  await t.test('Gate 1.8: Idempotency-Key com mesmo payload MAS encoding divergente rejeita com HTTP 409 Conflict', async () => {
    const jobOriginal = createSampleJob(TENANT_A, 'prn-alpha-tcp', { encoding: 'windows-1252' });
    const key = 'idem-key-diff-enc';
    await PrintJobRepository.createJob(jobOriginal, key);

    const jobDiffEnc = createSampleJob(TENANT_A, 'prn-alpha-tcp', {
      encoding: 'utf-8',
      payload: jobOriginal.payload,
      checksumSha256: jobOriginal.checksumSha256,
    });

    await assert.rejects(
      async () => {
        await PrintJobRepository.createJob(jobDiffEnc, key);
      },
      (err: any) => {
        assert.equal(err.statusCode, 409);
        assert.equal(err.code, 'IDEMPOTENCY_PAYLOAD_MISMATCH');
        assert.ok(err.message.includes('encoding'));
        return true;
      }
    );
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

  await t.test('Gate 4.4: Tentativa de recoverToPending em UNKNOWN_RESULT é terminantemente rejeitada', async () => {
    const job = createSampleJob(TENANT_A, 'prn-alpha-tcp', { status: 'UNKNOWN_RESULT' });
    await PrintJobRepository.createJob(job);

    await assert.rejects(
      async () => {
        await PrintJobRepository.recoverToPendingWithPositiveEvidence(
          TENANT_A,
          job.id,
          'Tentativa de bypass manual de resultado ambíguo.'
        );
      },
      (err: any) => {
        assert.ok(err.message.includes("Status 'UNKNOWN_RESULT' é ambíguo"));
        return true;
      }
    );
  });

  await t.test('Gate 4.5: Tentativa de recoverToPending com histórico prévio de DELIVERING é rejeitada com OBJECTIVE_PROOF_FAILED', async () => {
    const job = createSampleJob(TENANT_A, 'prn-alpha-tcp');
    await PrintJobRepository.createJob(job);
    const claimed = await PrintJobRepository.claimPendingJobsForAgent(TENANT_A, 'agt-alpha-01');
    const item = claimed[0];

    // Simula transição para DELIVERING e posterior falha de rede (FAILED)
    await PrintJobRepository.updateJobStatus(job.id, 'agt-alpha-01', {
      status: 'DELIVERING',
      leaseId: item.leaseId,
      attemptId: item.attemptId,
    });
    await PrintJobRepository.updateJobStatus(job.id, 'agt-alpha-01', {
      status: 'FAILED',
      leaseId: item.leaseId,
      attemptId: item.attemptId,
      error: 'Socket timeout durante envio de bytes',
    });

    // Embora o status atual seja FAILED, o job já esteve em DELIVERING (bytes podem ter chegado à cabeça térmica)
    await assert.rejects(
      async () => {
        await PrintJobRepository.recoverToPendingWithPositiveEvidence(
          TENANT_A,
          job.id,
          'Tentativa de recuperação sem evidência técnica de zero bytes.'
        );
      },
      (err: any) => {
        assert.ok(err.message.includes('OBJECTIVE_PROOF_FAILED'));
        return true;
      }
    );
  });

  await t.test('Gate 4.6: Resolução manual de UNKNOWN_RESULT via resolveAmbiguousJob com CONFIRM_FAILED_AND_RETRY cria nova tentativa auditável sem auto-reexecução', async () => {
    const job = createSampleJob(TENANT_A, 'prn-alpha-tcp', { status: 'UNKNOWN_RESULT' });
    await PrintJobRepository.createJob(job);

    const result = await PrintJobRepository.resolveAmbiguousJob(TENANT_A, job.id, {
      decision: 'CONFIRM_FAILED_AND_RETRY',
      justification: 'Inspeção física realizada na impressora; nenhuma etiqueta foi impressa.',
      operatorId: 'operador.marcel@empresa.com',
    });

    // Job original é marcado como FAILED mantendo histórico
    assert.equal(result.originalJob.status, 'FAILED');
    assert.ok(result.originalJob.error?.includes('operador.marcel@empresa.com'));

    // Nova tentativa auditável criada como PENDING com id próprio e zero attempts
    assert.ok(result.retryJob);
    assert.equal(result.retryJob.status, 'PENDING');
    assert.notEqual(result.retryJob.id, job.id);
    assert.equal(result.retryJob.attempts, 0);

    const events = await PrintJobRepository.getEventsForJob(TENANT_A, job.id);
    const lastEvent = events[events.length - 1];
    assert.equal(lastEvent.fromStatus, 'UNKNOWN_RESULT');
    assert.equal(lastEvent.toStatus, 'FAILED');
    assert.ok(lastEvent.error?.includes('operador.marcel@empresa.com'));
  });

  await t.test('Gate 4.7: Resolução manual de UNKNOWN_RESULT com CONFIRM_DELIVERED transita para PRINTED com auditoria', async () => {
    const job = createSampleJob(TENANT_A, 'prn-alpha-tcp', { status: 'UNKNOWN_RESULT' });
    await PrintJobRepository.createJob(job);

    const result = await PrintJobRepository.resolveAmbiguousJob(TENANT_A, job.id, {
      decision: 'CONFIRM_DELIVERED',
      justification: 'Etiqueta encontrada impressa com perfeição na bandeja.',
      operatorId: 'operador.suporte@empresa.com',
    });

    assert.equal(result.originalJob.status, 'PRINTED');
    assert.ok(result.originalJob.completedAt);
    assert.ok(result.originalJob.error?.includes('operador.suporte@empresa.com'));
  });

  await t.test('Gate 4.8: Resolução manual de UNKNOWN_RESULT com CANCEL transita para CANCELLED com auditoria', async () => {
    const job = createSampleJob(TENANT_A, 'prn-alpha-tcp', { status: 'UNKNOWN_RESULT' });
    await PrintJobRepository.createJob(job);

    const result = await PrintJobRepository.resolveAmbiguousJob(TENANT_A, job.id, {
      decision: 'CANCEL',
      justification: 'Pedido cancelado pelo cliente durante a ambiguidade.',
      operatorId: 'operador.admin@empresa.com',
    });

    assert.equal(result.originalJob.status, 'CANCELLED');
    assert.ok(result.originalJob.error?.includes('Cancelado'));
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

  await t.test('Gate 6.2: Código fonte do Agent Rust v0.2.0 envia leaseId, attemptId e não trava com 403/409', () => {
    const runtimeRsPath = path.resolve('apps/agent-core/src/runtime.rs');
    assert.ok(fs.existsSync(runtimeRsPath), 'runtime.rs do Agent Core deve existir');
    const runtimeContent = fs.readFileSync(runtimeRsPath, 'utf-8');

    // Confirma que o Agent Rust v0.2.0 já serializa lease_id e attempt_id em todas as chamadas
    assert.ok(runtimeContent.includes('lease_id: Some(job.lease_id.clone())'));
    assert.ok(runtimeContent.includes('attempt_id: Some(job.attempt_id.clone())'));
    assert.ok(runtimeContent.includes('DELIVERED_TO_TRANSPORT'));
    assert.ok(runtimeContent.includes('UNKNOWN_RESULT'));
  });

  // =========================================================================
  // GATE 7: MIGRATION 011, DDL CANÔNICO E FAIL-CLOSED POSTGRESQL (REGRA 1 & 8)
  // =========================================================================
  await t.test('Gate 7.1: Migration 011 possui DDL canônico, CREATE TABLE IF NOT EXISTS e índices parciais sem UTF-8 BOM', () => {
    const migrationPath = path.resolve('apps/backend/src/migrations/011_create_persistent_print_queue_tables.sql');
    assert.ok(fs.existsSync(migrationPath), 'Migration 011 deve existir');

    const bytes = fs.readFileSync(migrationPath);
    const hasBOM = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    assert.strictEqual(hasBOM, false, 'Migration 011 não pode conter UTF-8 BOM');

    const sql = bytes.toString('utf-8');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS print_jobs'), 'Deve criar print_jobs com IF NOT EXISTS');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS print_job_events'), 'Deve criar print_job_events com IF NOT EXISTS');
    assert.ok(sql.includes('idx_print_jobs_claim_queue'), 'Deve conter índice parcial de fila de claim');
    assert.ok(sql.includes('idx_print_jobs_lease_sweeper'), 'Deve conter índice parcial para lease sweeper');
    assert.ok(sql.includes('idx_print_jobs_company_idempotency'), 'Deve conter índice único parcial de idempotência');
    assert.ok(sql.includes('ON DELETE RESTRICT'), 'FK para printers deve ter ON DELETE RESTRICT (não-destrutiva)');
  });

  await t.test('Gate 7.2: Fail-Closed: Falha no PostgreSQL interrompe operações sem fallback silencioso para memória', async () => {
    // Valida que o código do repositório lança erro quando pgPool está configurado e falha
    const repoPath = path.resolve('apps/backend/src/repositories/printJobRepository.ts');
    const repoContent = fs.readFileSync(repoPath, 'utf-8');

    // Validação estrita da Regra 1
    assert.ok(repoContent.includes('if (pgPool)'), 'Deve consultar pgPool prioritariamente');
    assert.ok(repoContent.includes('throw err'), 'Deve propagar erro do PostgreSQL para abortar sem fallback em memória');
    assert.ok(repoContent.includes('await client.query(\'ROLLBACK\')'), 'Deve executar ROLLBACK em caso de falha transacional');
  });

  await t.test('Gate 7.3: Rotas HTTP recover-pending e resolve-ambiguous estão registradas no printJobsRouter', () => {
    const routes = (printJobsRouter as any).routes || [];
    const recoverRoute = routes.find((r: any) => r.path === '/:id/recover-pending' && r.method === 'POST');
    const resolveRoute = routes.find((r: any) => r.path === '/:id/resolve-ambiguous' && r.method === 'POST');
    const eventsRoute = routes.find((r: any) => r.path === '/:id/events' && r.method === 'GET');

    assert.ok(recoverRoute, 'POST /:id/recover-pending deve estar registrado');
    assert.ok(resolveRoute, 'POST /:id/resolve-ambiguous deve estar registrado');
    assert.ok(eventsRoute, 'GET /:id/events deve estar registrado');
  });
});
