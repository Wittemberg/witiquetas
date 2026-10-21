import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WITIQUETAS_MIGRATION_LOCK_ID,
  calculateMigrationChecksum,
  acquireMigrationLock,
  releaseMigrationLock,
  ensureSchemaMigrationsTable,
  getAppliedMigrations,
  executeMigrationsWithControl,
  initDatabase,
  type AppliedMigrationRecord,
} from '../apps/backend/src/db.js';
import {
  handleHealthCheck,
  handleLivenessCheck,
  handleReadinessCheck,
} from '../apps/backend/src/routes/health.js';

/**
 * Cluster PostgreSQL simulado em memória com fidelidade semântica para:
 * - Session Advisory Locks (pg_try_advisory_lock / pg_advisory_unlock)
 * - Tabela schema_migrations com checksum e execution_time_ms
 * - Atomicidade transacional (BEGIN / COMMIT / ROLLBACK)
 * - Liberação automática de session lock em caso de desconexão/queda
 */
class MockPgCluster {
  public advisoryLocks = new Map<string, string>(); // lockId -> sessionId
  public schemaMigrations = new Map<string, AppliedMigrationRecord>(); // filename -> record
  public executionCounters = new Map<string, number>(); // filename -> count
  public failOnMigration: string | null = null;
  public nextMigrationId = 1;

  public createClient(sessionId: string) {
    const cluster = this;
    let inTransaction = false;
    let uncommittedInserts: AppliedMigrationRecord[] = [];

    const client: any = {
      sessionId,
      isClosed: false,

      async query(sql: string, params?: any[]) {
        if (client.isClosed) {
          const err = new Error('Client has already been closed/disconnected');
          (err as any).code = '08006';
          throw err;
        }

        const trimmed = sql.trim();

        // 1. Advisory Lock de Sessão (pg_try_advisory_lock)
        if (trimmed.includes('pg_try_advisory_lock')) {
          const lockId = String(params?.[0] ?? WITIQUETAS_MIGRATION_LOCK_ID.toString());
          const currentOwner = cluster.advisoryLocks.get(lockId);

          if (!currentOwner) {
            cluster.advisoryLocks.set(lockId, sessionId);
            return { rows: [{ locked: true }] };
          }
          if (currentOwner === sessionId) {
            return { rows: [{ locked: true }] };
          }
          return { rows: [{ locked: false }] };
        }

        // 2. Advisory Unlock de Sessão (pg_advisory_unlock)
        if (trimmed.includes('pg_advisory_unlock')) {
          const lockId = String(params?.[0] ?? WITIQUETAS_MIGRATION_LOCK_ID.toString());
          const currentOwner = cluster.advisoryLocks.get(lockId);

          if (currentOwner === sessionId) {
            cluster.advisoryLocks.delete(lockId);
            return { rows: [{ unlocked: true }] };
          }
          return { rows: [{ unlocked: false }] };
        }

        // 3. Controle Transacional (BEGIN, COMMIT, ROLLBACK)
        if (trimmed === 'BEGIN') {
          inTransaction = true;
          uncommittedInserts = [];
          return { rows: [] };
        }

        if (trimmed === 'COMMIT') {
          if (inTransaction) {
            for (const item of uncommittedInserts) {
              cluster.schemaMigrations.set(item.filename, item);
            }
            uncommittedInserts = [];
            inTransaction = false;
          }
          return { rows: [] };
        }

        if (trimmed === 'ROLLBACK') {
          uncommittedInserts = [];
          inTransaction = false;
          return { rows: [] };
        }

        // 4. Criação da tabela schema_migrations
        if (trimmed.includes('CREATE TABLE IF NOT EXISTS schema_migrations')) {
          return { rows: [] };
        }

        // 5. Consulta de migrations aplicadas
        if (trimmed.startsWith('SELECT id, filename, checksum')) {
          const rows = Array.from(cluster.schemaMigrations.values()).sort((a, b) => a.id - b.id);
          return { rows };
        }

        // 6. Inserção de migration em schema_migrations
        if (trimmed.startsWith('INSERT INTO schema_migrations')) {
          const [filename, checksum, executionTimeMs] = params || [];
          const record: AppliedMigrationRecord = {
            id: cluster.nextMigrationId++,
            filename: String(filename),
            checksum: String(checksum),
            applied_at: new Date(),
            execution_time_ms: Number(executionTimeMs || 0),
          };

          if (inTransaction) {
            uncommittedInserts.push(record);
          } else {
            cluster.schemaMigrations.set(record.filename, record);
          }
          return { rows: [record] };
        }

        // 7. Execução do DDL de uma migration
        // Extrai o nome da migration simulada ou identifica padrão
        const matchingFilename = cluster.extractMigrationFilename(trimmed);
        if (matchingFilename) {
          const currentCount = cluster.executionCounters.get(matchingFilename) || 0;
          cluster.executionCounters.set(matchingFilename, currentCount + 1);

          if (cluster.failOnMigration === matchingFilename) {
            const syntaxErr = new Error(`Simulated database syntax/constraint error executing ${matchingFilename}`);
            (syntaxErr as any).code = '42601';
            throw syntaxErr;
          }
        }

        return { rows: [] };
      },

      release() {
        // Conexão liberada de volta ao pool normalmente
      },

      /**
       * Simula queda abrupta do processo ou encerramento de conexão pelo PostgreSQL.
       * O PostgreSQL libera automaticamente todos os session locks vinculados à conexão caída.
       */
      crash() {
        client.isClosed = true;
        for (const [lockId, owner] of cluster.advisoryLocks.entries()) {
          if (owner === sessionId) {
            cluster.advisoryLocks.delete(lockId);
          }
        }
      },
    };

    return client;
  }

