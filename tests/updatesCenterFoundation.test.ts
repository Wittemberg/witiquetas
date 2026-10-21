import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  SessionService,
  SessionRepository,
  clearSessionMemoryStores,
} from '../apps/backend/src/services/sessionService.js';
import {
  CompanyRepository,
  UserRepository,
  RoleRepository,
  CANONICAL_PERMISSIONS,
  clearAdminMemoryStores,
} from '../apps/backend/src/repositories/adminRepositories.js';
import updatesRouter from '../apps/backend/src/routes/updates.js';
import { UpdatesCenterService } from '../apps/backend/src/services/updatesCenterService.js';
import { SESSION_COOKIE_NAME } from '../apps/backend/src/routes/auth.js';

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

function callUpdatesRouter(req: any): Promise<any> {
  const handler = typeof updatesRouter === 'function' ? updatesRouter : ((updatesRouter as any)?.default || updatesRouter);
  const res = createMockResponse();
  return new Promise((resolve) => {
    const origJson = res.json.bind(res);
    res.json = (data: any) => {
      origJson(data);
      resolve(res);
      return res;
    };
    const origStatus = res.status.bind(res);
    res.status = (code: number) => {
      origStatus(code);
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

test('SUÍTE CANÔNICA — CENTRAL DE ATUALIZAÇÕES (SPRINT 1: ARQUITETURA, GOVERNANÇA E INTERFACE)', async (t) => {
  clearAdminMemoryStores();
  clearSessionMemoryStores();
  UpdatesCenterService.resetForTests();

  // Setup de Empresa e Usuários de Teste
  const testCompany = await CompanyRepository.create({
    id: 'comp-updates-test',
    name: 'Empresa Teste Updates',
    tradeName: 'Updates Corp',
    cnpj: '11222333000199',
    status: 'ACTIVE',
  });

  // 1. Perfil e Usuário Operador (sem permissão de updates)
  const opRole = await RoleRepository.create({
    id: 'role-op-test',
    companyId: testCompany.id,
    code: 'OPERATOR',
    name: 'Operador',
    description: 'Apenas impressão',
  });
  await RoleRepository.setRolePermissions(opRole.id, ['print.execute', 'print.history']);

  const operatorUser = await UserRepository.create({
    id: 'usr-op-01',
    companyId: testCompany.id,
    name: 'Operador Fabiano',
    email: 'operador@updates.com.br',
    passwordHash: 'hash-mock',
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole(testCompany.id, operatorUser.id, opRole.id);

  // 2. Perfil e Usuário com updates.view
  const viewerRole = await RoleRepository.create({
    id: 'role-viewer-test',
    companyId: testCompany.id,
    code: 'VIEWER',
    name: 'Visualizador',
    description: 'Visualizador de Atualizações',
  });
  await RoleRepository.setRolePermissions(viewerRole.id, ['updates.view']);

  const viewerUser = await UserRepository.create({
    id: 'usr-view-01',
    companyId: testCompany.id,
    name: 'Visualizador Vítor',
    email: 'viewer@updates.com.br',
    passwordHash: 'hash-mock',
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole(testCompany.id, viewerUser.id, viewerRole.id);

  // 3. Perfil e Usuário com updates.manage
  const managerRole = await RoleRepository.create({
    id: 'role-manager-test',
    companyId: testCompany.id,
    code: 'MANAGER',
    name: 'Gestor',
    description: 'Gestor de Atualizações',
  });
  await RoleRepository.setRolePermissions(managerRole.id, ['updates.view', 'updates.manage']);

  const managerUser = await UserRepository.create({
    id: 'usr-mgr-01',
    companyId: testCompany.id,
    name: 'Gestor Gabriel',
    email: 'manager@updates.com.br',
    passwordHash: 'hash-mock',
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole(testCompany.id, managerUser.id, managerRole.id);

  // 4. Perfil e Usuário ADMIN da Empresa
  const adminRole = await RoleRepository.create({
    id: 'role-admin-test',
    companyId: testCompany.id,
    code: 'ADMIN',
    name: 'Administrador',
    description: 'Acesso completo',
  });
  await RoleRepository.setRolePermissions(
    adminRole.id,
    CANONICAL_PERMISSIONS.map((p) => p.code)
  );

  const adminUser = await UserRepository.create({
    id: 'usr-admin-01',
    companyId: testCompany.id,
    name: 'Admin Alberto',
    email: 'admin@updates.com.br',
    passwordHash: 'hash-mock',
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole(testCompany.id, adminUser.id, adminRole.id);

  // Criação de Sessões Autenticadas
  const opSession = await SessionService.createAuthenticatedSession({
    userId: operatorUser.id,
    companyId: testCompany.id,
  });

  const viewerSession = await SessionService.createAuthenticatedSession({
    userId: viewerUser.id,
    companyId: testCompany.id,
  });

  const managerSession = await SessionService.createAuthenticatedSession({
    userId: managerUser.id,
    companyId: testCompany.id,
  });

  const adminSession = await SessionService.createAuthenticatedSession({
    userId: adminUser.id,
    companyId: testCompany.id,
  });

  // =========================================================================
  // GATE 1: REQUISIÇÃO ANÔNIMA REJEITADA COM 401
  // =========================================================================
  await t.test('Gate 1: GET /overview sem autenticação retorna 401 UNAUTHENTICATED', async () => {
    const req: any = {
      method: 'GET',
      url: '/overview',
      headers: {},
    };
    const res = await callUpdatesRouter(req);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, 'UNAUTHENTICATED');
  });

  // =========================================================================
  // GATE 2: USUÁRIO SEM PERMISSÃO REJEITADO COM 403
  // =========================================================================
  await t.test('Gate 2: Operador sem updates.view recebe 403 FORBIDDEN ao acessar /overview', async () => {
    const req: any = {
      method: 'GET',
      url: '/overview',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${opSession.rawToken}`,
      },
    };
    const res = await callUpdatesRouter(req);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'FORBIDDEN');
    assert.equal(res.body.requiredPermission, 'updates.view');
  });

  // =========================================================================
  // GATE 3: USUÁRIO COM UPDATES.VIEW ACESSA COM 200
  // =========================================================================
  await t.test('Gate 3: Usuário com updates.view acessa /overview e /history com HTTP 200', async () => {
    const reqOverview: any = {
      method: 'GET',
      url: '/overview',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${viewerSession.rawToken}`,
      },
    };
    const resOverview = await callUpdatesRouter(reqOverview);
    assert.equal(resOverview.statusCode, 200);
    assert.ok(resOverview.body.currentVersion);
    assert.equal(resOverview.body.canManageUpdates, false);
    assert.equal(resOverview.body.deployMechanismActive, false, 'Sprint 1: deployMechanismActive deve ser false');

    const reqHistory: any = {
      method: 'GET',
      url: '/history',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${viewerSession.rawToken}`,
      },
    };
    const resHistory = await callUpdatesRouter(reqHistory);
    assert.equal(resHistory.statusCode, 200);
    assert.ok(Array.isArray(resHistory.body.releases));
    assert.ok(resHistory.body.total >= 3);
  });

  // =========================================================================
  // GATE 4: ADMIN E PLATFORM_DEVELOPER TÊM ACESSO TOTAL COM canManageUpdates = true
  // =========================================================================
  await t.test('Gate 4: Perfil ADMIN possui canManageUpdates = true', async () => {
    const req: any = {
      method: 'GET',
      url: '/overview',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminSession.rawToken}`,
      },
    };
    const res = await callUpdatesRouter(req);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.canManageUpdates, true);
  });

  // =========================================================================
  // GATE 5: EDIÇÃO DE NOTAS DE VERSÃO EXIGE UPDATES.MANAGE (403 SE AUSENTE)
  // =========================================================================
  await t.test('Gate 5: Usuário sem updates.manage não pode atualizar release notes (HTTP 403)', async () => {
    const req: any = {
      method: 'PUT',
      url: '/releases/5.8.0',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${viewerSession.rawToken}`,
        'x-csrf-token': viewerSession.csrfToken,
      },
      body: {
        title: 'Tentativa de alteração não autorizada',
      },
      params: { version: '5.8.0' },
    };
    const res = await callUpdatesRouter(req);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'FORBIDDEN');
    assert.equal(res.body.requiredPermission, 'updates.manage');
  });

  // =========================================================================
  // GATE 6: ATUALIZAÇÃO BEM-SUCEDIDA DE NOTA DE VERSÃO
  // =========================================================================
  await t.test('Gate 6: Gestor com updates.manage e CSRF atualiza release note com sucesso (HTTP 200)', async () => {
    const req: any = {
      method: 'PUT',
      url: '/releases/5.8.0',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${managerSession.rawToken}`,
        'x-csrf-token': managerSession.csrfToken,
      },
      body: {
        title: '5.8.0 — Título Atualizado pela Governança',
        summary: 'Resumo auditado para operadores.',
        highlights: ['Destaque 1 atualizado', 'Destaque 2'],
      },
      params: { version: '5.8.0' },
    };
    const res = await callUpdatesRouter(req);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.version, '5.8.0');
    assert.equal(res.body.title, '5.8.0 — Título Atualizado pela Governança');
    assert.equal(res.body.summary, 'Resumo auditado para operadores.');
    assert.equal(res.body.highlights.length, 2);
  });

  // =========================================================================
  // GATE 7: VALIDAÇÃO DE CAMPOS OBRIGATÓRIOS (HTTP 400 EM TÍTULO VAZIO)
  // =========================================================================
  await t.test('Gate 7: PUT /releases/:version com título vazio retorna 400 INVALID_TITLE', async () => {
    const req: any = {
      method: 'PUT',
      url: '/releases/5.8.0',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${managerSession.rawToken}`,
        'x-csrf-token': managerSession.csrfToken,
      },
      body: {
        title: '   ',
      },
      params: { version: '5.8.0' },
    };
    const res = await callUpdatesRouter(req);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'INVALID_TITLE');
  });

  // =========================================================================
  // GATE 8: CHECAGEM SIMULADA DE ATUALIZAÇÕES (POST /check)
  // =========================================================================
  await t.test('Gate 8: POST /check executa verificação simulada e retorna status informativo', async () => {
    const req: any = {
      method: 'POST',
      url: '/check',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${viewerSession.rawToken}`,
      },
      body: { channel: 'STABLE' },
    };
    const res = await callUpdatesRouter(req);
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.checkedAt);
    assert.ok(typeof res.body.hasUpdate === 'boolean');
    assert.ok(res.body.message.length > 0);
  });

  // =========================================================================
  // GATE 9: SALVAGUARDA DE SEGURANÇA ESTATICA (ZERO DEPLOY MECÂNICO)
  // =========================================================================
  await t.test('Gate 9: Salvaguarda Sprint 1 — Ausência total de chamadas a Docker, Swarm ou Portainer Webhooks', () => {
    const svcPath = path.resolve('apps/backend/src/services/updatesCenterService.ts');
    const routePath = path.resolve('apps/backend/src/routes/updates.ts');
    const svcCode = fs.readFileSync(svcPath, 'utf-8');
    const routeCode = fs.readFileSync(routePath, 'utf-8');

    // Nenhuma chamada a child_process / exec / spawn
    assert.strictEqual(svcCode.includes('child_process'), false, 'updatesCenterService NÃO pode importar child_process');
    assert.strictEqual(routeCode.includes('child_process'), false, 'updates.ts NÃO pode importar child_process');
    assert.strictEqual(svcCode.includes('PORTAINER_WEBHOOK_URL'), false, 'updatesCenterService NÃO pode acionar Portainer');
    assert.strictEqual(routeCode.includes('PORTAINER_WEBHOOK_URL'), false, 'updates.ts NÃO pode acionar Portainer');
    assert.strictEqual(svcCode.includes('docker service update'), false, 'updatesCenterService NÃO pode invocar docker update');
  });

  // =========================================================================
  // GATE 10: COERÊNCIA COM DCC E HISTÓRICO DE CHECKPOINTS
  // =========================================================================
  await t.test('Gate 10: Coerência com catálogo de checkpoints do DCC', () => {
    const checkpointsPath = path.resolve('docs/development-control/checkpoints.json');
    assert.ok(fs.existsSync(checkpointsPath), 'checkpoints.json deve existir');
    const checkpointsData = JSON.parse(fs.readFileSync(checkpointsPath, 'utf-8'));
    assert.ok(Array.isArray(checkpointsData.checkpoints));

    const history = UpdatesCenterService.getHistory();
    // Verifica que versões históricas homologadas constam no catálogo da Central de Atualizações
    assert.ok(history.some((m) => m.version === '5.7.1'), 'Release 5.7.1 deve constar no catálogo');
    assert.ok(history.some((m) => m.version === '5.7.2.1.3'), 'Release 5.7.2.1.3 deve constar no catálogo');
  });
});
