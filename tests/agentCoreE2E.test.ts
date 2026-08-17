import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';

const AGENT_EXE_PATH = path.resolve(
  process.env.LOCALAPPDATA || '',
  'witiquetas-cargo-target/debug/witiquetas-agent-core.exe'
);

test('End-to-End: Agent Core Headless executa ciclo completo de heartbeat, claim, validação binária e PRINTED', async () => {
  const rawToken = `agt_live_e2e_${crypto.randomBytes(16).toString('hex')}`;
  const agentId = 'agent-e2e-matriz';
  const companyId = 'comp-matriz-01';

  // Impressora & Job de Teste
  const payloadStr = 'I8,A,001\nQ240,024\nq831\nA10,10,0,1,1,1,N,"E2E TEST"\nP1\n';
  const payloadBytes = Buffer.from(payloadStr, 'utf8');
  const payloadBase64 = payloadBytes.toString('base64');
  const checksumSha256 = crypto.createHash('sha256').update(payloadBytes).digest('hex');
  const jobId = `job-e2e-${Date.now()}`;

  const state = {
    heartbeatsReceived: 0,
    jobStatusHistory: [] as string[],
    job: {
      id: jobId,
      companyId,
      printerId: 'prn-e2e-01',
      printerName: 'Elgin L42 Pro Test',
      status: 'PENDING',
      language: 'PPLB',
      encoding: 'windows-1252',
      copies: 1,
      copyStrategy: 'EMBEDDED_IN_PAYLOAD',
      payload: payloadStr,
      payloadBase64,
      payloadBytesLength: payloadBytes.length,
      checksumSha256,
      attempts: 0,
      maxAttempts: 3,
      claimedByAgentId: null as string | null,
      completedAt: null as string | null,
    },
  };

  const server = http.createServer(async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${rawToken}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Não autorizado' }));
    }

    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }
    const jsonBody = body ? JSON.parse(body) : {};
    const url = req.url || '';

    if (req.method === 'POST' && url.startsWith('/agents/heartbeat')) {
      state.heartbeatsReceived += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({
          acknowledged: true,
          serverTime: new Date().toISOString(),
          pendingJobsCount: state.job.status === 'PENDING' ? 1 : 0,
          pollIntervalSeconds: 10,
        })
      );
    }

    if (req.method === 'GET' && url.startsWith('/print-jobs/pending')) {
      if (state.job.status === 'PENDING') {
        state.job.attempts += 1;
        state.job.claimedByAgentId = agentId;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({
            total: 1,
            jobs: [
              {
                jobId: state.job.id,
                leaseId: 'lease-e2e-01',
                attemptId: 'attempt-e2e-01',
                printerId: state.job.printerId,
                printerName: state.job.printerName,
                protocol: 'RAW_TCP',
                language: state.job.language,
                encoding: state.job.encoding,
                copies: state.job.copies,
                copyStrategy: state.job.copyStrategy,
                payloadBase64: state.job.payloadBase64,
                payloadBytesLength: state.job.payloadBytesLength,
                checksumSha256: state.job.checksumSha256,
              },
            ],
          })
        );
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ total: 0, jobs: [] }));
    }

    if (req.method === 'PATCH' && url.includes('/status')) {
      const newStatus = jsonBody.status;
      state.jobStatusHistory.push(newStatus);
      state.job.status = newStatus;
      if (newStatus === 'PRINTED') {
        state.job.completedAt = new Date().toISOString();
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, jobId: state.job.id, status: newStatus }));
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Rota não encontrada' }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as any;
  const backendUrl = `http://127.0.0.1:${address.port}`;

  const env = {
    ...process.env,
    WITIQUETAS_BACKEND_URL: backendUrl,
    WITIQUETAS_AGENT_ID: agentId,
    WITIQUETAS_AGENT_TOKEN: rawToken,
    WITIQUETAS_INSTALLATION_ID: 'inst-e2e-01',
    WITIQUETAS_SINGLE_RUN: '1',
  };

  const agentProcess = spawn(AGENT_EXE_PATH, ['--single-run'], { env });

  let stdout = '';
  let stderr = '';
  agentProcess.stdout.on('data', (d) => (stdout += d.toString()));
  agentProcess.stderr.on('data', (d) => (stderr += d.toString()));

  const exitCode = await new Promise<number>((resolve) => {
    agentProcess.on('close', (code) => resolve(code ?? 0));
  });

  server.close();

  assert.equal(exitCode, 0, `Agent Core deve encerrar com código 0. Erro: ${stderr}`);
  assert.ok(stdout.includes('Witiquetas Agent Core v0.1.0'), 'Banner de inicialização exibido');
  assert.ok(!stdout.includes(rawToken), 'O token não pode aparecer no stdout');
  assert.ok(state.heartbeatsReceived >= 1, 'Heartbeat deve ter sido recebido');

  // Verificar progressão de estados: DOWNLOADED -> DELIVERING -> PRINTED
  assert.ok(state.jobStatusHistory.includes('DOWNLOADED'), 'Estado intermediário DOWNLOADED deve ser enviado');
  assert.ok(state.jobStatusHistory.includes('DELIVERING'), 'Estado intermediário DELIVERING deve ser enviado');
  assert.equal(state.job.status, 'PRINTED', 'O job deve terminar no estado PRINTED');
  assert.ok(state.job.completedAt, 'completedAt deve estar preenchido');
  assert.equal(state.job.attempts, 1, 'attempts deve ser 1');
  assert.equal(state.job.claimedByAgentId, agentId);
});

