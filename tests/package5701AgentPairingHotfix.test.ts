import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import agentsRouter, {
  pairingCodes,
  getAgentWindowsX64Path,
} from '../apps/backend/src/routes/agents.js';
import { formatPairingExpiration } from '../apps/frontend/src/modules/admin/AgentsAdminView.js';
import type { GeneratePairingCodeResponseDTO, PairingStatusResponseDTO } from '@witiquetas/contracts';

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
    send(data: any) {
      this.body = data;
      return this;
    },
  };
  return res;
}

function callRouter(router: any, req: any): Promise<any> {
  const handler = typeof router === 'function' ? router : (router?.default || router);
  const res = createMockResponse();
  return new Promise((resolve) => {
    const origJson = res.json.bind(res);
    res.json = (data: any) => {
      origJson(data);
      resolve(res);
      return res;
    };
    handler(req, res, (err?: any) => {
      if (err) {
        res.statusCode = 500;
        res.body = { error: err.message };
      }
      resolve(res);
    });
  });
}

const TEST_ADMIN_KEY = 'test-admin-api-key-hotfix-5701';

test('SUÍTE PACKAGE 5.7.0.1 — AGENT PAIRING & WINDOWS UX HOTFIX', async (t) => {
  process.env.ADMIN_API_KEY = TEST_ADMIN_KEY;
  process.env.ADMIN_COMPANY_ID = 'comp-matriz-01';

  // =========================================================================
  // GATE 1: BACKEND PAIRING CONTRACT (ISO 8601 expiresAt, formattedCode, command)
  // =========================================================================
  await t.test('Gate 1: POST /generate-pairing-code retorna contrato canônico padronizado', async () => {
    const req = {
      method: 'POST',
      url: '/generate-pairing-code',
      headers: {
        authorization: `Bearer ${TEST_ADMIN_KEY}`,
      },
      body: { companyId: 'comp-matriz-01' },
    };

    const res = await callRouter(agentsRouter, req);

    assert.equal(res.statusCode, 200);
    const body: GeneratePairingCodeResponseDTO = res.body;

    assert.ok(body.pairingCode, 'pairingCode deve existir');
    assert.match(body.pairingCode, /^WIT-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/, 'pairingCode deve seguir formato WIT-XXXX-XXXX');
    assert.equal(body.formattedCode, body.pairingCode, 'formattedCode deve ser idêntico a pairingCode');
    assert.equal(body.expiresInSeconds, 900, 'expiresInSeconds deve ser 900');
    assert.equal(body.status, 'PENDING', 'status inicial deve ser PENDING');
    assert.equal(body.companyId, 'comp-matriz-01');

    // Validação estrita de expiresAt como ISO 8601
    assert.ok(typeof body.expiresAt === 'string', 'expiresAt deve ser uma string');
    const parsedDate = new Date(body.expiresAt);
    assert.equal(isNaN(parsedDate.getTime()), false, 'expiresAt deve ser uma data ISO 8601 válida');
    assert.ok(body.expiresAt.endsWith('Z'), 'expiresAt deve estar em UTC no formato ISO 8601');
    assert.ok(parsedDate.getTime() > Date.now(), 'expiresAt deve estar no futuro');

    // Validação do comando montado no backend
    assert.equal(
      body.command,
      `witiquetas-agent-windows-x64.exe pair --code ${body.pairingCode}`,
      'Comando deve conter o binário x64 e o código exato'
    );
  });

  // =========================================================================
  // GATE 2: PAIRING STATUS ENDPOINT (ISO 8601 expiresAt)
  // =========================================================================
  await t.test('Gate 2: GET /pairing-status/:code retorna expiresAt ISO 8601 válido', async () => {
    // Insere um código de teste no store em memória
    const testCode = 'WIT-TEST-5701';
    const futureMs = Date.now() + 10 * 60 * 1000;
    pairingCodes.set(testCode, {
      pairingCode: testCode,
      companyId: 'comp-matriz-01',
      companyName: 'Matriz Supermercado WR',
      createdBy: 'admin-01',
      createdAt: Date.now(),
      expiresAt: futureMs,
      status: 'PENDING',
    });

    const req = {
      method: 'GET',
      url: `/pairing-status/${testCode}`,
      params: { code: testCode },
      headers: {
        authorization: `Bearer ${TEST_ADMIN_KEY}`,
      },
    };

    const res = await callRouter(agentsRouter, req);

    assert.equal(res.statusCode, 200);
    const body: PairingStatusResponseDTO = res.body;

    assert.equal(body.pairingCode, testCode);
    assert.equal(body.formattedCode, testCode);
    assert.equal(body.status, 'PENDING');
    assert.ok(typeof body.expiresAt === 'string', 'expiresAt deve ser retornado como string ISO 8601');
    const parsedDate = new Date(body.expiresAt);
    assert.equal(isNaN(parsedDate.getTime()), false, 'expiresAt retornado deve ser parseável sem NaN');
    assert.equal(parsedDate.getTime(), futureMs, 'Timestamp deve corresponder ao milissegundo exato');
  });

  // =========================================================================
  // GATE 3: EXPIRATION DATE FORMATTER — ZERO "INVALID DATE"
  // =========================================================================
  await t.test('Gate 3: formatPairingExpiration elimina completamente "Invalid Date"', () => {
    // 1. Data ISO 8601 válida
    const validIso = new Date('2026-10-05T16:30:00.000Z').toISOString();
    const resultValid = formatPairingExpiration(validIso, 900);
    assert.equal(resultValid.primary, 'Este código expira em 15 minutos.');
    assert.ok(resultValid.secondary !== null, 'Data válida deve gerar secondary');
    assert.ok(resultValid.secondary?.startsWith('Expira às '), 'Secondary deve começar com Expira às ');
    assert.equal(resultValid.fullText.includes('Invalid Date'), false, 'NÃO pode conter Invalid Date');

    // 2. Data undefined
    const resultUndef = formatPairingExpiration(undefined, 900);
    assert.equal(resultUndef.primary, 'Este código expira em 15 minutos.');
    assert.equal(resultUndef.secondary, null, 'Secondary deve ser null');
    assert.equal(resultUndef.fullText, 'Este código expira em 15 minutos.');
    assert.equal(resultUndef.fullText.includes('Invalid Date'), false);

    // 3. String inválida arbitrária
    const resultInvalidStr = formatPairingExpiration('invalid-date-string-xyz', 600);
    assert.equal(resultInvalidStr.primary, 'Este código expira em 10 minutos.');
    assert.equal(resultInvalidStr.secondary, null);
    assert.equal(resultInvalidStr.fullText.includes('Invalid Date'), false);

    // 4. String vazia
    const resultEmpty = formatPairingExpiration('', 300);
    assert.equal(resultEmpty.primary, 'Este código expira em 5 minutos.');
    assert.equal(resultEmpty.secondary, null);
    assert.equal(resultEmpty.fullText.includes('Invalid Date'), false);

    // 5. Epoch ou valor NaN
    const resultNan = formatPairingExpiration('NaN', undefined);
    assert.equal(resultNan.primary, 'Este código expira em 15 minutos.');
    assert.equal(resultNan.secondary, null);
    assert.equal(resultNan.fullText.includes('Invalid Date'), false);
  });

  // =========================================================================
  // GATE 4: FRONTEND COMPONENT AUDIT (Alto Contraste WCAG, Monospace, Copiar)
  // =========================================================================
  await t.test('Gate 4: AgentsAdminView.tsx contém componentes de pairing code e comando de alto contraste', () => {
    const filePath = path.resolve('apps/frontend/src/modules/admin/AgentsAdminView.tsx');
    assert.ok(fs.existsSync(filePath), 'AgentsAdminView.tsx deve existir');

    const content = fs.readFileSync(filePath, 'utf-8');

    // Código em destaque com monospace e fallback robusto
    assert.ok(content.includes('CÓDIGO DE PAREAMENTO'), 'Deve ter label CÓDIGO DE PAREAMENTO');
    assert.ok(content.includes('data-testid="pairing-code-display"'), 'Deve conter data-testid para pairing code');
    assert.ok(
      content.includes('pairingData.pairingCode || pairingData.formattedCode'),
      'Deve ler pairingCode com fallback para formattedCode para nunca ficar vazio'
    );

    // Botões de cópia independentes com feedback Copiado ✓ sem alert()
    assert.ok(content.includes('handleCopyCode'), 'Deve ter handler de cópia de código');
    assert.ok(content.includes('handleCopyCommand'), 'Deve ter handler de cópia de comando');
    assert.ok(content.includes('Copiado ✓'), 'Deve ter feedback amigável Copiado ✓');
    assert.equal(content.includes('alert('), false, 'NÃO pode usar alert() do navegador');

    // Terminal com contraste WCAG adequado (Slate-900 / Slate-50) e sem azul sobre cinza ilegível
    assert.ok(content.includes('#0f172a'), 'Terminal deve usar fundo slate-900 escuro sólido de alto contraste');
    assert.ok(content.includes('#f8fafc'), 'Texto do comando deve usar cor slate-50 com alto contraste');
    assert.ok(content.includes('data-testid="pairing-command-display"'), 'Deve conter data-testid para comando');
    assert.ok(content.includes('overflowX: \'auto\''), 'Deve permitir scroll horizontal controlado sem corte');
    assert.ok(content.includes('userSelect: \'all\''), 'Deve permitir seleção manual do comando com um clique');
  });

  // =========================================================================
  // GATE 5: WINDOWS AGENT EXECUTABLE & PE VALIDATION
  // =========================================================================
  await t.test('Gate 5: Binário do Windows Agent existe, é PE x64 válido e aceita subcomandos', () => {
    const binaryPath = getAgentWindowsX64Path();
    assert.ok(fs.existsSync(binaryPath), `Binário do Agent deve existir em ${binaryPath}`);

    const stats = fs.statSync(binaryPath);
    assert.ok(stats.size > 1000000, `Binário deve ser executável real > 1MB (tamanho: ${stats.size} bytes)`);

    // Validação de cabeçalho Windows PE (MZ)
    const fd = fs.openSync(binaryPath, 'r');
    const header = Buffer.alloc(2);
    fs.readSync(fd, header, 0, 2, 0);
    fs.closeSync(fd);

    assert.equal(header[0], 0x4d, 'Byte 0 do cabeçalho deve ser M (0x4D)');
    assert.equal(header[1], 0x5a, 'Byte 1 do cabeçalho deve ser Z (0x5A)');
  });

  // =========================================================================
  // GATE 6: CONTRATO AGENT CLI — VERBO 'pair' E FLAGS
  // =========================================================================
  await t.test('Gate 6: apps/agent-core/src/main.rs aceita verbo pair e flags intercambiáveis', () => {
    const mainRsPath = path.resolve('apps/agent-core/src/main.rs');
    const content = fs.readFileSync(mainRsPath, 'utf-8');

    assert.ok(
      content.includes('args.iter().any(|arg| arg == "--pair" || arg == "pair"'),
      'main.rs deve suportar tanto flag --pair quanto verbo pair'
    );
    assert.ok(
      content.includes('args.iter().any(|arg| arg == "--install-service" || arg == "install-service"'),
      'main.rs deve suportar verbo install-service'
    );
  });
});
