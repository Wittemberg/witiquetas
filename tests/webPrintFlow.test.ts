import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  PrintJobDTO,
  CreatePrintJobDTO,
  PrinterDTO,
} from '../packages/contracts/src/index.js';
import printJobsRouter, {
  printJobsStore,
  claimPendingJobsForAgent,
} from '../apps/backend/src/routes/printJobs.js';
import agentsRouter, {
  authenticateWebUser,
  type AuthWebUser,
} from '../apps/backend/src/routes/agents.js';
import authRouter, {
  webSessionsStore,
  createWebSession,
  getWebSession,
  SESSION_COOKIE_NAME,
} from '../apps/backend/src/routes/auth.js';
import { printersStore } from '../apps/backend/src/routes/printers.js';

// Setup de chaves administrativas dinâmicas injetadas via ENV para os testes (sem hardcode)
const testAdminKeyMatriz = process.env.ADMIN_API_KEY || `test_adm_matriz_${crypto.randomBytes(16).toString('hex')}`;
const testSuperAdminKey = process.env.SUPER_ADMIN_API_KEY || `test_super_adm_${crypto.randomBytes(16).toString('hex')}`;

process.env.ADMIN_API_KEY = testAdminKeyMatriz;
process.env.ADMIN_COMPANY_ID = 'comp-matriz-01';
process.env.SUPER_ADMIN_API_KEY = testSuperAdminKey;

// Helper: Executa a cadeia de handlers de rota (incluindo middlewares de autenticação)
function executeRouteChain(handlers: Function[], req: any, res: any) {
  let idx = 0;
  function next() {
    idx++;
    if (idx < handlers.length) {
      handlers[idx](req, res, next);
    }
  }
  if (handlers && handlers.length > 0) {
    handlers[0](req, res, next);
  }
}

