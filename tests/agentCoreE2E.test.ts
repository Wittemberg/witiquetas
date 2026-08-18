import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';

import fs from 'node:fs';

const localTarget = path.resolve(process.cwd(), 'apps/agent-core/target/debug/witiquetas-agent-core.exe');
const appDataTarget = path.resolve(process.env.LOCALAPPDATA || '', 'witiquetas-cargo-target/debug/witiquetas-agent-core.exe');
const AGENT_EXE_PATH = fs.existsSync(localTarget) ? localTarget : appDataTarget;

test('End-to-End: 1. Ciclo de sucesso termina em DELIVERED_TO_TRANSPORT e NUNCA em PRINTED', async () => {
  const rawToken = `agt_live_e2e_${crypto.randomBytes(16).toString('hex')}`;
  const agentId = 'agent-e2e-matriz';
  const companyId = 'comp-matriz-01';

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
      payloadBase64,
      payloadBytesLength: payloadBytes.length,
      checksumSha256,
      attempts: 0,
      maxAttempts: 3,
      claimedByAgentId: null as string | null,
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
                protocol: 'MEMORY',
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
  assert.ok(!stdout.includes(rawToken), 'O token não pode aparecer no stdout');

  // Sequência de status obrigatória: DOWNLOADED -> DELIVERING -> DELIVERED_TO_TRANSPORT
  assert.deepEqual(
    state.jobStatusHistory,
    ['DOWNLOADED', 'DELIVERING', 'DELIVERED_TO_TRANSPORT'],
    'Sequência de transições deve ser estritamente DOWNLOADED -> DELIVERING -> DELIVERED_TO_TRANSPORT'
  );
  assert.equal(state.job.status, 'DELIVERED_TO_TRANSPORT', 'Status final deve ser DELIVERED_TO_TRANSPORT');
  assert.ok(!state.jobStatusHistory.includes('PRINTED'), 'O status PRINTED NUNCA deve ser emitido');
});

test('End-to-End: 2. Gate DOWNLOADED rejeitado pelo Backend -> aborta sem executar transporte', async () => {
  const rawToken = `agt_live_e2e_gate1_${crypto.randomBytes(16).toString('hex')}`;
  const agentId = 'agent-e2e-gate1';
  const jobId = `job-gate1-${Date.now()}`;

  const payloadStr = 'I8,A,001\nQ240,024\nP1\n';
  const payloadBytes = Buffer.from(payloadStr, 'utf8');
  const payloadBase64 = payloadBytes.toString('base64');
  const checksumSha256 = crypto.createHash('sha256').update(payloadBytes).digest('hex');

  const statusHistory: string[] = [];

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
              leaseId: 'lease-gate1-01',
              attemptId: 'attempt-gate1-01',
              printerId: 'prn-01',
              printerName: 'Elgin L42',
              protocol: 'RAW_TCP',
              language: 'PPLB',
              encoding: 'windows-1252',
              copies: 1,
              copyStrategy: 'EMBEDDED_IN_PAYLOAD',
              payloadBase64,
              payloadBytesLength: payloadBytes.length,
              checksumSha256,
            },
          ],
        })
      );
    }

    if (req.method === 'PATCH' && url.includes('/status')) {
      statusHistory.push(jsonBody.status);
      if (jsonBody.status === 'DOWNLOADED') {
        // Backend rejeita DOWNLOADED (ex: 409 Lease Expired / Conflito)
        res.writeHead(409, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Lease expirado no gate DOWNLOADED' }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
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
    WITIQUETAS_INSTALLATION_ID: 'inst-e2e-gate1',
    WITIQUETAS_SINGLE_RUN: '1',
  };

  const agentProcess = spawn(AGENT_EXE_PATH, ['--single-run'], { env });
  const exitCode = await new Promise<number>((resolve) => {
    agentProcess.on('close', (code) => resolve(code ?? 0));
  });

  server.close();

  assert.equal(exitCode, 0, 'O Agent não deve crashar em erro de lease');
  assert.deepEqual(statusHistory, ['DOWNLOADED'], 'DELIVERING e DELIVERED_TO_TRANSPORT não podem ser chamados');
});

