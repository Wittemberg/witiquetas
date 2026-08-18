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
    get statusCode() {
      return statusCode;
    },
    get data() {
      return responseData;
    },
  };

  return { req, res };
}

// Obter handlers da rota POST / em printJobsRouter
const postJobHandlers = (printJobsRouter as any).routes.find(
  (r: any) => r.method === 'POST' && r.path === '/'
).handlers;

test('Segurança Web: 1. Frontend source não contém ADMIN_API_KEY hardcoded nem em variáveis', () => {
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

test('Segurança Web: 2. Print job via sessão Web autoriza sem expor tokens e resolve tenant server-side', () => {
  const { req, res } = createMockReqRes({
    method: 'POST',
    url: '/',
    headers: {
      'x-web-client': 'witiquetas-web',
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
  assert.equal(res.data.job.companyId, 'comp-matriz-01', 'Tenant deve ser resolvido server-side como comp-matriz-01');
  assert.equal(res.data.job.status, 'PENDING');
  assert.equal(res.data.job.printerId, 'prn-gondola-elgin-tcp');
});

test('Segurança Web: 3. Requisição anônima sem header web e sem token é rejeitada com 401 fail-closed', () => {
  const { req, res } = createMockReqRes({
    method: 'POST',
    url: '/',
    headers: {}, // SEM TOKEN E SEM X-WEB-CLIENT
    body: {
      printerId: 'prn-gondola-elgin-tcp',
      compiledCommand: 'P1\n',
      language: 'PPLB',
    },
  });

  executeRouteChain(postJobHandlers, req, res);

  assert.equal(res.statusCode, 401, 'Requisição anônima deve ser rejeitada com 401');
  assert.ok(!res.data?.job);
});

test('Segurança Web: 4. Tenant incorreto é rejeitado com 403 Forbidden', () => {
  // Cria impressora de outra empresa no store
  printersStore.set('prn-filial-01', {
    id: 'prn-filial-01',
    companyId: 'comp-filial-999', // Empresa diferente de comp-matriz-01
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

  const { req, res } = createMockReqRes({
    method: 'POST',
    url: '/',
    headers: {
      'x-web-client': 'witiquetas-web', // Web user com tenant resolvido comp-matriz-01
    },
    body: {
      printerId: 'prn-filial-01',
      compiledCommand: '^XA^FO50,50^FDTeste^FS^XZ',
      language: 'ZPL',
    },
  });

  executeRouteChain(postJobHandlers, req, res);

  assert.equal(res.statusCode, 403, 'Acesso a impressora de outro tenant deve retornar 403');
  assert.ok(res.data.error.includes('Não autorizado a enviar jobs para impressora da empresa'));
});

test('Segurança Web: 5. RAW_TCP sem host na impressora é rejeitado com 400 Bad Request', () => {
  printersStore.set('prn-sem-ip', {
    id: 'prn-sem-ip',
    companyId: 'comp-matriz-01',
    name: 'Zebra Sem IP',
    model: 'ZD220',
    protocol: 'RAW_TCP',
    host: undefined, // SEM HOST
    port: 9100,
    language: 'PPLB',
    dpi: 203,
    active: true,
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const { req, res } = createMockReqRes({
    method: 'POST',
    url: '/',
    headers: {
      'x-web-client': 'witiquetas-web',
    },
    body: {
      printerId: 'prn-sem-ip',
      compiledCommand: 'P1\n',
      language: 'PPLB',
    },
  });

  executeRouteChain(postJobHandlers, req, res);

  assert.equal(res.statusCode, 400, 'RAW_TCP sem host configurado deve retornar 400');
  assert.ok(res.data.error.includes('não possui Host/IP configurado'));
});

test('Segurança Web: 6. Job criado para impressora RAW_TCP é consumido pelo Agent com host e port corretos', () => {
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
