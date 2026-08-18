import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import agentsRouter from '../apps/backend/src/routes/agents.js';

function createMockReqRes(options: {
  method: string;
  url: string;
  params?: Record<string, string>;
}) {
  let statusCode = 200;
  let responseData: any = null;
  const headersSet: Record<string, string> = {};
  let sentFilePath: string | null = null;

  const req: any = {
    method: options.method,
    url: options.url,
    headers: {},
    params: options.params || {},
  };

  const res: any = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: any) {
      responseData = data;
      return res;
    },
    send(data: any) {
      responseData = data;
      return res;
    },
    sendFile(filePath: string) {
      sentFilePath = filePath;
      responseData = fs.readFileSync(filePath);
      return res;
    },
    setHeader(name: string, value: string | number) {
      headersSet[name.toLowerCase()] = String(value);
      return res;
    },
    getHeader(name: string) {
      return headersSet[name.toLowerCase()];
    },
    get statusCode() {
      return statusCode;
    },
    get data() {
      return responseData;
    },
    get sentFilePath() {
      return sentFilePath;
    },
    get headers() {
      return headersSet;
    },
  };

  return { req, res };
}

const getDownloadHandler = (agentsRouter as any).routes.find(
  (r: any) => r.method === 'GET' && r.path === '/download/:platform'
).handlers[0];

// ============================================================================
// SUÍTE DE TESTES: DOWNLOAD REAL DO AGENT WINDOWS (SEM MOCK)
// ============================================================================

test('1. Auditoria de Código-Fonte: String de mock MZ_WITIQUETAS_AGENT_STANDALONE_BINARY_MOCK não existe mais no backend', () => {
  const agentsTsPath = path.resolve('apps/backend/src/routes/agents.ts');
  const content = fs.readFileSync(agentsTsPath, 'utf8');

  assert.ok(
    !content.includes('MZ_WITIQUETAS_AGENT_STANDALONE_BINARY_MOCK'),
    'A string de mock MZ_WITIQUETAS_AGENT_STANDALONE_BINARY_MOCK deve ter sido 100% removida do backend'
  );
});

test('2. Download Windows x64: Serve binário PE real com headers corretos', () => {
  const { req, res } = createMockReqRes({
    method: 'GET',
    url: '/download/windows-x64',
    params: { platform: 'windows-x64' },
  });

  getDownloadHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'application/octet-stream');
  assert.equal(res.headers['content-disposition'], 'attachment; filename="witiquetas-agent-windows-x64.exe"');
  assert.equal(res.headers['x-agent-version'], '0.1.0');
  assert.ok(res.headers['x-agent-sha256'], 'Header X-Agent-SHA256 deve estar presente');

  // Validar integridade binária PE (Magic bytes MZ = 0x4D 0x5A)
  const buffer = Buffer.isBuffer(res.data) ? res.data : Buffer.from(res.data);
  assert.ok(buffer.length > 1000000, `Tamanho do executável (${buffer.length} bytes) deve ser maior que 1MB`);
  assert.equal(buffer[0], 0x4d, 'Byte 0 do executável deve ser M (0x4D)');
  assert.equal(buffer[1], 0x5a, 'Byte 1 do executável deve ser Z (0x5A)');

  // Validar checksum SHA-256
  const computedHash = crypto.createHash('sha256').update(buffer).digest('hex');
  assert.equal(res.headers['x-agent-sha256'], computedHash, 'X-Agent-SHA256 deve coincidir com o hash real do arquivo');
});

test('3. Fail-Closed: Quando a plataforma for desconhecida ou não disponível, retorna 404/503 e NUNCA mock', () => {
  const { req, res } = createMockReqRes({
    method: 'GET',
    url: '/download/solaris-sparc',
    params: { platform: 'solaris-sparc' },
  });

  getDownloadHandler(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.data.status, 'COMING_SOON');
});