// Helper: Cria objetos mock de request e response
function createMockReqRes(options: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: any;
  params?: Record<string, string>;
}) {
  let statusCode = 200;
  let responseData: any = null;
  const headersSet: Record<string, string> = {};

  const req: any = {
    method: options.method,
    url: options.url,
    headers: options.headers || {},
    body: options.body || {},
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
    setHeader(name: string, value: string) {
      headersSet[name.toLowerCase()] = value;
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
  };

  return { req, res };
}

// Handlers das rotas
const postJobHandlers = (printJobsRouter as any).routes.find(
  (r: any) => r.method === 'POST' && r.path === '/'
).handlers;

const postAuthSessionHandlers = (authRouter as any).routes.find(
  (r: any) => r.method === 'POST' && r.path === '/pre-rbac-session'
).handlers;

const postLogoutHandlers = (authRouter as any).routes.find(
  (r: any) => r.method === 'POST' && r.path === '/logout'
).handlers;

const getSessionHandlers = (authRouter as any).routes.find(
  (r: any) => r.method === 'GET' && r.path === '/session'
).handlers;

// ============================================================================
// SUÍTE P0: AUTENTICAÇÃO WEB REAL PRÉ-RBAC
// ============================================================================

test('P0.1: Header declaratório x-web-client sozinho NÃO autentica -> retorna 401', () => {
  const { req, res } = createMockReqRes({
    method: 'POST',
    url: '/',
    headers: { 'x-web-client': 'witiquetas-web' },
    body: { printerId: 'prn-gondola-elgin-tcp', compiledCommand: 'P1\n', language: 'PPLB' },
  });
  executeRouteChain(postJobHandlers, req, res);
  assert.equal(res.statusCode, 401, 'x-web-client sozinho deve retornar 401');
});

test('P0.2: Header declaratório x-web-session sozinho NÃO autentica -> retorna 401', () => {
  const { req, res } = createMockReqRes({
    method: 'POST',
    url: '/',
    headers: { 'x-web-session': 'witiquetas-editor' },
    body: { printerId: 'prn-gondola-elgin-tcp', compiledCommand: 'P1\n', language: 'PPLB' },
  });
  executeRouteChain(postJobHandlers, req, res);
  assert.equal(res.statusCode, 401, 'x-web-session sozinho deve retornar 401');
});

test('P0.3: Header declaratório sec-fetch-dest sozinho NÃO autentica -> retorna 401', () => {
  const { req, res } = createMockReqRes({
    method: 'POST',
    url: '/',
    headers: { 'sec-fetch-dest': 'empty' },
    body: { printerId: 'prn-gondola-elgin-tcp', compiledCommand: 'P1\n', language: 'PPLB' },
  });
  executeRouteChain(postJobHandlers, req, res);
  assert.equal(res.statusCode, 401, 'sec-fetch-dest sozinho deve retornar 401');
});

test('P0.4: Todos os headers declaratórios combinados sem cookie -> retorna 401', () => {
  const { req, res } = createMockReqRes({
    method: 'POST',
    url: '/',
    headers: {
      'x-web-client': 'witiquetas-web',
      'x-web-session': 'witiquetas-editor',
      'sec-fetch-dest': 'empty',
      origin: 'https://witiquetas.wrtec.com.br',
      referer: 'https://witiquetas.wrtec.com.br/',
    },
    body: { printerId: 'prn-gondola-elgin-tcp', compiledCommand: 'P1\n', language: 'PPLB' },
  });
  executeRouteChain(postJobHandlers, req, res);
  assert.equal(res.statusCode, 401, 'Headers combinados sem cookie/token devem retornar 401');
});

test('P0.5: API key inválida no bootstrap de sessão -> retorna 403', () => {
  const { req, res } = createMockReqRes({
    method: 'POST',
    url: '/pre-rbac-session',
    body: { apiKey: 'chave_totalmente_invalida' },
  });
  executeRouteChain(postAuthSessionHandlers, req, res);
  assert.equal(res.statusCode, 403, 'Chave inválida no bootstrap deve retornar 403');
  assert.equal(res.getHeader('set-cookie'), undefined, 'Nenhum cookie de sessão pode ser emitido');
});

test('P0.6: API key válida no bootstrap -> cria sessão server-side e emite cookie HttpOnly', () => {
  const { req, res } = createMockReqRes({
    method: 'POST',
    url: '/pre-rbac-session',
    body: { apiKey: testAdminKeyMatriz },
  });
  executeRouteChain(postAuthSessionHandlers, req, res);
  assert.equal(res.statusCode, 200, 'Bootstrap com chave válida deve retornar 200');
  assert.ok(res.data.success);
  assert.equal(res.data.user.companyId, 'comp-matriz-01');

  const setCookie = res.getHeader('set-cookie');
  assert.ok(setCookie, 'Header Set-Cookie deve ser emitido');
  assert.ok(setCookie.includes('witiquetas_session='), 'Cookie deve se chamar witiquetas_session');
  assert.ok(setCookie.includes('HttpOnly'), 'Cookie DEVE ser HttpOnly');
  assert.ok(setCookie.includes('Path=/'), 'Cookie DEVE ter Path=/');
});

test('P0.7: Cookie de sessão válido em POST /print-jobs -> cria PrintJob autorizado com tenant server-side', () => {
  // Cria sessão legítima no store
  const session = createWebSession({
    id: 'usr-matriz-op',
    companyId: 'comp-matriz-01',
    role: 'OPERATOR',
  });

  const { req, res } = createMockReqRes({
    method: 'POST',
    url: '/',
    headers: {
      cookie: `witiquetas_session=${session.sessionId}`,
    },
    body: {
      printerId: 'prn-gondola-elgin-tcp',
      compiledCommand: 'N\nq800\nQ240,24\nB40,40,0,1,2,6,50,B,"7894900011517"\nA40,120,0,4,1,1,N,"WITIQUETAS TESTE"\nP1\n',
      language: 'PPLB',
      copies: 1,
    },
  });

  executeRouteChain(postJobHandlers, req, res);

  assert.equal(res.statusCode, 201, `Job deve ser criado com 201. Erro: ${JSON.stringify(res.data)}`);
  assert.ok(res.data.success);
  assert.ok(res.data.job.id.startsWith('job-'));
  assert.equal(res.data.job.companyId, 'comp-matriz-01', 'Tenant deve vir exclusivamente da sessão do backend');
  assert.equal(res.data.job.status, 'PENDING');
  assert.equal(res.data.job.printerId, 'prn-gondola-elgin-tcp');
});

test('P0.8: Sessão expirada -> retorna 401', () => {
  const expiredSessionId = 'sess_expirada_' + crypto.randomBytes(16).toString('hex');
  webSessionsStore.set(expiredSessionId, {
    sessionId: expiredSessionId,
    userId: 'usr-exp',
    companyId: 'comp-matriz-01',
    role: 'OPERATOR',
    createdAt: Date.now() - 100000,
    expiresAt: Date.now() - 1000, // EXPIRADA
  });

  const { req, res } = createMockReqRes({
    method: 'POST',
    url: '/',
    headers: {
      cookie: `witiquetas_session=${expiredSessionId}`,
    },
    body: {
      printerId: 'prn-gondola-elgin-tcp',
      compiledCommand: 'P1\n',
      language: 'PPLB',
    },
  });

  executeRouteChain(postJobHandlers, req, res);
  assert.equal(res.statusCode, 401, 'Sessão expirada deve retornar 401');
});

test('P0.9: Sessão de tenant A NÃO cria job em impressora do tenant B -> retorna 403 Forbidden', () => {
  // Impressora da Filial
  printersStore.set('prn-filial-01', {
    id: 'prn-filial-01',
    companyId: 'comp-filial-999',
    name: 'Zebra Filial',
    model: 'ZD220',
    protocol: 'RAW_TCP',
    host: '192.168.1.250',
    port: 9100,
    language: 'ZPL',
    dpi: 203,
    active: true,
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Sessão do operador da Matriz
  const sessionMatriz = createWebSession({
    id: 'usr-matriz-op',
    companyId: 'comp-matriz-01',
    role: 'OPERATOR',
  });

  const { req, res } = createMockReqRes({
    method: 'POST',
    url: '/',
    headers: {
      cookie: `witiquetas_session=${sessionMatriz.sessionId}`,
    },
    body: {
      printerId: 'prn-filial-01',
      compiledCommand: '^XA^FO50,50^FDTeste^FS^XZ',
      language: 'ZPL',
    },
  });

  executeRouteChain(postJobHandlers, req, res);
  assert.equal(res.statusCode, 403, 'Operador da Matriz não pode enviar job para impressora da Filial');
  assert.ok(res.data.error.includes('Não autorizado a enviar jobs para impressora da empresa'));
});

test('P0.10: Logout invalida sessão e limpa cookie -> chamadas subsequentes retornam 401', () => {
  const session = createWebSession({
    id: 'usr-logout-op',
    companyId: 'comp-matriz-01',
    role: 'OPERATOR',
  });

  // 1. Executar logout
  const { req: reqLogout, res: resLogout } = createMockReqRes({
    method: 'POST',
    url: '/logout',
    headers: {
      cookie: `witiquetas_session=${session.sessionId}`,
    },
  });
  executeRouteChain(postLogoutHandlers, reqLogout, resLogout);
  assert.equal(resLogout.statusCode, 200);
  assert.equal(getWebSession(session.sessionId), null, 'Sessão deve ser removida do store');
  assert.ok(resLogout.getHeader('set-cookie').includes('Max-Age=0'), 'Cookie deve ser zerado no logout');

  // 2. Tentar criar job com a sessão deslogada
  const { req: reqJob, res: resJob } = createMockReqRes({
    method: 'POST',
    url: '/',
    headers: {
      cookie: `witiquetas_session=${session.sessionId}`,
    },
    body: {
      printerId: 'prn-gondola-elgin-tcp',
      compiledCommand: 'P1\n',
      language: 'PPLB',
    },
  });
  executeRouteChain(postJobHandlers, reqJob, resJob);
  assert.equal(resJob.statusCode, 401, 'Sessão invalidada deve retornar 401');
});

test('P0.11: Frontend source NÃO contém ADMIN_API_KEY nem SUPER_ADMIN_API_KEY', () => {
  const frontendSrcDir = path.resolve(process.cwd(), 'apps/frontend/src');
  const files: string[] = [];

  function walk(dir: string) {
    for (const item of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, item);
      if (fs.statSync(fullPath).isDirectory()) {
        walk(fullPath);
      } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.js') || fullPath.endsWith('.html')) {
        files.push(fullPath);
      }
    }
  }

  walk(frontendSrcDir);

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    assert.ok(
      !content.includes('ADMIN_API_KEY'),
      `Arquivo '${file}' não pode referenciar ADMIN_API_KEY`
    );
    assert.ok(
      !content.includes('SUPER_ADMIN_API_KEY'),
      `Arquivo '${file}' não pode referenciar SUPER_ADMIN_API_KEY`
    );
    assert.ok(
      !content.includes('adm_secret_'),
      `Arquivo '${file}' não pode conter credenciais administrativas hardcoded`
    );
  }
});