test('End-to-End: 3. Gate DELIVERING rejeitado pelo Backend -> aborta sem executar transporte', async () => {
  const rawToken = `agt_live_e2e_gate2_${crypto.randomBytes(16).toString('hex')}`;
  const agentId = 'agent-e2e-gate2';
  const jobId = `job-gate2-${Date.now()}`;

  const payloadStr = 'I8,A,001\nQ240,024\nP1\n';
  const payloadBytes = Buffer.from(payloadStr, 'utf8');
  const payloadBase64 = payloadBytes.toString('base64');
  const checksumSha256 = crypto.createHash('sha256').update(payloadBytes).digest('hex');

  const statusHistory: string[] = [];

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
              leaseId: 'lease-gate2-01',
              attemptId: 'attempt-gate2-01',
              printerId: 'prn-01',
              printerName: 'Elgin L42',
              protocol: 'RAW_TCP',
              language: 'PPLB',
              encoding: 'windows-1252',
              copies: 1,
              copyStrategy: 'EMBEDDED_IN_PAYLOAD',
              payloadBase64,
              payloadBytesLength: payloadBytes.length,
              checksumSha256,
            },
          ],
        })
      );
    }

    if (req.method === 'PATCH' && url.includes('/status')) {
      statusHistory.push(jsonBody.status);
      if (jsonBody.status === 'DOWNLOADED') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true }));
      }
      if (jsonBody.status === 'DELIVERING') {
        // Backend rejeita DELIVERING (ex: 409 Lease Expired / Conflito)
        res.writeHead(409, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Lease expirado no gate DELIVERING' }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
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
    WITIQUETAS_INSTALLATION_ID: 'inst-e2e-gate2',
    WITIQUETAS_SINGLE_RUN: '1',
  };

  const agentProcess = spawn(AGENT_EXE_PATH, ['--single-run'], { env });
  const exitCode = await new Promise<number>((resolve) => {
    agentProcess.on('close', (code) => resolve(code ?? 0));
  });

  server.close();

  assert.equal(exitCode, 0, 'O Agent não deve crashar em erro de lease no gate DELIVERING');
  assert.deepEqual(statusHistory, ['DOWNLOADED', 'DELIVERING'], 'DELIVERED_TO_TRANSPORT não pode ser chamado');
});

test('End-to-End: 4. Rejeição de copies=0 reporta FAILED e não executa transporte', async () => {
  const rawToken = `agt_live_e2e_copies0_${crypto.randomBytes(16).toString('hex')}`;
  const agentId = 'agent-e2e-copies0';
  const jobId = `job-copies0-${Date.now()}`;

  let finalStatus = '';
  let finalError = '';

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
              leaseId: 'lease-copies0-01',
              attemptId: 'attempt-copies0-01',
              printerId: 'prn-01',
              printerName: 'Elgin L42',
              protocol: 'RAW_TCP',
              language: 'PPLB',
              encoding: 'windows-1252',
              copies: 0, // CÓPIAS INVÁLIDAS
              copyStrategy: 'EMBEDDED_IN_PAYLOAD',
              payloadBase64: Buffer.from('P1\n').toString('base64'),
              payloadBytesLength: 3,
              checksumSha256: crypto.createHash('sha256').update(Buffer.from('P1\n')).digest('hex'),
            },
          ],
        })
      );
    }

    if (req.method === 'PATCH' && url.includes('/status')) {
      finalStatus = jsonBody.status;
      finalError = jsonBody.error || '';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
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
    WITIQUETAS_INSTALLATION_ID: 'inst-e2e-copies0',
    WITIQUETAS_SINGLE_RUN: '1',
  };

  const agentProcess = spawn(AGENT_EXE_PATH, ['--single-run'], { env });
  const exitCode = await new Promise<number>((resolve) => {
    agentProcess.on('close', (code) => resolve(code ?? 0));
  });

  server.close();

  assert.equal(exitCode, 0);
  assert.equal(finalStatus, 'FAILED');
  assert.ok(finalError.includes('Quantidade de cópias inválida'));
});