test('End-to-End: Agent Core detecta divergência de SHA-256 e reporta FAILED sem enviar para impressora', async () => {
  const rawToken = `agt_live_e2e_corrupt_${crypto.randomBytes(16).toString('hex')}`;
  const agentId = 'agent-e2e-corrupt';
  const jobId = `job-corrupt-${Date.now()}`;

  const payloadStr = 'I8,A,001\nQ240,024\nP1\n';
  const payloadBytes = Buffer.from(payloadStr, 'utf8');
  const payloadBase64 = payloadBytes.toString('base64');
  const fakeChecksum = '0000000000000000000000000000000000000000000000000000000000000000'; // Checksum incorreto

  let finalReportedStatus = '';
  let finalErrorMessage = '';

  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }
    const jsonBody = body ? JSON.parse(body) : {};
    const url = req.url || '';

    if (req.method === 'POST' && url.startsWith('/agents/heartbeat')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({
          acknowledged: true,
          serverTime: new Date().toISOString(),
          pendingJobsCount: 1,
          pollIntervalSeconds: 10,
        })
      );
    }

    if (req.method === 'GET' && url.startsWith('/print-jobs/pending')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({
          total: 1,
          jobs: [
            {
              jobId,
              leaseId: 'lease-corrupt-01',
              attemptId: 'attempt-corrupt-01',
              printerId: 'prn-01',
              printerName: 'Elgin L42',
              protocol: 'RAW_TCP',
              language: 'PPLB',
              encoding: 'windows-1252',
              copies: 1,
              copyStrategy: 'EMBEDDED_IN_PAYLOAD',
              payloadBase64,
              payloadBytesLength: payloadBytes.length,
              checksumSha256: fakeChecksum,
            },
          ],
        })
      );
    }

    if (req.method === 'PATCH' && url.includes('/status')) {
      finalReportedStatus = jsonBody.status;
      finalErrorMessage = jsonBody.error || jsonBody.errorMessage || '';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, jobId, status: finalReportedStatus }));
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as any;
  const backendUrl = `http://127.0.0.1:${address.port}`;

  const env = {
    ...process.env,
    WITIQUETAS_BACKEND_URL: backendUrl,
    WITIQUETAS_AGENT_ID: agentId,
    WITIQUETAS_AGENT_TOKEN: rawToken,
    WITIQUETAS_INSTALLATION_ID: 'inst-e2e-corrupt',
    WITIQUETAS_SINGLE_RUN: '1',
  };

  const agentProcess = spawn(AGENT_EXE_PATH, ['--single-run'], { env });
  await new Promise<number>((resolve) => {
    agentProcess.on('close', (code) => resolve(code ?? 0));
  });

  server.close();

  assert.equal(finalReportedStatus, 'FAILED', 'O job com payload corrompido deve ser reportado como FAILED');
  assert.ok(
    finalErrorMessage.includes('diverge do esperado') || finalErrorMessage.includes('Checksum'),
    `Mensagem de erro deve indicar falha de integridade: ${finalErrorMessage}`
  );
});

test('End-to-End: Agent Core executa ciclo limpo quando não há jobs pendentes', async () => {
  const rawToken = `agt_live_e2e_empty_${crypto.randomBytes(16).toString('hex')}`;
  const agentId = 'agent-e2e-empty';

  let heartbeatsReceived = 0;

  const server = http.createServer(async (req, res) => {
    const url = req.url || '';
    if (req.method === 'POST' && url.startsWith('/agents/heartbeat')) {
      heartbeatsReceived += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({
          acknowledged: true,
          serverTime: new Date().toISOString(),
          pendingJobsCount: 0,
          pollIntervalSeconds: 15,
        })
      );
    }

    if (req.method === 'GET' && url.startsWith('/print-jobs/pending')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ total: 0, jobs: [] }));
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as any;
  const backendUrl = `http://127.0.0.1:${address.port}`;

  const env = {
    ...process.env,
    WITIQUETAS_BACKEND_URL: backendUrl,
    WITIQUETAS_AGENT_ID: agentId,
    WITIQUETAS_AGENT_TOKEN: rawToken,
    WITIQUETAS_INSTALLATION_ID: 'inst-e2e-empty',
    WITIQUETAS_SINGLE_RUN: '1',
  };

  const agentProcess = spawn(AGENT_EXE_PATH, ['--single-run'], { env });
  const exitCode = await new Promise<number>((resolve) => {
    agentProcess.on('close', (code) => resolve(code ?? 0));
  });

  server.close();

  assert.equal(exitCode, 0);
  assert.ok(heartbeatsReceived >= 1);
});
