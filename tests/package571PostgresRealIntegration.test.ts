import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import crypto from 'node:crypto';
import { PrintJobRepository } from '../apps/backend/src/repositories/printJobRepository.js';
import { pgPool, setPgPool, getMigrationsList } from '../apps/backend/src/db.js';
import type { PrintJobDTO } from '@witiquetas/contracts';

const databaseUrl = process.env.DATABASE_URL;

function createSampleJob(
  companyId: string,
  printerId: string,
  overrides?: Partial<PrintJobDTO>
): PrintJobDTO {
  const id = `job-pg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const payload = 'N\nq800\nQ600,24\nB50,50,0,1,2,4,80,B,"123456789"\nP1\n';
  const payloadBase64 = Buffer.from(payload).toString('base64');
  const checksum = crypto.createHash('sha256').update(payload).digest('hex');

  return {
    id,
    companyId,
    printerId,
    status: 'PENDING',
    language: 'PPLB',
    encoding: 'windows-1252',
    copies: 1,
    copyStrategy: 'EMBEDDED_IN_PAYLOAD',
    payload,
    payloadBase64,
    payloadBytesLength: Buffer.byteLength(payload),
    checksumSha256: checksum,
    attempts: 0,
    maxAttempts: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

test('SUÍTE PACKAGE 5.7.1 — POSTGRESQL 14 REAL INTEGRATION GATE', async (t) => {
  if (!databaseUrl) {
    console.log(
      '[PostgreSQL Gate] AVISO: DATABASE_URL não definida no ambiente local. Pulando suíte PostgreSQL real (execução mandatória no runner GitHub Actions com PostgreSQL 14).'
    );
    t.test('Gate PG.0: Informar ausência de DATABASE_URL local', () => {
      assert.ok(true, 'Ignorado localmente sem PostgreSQL');
    });
    return;
  }

  // 1. Inicializa Pool dedicado com PostgreSQL Real
  const testPool = new Pool({
    connectionString: databaseUrl,
    max: 20,
    connectionTimeoutMillis: 5000,
  });
  setPgPool(testPool);

  // 2. Aplica todas as migrations oficiais em ordem sequencial com retry de conexão
  let client: any;
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      client = await testPool.connect();
      break;
    } catch (err) {
      if (attempt === 10) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  try {
    const migrations = getMigrationsList();
    for (const m of migrations) {
      await client.query(m.sql);
    }

    // 3. Provisiona entidades pré-requisito (empresas, impressoras, agentes) para testes multi-tenant
    await client.query(`
      INSERT INTO companies (id, name, slug, status)
      VALUES 
        ('comp-pg-alpha', 'Empresa PG Alpha', 'empresa-pg-alpha', 'ACTIVE'),
        ('comp-pg-beta', 'Empresa PG Beta', 'empresa-pg-beta', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO agents (id, company_id, installation_id, machine_name, os, architecture, agent_version, token_hash, status)
      VALUES 
        ('agt-pg-worker-1', 'comp-pg-alpha', 'inst-pg-1', 'WORKER-1', 'Windows', 'x64', '0.2.0', 'hash1', 'ONLINE'),
        ('agt-pg-worker-2', 'comp-pg-alpha', 'inst-pg-2', 'WORKER-2', 'Windows', 'x64', '0.2.0', 'hash2', 'ONLINE'),
        ('agt-pg-worker-3', 'comp-pg-alpha', 'inst-pg-3', 'WORKER-3', 'Windows', 'x64', '0.2.0', 'hash3', 'ONLINE'),
        ('agt-pg-worker-4', 'comp-pg-alpha', 'inst-pg-4', 'WORKER-4', 'Windows', 'x64', '0.2.0', 'hash4', 'ONLINE'),
        ('agt-pg-worker-5', 'comp-pg-alpha', 'inst-pg-5', 'WORKER-5', 'Windows', 'x64', '0.2.0', 'hash5', 'ONLINE'),
        ('agt-pg-beta-worker', 'comp-pg-beta', 'inst-pg-beta', 'WORKER-BETA', 'Windows', 'x64', '0.2.0', 'hashbeta', 'ONLINE')
      ON CONFLICT (id) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO printers (id, company_id, name, model_id, protocol, connection_type, dpi, status)
      VALUES 
        ('prn-pg-alpha-1', 'comp-pg-alpha', 'Zebra Alpha 1', 'zebra-2844', 'PPLB', 'RAW_TCP', 203, 'ACTIVE'),
        ('prn-pg-alpha-2', 'comp-pg-alpha', 'Zebra Alpha 2', 'zebra-2844', 'PPLB', 'RAW_TCP', 203, 'ACTIVE'),
        ('prn-pg-beta-1', 'comp-pg-beta', 'Argox Beta 1', 'argox-os214', 'PPLA', 'RAW_TCP', 203, 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
    `);
  } finally {
    if (client) client.release();
  }

  // =========================================================================
  // GATE A: MIGRATION 011 E CONSTRAINTS NO POSTGRESQL REAL
  // =========================================================================
  await t.test('Gate A: Migration 011 tabelas, índices parciais e constraints existem no PostgreSQL', async () => {
    const resTables = await testPool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('print_jobs', 'print_job_events');
    `);
    assert.equal(resTables.rows.length, 2, 'Tabelas print_jobs e print_job_events devem existir');

    const resIndexes = await testPool.query(`
      SELECT indexname FROM pg_indexes 
      WHERE tablename = 'print_jobs' AND indexname IN (
        'idx_print_jobs_claim_queue',
        'idx_print_jobs_lease_sweeper',
        'idx_print_jobs_company_idempotency'
      );
    `);
    assert.equal(resIndexes.rows.length, 3, 'Índices de alta performance e idempotência devem existir');
  });

  // =========================================================================
  // GATE B: CRIAÇÃO DE JOBS PERSISTENTES
  // =========================================================================
  await t.test('Gate B: Criação de job persiste registro físico no PostgreSQL com status PENDING', async () => {
    const job = createSampleJob('comp-pg-alpha', 'prn-pg-alpha-1');
    const created = await PrintJobRepository.createJob(job);
    assert.equal(created.job.id, job.id);
    assert.equal(created.idempotentReplay, false);

    // Consulta direta via SQL comprovando persistência no disco
    const checkSql = await testPool.query(`SELECT * FROM print_jobs WHERE id = $1`, [job.id]);
    assert.equal(checkSql.rows.length, 1);
    assert.equal(checkSql.rows[0].id, job.id);
    assert.equal(checkSql.rows[0].status, 'PENDING');
    assert.equal(checkSql.rows[0].company_id, 'comp-pg-alpha');
  });

  // =========================================================================
  // GATES C & D: CLAIM CONCORRENTE COM 5 CONEXÕES E FOR UPDATE SKIP LOCKED
  // =========================================================================
  await t.test('Gates C & D: 5 workers concorrentes via SKIP LOCKED dividem 10 jobs sem duplicidade', async () => {
    const TENANT = 'comp-pg-alpha';
    const PRINTER = 'prn-pg-alpha-1';
    const TOTAL_JOBS = 10;
    const WORKERS = 5;

    // Cria 10 jobs pendentes
    const jobIds: string[] = [];
    for (let i = 0; i < TOTAL_JOBS; i++) {
      const j = createSampleJob(TENANT, PRINTER);
      await PrintJobRepository.createJob(j);
      jobIds.push(j.id);
    }

    // Dispara 5 chamadas de claim concorrentes simultâneas com Promise.all
    const workerPromises = Array.from({ length: WORKERS }, (_, i) => {
      const agentId = `agt-pg-worker-${i + 1}`;
      return PrintJobRepository.claimPendingJobsForAgent(TENANT, agentId, 2, 60);
    });

    const results = await Promise.all(workerPromises);

    // Coleta todos os IDs reivindicados
    const claimedJobIds: string[] = [];
    for (const batch of results) {
      for (const item of batch) {
        claimedJobIds.push(item.jobId);
      }
    }

    // Regra D: Nenhum job pode ser reivindicado duas vezes (zero duplicidade)
    const uniqueClaimed = new Set(claimedJobIds);
    assert.equal(
      uniqueClaimed.size,
      claimedJobIds.length,
      'FOR UPDATE SKIP LOCKED deve garantir zero duplicação concorrente de claim'
    );
    assert.equal(claimedJobIds.length, TOTAL_JOBS, 'Todos os 10 jobs devem ter sido reivindicados');

    // Valida no banco que cada um possui seu respectivo claimed_by_agent_id e lease ativo
    const checkDb = await testPool.query(
      `SELECT id, status, claimed_by_agent_id, attempts FROM print_jobs WHERE id = ANY($1)`,
      [jobIds]
    );
    for (const row of checkDb.rows) {
      assert.equal(row.status, 'CLAIMED');
      assert.ok(row.claimed_by_agent_id.startsWith('agt-pg-worker-'));
      assert.equal(row.attempts, 1);
    }
  });

  // =========================================================================
  // GATE E: PERSISTÊNCIA APÓS REINICIALIZAÇÃO DO POOL DE CONEXÕES
  // =========================================================================
  await t.test('Gate E: Dados persistem intactos após fechamento e recriação do pool de conexões', async () => {
    const job = createSampleJob('comp-pg-alpha', 'prn-pg-alpha-1');
    await PrintJobRepository.createJob(job);

    // Simula reinicialização do backend: destrói pool existente e reconecta novo pool
    await testPool.end();

    const newPool = new Pool({
      connectionString: databaseUrl,
      max: 20,
      connectionTimeoutMillis: 5000,
    });
    setPgPool(newPool);

    // Busca o job através do repositório reconectado
    const retrieved = await PrintJobRepository.findById('comp-pg-alpha', job.id);
    assert.ok(retrieved, 'Job deve persistir e ser localizado após restart');
    assert.equal(retrieved.id, job.id);
    assert.equal(retrieved.status, 'PENDING');
  });

  // =========================================================================
  // GATE F: ROLLBACK TRANSACIONAL EM FALHA
  // =========================================================================
  await t.test('Gate F: Transição inválida ou falha de chave estrangeira executa ROLLBACK sem sujeira', async () => {
    const job = createSampleJob('comp-pg-alpha', 'prn-pg-alpha-1');
    await PrintJobRepository.createJob(job);

    // Tenta atualizar com agente não detentor de claim -> ROLLBACK
    const badUpdate = await PrintJobRepository.updateJobStatus(job.id, 'agt-pg-worker-999', {
      status: 'DELIVERING',
      leaseId: 'fake-lease',
      attemptId: 'fake-att',
    });
    assert.equal(badUpdate.status, 403);

    // Verifica que o status permanece intacto
    const current = await PrintJobRepository.findById('comp-pg-alpha', job.id);
    assert.equal(current?.status, 'PENDING');
  });

  // =========================================================================
  // GATE G: ATOMICIDADE DE JOB + EVENTO DE AUDITORIA
  // =========================================================================
  await t.test('Gate G: Ciclo de vida grava eventos de auditoria na mesma transação atômica', async () => {
    const job = createSampleJob('comp-pg-alpha', 'prn-pg-alpha-1');
    await PrintJobRepository.createJob(job);

    const claimed = await PrintJobRepository.claimPendingJobsForAgent('comp-pg-alpha', 'agt-pg-worker-1');
    assert.equal(claimed.length, 1);
    const item = claimed[0];

    await PrintJobRepository.updateJobStatus(job.id, 'agt-pg-worker-1', {
      status: 'DOWNLOADED',
      leaseId: item.leaseId,
      attemptId: item.attemptId,
    });
    await PrintJobRepository.updateJobStatus(job.id, 'agt-pg-worker-1', {
      status: 'DELIVERING',
      leaseId: item.leaseId,
      attemptId: item.attemptId,
    });
    await PrintJobRepository.updateJobStatus(job.id, 'agt-pg-worker-1', {
      status: 'DELIVERED_TO_TRANSPORT',
      leaseId: item.leaseId,
      attemptId: item.attemptId,
      executionTimeMs: 38,
    });

    const events = await PrintJobRepository.getEventsForJob('comp-pg-alpha', job.id);
    assert.equal(events.length, 5);
    assert.equal(events[0].toStatus, 'PENDING');
    assert.equal(events[1].toStatus, 'CLAIMED');
    assert.equal(events[2].toStatus, 'DOWNLOADED');
    assert.equal(events[3].toStatus, 'DELIVERING');
    assert.equal(events[4].toStatus, 'DELIVERED_TO_TRANSPORT');
  });

  // =========================================================================
  // GATES H & I: IDEMPOTÊNCIA POR TENANT E DIVERGÊNCIA FÍSICA (409)
  // =========================================================================
  await t.test('Gate H & I: Idempotency-Key retorna mesmo job se igual e 409 se parâmetro físico diverge', async () => {
    const jobOriginal = createSampleJob('comp-pg-alpha', 'prn-pg-alpha-1', { copies: 2 });
    const IDEM_KEY = `idem-pg-${Date.now()}`;

    // 1. Primeira criação
    const res1 = await PrintJobRepository.createJob(jobOriginal, IDEM_KEY);
    assert.equal(res1.idempotentReplay, false);

    // 2. Replay com mesmo payload e parâmetros
    const res2 = await PrintJobRepository.createJob(jobOriginal, IDEM_KEY);
    assert.equal(res2.idempotentReplay, true);
    assert.equal(res2.job.id, res1.job.id);

    // 3. Mesma chave com copies divergente -> 409 Conflict
    const jobDiffCopies = createSampleJob('comp-pg-alpha', 'prn-pg-alpha-1', {
      copies: 5,
      payload: jobOriginal.payload,
      checksumSha256: jobOriginal.checksumSha256,
    });
    await assert.rejects(
      async () => {
        await PrintJobRepository.createJob(jobDiffCopies, IDEM_KEY);
      },
      (err: any) => {
        assert.equal(err.statusCode, 409);
        assert.equal(err.code, 'IDEMPOTENCY_PAYLOAD_MISMATCH');
        return true;
      }
    );
  });

  // =========================================================================
  // GATES J & K: LEASE EXPIRADO EM DELIVERING (UNKNOWN_RESULT) E EM CLAIMED (EXPIRED_LEASE)
  // =========================================================================
  await t.test('Gates J & K: Lease sweeper real transiciona DELIVERING para UNKNOWN_RESULT e CLAIMED para EXPIRED_LEASE', async () => {
    // 1. Job em CLAIMED com lease expirado
    const jobClaimed = createSampleJob('comp-pg-alpha', 'prn-pg-alpha-1');
    await PrintJobRepository.createJob(jobClaimed);
    const claimed = await PrintJobRepository.claimPendingJobsForAgent('comp-pg-alpha', 'agt-pg-worker-1');
    assert.equal(claimed.length, 1);

    // Força lease expirado no PostgreSQL
    await pgPool!.query(
      `UPDATE print_jobs SET lease_expires_at = NOW() - INTERVAL '10 seconds' WHERE id = $1`,
      [jobClaimed.id]
    );

    // 2. Job em DELIVERING com lease expirado
    const jobDelivering = createSampleJob('comp-pg-alpha', 'prn-pg-alpha-2');
    await PrintJobRepository.createJob(jobDelivering);
    const claimedD = await PrintJobRepository.claimPendingJobsForAgent('comp-pg-alpha', 'agt-pg-worker-2');
    await PrintJobRepository.updateJobStatus(jobDelivering.id, 'agt-pg-worker-2', {
      status: 'DELIVERING',
      leaseId: claimedD[0].leaseId,
      attemptId: claimedD[0].attemptId,
    });

    await pgPool!.query(
      `UPDATE print_jobs SET lease_expires_at = NOW() - INTERVAL '10 seconds' WHERE id = $1`,
      [jobDelivering.id]
    );

    // Executa lease sweeper
    const sweep = await PrintJobRepository.reapExpiredLeases();
    assert.ok(sweep.reaped >= 2);

    const checkC = await PrintJobRepository.findById('comp-pg-alpha', jobClaimed.id);
    assert.equal(checkC?.status, 'EXPIRED_LEASE');

    const checkD = await PrintJobRepository.findById('comp-pg-alpha', jobDelivering.id);
    assert.equal(checkD?.status, 'UNKNOWN_RESULT', 'DELIVERING com lease expirado DEVE transicionar para UNKNOWN_RESULT');
  });

  // =========================================================================
  // GATE L: ISOLAMENTO MULTI-TENANT ENTRE EMPRESAS
  // =========================================================================
  await t.test('Gate L: Chaves de idempotência e filas de claim são 100% isoladas por empresa', async () => {
    const SHARED_KEY = `idem-cross-tenant-${Date.now()}`;

    // Empresa Alpha cria com SHARED_KEY
    const jobA = createSampleJob('comp-pg-alpha', 'prn-pg-alpha-1');
    const resA = await PrintJobRepository.createJob(jobA, SHARED_KEY);

    // Empresa Beta cria com a mesma SHARED_KEY
    const jobB = createSampleJob('comp-pg-beta', 'prn-pg-beta-1');
    const resB = await PrintJobRepository.createJob(jobB, SHARED_KEY);

    assert.notEqual(resA.job.id, resB.job.id, 'Chave idêntica em empresas distintas não deve colidir');
    assert.equal(resB.idempotentReplay, false);

    // Agente Beta não deve reivindicar jobs de Alpha
    const betaClaim = await PrintJobRepository.claimPendingJobsForAgent('comp-pg-beta', 'agt-pg-beta-worker');
    for (const item of betaClaim) {
      assert.equal(item.printerId, 'prn-pg-beta-1');
    }
  });

  // =========================================================================
  // GATE M: FAIL-CLOSED SEM FALLBACK EM MEMÓRIA
  // =========================================================================
  await t.test('Gate M: Falha no PostgreSQL interrompe operações imediatamente sem fallback silencioso', async () => {
    // Salva pool saudável antes de simular falha
    const healthyPool = pgPool;
    const deadPool = new Pool({
      connectionString: 'postgresql://invalid_user:invalid_pass@127.0.0.1:54399/invalid_db',
      connectionTimeoutMillis: 500,
    });
    setPgPool(deadPool);

    const testJob = createSampleJob('comp-pg-alpha', 'prn-pg-alpha-1');
    await assert.rejects(
      async () => {
        await PrintJobRepository.createJob(testJob);
      },
      (err: any) => {
        assert.ok(err, 'Deve lançar erro explícito de conexão sem fallback em memória');
        return true;
      }
    );

    // Restaura pool saudável e encerra deadPool
    setPgPool(healthyPool);
    await deadPool.end().catch(() => {});
  });

  // =========================================================================
  // GATE N: RESOLUÇÃO MANUAL DE UNKNOWN_RESULT SEM REEXECUÇÃO AUTOMÁTICA
  // =========================================================================
  await t.test('Gate N: Resolução manual de UNKNOWN_RESULT com CONFIRM_FAILED_AND_RETRY gera nova tentativa auditável', async () => {
    const job = createSampleJob('comp-pg-alpha', 'prn-pg-alpha-1', { status: 'UNKNOWN_RESULT' });
    await PrintJobRepository.createJob(job);

    const resolution = await PrintJobRepository.resolveAmbiguousJob('comp-pg-alpha', job.id, {
      decision: 'CONFIRM_FAILED_AND_RETRY',
      justification: 'Operador inspecionou bandeja da impressora física; confirmou ausência de impressão.',
      operatorId: 'operador.ci@empresa.com',
    });

    assert.equal(resolution.originalJob.status, 'FAILED');
    assert.ok(resolution.retryJob);
    assert.equal(resolution.retryJob.status, 'PENDING');
    assert.notEqual(resolution.retryJob.id, job.id);
    assert.equal(resolution.retryJob.attempts, 0);

    // Valida diretamente no PostgreSQL
    const resSqlOriginal = await pgPool!.query(`SELECT status, error FROM print_jobs WHERE id = $1`, [job.id]);
    assert.equal(resSqlOriginal.rows[0].status, 'FAILED');

    const resSqlRetry = await pgPool!.query(`SELECT status, attempts FROM print_jobs WHERE id = $1`, [resolution.retryJob.id]);
    assert.equal(resSqlRetry.rows[0].status, 'PENDING');
    assert.equal(resSqlRetry.rows[0].attempts, 0);
  });

  // Fecha conexões após todos os testes
  await pgPool!.end();
});
