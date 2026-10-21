import test from 'node:test';
import assert from 'node:assert/strict';
import {
  connectWithRetry,
  isTransientDbError,
  isPermanentDbError,
  sanitizeDbUrl,
  setPgPool,
  type DbRetryOptions,
} from '../apps/backend/src/db.js';
import {
  handleHealthCheck,
  handleLivenessCheck,
  handleReadinessCheck,
} from '../apps/backend/src/routes/health.js';

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
    set(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
  };
  return res;
}

test('SUÍTE CANÔNICA DE RESILIÊNCIA POSTGRESQL & HEALTHCHECK (ETAPA 1)', async (t) => {

  await t.test('1. Sanitização de Credenciais em URLs de Banco', () => {
    const raw = 'postgresql://app_user:SuperSecretPassword123!@postgres.internal:5432/witiquetas_prod';
    const sanitized = sanitizeDbUrl(raw);
    assert.ok(!sanitized.includes('SuperSecretPassword123!'), 'Senha real não deve constar na URL sanitizada');
    assert.ok(sanitized.includes('***'), 'Senha deve ser substituída por máscara ***');
    assert.ok(sanitized.includes('app_user'), 'Usuário deve ser preservado');
    assert.ok(sanitized.includes('postgres.internal:5432/witiquetas_prod'), 'Host e DB devem ser preservados');
  });

  await t.test('2. Classificação de Erros Transitórios vs Permanentes', () => {
    // Falhas transitórias de DNS e rede
    assert.equal(isTransientDbError({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND postgres' }), true);
    assert.equal(isTransientDbError({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' }), true);
    assert.equal(isTransientDbError({ code: 'ETIMEDOUT', message: 'connection timeout' }), true);
    assert.equal(isTransientDbError({ code: '57P03', message: 'the database system is starting up' }), true);
    assert.equal(isTransientDbError({ code: '53300', message: 'too many connections' }), true);

    // Falhas permanentes de autenticação e catálogo
    assert.equal(isPermanentDbError({ code: '28P01', message: 'password authentication failed for user "witiquetas"' }), true);
    assert.equal(isPermanentDbError({ code: '3D000', message: 'database "witiquetas" does not exist' }), true);
    assert.equal(isPermanentDbError({ code: '28000', message: 'invalid authorization specification' }), true);

    // Não-sobreposição
    assert.equal(isPermanentDbError({ code: 'ENOTFOUND' }), false);
    assert.equal(isTransientDbError({ code: '28P01' }), false);
  });

  await t.test('3. Conexão bem-sucedida na primeira tentativa', async () => {
    let connectCalls = 0;
    const mockClient = {
      query: async () => ({ rows: [] }),
      release: () => {},
    };
    const mockPool: any = {
      connect: async () => {
        connectCalls++;
        return mockClient;
      },
    };

    const options: DbRetryOptions = {
      maxRetries: 3,
      initialDelayMs: 5,
      maxDelayMs: 20,
    };

    const client = await connectWithRetry(mockPool, options);
    assert.equal(connectCalls, 1, 'Deve conectar logo na 1ª tentativa');
    assert.equal(client, mockClient, 'Deve retornar o client conectado');
  });

  await t.test('4. Falha transitória de DNS (ENOTFOUND) seguida de recuperação na 2ª tentativa', async () => {
    let connectCalls = 0;
    const mockClient = { release: () => {} };
    const mockPool: any = {
      connect: async () => {
        connectCalls++;
        if (connectCalls === 1) {
          const err: any = new Error('getaddrinfo ENOTFOUND postgres');
          err.code = 'ENOTFOUND';
          throw err;
        }
        return mockClient;
      },
    };

    const options: DbRetryOptions = {
      maxRetries: 3,
      initialDelayMs: 10,
      maxDelayMs: 50,
      backoffFactor: 2,
    };

    const client = await connectWithRetry(mockPool, options);
    assert.equal(connectCalls, 2, 'Deve ter tentado 2 vezes');
    assert.equal(client, mockClient, 'Deve retornar o client conectado com sucesso após recuperação');
  });

  await t.test('5. PostgreSQL temporariamente indisponível (ECONNREFUSED -> 57P03 -> Sucesso)', async () => {
    let connectCalls = 0;
    const mockClient = { release: () => {} };
    const mockPool: any = {
      connect: async () => {
        connectCalls++;
        if (connectCalls === 1) {
          const err: any = new Error('connect ECONNREFUSED 10.0.0.5:5432');
          err.code = 'ECONNREFUSED';
          throw err;
        }
        if (connectCalls === 2) {
          const err: any = new Error('the database system is starting up');
          err.code = '57P03';
          throw err;
        }
        return mockClient;
      },
    };

    const options: DbRetryOptions = {
      maxRetries: 4,
      initialDelayMs: 10,
      maxDelayMs: 40,
    };

    const client = await connectWithRetry(mockPool, options);
    assert.equal(connectCalls, 3, 'Deve ter superado as 2 falhas transitórias e conectado na 3ª tentativa');
    assert.equal(client, mockClient);
  });

  await t.test('6. Erro permanente (28P01 / Senha Inválida) aborta imediatamente sem novos retries', async () => {
    let connectCalls = 0;
    const mockPool: any = {
      connect: async () => {
        connectCalls++;
        const err: any = new Error('password authentication failed for user "witiquetas"');
        err.code = '28P01';
        throw err;
      },
    };

    const options: DbRetryOptions = {
      maxRetries: 5,
      initialDelayMs: 10,
    };

    await assert.rejects(
      async () => {
        await connectWithRetry(mockPool, options);
      },
      (err: any) => {
        assert.equal(err.code, '28P01');
        return true;
      }
    );

    assert.equal(connectCalls, 1, 'Deve abortar na tentativa 1 sem tentar novamente');
  });

  await t.test('7. Esgotamento do limite máximo de tentativas de reconexão', async () => {
    let connectCalls = 0;
    const mockPool: any = {
      connect: async () => {
        connectCalls++;
        const err: any = new Error('Connection timeout expired');
        err.code = 'ETIMEDOUT';
        throw err;
      },
    };

    const options: DbRetryOptions = {
      maxRetries: 3,
      initialDelayMs: 5,
      maxDelayMs: 20,
    };

    await assert.rejects(
      async () => {
        await connectWithRetry(mockPool, options);
      },
      (err: any) => {
        assert.equal(err.code, 'ETIMEDOUT');
        assert.ok(err.message.includes('Connection timeout expired'));
        return true;
      }
    );

    assert.equal(connectCalls, 3, 'Deve ter tentado exatamente o número máximo de vezes (3)');
  });

  await t.test('8. Healthcheck retorna HTTP 200 em condição saudável (PostgreSQL e MinIO operacionais)', async () => {
    const mockPool: any = {
      query: async (sql: string) => {
        assert.ok(sql.includes('SELECT NOW()'), 'Consulta de healthcheck deve ser somente leitura');
        return {
          rows: [
            {
              db_name: 'witiquetas_test',
              current_time: new Date(),
              version_info: 'PostgreSQL 14.15 on x86_64-pc-linux-musl',
            },
          ],
        };
      },
    };

    setPgPool(mockPool);

    const req: any = {};
    const res = createMockResponse();

    await handleHealthCheck(req, res);

    assert.equal(res.statusCode, 200, 'Healthcheck deve retornar HTTP 200 quando saudável');
    assert.ok(res.body.status === 'HEALTHY' || res.body.status === 'DEGRADED');
    assert.equal(res.body.services.postgres.status, 'OK');
  });

  await t.test('9. Healthcheck retorna HTTP 503 com banco indisponível (Impede falso positivo de HEALTHY)', async () => {
    const mockPool: any = {
      query: async () => {
        const err: any = new Error('getaddrinfo ENOTFOUND postgres');
        err.code = 'ENOTFOUND';
        throw err;
      },
    };

    setPgPool(mockPool);

    const req: any = {};
    const res = createMockResponse();

    await handleHealthCheck(req, res);

    assert.equal(res.statusCode, 503, 'Healthcheck DEVE retornar HTTP 503 quando o PostgreSQL estiver inoperante');
    assert.equal(res.body.status, 'UNHEALTHY', 'Status global deve ser UNHEALTHY');
    assert.equal(res.body.services.postgres.status, 'ERROR');
    assert.ok(res.body.error.includes('Serviço essencial'), 'Mensagem explícita de indisponibilidade de serviço essencial');
  });

  await t.test('10. Recuperação do healthcheck após restabelecimento da conexão com PostgreSQL', async () => {
    let isDbHealthy = false;

    const mockPool: any = {
      query: async () => {
        if (!isDbHealthy) {
          throw new Error('Connection refused');
        }
        return {
          rows: [
            {
              db_name: 'witiquetas_prod',
              current_time: new Date(),
              version_info: 'PostgreSQL 14',
            },
          ],
        };
      },
    };

    setPgPool(mockPool);

    // Fase 1: Banco fora -> HTTP 503
    const req1: any = {};
    const res1 = createMockResponse();
    await handleHealthCheck(req1, res1);
    assert.equal(res1.statusCode, 503, 'Fase 1 deve responder 503');

    // Fase 2: Banco restabelecido -> HTTP 200
    isDbHealthy = true;
    const req2: any = {};
    const res2 = createMockResponse();
    await handleHealthCheck(req2, res2);
    assert.equal(res2.statusCode, 200, 'Fase 2 deve recuperar e responder 200');
    assert.equal(res2.body.services.postgres.status, 'OK');
  });

  await t.test('11. Readiness Probe (/api/health/ready) retorna 200 se pronto e 503 se indisponível', async () => {
    const mockPool: any = {
      query: async () => ({
        rows: [{ db_name: 'witiquetas', current_time: new Date(), version_info: 'PG 14' }],
      }),
    };
    setPgPool(mockPool);

    const reqReady: any = {};
    const resReady = createMockResponse();
    await handleReadinessCheck(reqReady, resReady);
    assert.equal(resReady.statusCode, 200);
    assert.equal(resReady.body.status, 'READY');

    // Com banco com falha
    setPgPool({
      query: async () => {
        throw new Error('DB Down');
      },
    } as any);

    const resNotReady = createMockResponse();
    await handleReadinessCheck(reqReady, resNotReady);
    assert.equal(resNotReady.statusCode, 503);
    assert.equal(resNotReady.body.status, 'NOT_READY');
  });

  await t.test('12. Liveness Probe (/api/health/live) retorna sempre HTTP 200 com uptime', () => {
    const req: any = {};
    const res = createMockResponse();
    handleLivenessCheck(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'ALIVE');
    assert.ok(typeof res.body.uptimeSeconds === 'number');
  });

  // Limpeza final de mocks
  setPgPool(null);
});
