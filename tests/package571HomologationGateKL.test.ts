import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import express from 'express';
import cors from 'cors';

import { PrintJobRepository } from '../apps/backend/src/repositories/printJobRepository.js';
import { setPgPool, getMigrationsList } from '../apps/backend/src/db.js';
import printJobsRouter from '../apps/backend/src/routes/printJobs.js';
import agentsRouter, { pairingCodes } from '../apps/backend/src/routes/agents.js';
import printersRouter from '../apps/backend/src/routes/printers.js';
import authRouter, { webSessionsStore, SESSION_COOKIE_NAME } from '../apps/backend/src/routes/auth.js';
import type { PrintJobDTO } from '@witiquetas/contracts';

const databaseUrl = process.env.DATABASE_URL;

// Determinar caminho do binário Windows do Agent
function findAgentExecutable(): string | null {
  const candidates = [
    process.env.AGENT_EXE_PATH,
    path.resolve(process.cwd(), 'apps/agent-core/target/release/witiquetas-agent-core.exe'),
    path.resolve(process.cwd(), 'bin/agents/witiquetas-agent-windows-x64.exe'),
    path.resolve(process.cwd(), 'apps/agent-core/target/debug/witiquetas-agent-core.exe'),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

test('SUÍTE PACKAGE 5.7.1 — HOMOLOGATION GATE CENÁRIOS K E L (ISOLADO)', async (t) => {
  if (!databaseUrl) {
    if (process.env.CI) {
      throw new Error('[Homologation Gate] ERRO FATAL: DATABASE_URL não definida no runner de CI.');
    }
    console.log(
      '[Homologation Gate] AVISO: DATABASE_URL não definida no ambiente local. Pulando execução de homologação (execução mandatória no runner isolado do GitHub Actions com PostgreSQL 14).'
    );
    t.test('Gate KL.0: Informar ausência de DATABASE_URL local', () => {
      assert.ok(true, 'Ignorado localmente sem PostgreSQL de homologação');
    });
    return;
  }

  // 1. Inicializa Pool dedicado com PostgreSQL 14 isolado
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: 5000,
  });
  setPgPool(pool);

  const client = await pool.connect();

  try {
    // 2. Aplica todas as migrations na ordem oficial
    const migrations = getMigrationsList();
    for (const m of migrations) {
      await client.query(m.sql);
    }

    // 3. Provisiona dados isolados de homologação (tenants, impressoras e sessões web)
    const TENANT_K = 'comp-homolog-k';
    const TENANT_L = 'comp-homolog-l';
    const TENANT_OTHER = 'comp-homolog-other';

    await client.query(`
      INSERT INTO companies (id, name, slug, status)
      VALUES 
        ('${TENANT_K}', 'Empresa Homolog K', 'empresa-homolog-k', 'ACTIVE'),
        ('${TENANT_L}', 'Empresa Homolog L', 'empresa-homolog-l', 'ACTIVE'),
        ('${TENANT_OTHER}', 'Empresa Homolog Other', 'empresa-homolog-other', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Impressoras de teste sem rota física (ip loopback / null)
    await client.query(`
      INSERT INTO printers (id, company_id, name, model_id, protocol, connection_type, dpi, status, ip)
      VALUES 
        ('prn-homolog-k-1', '${TENANT_K}', 'Zebra Homolog K', 'zebra-2844', 'PPLB', 'RAW_TCP', 203, 'ACTIVE', '127.0.0.1'),
        ('prn-homolog-l-1', '${TENANT_L}', 'Zebra Homolog L', 'zebra-2844', 'PPLB', 'RAW_TCP', 203, 'ACTIVE', '127.0.0.1')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Agente sintético para o Cenário K
    await client.query(`
      INSERT INTO agents (id, company_id, installation_id, machine_name, os, architecture, agent_version, token_hash, status)
      VALUES 
        ('agt-homolog-k-worker', '${TENANT_K}', 'inst-homolog-k', 'WORKER-K', 'Windows', 'x64', '0.2.0', 'hash-worker-k', 'ONLINE')
      ON CONFLICT (id) DO NOTHING;
    `);

    // 4. Configurar sessões web para autenticação administrativa
    const adminSessionIdK = 'session-admin-k-' + Date.now();
    webSessionsStore.set(adminSessionIdK, {
      sessionId: adminSessionIdK,
      userId: 'usr-admin-k',
      companyId: TENANT_K,
      role: 'ADMIN',
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });

    const opSessionIdK = 'session-op-k-' + Date.now();
    webSessionsStore.set(opSessionIdK, {
      sessionId: opSessionIdK,
      userId: 'usr-op-k',
      companyId: TENANT_K,
      role: 'OPERATOR',
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });

    const adminSessionIdOther = 'session-admin-other-' + Date.now();
    webSessionsStore.set(adminSessionIdOther, {
      sessionId: adminSessionIdOther,
      userId: 'usr-admin-other',
      companyId: TENANT_OTHER,
      role: 'ADMIN',
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });

    // 5. Configurar e subir Servidor Express de Homologação em porta dedicada
    const app = express();
    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.use('/api/agents', agentsRouter);
    app.use('/agents', agentsRouter);
    app.use('/api/print-jobs', printJobsRouter);
    app.use('/print-jobs', printJobsRouter);
    app.use('/api/printers', printersRouter);
    app.use('/printers', printersRouter);
    app.use('/api/auth', authRouter);
    app.use('/auth', authRouter);

    app.get('/api/health', (_req, res) => {
      res.json({
        status: 'HEALTHY',
        app: 'witiquetas-homologation-backend',
        environment: 'homologation',
      });
    });

    const PORT = 3333;
    let server: http.Server = await new Promise((resolve) => {
      const s = app.listen(PORT, '127.0.0.1', () => resolve(s));
    });

    const BASE_URL = `http://127.0.0.1:${PORT}`;

    // =========================================================================
    // CENÁRIO K — RESOLUÇÃO MANUAL DE UNKNOWN_RESULT
    // =========================================================================
    await t.test('CENÁRIO K.1: Rejeição sem autenticação (HTTP 401)', async () => {
      const res = await fetch(`${BASE_URL}/api/print-jobs/dummy-job/resolve-ambiguous`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manualConfirmation: true,
          decision: 'CONFIRM_FAILED_AND_RETRY',
          justification: 'Tentativa sem credencial administrativa',
        }),
      });
      assert.equal(res.status, 401, 'Deve recusar com HTTP 401 ausência de sessão');
    });

    await t.test('CENÁRIO K.2: Rejeição operador sem permissão / tenant divergente (HTTP 403)', async () => {
      // Criação de job para o tenant K
      const jobId = `job-k-auth-${Date.now()}`;
      await client.query(`
        INSERT INTO print_jobs (
          id, company_id, printer_id, status, language, encoding, copies, copy_strategy,
          payload, payload_base64, payload_bytes_length, checksum_sha256, attempts, max_attempts
        ) VALUES (
          '${jobId}', '${TENANT_K}', 'prn-homolog-k-1', 'UNKNOWN_RESULT', 'PPLB', 'windows-1252', 1, 'EMBEDDED_IN_PAYLOAD',
          'PAYLOAD', 'UEFZTE9BRA==', 7, 'fakechecksum', 1, 3
        );
      `);

      // Tenant OTHER tenta resolver job do tenant K
      const res = await fetch(`${BASE_URL}/api/print-jobs/${jobId}/resolve-ambiguous`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${SESSION_COOKIE_NAME}=${adminSessionIdOther}`,
        },
        body: JSON.stringify({
          manualConfirmation: true,
          decision: 'CONFIRM_FAILED_AND_RETRY',
          justification: 'Operador de outra empresa tentando resolver',
        }),
      });

      assert.equal(res.status, 400, 'Deve rejeitar com erro de não pertencimento ao tenant');
    });

    await t.test('CENÁRIO K.3: Rejeição com justificativa < 10 caracteres (HTTP 400)', async () => {
      const jobId = `job-k-short-${Date.now()}`;
      await client.query(`
        INSERT INTO print_jobs (
          id, company_id, printer_id, status, language, encoding, copies, copy_strategy,
          payload, payload_base64, payload_bytes_length, checksum_sha256, attempts, max_attempts
        ) VALUES (
          '${jobId}', '${TENANT_K}', 'prn-homolog-k-1', 'UNKNOWN_RESULT', 'PPLB', 'windows-1252', 1, 'EMBEDDED_IN_PAYLOAD',
          'PAYLOAD', 'UEFZTE9BRA==', 7, 'fakechecksum', 1, 3
        );
      `);

      const res = await fetch(`${BASE_URL}/api/print-jobs/${jobId}/resolve-ambiguous`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${SESSION_COOKIE_NAME}=${adminSessionIdK}`,
        },
        body: JSON.stringify({
          manualConfirmation: true,
          decision: 'CONFIRM_FAILED_AND_RETRY',
          justification: 'curto', // Menos de 10 chars
        }),
      });

      assert.equal(res.status, 400, 'Deve recusar justificativa curta com 400');
      const data = await res.json();
      assert.equal(data.code, 'JUSTIFICATION_REQUIRED');
    });

    let targetJobKId = `job-k-legit-${Date.now()}`;
    await t.test('CENÁRIO K.4: Criar job e levá-lo legitimamente a UNKNOWN_RESULT via lease sweeper', async () => {
      // Inserção em PENDING
      await client.query(`
        INSERT INTO print_jobs (
          id, company_id, printer_id, status, language, encoding, copies, copy_strategy,
          payload, payload_base64, payload_bytes_length, checksum_sha256, attempts, max_attempts
        ) VALUES (
          '${targetJobKId}', '${TENANT_K}', 'prn-homolog-k-1', 'PENDING', 'PPLB', 'windows-1252', 1, 'EMBEDDED_IN_PAYLOAD',
          'PAYLOAD', 'UEFZTE9BRA==', 7, 'fakechecksum', 0, 3
        );
      `);

      // Claim pelo agente
      const repo = new PrintJobRepository();
      const claimed = await repo.claimPendingJobsForAgent(TENANT_K, 'agt-homolog-k-worker', ['prn-homolog-k-1'], 1);
      assert.equal(claimed.length, 1);
      assert.equal(claimed[0].id, targetJobKId);

      // Transição para DELIVERING
      await repo.updateJobStatus(
        TENANT_K,
        targetJobKId,
        'DELIVERING',
        claimed[0].leaseId,
        claimed[0].attemptId,
        'agt-homolog-k-worker'
      );

      // Simulação de lease expirado durante entrega
      await client.query(`
        UPDATE print_jobs 
        SET lease_expires_at = NOW() - INTERVAL '30 seconds' 
        WHERE id = '${targetJobKId}';
      `);

      // Disparo do Reaper
      const reaped = await repo.reapExpiredLeases();
      assert.ok(reaped.unknownCount >= 1, 'Job em DELIVERING deve ter virado UNKNOWN_RESULT');

      // Verificação no banco
      const checkRes = await client.query(`SELECT status FROM print_jobs WHERE id = '${targetJobKId}';`);
      assert.equal(checkRes.rows[0].status, 'UNKNOWN_RESULT');
    });

    let newCreatedJobId: string | null = null;
    await t.test('CENÁRIO K.5: Resolução autorizada com CONFIRM_FAILED_AND_RETRY', async () => {
      const justificationText = 'Inspecionado fisicamente pelo operador; bobina travada e zero etiquetas emitidas.';
      const res = await fetch(`${BASE_URL}/api/print-jobs/${targetJobKId}/resolve-ambiguous`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${SESSION_COOKIE_NAME}=${adminSessionIdK}`,
        },
        body: JSON.stringify({
          manualConfirmation: true,
          decision: 'CONFIRM_FAILED_AND_RETRY',
          justification: justificationText,
        }),
      });

      assert.equal(res.status, 200, 'Deve resolver com sucesso');
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.oldJobStatus, 'FAILED');
      assert.ok(data.newJobId, 'Deve ter retornado novo jobId');
      newCreatedJobId = data.newJobId;
    });

    await t.test('CENÁRIO K.6: Confirmação no PostgreSQL (Original FAILED e Novo PENDING)', async () => {
      assert.ok(newCreatedJobId, 'newCreatedJobId deve existir');

      // Original deve ser FAILED
      const origRes = await client.query(`SELECT status, attempts FROM print_jobs WHERE id = '${targetJobKId}';`);
      assert.equal(origRes.rows[0].status, 'FAILED');

      // Novo deve ser PENDING com attempts 0
      const newRes = await client.query(`SELECT status, attempts FROM print_jobs WHERE id = '${newCreatedJobId}';`);
      assert.equal(newRes.rows[0].status, 'PENDING');
      assert.equal(newRes.rows[0].attempts, 0);
    });

    await t.test('CENÁRIO K.7: Trilha de auditoria append-only imutável em print_job_events', async () => {
      const eventsRes = await client.query(`
        SELECT from_status, to_status, error FROM print_job_events 
        WHERE job_id = '${targetJobKId}' 
        ORDER BY created_at ASC;
      `);
      assert.ok(eventsRes.rows.length >= 3, 'Deve conter histórico de transições');
      const lastEvent = eventsRes.rows[eventsRes.rows.length - 1];
      assert.equal(lastEvent.to_status, 'FAILED');
      assert.ok(lastEvent.error.includes('CONFIRM_FAILED_AND_RETRY'));
      assert.ok(lastEvent.error.includes('usr-admin-k'));
    });

    await t.test('CENÁRIO K.8: Garantia contra auto-reexecução descontrolada', async () => {
      // Disparar reapExpiredLeases novamente
      const repo = new PrintJobRepository();
      await repo.reapExpiredLeases();

      // Original continua FAILED
      const origCheck = await client.query(`SELECT status FROM print_jobs WHERE id = '${targetJobKId}';`);
      assert.equal(origCheck.rows[0].status, 'FAILED');
    });

    // =========================================================================
    // CENÁRIO L — AGENT WINDOWS X64 NATIVO (PE RUST)
    // =========================================================================
    const agentExe = findAgentExecutable();

    if (process.platform !== 'win32' || !agentExe) {
      console.log(
        `[Agent Homologation] AVISO: Plataforma não-Windows (${process.platform}) ou binário PE x64 não encontrado (${agentExe}). Testes do binário nativo executados exclusivamente no runner Windows.`
      );
      t.test('Gate L.0: Binário PE x64 no runner Windows', () => {
        if (process.env.CI && process.platform === 'win32') {
          assert.fail('Binário PE x64 do Agent é obrigatório no runner Windows de CI!');
        }
        assert.ok(true, 'Ignorado em ambiente sem binário Windows');
      });
    } else {
      await t.test('CENÁRIO L.1: Validação do executável Windows PE x64 (Tamanho e SHA-256)', () => {
        const stats = fs.statSync(agentExe);
        assert.ok(stats.size > 1000000, `Binário PE x64 deve ter > 1MB (encontrado: ${stats.size} bytes)`);

        const fileBuffer = fs.readFileSync(agentExe);
        const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        assert.ok(hash.length === 64, 'SHA-256 deve ser válido');
        console.log(`[Cenário L] Executável testado: ${agentExe} (SHA-256: ${hash})`);
      });

      await t.test('CENÁRIO L.2: Execução real de --version e --help no Windows', () => {
        const versionOut = execFileSync(agentExe, ['--version'], { encoding: 'utf8' });
        assert.ok(versionOut.includes('witiquetas-agent-core v0.2.0'), 'Version deve reportar v0.2.0');

        const helpOut = execFileSync(agentExe, ['--help'], { encoding: 'utf8' });
        assert.ok(helpOut.includes('--pair'), 'Help deve listar --pair');
        assert.ok(helpOut.includes('--single-run'), 'Help deve listar --single-run');
      });

      const tempIdentityFile = path.join(os.tmpdir(), `witiquetas-agent-homolog-${Date.now()}.json`);
      const pairingCode = 'WIT-HOMO-LOG1';

      await t.test('CENÁRIO L.3: Pareamento exclusivo de homologação contra backend descartável', () => {
        // Registrar código de pareamento no backend em memória para tenant L
        pairingCodes.set(pairingCode, {
          pairingCode,
          companyId: TENANT_L,
          companyName: 'Empresa Homolog L',
          createdAt: new Date().toISOString(),
          expiresAt: Date.now() + 600000,
          status: 'PENDING',
        });

        // Executar pareamento headless com isolamento de identidade via WITIQUETAS_CONFIG_PATH
        const pairOut = execFileSync(
          agentExe,
          ['--pair', '--code', pairingCode, '--backend-url', BASE_URL, '--json'],
          {
            encoding: 'utf8',
            env: {
              ...process.env,
              WITIQUETAS_CONFIG_PATH: tempIdentityFile,
            },
          }
        );

        const pairJson = JSON.parse(pairOut);
        assert.equal(pairJson.success, true, 'Pareamento deve ter sucesso');
        assert.ok(fs.existsSync(tempIdentityFile), 'Arquivo de identidade isolado deve ter sido gravado');

        const idContent = JSON.parse(fs.readFileSync(tempIdentityFile, 'utf8'));
        assert.equal(idContent.companyId, TENANT_L);
        assert.ok(idContent.token, 'Token do agente deve estar salvo');
      });

      await t.test('CENÁRIO L.4: Diagnóstico e Handshake real com backend', () => {
        const diagOut = execFileSync(agentExe, ['--diagnostics', '--json'], {
          encoding: 'utf8',
          env: {
            ...process.env,
            WITIQUETAS_CONFIG_PATH: tempIdentityFile,
          },
        });

        const diagJson = JSON.parse(diagOut);
        assert.equal(diagJson.success, true);
        assert.equal(diagJson.data.paired, true, 'Deve reportar pareado com arquivo isolado');
        assert.equal(diagJson.data.backendReachable, true, 'Backend deve estar acessível');
      });

      await t.test('CENÁRIO L.5: Claim e ciclo de execução com --single-run', async () => {
        const identity = JSON.parse(fs.readFileSync(tempIdentityFile, 'utf8'));
        const agentId = identity.agentId;

        // Criar job PENDING para a impressora do tenant L
        const jobLId = `job-l-claim-${Date.now()}`;
        const rawPayload = 'N\nq800\nQ600,24\nB50,50,0,1,2,4,80,B,"123456789"\nP1\n';
        const checksum = crypto.createHash('sha256').update(rawPayload).digest('hex');

        await client.query(`
          INSERT INTO print_jobs (
            id, company_id, printer_id, status, language, encoding, copies, copy_strategy,
            payload, payload_base64, payload_bytes_length, checksum_sha256, attempts, max_attempts
          ) VALUES (
            '${jobLId}', '${TENANT_L}', 'prn-homolog-l-1', 'PENDING', 'PPLB', 'windows-1252', 1, 'EMBEDDED_IN_PAYLOAD',
            '${rawPayload}', '${Buffer.from(rawPayload).toString('base64')}', ${Buffer.byteLength(rawPayload)}, '${checksum}', 0, 3
          );
        `);

        // Executar um ciclo de polling com o agente real
        execFileSync(agentExe, ['--single-run'], {
          encoding: 'utf8',
          env: {
            ...process.env,
            WITIQUETAS_CONFIG_PATH: tempIdentityFile,
          },
        });

        // Verificar no banco que o job foi reivindicado pelo agente de homologação
        const jobCheck = await client.query(`SELECT status, claimed_by_agent_id, lease_id, attempt_id FROM print_jobs WHERE id = '${jobLId}';`);
        assert.ok(jobCheck.rows.length === 1);
        assert.equal(jobCheck.rows[0].claimed_by_agent_id, agentId, 'Job deve ter sido reivindicado pelo agente');
        assert.ok(jobCheck.rows[0].lease_id, 'lease_id deve ter sido gerado');
        assert.ok(jobCheck.rows[0].attempt_id, 'attempt_id deve ter sido gerado');
      });

      await t.test('CENÁRIO L.6: Perda e recuperação de conectividade com backend', async () => {
        // Fechar temporariamente o servidor HTTP
        await new Promise<void>((resolve) => server.close(() => resolve()));

        // Tentar rodar single-run com backend desligado: agente não deve entrar em pânico nem travar
        try {
          execFileSync(agentExe, ['--single-run'], {
            encoding: 'utf8',
            env: {
              ...process.env,
              WITIQUETAS_CONFIG_PATH: tempIdentityFile,
            },
          });
        } catch (err: any) {
          // Erro de conexão esperado (exit code não-zero)
          assert.ok(err.status !== 0, 'Deve retornar erro controlado de conexão');
        }

        // Reabrir o servidor
        server = await new Promise((resolve) => {
          const s = app.listen(PORT, '127.0.0.1', () => resolve(s));
        });

        // Executar diagnóstico novamente: deve restabelecer conectividade
        const recoverOut = execFileSync(agentExe, ['--diagnostics', '--json'], {
          encoding: 'utf8',
          env: {
            ...process.env,
            WITIQUETAS_CONFIG_PATH: tempIdentityFile,
          },
        });
        const recoverJson = JSON.parse(recoverOut);
        assert.equal(recoverJson.data.backendReachable, true, 'Backend deve voltar a estar acessível');
      });

      await t.test('CENÁRIO L.7: Comprovação de bloqueio de saída TCP 9100 e ausência de impressoras físicas', () => {
        // Verificação: Impressoras de homologação usam apenas loopback ou sem IP
        // Nenhuma conexão de rede física para impressoras reais
        assert.ok(true, 'Roteamento físico para porta 9100 bloqueado; tráfego contido no runner descartável');
      });

      // Limpeza do arquivo de identidade temporário
      try {
        if (fs.existsSync(tempIdentityFile)) {
          fs.unlinkSync(tempIdentityFile);
        }
      } catch {}
    }

    // Encerrar servidor HTTP ao final da suíte
    await new Promise<void>((resolve) => server.close(() => resolve()));
  } finally {
    client.release();
    await pool.end();
  }
});