test('End-to-End: 5. Payload corrompido reporta FAILED e não executa transporte', async () => {
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
      if (jsonBody.status === 'FAILED') {
        finalErrorMessage = jsonBody.error || jsonBody.errorMessage || '';
      }
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

test('End-to-End: 6. Ciclo limpo quando não há jobs pendentes', async () => {
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

test('End-to-End: 7. Envio físico RAW TCP ponta a ponta para servidor TCP fake com preservação binária integral', async () => {
  const rawToken = `agt_live_e2e_${crypto.randomBytes(16).toString('hex')}`;
  const agentId = 'agent-e2e-tcp';
  const companyId = 'comp-matriz-01';

  // 1. Iniciar servidor de impressora TCP RAW fake
  let capturedTcpBytes = Buffer.alloc(0);
  const fakePrinterServer = net.createServer((socket) => {
    socket.on('data', (chunk) => {
      capturedTcpBytes = Buffer.concat([capturedTcpBytes, chunk]);
    });
  });

  await new Promise<void>((resolve) => fakePrinterServer.listen(0, '127.0.0.1', () => resolve()));
  const tcpAddr = fakePrinterServer.address() as net.AddressInfo;
  const tcpPort = tcpAddr.port;

  // 2. Preparar payload de teste com bytes reais
  const payloadStr = 'I8,A,001\nQ240,024\nq831\nA10,10,0,1,1,1,N,"RAW TCP PHYSICAL TEST"\nP1\n';
  const payloadBytes = Buffer.from(payloadStr, 'utf8');
  const payloadBase64 = payloadBytes.toString('base64');
  const checksumSha256 = crypto.createHash('sha256').update(payloadBytes).digest('hex');
  const jobId = `job-e2e-tcp-${Date.now()}`;

  const state = {
    heartbeatsReceived: 0,
    jobStatusHistory: [] as string[],
    job: {
      id: jobId,
      companyId,
      printerId: 'prn-tcp-01',
      printerName: 'Zebra ZD220 TCP',
      status: 'PENDING',
      language: 'PPLB',
      encoding: 'windows-1252',
      copies: 1,
      copyStrategy: 'EMBEDDED_IN_PAYLOAD',
      payloadBase64,
      payloadBytesLength: payloadBytes.length,
      checksumSha256,
      attempts: 0,
      maxAttempts: 3,
      claimedByAgentId: null as string | null,
    },
  };

  // 3. Iniciar servidor Backend mock
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
                leaseId: 'lease-e2e-tcp-01',
                attemptId: 'attempt-e2e-tcp-01',
                printerId: state.job.printerId,
                printerName: state.job.printerName,
                protocol: 'RAW_TCP',
                host: '127.0.0.1',
                port: tcpPort,
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
    WITIQUETAS_INSTALLATION_ID: 'inst-e2e-tcp',
    WITIQUETAS_SINGLE_RUN: '1',
  };

  const agentProcess = spawn(AGENT_EXE_PATH, ['--single-run'], { env });
  const exitCode = await new Promise<number>((resolve) => {
    agentProcess.on('close', (code) => resolve(code ?? 0));
  });

  server.close();
  fakePrinterServer.close();

  assert.equal(exitCode, 0, 'Agent Core deve finalizar com código 0');
  assert.ok(state.heartbeatsReceived >= 1);
  assert.deepEqual(
    state.jobStatusHistory,
    ['DOWNLOADED', 'DELIVERING', 'DELIVERED_TO_TRANSPORT'],
    'Ciclo completo de gates com RAW TCP real'
  );
  assert.equal(
    capturedTcpBytes.toString('utf8'),
    payloadStr,
    'Servidor de impressora TCP capturou exatamente os bytes enviados pelo Agent Core'
  );
});

test('End-to-End: 8. Fail-Closed: RAW_TCP sem host reporta FAILED e NUNCA usa MemoryTransport silencioso', async () => {
  const rawToken = `agt_live_e2e_nohost_${crypto.randomBytes(16).toString('hex')}`;
  const agentId = 'agent-e2e-nohost';
  const companyId = 'comp-matriz-01';

  const payloadStr = 'I8,A,001\nQ240,024\nP1\n';
  const payloadBytes = Buffer.from(payloadStr, 'utf8');
  const payloadBase64 = payloadBytes.toString('base64');
  const checksumSha256 = crypto.createHash('sha256').update(payloadBytes).digest('hex');
  const jobId = `job-e2e-nohost-${Date.now()}`;

  const state = {
    jobStatusHistory: [] as string[],
    finalError: '',
    job: {
      id: jobId,
      companyId,
      printerId: 'prn-nohost-01',
      printerName: 'Zebra Sem IP',
      status: 'PENDING',
      language: 'PPLB',
      encoding: 'windows-1252',
      copies: 1,
      copyStrategy: 'EMBEDDED_IN_PAYLOAD',
      payloadBase64,
      payloadBytesLength: payloadBytes.length,
      checksumSha256,
      attempts: 0,
      maxAttempts: 3,
      claimedByAgentId: null as string | null,
    },
  };

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
                leaseId: 'lease-nohost-01',
                attemptId: 'attempt-nohost-01',
                printerId: state.job.printerId,
                printerName: state.job.printerName,
                protocol: 'RAW_TCP',
                host: null, // HOST AUSENTE
                port: 9100,
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
      if (jsonBody.error) {
        state.finalError = jsonBody.error;
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
    WITIQUETAS_INSTALLATION_ID: 'inst-e2e-nohost',
    WITIQUETAS_SINGLE_RUN: '1',
  };

  const agentProcess = spawn(AGENT_EXE_PATH, ['--single-run'], { env });
  const exitCode = await new Promise<number>((resolve) => {
    agentProcess.on('close', (code) => resolve(code ?? 0));
  });

  server.close();

  assert.equal(exitCode, 0);
  assert.deepEqual(
    state.jobStatusHistory,
    ['DOWNLOADED', 'DELIVERING', 'FAILED'],
    'RAW_TCP sem host deve falhar no transporte reportando FAILED'
  );
  assert.ok(
    state.finalError.toLowerCase().includes('host/ip') || state.finalError.toLowerCase().includes('destino'),
    'Mensagem de erro deve indicar ausência de host/IP'
  );
  assert.ok(!state.jobStatusHistory.includes('DELIVERED_TO_TRANSPORT'), 'NUNCA reportar DELIVERED_TO_TRANSPORT');
});

test('End-to-End: 9. Fail-Closed: Protocolo desconhecido reporta FAILED e NUNCA usa MemoryTransport silencioso', async () => {
  const rawToken = `agt_live_e2e_unkproto_${crypto.randomBytes(16).toString('hex')}`;
  const agentId = 'agent-e2e-unkproto';
  const companyId = 'comp-matriz-01';

  const payloadStr = 'I8,A,001\nQ240,024\nP1\n';
  const payloadBytes = Buffer.from(payloadStr, 'utf8');
  const payloadBase64 = payloadBytes.toString('base64');
  const checksumSha256 = crypto.createHash('sha256').update(payloadBytes).digest('hex');
  const jobId = `job-e2e-unkproto-${Date.now()}`;

  const state = {
    jobStatusHistory: [] as string[],
    finalError: '',
    job: {
      id: jobId,
      companyId,
      printerId: 'prn-unk-01',
      printerName: 'Impressora Bluetooth',
      status: 'PENDING',
      language: 'PPLB',
      encoding: 'windows-1252',
      copies: 1,
      copyStrategy: 'EMBEDDED_IN_PAYLOAD',
      payloadBase64,
      payloadBytesLength: payloadBytes.length,
      checksumSha256,
      attempts: 0,
      maxAttempts: 3,
      claimedByAgentId: null as string | null,
    },
  };

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
                leaseId: 'lease-unk-01',
                attemptId: 'attempt-unk-01',
                printerId: state.job.printerId,
                printerName: state.job.printerName,
                protocol: 'BLUETOOTH_SPP', // PROTOCOLO DESCONHECIDO
                host: '192.168.1.50',
                port: 9100,
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
      if (jsonBody.error) {
        state.finalError = jsonBody.error;
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
    WITIQUETAS_INSTALLATION_ID: 'inst-e2e-unkproto',
    WITIQUETAS_SINGLE_RUN: '1',
  };

  const agentProcess = spawn(AGENT_EXE_PATH, ['--single-run'], { env });
  const exitCode = await new Promise<number>((resolve) => {
    agentProcess.on('close', (code) => resolve(code ?? 0));
  });

  server.close();

  assert.equal(exitCode, 0);
  assert.deepEqual(
    state.jobStatusHistory,
    ['DOWNLOADED', 'DELIVERING', 'FAILED'],
    'Protocolo desconhecido deve falhar no transporte reportando FAILED'
  );
  assert.ok(
    state.finalError.toLowerCase().includes('não suportado') || state.finalError.toLowerCase().includes('destino'),
    'Mensagem de erro deve indicar protocolo não suportado'
  );
  assert.ok(!state.jobStatusHistory.includes('DELIVERED_TO_TRANSPORT'), 'NUNCA reportar DELIVERED_TO_TRANSPORT');
});