  private extractMigrationFilename(sql: string): string | null {
    // Procura por marcadores de nome de migration nos SQLs
    const match = sql.match(/-- MIGRATION: ([\w.-]+)/);
    if (match) return match[1];

    if (sql.includes('agents')) return '001_create_agents_table.sql';
    if (sql.includes('label_templates')) return '002_create_label_templates_table.sql';
    if (sql.includes('editing_sessions')) return '003_create_editing_sessions_table.sql';
    return null;
  }
}

function createMockResponse() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
  };
  return res;
}

test('SUÍTE CANÔNICA DE CONCORRÊNCIA E CONTROLE DE MIGRATIONS (ETAPA 2)', async (t) => {

  await t.test('1. Uma instância executa migrations normalmente e registra histórico', async () => {
    const cluster = new MockPgCluster();
    const client = cluster.createClient('replica-1');

    const sampleMigrations = [
      { filename: '001_create_agents_table.sql', sql: '-- MIGRATION: 001_create_agents_table.sql\nCREATE TABLE agents (id VARCHAR(64) PRIMARY KEY);' },
      { filename: '002_create_label_templates_table.sql', sql: '-- MIGRATION: 002_create_label_templates_table.sql\nCREATE TABLE label_templates (id VARCHAR(64) PRIMARY KEY);' },
    ];

    const result = await executeMigrationsWithControl(client, sampleMigrations);

    assert.equal(result.applied.length, 2, 'Ambas as migrations devem ter sido aplicadas');
    assert.equal(result.skipped.length, 0, 'Nenhuma migration deve ter sido pulada');
    assert.equal(cluster.schemaMigrations.size, 2, 'Tabela schema_migrations deve possuir 2 registros');

    const rec001 = cluster.schemaMigrations.get('001_create_agents_table.sql');
    assert.ok(rec001, 'Migration 001 deve constar em schema_migrations');
    assert.equal(rec001.checksum, calculateMigrationChecksum(sampleMigrations[0].sql));
    assert.ok(rec001.execution_time_ms >= 0);
  });

  await t.test('2. Duas instâncias iniciando simultaneamente: exclusão mútua e idempotência', async () => {
    const cluster = new MockPgCluster();
    const clientA = cluster.createClient('replica-A');
    const clientB = cluster.createClient('replica-B');

    const sampleMigrations = [
      { filename: '001_create_agents_table.sql', sql: '-- MIGRATION: 001_create_agents_table.sql\nCREATE TABLE agents (id VARCHAR(64) PRIMARY KEY);' },
    ];

    let orderOfExecution: string[] = [];

    // Replica A obtém o lock, roda as migrations e libera
    const runInstanceA = async () => {
      await acquireMigrationLock(clientA, { timeoutMs: 2000, pollIntervalMs: 20 });
      orderOfExecution.push('A_LOCKED');
      // Simula tempo de trabalho
      await new Promise((r) => setTimeout(r, 60));
      const res = await executeMigrationsWithControl(clientA, sampleMigrations);
      orderOfExecution.push('A_MIGRATED');
      await releaseMigrationLock(clientA);
      orderOfExecution.push('A_UNLOCKED');
      return res;
    };

    // Replica B tenta ao mesmo tempo: deve aguardar Replica A liberar
    const runInstanceB = async () => {
      // Pequeno atraso de 10ms para garantir que A pede o lock primeiro
      await new Promise((r) => setTimeout(r, 10));
      await acquireMigrationLock(clientB, { timeoutMs: 2000, pollIntervalMs: 20 });
      orderOfExecution.push('B_LOCKED');
      const res = await executeMigrationsWithControl(clientB, sampleMigrations);
      orderOfExecution.push('B_MIGRATED');
      await releaseMigrationLock(clientB);
      orderOfExecution.push('B_UNLOCKED');
      return res;
    };

    const [resA, resB] = await Promise.all([runInstanceA(), runInstanceB()]);

    assert.equal(resA.applied.length, 1, 'Instância A deve ter aplicado a migration');
    assert.equal(resA.skipped.length, 0);

    assert.equal(resB.applied.length, 0, 'Instância B não deve reaplicar a migration');
    assert.equal(resB.skipped.length, 1, 'Instância B deve ter pulado a migration já aplicada');

    // Comprova que B só obteve o lock após A liberar
    const aUnlockIdx = orderOfExecution.indexOf('A_UNLOCKED');
    const bLockIdx = orderOfExecution.indexOf('B_LOCKED');
    assert.ok(bLockIdx > aUnlockIdx, 'Instância B só deve adquirir o lock após a liberação por A');
  });

  await t.test('3. Três ou mais instâncias concorrentes (A, B, C)', async () => {
    const cluster = new MockPgCluster();
    const clientA = cluster.createClient('replica-A');
    const clientB = cluster.createClient('replica-B');
    const clientC = cluster.createClient('replica-C');

    const sampleMigrations = [
      { filename: '001_create_agents_table.sql', sql: '-- MIGRATION: 001_create_agents_table.sql\nCREATE TABLE agents (id VARCHAR(64) PRIMARY KEY);' },
      { filename: '002_create_label_templates_table.sql', sql: '-- MIGRATION: 002_create_label_templates_table.sql\nCREATE TABLE label_templates (id VARCHAR(64) PRIMARY KEY);' },
    ];

    const runInstance = async (client: any, delayMs: number) => {
      await new Promise((r) => setTimeout(r, delayMs));
      await acquireMigrationLock(client, { timeoutMs: 3000, pollIntervalMs: 25 });
      try {
        await new Promise((r) => setTimeout(r, 40));
        return await executeMigrationsWithControl(client, sampleMigrations);
      } finally {
        await releaseMigrationLock(client);
      }
    };

    const results = await Promise.all([
      runInstance(clientA, 0),
      runInstance(clientB, 10),
      runInstance(clientC, 20),
    ]);

    const totalApplied = results.reduce((acc, r) => acc + r.applied.length, 0);
    assert.equal(totalApplied, 2, 'Exatamente 2 migrations devem ter sido aplicadas no total por todas as instâncias');
    assert.equal(cluster.schemaMigrations.size, 2, 'Tabela schema_migrations deve possuir exatamente 2 registros');
  });

  await t.test('4. Apenas uma instância executa cada migration pendente', async () => {
    const cluster = new MockPgCluster();
    const clientA = cluster.createClient('replica-1');
    const clientB = cluster.createClient('replica-2');

    const sampleMigrations = [
      { filename: '001_create_agents_table.sql', sql: '-- MIGRATION: 001_create_agents_table.sql\nCREATE TABLE agents;' },
      { filename: '002_create_label_templates_table.sql', sql: '-- MIGRATION: 002_create_label_templates_table.sql\nCREATE TABLE label_templates;' },
    ];

    await acquireMigrationLock(clientA, { timeoutMs: 1000 });
    await executeMigrationsWithControl(clientA, sampleMigrations);
    await releaseMigrationLock(clientA);

    await acquireMigrationLock(clientB, { timeoutMs: 1000 });
    await executeMigrationsWithControl(clientB, sampleMigrations);
    await releaseMigrationLock(clientB);

    assert.equal(cluster.executionCounters.get('001_create_agents_table.sql'), 1, '001 deve ter sido executada exatamente 1 vez');
    assert.equal(cluster.executionCounters.get('002_create_label_templates_table.sql'), 1, '002 deve ter sido executada exatamente 1 vez');
  });

  await t.test('5. Instâncias subsequentes aguardam e reconhecem o resultado após a liberação', async () => {
    const cluster = new MockPgCluster();
    const clientA = cluster.createClient('replica-primary');
    const clientB = cluster.createClient('replica-standby');

    const sampleMigrations = [
      { filename: '001_create_agents_table.sql', sql: '-- MIGRATION: 001_create_agents_table.sql\nCREATE TABLE agents;' },
    ];

    // Instância A aplica
    await acquireMigrationLock(clientA, { timeoutMs: 1000 });
    await executeMigrationsWithControl(clientA, sampleMigrations);
    await releaseMigrationLock(clientA);

    // Instância B adquire e verifica que o esquema está pronto
    await acquireMigrationLock(clientB, { timeoutMs: 1000 });
    const resB = await executeMigrationsWithControl(clientB, sampleMigrations);
    await releaseMigrationLock(clientB);

    assert.equal(resB.applied.length, 0);
    assert.equal(resB.skipped.length, 1);
    assert.equal(resB.skipped[0], '001_create_agents_table.sql');
  });

  await t.test('6. Timeout de lock caso a instância detentora não conclua dentro do limite configurado', async () => {
    const cluster = new MockPgCluster();
    const clientHolder = cluster.createClient('replica-holder');
    const clientWaiting = cluster.createClient('replica-waiting');

    // Replica holder adquire e não solta
    await acquireMigrationLock(clientHolder, { timeoutMs: 1000 });

    // Replica waiting tenta com timeout curto de 80ms
    await assert.rejects(
      async () => {
        await acquireMigrationLock(clientWaiting, { timeoutMs: 80, pollIntervalMs: 20 });
      },
      (err: any) => {
        assert.equal(err.code, 'MIGRATION_LOCK_TIMEOUT', 'Deve lançar erro com código MIGRATION_LOCK_TIMEOUT');
        assert.ok(err.message.includes('MIGRATION_LOCK_TIMEOUT'), 'Mensagem deve indicar timeout de advisory lock');
        return true;
      }
    );

    // Limpeza
    await releaseMigrationLock(clientHolder);
  });

  await t.test('7. Falha de migration provoca ROLLBACK e impede registro em schema_migrations', async () => {
    const cluster = new MockPgCluster();
    const client = cluster.createClient('replica-fail');
    cluster.failOnMigration = '002_create_label_templates_table.sql';

    const sampleMigrations = [
      { filename: '001_create_agents_table.sql', sql: '-- MIGRATION: 001_create_agents_table.sql\nCREATE TABLE agents;' },
      { filename: '002_create_label_templates_table.sql', sql: '-- MIGRATION: 002_create_label_templates_table.sql\nSYNTAX ERROR;' },
    ];

    await acquireMigrationLock(client, { timeoutMs: 1000 });

    await assert.rejects(
      async () => {
        await executeMigrationsWithControl(client, sampleMigrations);
      },
      (err: any) => {
        assert.ok(err.message.includes('Simulated database syntax/constraint error executing 002_create_label_templates_table.sql'));
        return true;
      }
    );

    await releaseMigrationLock(client);

    // 001 passou com sucesso antes de 002
    assert.ok(cluster.schemaMigrations.has('001_create_agents_table.sql'), '001 deve estar registrada');
    // 002 falhou e não pode constar em schema_migrations
    assert.equal(cluster.schemaMigrations.has('002_create_label_templates_table.sql'), false, '002 NÃO pode estar em schema_migrations');
  });

  await t.test('8. Liberação do lock após falha, permitindo nova tentativa', async () => {
    const cluster = new MockPgCluster();
    const client1 = cluster.createClient('replica-1');
    const client2 = cluster.createClient('replica-2');

    cluster.failOnMigration = '001_create_agents_table.sql';

    const sampleMigrations = [
      { filename: '001_create_agents_table.sql', sql: '-- MIGRATION: 001_create_agents_table.sql\nFAIL;' },
    ];

    // Instância 1 falha mas libera no finally
    let lockAcquired = false;
    try {
      await acquireMigrationLock(client1, { timeoutMs: 500 });
      lockAcquired = true;
      await executeMigrationsWithControl(client1, sampleMigrations);
    } catch {
      // Erro esperado
    } finally {
      if (lockAcquired) {
        await releaseMigrationLock(client1);
      }
    }

    // Corrige a falha no cluster
    cluster.failOnMigration = null;
    sampleMigrations[0].sql = '-- MIGRATION: 001_create_agents_table.sql\nCREATE TABLE agents (id VARCHAR(64));';

    // Instância 2 deve conseguir adquirir o lock imediatamente e rodar com sucesso
    await acquireMigrationLock(client2, { timeoutMs: 500 });
    const res2 = await executeMigrationsWithControl(client2, sampleMigrations);
    await releaseMigrationLock(client2);

    assert.equal(res2.applied.length, 1, 'Instância 2 deve conseguir aplicar a migration recuperada');
  });

  await t.test('9. Recuperação correta após encerramento abrupto (crash) da conexão detentora do lock', async () => {
    const cluster = new MockPgCluster();
    const clientA = cluster.createClient('replica-crash');
    const clientB = cluster.createClient('replica-survivor');

    // Réplica A adquire o lock
    await acquireMigrationLock(clientA, { timeoutMs: 1000 });
    assert.equal(cluster.advisoryLocks.get(WITIQUETAS_MIGRATION_LOCK_ID.toString()), 'replica-crash');

    // Réplica A sofre um crash / encerramento súbito da conexão (sem releaseMigrationLock explícito)
    clientA.crash();

    // A semântica do PostgreSQL libera automaticamente o session lock ao cair a conexão
    // Réplica B deve conseguir adquirir o lock normalmente
    await acquireMigrationLock(clientB, { timeoutMs: 500, pollIntervalMs: 20 });
    assert.equal(cluster.advisoryLocks.get(WITIQUETAS_MIGRATION_LOCK_ID.toString()), 'replica-survivor');

    await releaseMigrationLock(clientB);
  });

  await t.test('10. Reinicialização idempotente quando todas as migrations já foram aplicadas', async () => {
    const cluster = new MockPgCluster();
    const client = cluster.createClient('replica-restart');

    const sampleMigrations = [
      { filename: '001_create_agents_table.sql', sql: '-- MIGRATION: 001_create_agents_table.sql\nCREATE TABLE agents;' },
      { filename: '002_create_label_templates_table.sql', sql: '-- MIGRATION: 002_create_label_templates_table.sql\nCREATE TABLE label_templates;' },
    ];

    // Primeira execução
    await executeMigrationsWithControl(client, sampleMigrations);

    // Reinicialização do serviço backend (novo ciclo de bootstrap)
    const restartResult = await executeMigrationsWithControl(client, sampleMigrations);

    assert.equal(restartResult.applied.length, 0, 'Nenhuma migration nova deve ser aplicada');
    assert.equal(restartResult.skipped.length, 2, 'Todas as 2 migrations devem ser ignoradas');
  });

  await t.test('11. Detecção e rejeição de alteração em migration previamente aplicada (checksum divergente)', async () => {
    const cluster = new MockPgCluster();
    const client = cluster.createClient('replica-tamper');

    const originalSql = '-- MIGRATION: 001_create_agents_table.sql\nCREATE TABLE agents (id VARCHAR(64) PRIMARY KEY);';
    const modifiedSql = '-- MIGRATION: 001_create_agents_table.sql\nCREATE TABLE agents (id VARCHAR(128) PRIMARY KEY);'; // modificado!

    // Aplica a versão original
    await executeMigrationsWithControl(client, [{ filename: '001_create_agents_table.sql', sql: originalSql }]);

    // Tenta executar com o arquivo local alterado
    await assert.rejects(
      async () => {
        await executeMigrationsWithControl(client, [{ filename: '001_create_agents_table.sql', sql: modifiedSql }]);
      },
      (err: any) => {
        assert.equal(err.code, 'MIGRATION_CHECKSUM_MISMATCH');
        assert.equal(err.filename, '001_create_agents_table.sql');
        assert.ok(err.message.includes('MIGRATION_CHECKSUM_MISMATCH'));
        assert.ok(err.message.includes('001_create_agents_table.sql'));
        return true;
      }
    );
  });

  await t.test('12. Não regressão do Healthcheck e garantias da Etapa 1', async () => {
    // Valida que os endpoints de healthcheck continuam operando normalmente
    const resHealthy = createMockResponse();
    await handleHealthCheck({} as any, resHealthy);
    assert.ok(resHealthy.statusCode === 200 || resHealthy.statusCode === 503);

    const resLiveness = createMockResponse();
    handleLivenessCheck({} as any, resLiveness);
    assert.equal(resLiveness.statusCode, 200);
    assert.equal(resLiveness.body.status, 'ALIVE');

    const resReadiness = createMockResponse();
    await handleReadinessCheck({} as any, resReadiness);
    assert.ok(resReadiness.statusCode === 200 || resReadiness.statusCode === 503);
  });
});
