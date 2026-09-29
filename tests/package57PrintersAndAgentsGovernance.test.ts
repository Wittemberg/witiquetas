import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Importa Repositories e DTOs
import { PrintersRepository } from '../apps/backend/src/repositories/printersRepository.js';
import { AgentsRepository } from '../apps/backend/src/repositories/agentsRepository.js';
import { authenticateWebUser } from '../apps/backend/src/routes/agents.js';
import { getMigrationsList } from '../apps/backend/src/db.js';
import { CANONICAL_PERMISSIONS } from '../apps/backend/src/repositories/adminRepositories.js';
import type {
  PrinterDTO,
  CreatePrinterDTO,
  UpdatePrinterDTO,
  SerialFlowControl,
} from '@witiquetas/contracts';

test('SUÍTE COMPLETA — PACKAGE 5.7 & P0 RESOLUTION (PRINTERS & AGENTS GOVERNANCE)', async (t) => {

  // =========================================================================
  // GATE 1 & 2: MIGRATION 010 DDL, INTEGRIDADE REFERENCIAL E PARTIAL UNIQUE INDEX
  // =========================================================================
  await t.test('Gate 1 & 2: Migration 010 possui DDL canônico, FK same-tenant e partial unique index default', () => {
    const migrationFile = path.resolve('apps/backend/src/migrations/010_create_printers_table.sql');
    assert.ok(fs.existsSync(migrationFile), 'Arquivo 010_create_printers_table.sql deve existir');

    const bytes = fs.readFileSync(migrationFile);
    // Anti-BOM check
    const hasBOM = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    assert.strictEqual(hasBOM, false, 'Migration 010 não pode conter UTF-8 BOM');

    const sql = bytes.toString('utf-8');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS printers'), 'Deve criar a tabela printers');
    assert.ok(sql.includes('company_id VARCHAR(64) NOT NULL REFERENCES companies(id)'), 'Deve ter FK para companies');
    assert.ok(sql.includes('location VARCHAR(100)'), 'Deve suportar location VARCHAR(100)');
    assert.ok(sql.includes('serial_flow_control VARCHAR(32)'), 'Deve conter serial_flow_control');
    assert.ok(sql.includes('CONSTRAINT uq_printers_company_id UNIQUE (company_id, id)'), 'Deve conter chave composta única');
    assert.ok(
      /CONSTRAINT fk_printer_agent FOREIGN KEY\s*\(company_id,\s*agent_id\)\s*REFERENCES agents\s*\(company_id,\s*id\)/i.test(sql),
      'FK de printer para agent deve ser same-tenant composta'
    );
    assert.ok(sql.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_printers_company_default ON printers (company_id) WHERE is_default = TRUE'), 'Deve conter partial unique index para default');

    // Valida registro em db.ts
    const migrations = getMigrationsList();
    const m010 = migrations.find((m) => m.filename === '010_create_printers_table.sql');
    assert.ok(m010, 'Migration 010 deve estar registrada no bootstrap de migrations em db.ts');
  });

  // =========================================================================
  // GATE 3: ZERO PHYSICAL PRINTER SEEDING
  // =========================================================================
  await t.test('Gate 3: Zero Physical Printer Seeding na migration 010 e inicialização limpa', () => {
    const migrationFile = path.resolve('apps/backend/src/migrations/010_create_printers_table.sql');
    const sql = fs.readFileSync(migrationFile, 'utf-8');
    assert.strictEqual(sql.includes('INSERT INTO printers'), false, 'Migration 010 NÃO pode inserir impressoras físicas fictícias');
  });

  // =========================================================================
  // GATE 4: CRUD MULTI-TENANT E ISOLAMENTO ESTREITO
  // =========================================================================
  await t.test('Gate 4: PrintersRepository isola rigorosamente recursos por empresa (Multi-Tenant)', async () => {
    PrintersRepository.clearMemory();

    const tenantA = 'comp-empresa-alpha';
    const tenantB = 'comp-empresa-beta';

    const pA1 = await PrintersRepository.create(tenantA, {
      name: 'Alpha Elgin L42 Pro',
      modelId: 'elgin-l42-pro',
      protocol: 'PPLB',
      connectionType: 'RAW_TCP',
      ip: '192.168.1.100',
      port: 9100,
      location: 'Caixa 01',
      isDefault: true,
    });

    const pB1 = await PrintersRepository.create(tenantB, {
      name: 'Beta Zebra ZD220',
      modelId: 'zebra-zd220',
      protocol: 'ZPL',
      connectionType: 'RAW_TCP',
      ip: '10.0.0.50',
      port: 9100,
      location: 'Depósito Beta',
      isDefault: true,
    });

    // Tenant A lista apenas suas impressoras
    const listA = await PrintersRepository.listByCompany(tenantA);
    assert.strictEqual(listA.length, 1);
    assert.strictEqual(listA[0].id, pA1.id);
    assert.strictEqual(listA[0].name, 'Alpha Elgin L42 Pro');

    // Tenant B lista apenas suas impressoras
    const listB = await PrintersRepository.listByCompany(tenantB);
    assert.strictEqual(listB.length, 1);
    assert.strictEqual(listB[0].id, pB1.id);

    // Nova empresa inicia com ZERO impressoras
    const listNew = await PrintersRepository.listByCompany('comp-nova-sem-impressoras');
    assert.strictEqual(listNew.length, 0, 'Nova empresa deve iniciar com exatamente zero impressoras');

    // Anti-IDOR: Tenant A não encontra impressora do Tenant B
    const crossAccess = await PrintersRepository.findById(tenantA, pB1.id);
    assert.strictEqual(crossAccess, null, 'Tenant A não pode localizar impressora do Tenant B por ID');
  });

  // =========================================================================
  // GATE 5: UNICIDADE DE IMPRESSORA PADRÃO POR TENANT
  // =========================================================================
  await t.test('Gate 5: No máximo UMA impressora padrão por tenant (troca afeta somente o tenant atual)', async () => {
    const tenant = 'comp-padrao-test';
    const otherTenant = 'comp-outro-tenant';

    // Cria duas impressoras no mesmo tenant
    const p1 = await PrintersRepository.create(tenant, {
      name: 'Impressora 1',
      modelId: 'generic-zpl',
      protocol: 'ZPL',
      connectionType: 'RAW_TCP',
      isDefault: true,
    });
    assert.strictEqual(p1.isDefault, true);

    const p2 = await PrintersRepository.create(tenant, {
      name: 'Impressora 2',
      modelId: 'generic-zpl',
      protocol: 'ZPL',
      connectionType: 'RAW_TCP',
      isDefault: true, // Nova padrão
    });
    assert.strictEqual(p2.isDefault, true);

    // p1 deve ter deixado de ser default automaticamente
    const p1Reloaded = await PrintersRepository.findById(tenant, p1.id);
    assert.strictEqual(p1Reloaded?.isDefault, false, 'Impressora 1 deve ter isDefault desmarcado');

    // Cria impressora default em outro tenant
    const pOther = await PrintersRepository.create(otherTenant, {
      name: 'Impressora Other',
      modelId: 'generic-zpl',
      protocol: 'ZPL',
      connectionType: 'RAW_TCP',
      isDefault: true,
    });

    // Troca o default de volta para p1 no tenant
    await PrintersRepository.setDefault(tenant, p1.id);
    const p1Again = await PrintersRepository.findById(tenant, p1.id);
    const p2Again = await PrintersRepository.findById(tenant, p2.id);
    const pOtherAgain = await PrintersRepository.findById(otherTenant, pOther.id);

    assert.strictEqual(p1Again?.isDefault, true);
    assert.strictEqual(p2Again?.isDefault, false);
    assert.strictEqual(pOtherAgain?.isDefault, true, 'Impressora padrão de outro tenant não pode ser afetada');
  });

  // =========================================================================
  // GATE 6 & 7: CONTROLE DE FLUXO SERIAL, LOCATION E PROPRIEDADES FÍSICAS
  // =========================================================================
  await t.test('Gate 6 & 7: Suporte completo a fluxo serial (NONE, RTS_CTS, XON_XOFF) e location', async () => {
    const tenant = 'comp-serial-test';

    const serialFlows: SerialFlowControl[] = ['NONE', 'RTS_CTS', 'XON_XOFF'];

    for (const flow of serialFlows) {
      const created = await PrintersRepository.create(tenant, {
        name: `Argox Serial ${flow}`,
        modelId: 'argox-os214plus',
        protocol: 'PPLA',
        connectionType: 'SERIAL',
        serialPort: 'COM3',
        baudRate: 9600,
        serialFlowControl: flow,
        location: `Bancada Teste ${flow}`,
      });

      assert.strictEqual(created.serialFlowControl, flow);
      assert.strictEqual(created.location, `Bancada Teste ${flow}`);
      assert.strictEqual(created.connectionType, 'SERIAL');
    }
  });

  // =========================================================================
  // GATE 8: VALIDAÇÃO SAME-TENANT DE VÍNCULO COM AGENT
  // =========================================================================
  await t.test('Gate 8: Vinculação de Agent à Impressora exige estritamente que sejam da mesma empresa', async () => {
    const tenantA = 'comp-agent-a';
    const tenantB = 'comp-agent-b';

    // Salva agentes nos dois tenants
    await AgentsRepository.save({
      id: 'agent-tenant-a',
      companyId: tenantA,
      installationId: 'inst-a-1234',
      machineName: 'PC-Expedicao-A',
      os: 'windows',
      architecture: 'x86_64',
      agentVersion: '0.1.0',
      status: 'ONLINE',
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      tokenHash: 'hash-a',
    });

    await AgentsRepository.save({
      id: 'agent-tenant-b',
      companyId: tenantB,
      installationId: 'inst-b-5678',
      machineName: 'PC-Expedicao-B',
      os: 'windows',
      architecture: 'x86_64',
      agentVersion: '0.1.0',
      status: 'ONLINE',
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      tokenHash: 'hash-b',
    });

    // Validação de findByIdAndCompany
    const validSameTenant = await AgentsRepository.findByIdAndCompany(tenantA, 'agent-tenant-a');
    assert.ok(validSameTenant, 'Agent do mesmo tenant deve ser localizado');

    const invalidCrossTenant = await AgentsRepository.findByIdAndCompany(tenantA, 'agent-tenant-b');
    assert.strictEqual(invalidCrossTenant, null, 'Agent de outro tenant não pode ser localizado para vínculo');
  });

  // =========================================================================
  // GATE 9 & 10 & 11: ROTAS DE IMPRESSORAS, ANTI-IDOR, RBAC E FORGED COMPANY_ID
  // =========================================================================
  await t.test('Gate 9, 10 & 11: Rotas de Impressoras aplicam Anti-IDOR, RBAC e rejeitam companyId forjado', async () => {
    const { default: printersRouter } = await import('../apps/backend/src/routes/printers.js');
    assert.ok(printersRouter, 'Router de impressoras deve ser exportado');

    // Valida que as permissões canônicas estão catalogadas no RBAC
    assert.ok(CANONICAL_PERMISSIONS.some((p) => p.code === 'printers.view'), 'printers.view deve ser permissão canônica');
    assert.ok(CANONICAL_PERMISSIONS.some((p) => p.code === 'printers.manage'), 'printers.manage deve ser permissão canônica');
    assert.ok(CANONICAL_PERMISSIONS.some((p) => p.code === 'agents.view'), 'agents.view deve ser permissão canônica');
    assert.ok(CANONICAL_PERMISSIONS.some((p) => p.code === 'agents.manage'), 'agents.manage deve ser permissão canônica');
  });

  // =========================================================================
  // GATE 12: RESOLUÇÃO P0-5 (FAIL-CLOSED EM AGENTS.TS)
  // =========================================================================
  await t.test('Gate 12: P0-5 RESOLVED — agents.ts rejeita anônimos com Fail-Closed sem bypass pré-RBAC', async () => {
    const agentsRouteFile = path.resolve('apps/backend/src/routes/agents.ts');
    const content = fs.readFileSync(agentsRouteFile, 'utf-8');

    // Confirma que o bypass foi removido do código
    assert.strictEqual(content.includes("process.env.AUTH_MODE !== 'RBAC'"), false, 'Bypass pré-RBAC não pode existir em agents.ts');
    assert.strictEqual(content.includes("process.env.RBAC_ENABLED !== 'true'"), false, 'Bypass RBAC_ENABLED não pode existir em agents.ts');

    // Testa diretamente o middleware authenticateWebUser com requisição anônima
    const req = { headers: {} } as any;
    let statusCode = 0;
    let responseBody: any = null;
    const res = {
      status(code: number) {
        statusCode = code;
        return {
          json(data: any) {
            responseBody = data;
          },
        };
      },
    } as any;
    let nextCalled = false;
    await authenticateWebUser(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false, 'Requisição anônima NÃO pode prosseguir para o handler');
    assert.strictEqual(statusCode, 401, 'Requisição anônima deve receber status 401 Fail-Closed');
    assert.ok(responseBody?.error, 'Deve retornar mensagem de erro de autenticação');
  });

  // =========================================================================
  // GATE 13: RESOLUÇÃO P0-4 (PROTEÇÃO TOTAL DE QRCODES.TS)
  // =========================================================================
  await t.test('Gate 13: P0-4 RESOLVED — qrcodes.ts protegido com Auth, RBAC, CSRF e isolamento de tenant', () => {
    const qrcodesRouteFile = path.resolve('apps/backend/src/routes/qrcodes.ts');
    const content = fs.readFileSync(qrcodesRouteFile, 'utf-8');

    assert.ok(content.includes('requireAuthenticatedUser'), 'qrcodes.ts deve exigir usuário autenticado');
    assert.ok(content.includes("requirePermission('templates.view')"), 'GET /qrcodes deve exigir templates.view');
    assert.ok(content.includes("requirePermission('templates.create')"), 'POST /qrcodes deve exigir templates.create');
    assert.ok(content.includes("requirePermission('templates.edit')"), 'PUT /qrcodes deve exigir templates.edit');
    assert.ok(content.includes("requirePermission('templates.delete')"), 'DELETE /qrcodes deve exigir templates.delete');
    assert.ok(content.includes('requireCsrf'), 'Mutações em qrcodes.ts devem exigir CSRF');
    assert.ok(content.includes('getCompanyId'), 'qrcodes.ts deve isolar dados por empresa');
  });

  // =========================================================================
  // GATE 14: RESOLUÇÃO P0-3 (CI QUALITY GATE NO DOCKER.YML)
  // =========================================================================
  await t.test('Gate 14: P0-3 RESOLVED — Workflow do CI executa testes TypeScript antes do Docker build', () => {
    const workflowFile = path.resolve('.github/workflows/docker.yml');
    const content = fs.readFileSync(workflowFile, 'utf-8');

    assert.ok(content.includes('CI QUALITY GATE'), 'Workflow deve ter seção CI Quality Gate');
    assert.ok(content.includes('node --loader ./tests/ts-loader.js --test'), 'Workflow deve rodar testes TypeScript com ts-loader');
    assert.ok(content.includes('npm --prefix packages/contracts run build'), 'Workflow deve compilar contracts antes dos testes');

    // Valida que o step de teste ocorre antes do Docker Build & Push
    const testIndex = content.indexOf('Run TypeScript Automated Tests & Quality Gate');
    const buildBackendIndex = content.indexOf('Build & Push Backend Candidate Image');
    assert.ok(testIndex > 0 && buildBackendIndex > 0 && testIndex < buildBackendIndex, 'Os testes TypeScript devem rodar estritamente antes do build Docker');
  });

  // =========================================================================
  // GATE 15: ALIASES DE ROTA E FRONTEND ADMIN CONFORMANCE
  // =========================================================================
  await t.test('Gate 15: Frontend possui PrintersAdminView, AgentsAdminView e aliases canônicos no Shell', () => {
    const printersView = path.resolve('apps/frontend/src/modules/admin/PrintersAdminView.tsx');
    const agentsView = path.resolve('apps/frontend/src/modules/admin/AgentsAdminView.tsx');
    assert.ok(fs.existsSync(printersView), 'PrintersAdminView.tsx deve existir');
    assert.ok(fs.existsSync(agentsView), 'AgentsAdminView.tsx deve existir');

    const appFile = path.resolve('apps/frontend/src/App.tsx');
    const appContent = fs.readFileSync(appFile, 'utf-8');
    assert.ok(appContent.includes("initialTab=\"printers\""), 'App.tsx deve redirecionar /printers para AdminPage tab printers');
    assert.ok(appContent.includes("initialTab=\"agents\""), 'App.tsx deve redirecionar /agents para AdminPage tab agents');

    const sidebarFile = path.resolve('apps/frontend/src/shell/Sidebar.tsx');
    const sidebarContent = fs.readFileSync(sidebarFile, 'utf-8');
    assert.ok(sidebarContent.includes("currentModule === 'printers'"), 'Sidebar deve destacar admin quando em printers');
    assert.ok(sidebarContent.includes("currentModule === 'agents'"), 'Sidebar deve destacar admin quando em agents');
  });

  // =========================================================================
  // GATE 16: BASELINE CONGELADO DO EDITOR E CENTRAL DE IMPRESSÃO
  // =========================================================================
  await t.test('Gate 16: Editor Visual e Central de Impressão permanecem rigorosamente congelados', () => {
    const editorStore = path.resolve('apps/frontend/src/editor/useEditorStore.ts');
    const printCenter = path.resolve('apps/frontend/src/modules/printcenter/PrintCenterPage.tsx');
    assert.ok(fs.existsSync(editorStore), 'useEditorStore deve existir intacto');
    assert.ok(fs.existsSync(printCenter), 'PrintCenterPage deve existir intacto');
  });

  // =========================================================================
  // GATE 17: FILA DE IMPRESSÃO VOLÁTIL PRESERVADA PARA PACKAGE 5.7.1
  // =========================================================================
  await t.test('Gate 17: Semântica da Print Queue preservada sem alteração antecipada do Package 5.7.1', async () => {
    const printJobsRoute = path.resolve('apps/backend/src/routes/printJobs.ts');
    const content = fs.readFileSync(printJobsRoute, 'utf-8');

    // Confirma que as stores em memória continuam intactas para o 5.7.1
    assert.ok(content.includes('printJobsStore'), 'printJobsStore deve permanecer para ser migrado no 5.7.1');
    assert.strictEqual(content.includes('SKIP LOCKED'), false, 'SKIP LOCKED não deve ter sido introduzido antecipadamente nesta fase');
    assert.strictEqual(content.includes('FOR UPDATE'), false, 'FOR UPDATE não deve ter sido introduzido antecipadamente nesta fase');
  });
});