test('P0.12: Token de Agente NÃO funciona como credencial/sessão Web em POST /print-jobs', () => {
  const { req, res } = createMockReqRes({
    method: 'POST',
    url: '/',
    headers: {
      authorization: 'Bearer agt_live_token_do_daemon_123',
    },
    body: {
      printerId: 'prn-gondola-elgin-tcp',
      compiledCommand: 'P1\n',
      language: 'PPLB',
    },
  });

  executeRouteChain(postJobHandlers, req, res);
  assert.equal(res.statusCode, 403, 'Token de agente não é chave administrativa e deve retornar 403');
});

test('P0.13: Job criado para impressora RAW_TCP é consumido pelo Agent com host e port corretos', () => {
  const printer = printersStore.get('prn-gondola-elgin-tcp')!;
  assert.ok(printer, 'Impressora padrão deve existir');
  assert.equal(printer.protocol, 'RAW_TCP');
  assert.equal(printer.host, '192.168.1.200');
  assert.equal(printer.port, 9100);

  const mockAgent = {
    id: 'agent-matriz-01',
    companyId: 'comp-matriz-01',
    name: 'Agent PDV Matriz',
    hostname: 'pdv-01',
    version: '0.1.0',
    status: 'ONLINE' as const,
    tokenHash: 'abc',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const claimed = claimPendingJobsForAgent(mockAgent);
  assert.ok(claimed.length >= 1, 'Agente deve clamar o job pendente');
  const job = claimed[claimed.length - 1];
  assert.equal(job.protocol, 'RAW_TCP');
  assert.equal(job.host, '192.168.1.200');
  assert.equal(job.port, 9100);
  assert.ok(job.payloadBase64.length > 0);
  assert.equal(job.copies, 1);
});

test('P0.14: WINDOWS_SPOOLER não entra na validação de host TCP e cria job sem exigir host', () => {
  printersStore.set('prn-spooler-01', {
    id: 'prn-spooler-01',
    companyId: 'comp-matriz-01',
    name: 'Zebra Windows Spooler',
    model: 'ZD220',
    protocol: 'WINDOWS_SPOOLER',
    spoolerName: 'ZDesigner ZD220',
    language: 'ZPL',
    dpi: 203,
    active: true,
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const session = createWebSession({
    id: 'usr-spooler-op',
    companyId: 'comp-matriz-01',
    role: 'OPERATOR',
  });

  const { req, res } = createMockReqRes({
    method: 'POST',
    url: '/',
    headers: {
      cookie: `witiquetas_session=${session.sessionId}`,
    },
    body: {
      printerId: 'prn-spooler-01',
      compiledCommand: '^XA^FO10,10^FDTeste^FS^XZ',
      language: 'ZPL',
    },
  });

  executeRouteChain(postJobHandlers, req, res);
  assert.equal(res.statusCode, 201, 'WINDOWS_SPOOLER deve criar job sem exigir host TCP');
  assert.equal(res.data.job.printerId, 'prn-spooler-01');
});

test('P0.15: CUPS não entra na validação de host TCP e cria job sem exigir host', () => {
  printersStore.set('prn-cups-01', {
    id: 'prn-cups-01',
    companyId: 'comp-matriz-01',
    name: 'Zebra CUPS Linux',
    model: 'ZD220',
    protocol: 'CUPS',
    spoolerName: 'zebra_cups',
    language: 'ZPL',
    dpi: 203,
    active: true,
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const session = createWebSession({
    id: 'usr-cups-op',
    companyId: 'comp-matriz-01',
    role: 'OPERATOR',
  });

  const { req, res } = createMockReqRes({
    method: 'POST',
    url: '/',
    headers: {
      cookie: `witiquetas_session=${session.sessionId}`,
    },
    body: {
      printerId: 'prn-cups-01',
      compiledCommand: '^XA^FO10,10^FDTeste^FS^XZ',
      language: 'ZPL',
    },
  });

  executeRouteChain(postJobHandlers, req, res);
  assert.equal(res.statusCode, 201, 'CUPS deve criar job sem exigir host TCP');
  assert.equal(res.data.job.printerId, 'prn-cups-01');
});

test('P0.16: RAW_TCP com host ausente/vazio é rejeitado com 400 Bad Request', () => {
  printersStore.set('prn-tcp-nohost', {
    id: 'prn-tcp-nohost',
    companyId: 'comp-matriz-01',
    name: 'Elgin Sem Host',
    model: 'L42',
    protocol: 'RAW_TCP',
    host: '   ', // HOST VAZIO
    language: 'PPLB',
    dpi: 203,
    active: true,
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const session = createWebSession({
    id: 'usr-nohost-op',
    companyId: 'comp-matriz-01',
    role: 'OPERATOR',
  });

  const { req, res } = createMockReqRes({
    method: 'POST',
    url: '/',
    headers: {
      cookie: `witiquetas_session=${session.sessionId}`,
    },
    body: {
      printerId: 'prn-tcp-nohost',
      compiledCommand: 'P1\n',
      language: 'PPLB',
    },
  });

  executeRouteChain(postJobHandlers, req, res);
  assert.equal(res.statusCode, 400, 'RAW_TCP com host vazio deve retornar 400');
  assert.ok(res.data.error.includes('não possui Host/IP configurado'));
});

