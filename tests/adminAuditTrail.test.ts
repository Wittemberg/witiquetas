import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import adminRouter from '../apps/backend/src/routes/admin.js';
import {
  clearAdminMemoryStores,
  CompanyRepository,
  UserRepository,
  RoleRepository,
} from '../apps/backend/src/repositories/adminRepositories.js';
import { clearSessionMemoryStores } from '../apps/backend/src/repositories/sessionRepository.js';
import { AdminAuditRepository } from '../apps/backend/src/repositories/adminAuditRepository.js';
import { AdminAuditService, sanitizeAuditDetails } from '../apps/backend/src/services/adminAuditService.js';

function createMockResponse() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null,
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

function callAdminRouter(req: any): Promise<any> {
  const handler = typeof adminRouter === 'function' ? adminRouter : ((adminRouter as any)?.default || adminRouter);
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
      } else {
        res.statusCode = 404;
        res.body = { error: 'Not found' };
      }
      resolve(res);
    });
  });
}

async function setupTestTenant(prefix: string) {
  const company = await CompanyRepository.create({
    name: `Empresa ${prefix}`,
    slug: `empresa-${prefix.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });

  const adminRole = await RoleRepository.create({
    companyId: company.id,
    code: 'ADMIN',
    name: 'Administrador',
    isSystem: true,
  });

  const operatorRole = await RoleRepository.create({
    companyId: company.id,
    code: 'OPERATOR',
    name: 'Operador',
    isSystem: true,
  });

  // Admin possui todas as permissões
  await RoleRepository.setRolePermissions(adminRole.id, [
    'company.view',
    'company.manage',
    'users.view',
    'users.manage',
    'roles.view',
    'roles.manage',
    'audit.view',
  ]);

  // Operador possui apenas permissões básicas de consulta, sem audit.view
  await RoleRepository.setRolePermissions(operatorRole.id, [
    'company.view',
    'users.view',
  ]);

  const adminUser = await UserRepository.create({
    companyId: company.id,
    name: `Admin ${prefix}`,
    email: `admin_${prefix.toLowerCase()}@teste.com`,
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole(company.id, adminUser.id, adminRole.id);

  const operatorUser = await UserRepository.create({
    companyId: company.id,
    name: `Operador ${prefix}`,
    email: `op_${prefix.toLowerCase()}@teste.com`,
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole(company.id, operatorUser.id, operatorRole.id);

  return { company, adminRole, operatorRole, adminUser, operatorUser };
}

test('SUÍTE CANÔNICA — AUDITORIA ADMINISTRATIVA (cap-admin-audit-log & cap-admin-audit)', async (t) => {
  clearAdminMemoryStores();
  clearSessionMemoryStores();
  AdminAuditRepository.clearMemoryLogs();

  const tenantA = await setupTestTenant('Alfa');
  const tenantB = await setupTestTenant('Beta');

  await t.test('1. Migration 013 existe no catálogo, é válida e possui índices e chaves corretos', () => {
    const migrationPath = path.resolve('apps/backend/src/migrations/013_create_admin_audit_logs_table.sql');
    assert.ok(fs.existsSync(migrationPath), 'Arquivo 013_create_admin_audit_logs_table.sql deve existir');

    const sql = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS admin_audit_logs'), 'Deve criar a tabela admin_audit_logs');
    assert.ok(sql.includes('company_id VARCHAR(64) NOT NULL REFERENCES companies(id)'), 'Deve ter FK para companies(id)');
    assert.ok(sql.includes('details JSONB'), 'Deve ter coluna details JSONB');
    assert.ok(sql.includes('idx_admin_audit_logs_company_created'), 'Deve possuir índice por company_id e created_at');
    assert.ok(sql.includes('idx_admin_audit_logs_company_category'), 'Deve possuir índice por company_id e category');
  });

  await t.test('2. Registro de ação administrativa: Criação e modificação de usuário geram auditoria', async () => {
    // 2.1 Criar Usuário via POST /users
    const reqCreate = {
      method: 'POST',
      url: '/users',
      body: {
        name: 'Novo Colaborador',
        email: 'colaborador@alfa.com',
        password: 'SenhaForte123!',
        roleIds: [tenantA.operatorRole.id],
      },
      headers: {
        'x-csrf-token': 'mock-csrf',
      },
      principal: {
        csrfToken: 'mock-csrf',
        user: tenantA.adminUser,
        company: tenantA.company,
        roles: [tenantA.adminRole],
        permissions: ['users.manage'],
      },
    };

    const resCreate = await callAdminRouter(reqCreate);
    assert.strictEqual(resCreate.statusCode, 201, 'Criação de usuário deve retornar 201');
    const createdUserId = resCreate.body.id;

    // Verificar log gerado
    const { logs } = await AdminAuditRepository.list(tenantA.company.id, {});
    const createLog = logs.find((l) => l.action === 'user.create');
    assert.ok(createLog, 'Deve existir evento user.create');
    assert.strictEqual(createLog.category, 'USER');
    assert.strictEqual(createLog.userId, tenantA.adminUser.id);
    assert.strictEqual(createLog.targetId, createdUserId);
    assert.strictEqual(createLog.details?.name, 'Novo Colaborador');
    assert.strictEqual((createLog.details as any)?.password, undefined, 'Senha não pode ser registrada');

    // 2.2 Modificar Usuário via PUT /users/:id (inativação)
    const reqUpdate = {
      method: 'PUT',
      url: `/users/${createdUserId}`,
      params: { id: createdUserId },
      body: {
        name: 'Colaborador Inativo',
        status: 'INACTIVE',
      },
      headers: {
        'x-csrf-token': 'mock-csrf',
      },
      principal: {
        csrfToken: 'mock-csrf',
        user: tenantA.adminUser,
        company: tenantA.company,
        roles: [tenantA.adminRole],
        permissions: ['users.manage'],
      },
    };

    const resUpdate = await callAdminRouter(reqUpdate);
    assert.strictEqual(resUpdate.statusCode, 200, 'Atualização de usuário deve retornar 200');

    const { logs: logsAfterUpdate } = await AdminAuditRepository.list(tenantA.company.id, {});
    const updateLog = logsAfterUpdate.find((l) => l.action === 'user.update');
    assert.ok(updateLog, 'Deve existir evento user.update');
    assert.strictEqual(updateLog.severity, 'WARN', 'Inativação de usuário deve ter severidade WARN');
    assert.strictEqual(updateLog.details?.status, 'INACTIVE');
  });

  await t.test('3. Registro de ação administrativa: Reset de senha e exclusão de usuário', async () => {
    // Criar um usuário temporário para testar reset e exclusão
    const tempUser = await UserRepository.create({
      companyId: tenantA.company.id,
      name: 'Temp User',
      email: 'temp@alfa.com',
      status: 'ACTIVE',
    });

    // Reset de Senha
    const reqReset = {
      method: 'POST',
      url: `/users/${tempUser.id}/reset-password`,
      params: { id: tempUser.id },
      body: { newPassword: 'NovaSenhaForte999!' },
      headers: { 'x-csrf-token': 'mock-csrf' },
      principal: {
        csrfToken: 'mock-csrf',
        user: tenantA.adminUser,
        company: tenantA.company,
        roles: [tenantA.adminRole],
        permissions: ['users.manage'],
      },
    };
    const resReset = await callAdminRouter(reqReset);
    assert.strictEqual(resReset.statusCode, 200);

    const { logs: logsReset } = await AdminAuditRepository.list(tenantA.company.id, {});
    const resetLog = logsReset.find((l) => l.action === 'user.reset_password');
    assert.ok(resetLog, 'Deve existir evento user.reset_password');
    assert.strictEqual(resetLog.category, 'SECURITY');
    assert.strictEqual((resetLog.details as any)?.newPassword, undefined, 'A nova senha jamais deve constar no log');

    // Exclusão de Usuário
    const reqDelete = {
      method: 'DELETE',
      url: `/users/${tempUser.id}`,
      params: { id: tempUser.id },
      headers: { 'x-csrf-token': 'mock-csrf' },
      principal: {
        csrfToken: 'mock-csrf',
        user: tenantA.adminUser,
        company: tenantA.company,
        roles: [tenantA.adminRole],
        permissions: ['users.manage'],
      },
    };
    const resDelete = await callAdminRouter(reqDelete);
    assert.strictEqual(resDelete.statusCode, 200);

    const { logs: logsDelete } = await AdminAuditRepository.list(tenantA.company.id, {});
    const deleteLog = logsDelete.find((l) => l.action === 'user.delete');
    assert.ok(deleteLog, 'Deve existir evento user.delete');
    assert.strictEqual(deleteLog.severity, 'CRITICAL');
    assert.strictEqual(deleteLog.targetId, tempUser.id);
  });

  await t.test('4. Registro de ação administrativa: Papéis e permissões', async () => {
    // 4.1 Criar Papel via POST /roles
    const reqCreateRole = {
      method: 'POST',
      url: '/roles',
      body: {
        code: 'SUPERVISOR',
        name: 'Supervisor de Logística',
        description: 'Perfil para supervisão operacional',
        permissions: ['users.view', 'company.view'],
      },
      headers: { 'x-csrf-token': 'mock-csrf' },
      principal: {
        csrfToken: 'mock-csrf',
        user: tenantA.adminUser,
        company: tenantA.company,
        roles: [tenantA.adminRole],
        permissions: ['roles.manage'],
      },
    };

    const resCreateRole = await callAdminRouter(reqCreateRole);
    assert.strictEqual(resCreateRole.statusCode, 201);
    const createdRoleId = resCreateRole.body.id;

    // 4.2 Atualizar Permissões do Papel via PUT /roles/:id/permissions
    const reqUpdatePerms = {
      method: 'PUT',
      url: `/roles/${createdRoleId}/permissions`,
      params: { id: createdRoleId },
      body: {
        permissions: ['users.view', 'company.view', 'templates.view'],
      },
      headers: { 'x-csrf-token': 'mock-csrf' },
      principal: {
        csrfToken: 'mock-csrf',
        user: tenantA.adminUser,
        company: tenantA.company,
        roles: [tenantA.adminRole],
        permissions: ['roles.manage'],
      },
    };

    const resUpdatePerms = await callAdminRouter(reqUpdatePerms);
    assert.strictEqual(resUpdatePerms.statusCode, 200);

    const { logs } = await AdminAuditRepository.list(tenantA.company.id, { category: 'ROLE' });
    const permLog = logs.find((l) => l.action === 'role.update_permissions');
    assert.ok(permLog, 'Deve existir evento role.update_permissions');
    assert.strictEqual(permLog.category, 'ROLE');
    assert.strictEqual(permLog.severity, 'WARN');
  });

  await t.test('5. Consulta por usuário autorizado (audit.view)', async () => {
    const reqList = {
      method: 'GET',
      url: '/audit-logs',
      query: { page: '1', limit: '10' },
      principal: {
        csrfToken: 'mock-csrf',
        user: tenantA.adminUser,
        company: tenantA.company,
        roles: [tenantA.adminRole],
        permissions: ['audit.view'],
      },
    };

    const resList = await callAdminRouter(reqList);
    assert.strictEqual(resList.statusCode, 200);
    assert.ok(Array.isArray(resList.body.logs), 'body.logs deve ser uma lista');
    assert.ok(resList.body.total > 0, 'Deve conter registros');
    assert.strictEqual(resList.body.page, 1);
    assert.strictEqual(resList.body.limit, 10);
  });

  await t.test('6. Negação de acesso sem audit.view (Fail-Closed)', async () => {
    // 6.1 Operador autenticado mas sem permissão audit.view
    const reqForbidden = {
      method: 'GET',
      url: '/audit-logs',
      principal: {
        csrfToken: 'mock-csrf',
        user: tenantA.operatorUser,
        company: tenantA.company,
        roles: [tenantA.operatorRole],
        permissions: ['company.view', 'users.view'], // sem audit.view
      },
    };

    const resForbidden = await callAdminRouter(reqForbidden);
    assert.strictEqual(resForbidden.statusCode, 403, 'Sem audit.view deve retornar HTTP 403');
    assert.strictEqual(resForbidden.body.code, 'FORBIDDEN');

    // 6.2 Requisição sem autenticação
    const reqUnauth = {
      method: 'GET',
      url: '/audit-logs',
    };

    const resUnauth = await callAdminRouter(reqUnauth);
    assert.strictEqual(resUnauth.statusCode, 401, 'Sem autenticação deve retornar HTTP 401');
    assert.strictEqual(resUnauth.body.code, 'UNAUTHENTICATED');
  });

  await t.test('7. Isolamento rigoroso entre empresas (Multi-Tenancy)', async () => {
    // Registrar ação administrativa no Tenant B
    await AdminAuditService.recordEvent({
      companyId: tenantB.company.id,
      actor: {
        id: tenantB.adminUser.id,
        name: tenantB.adminUser.name,
        email: tenantB.adminUser.email,
      },
      action: 'company.update',
      category: 'COMPANY',
      severity: 'INFO',
      details: { secretTenantBInfo: 'confidential_beta_data' },
    });

    // Consultar como Tenant A
    const reqTenantA = {
      method: 'GET',
      url: '/audit-logs',
      query: {},
      principal: {
        csrfToken: 'mock-csrf',
        user: tenantA.adminUser,
        company: tenantA.company,
        roles: [tenantA.adminRole],
        permissions: ['audit.view'],
      },
    };

    const resTenantA = await callAdminRouter(reqTenantA);
    assert.strictEqual(resTenantA.statusCode, 200);

    // Garantir que nenhum log do Tenant B vaze para o Tenant A
    const leaks = resTenantA.body.logs.filter((l: any) => l.companyId === tenantB.company.id);
    assert.strictEqual(leaks.length, 0, 'Nenhum log do Tenant B pode ser visível para Tenant A');

    // Consultar como Tenant B
    const reqTenantB = {
      method: 'GET',
      url: '/audit-logs',
      query: {},
      principal: {
        csrfToken: 'mock-csrf',
        user: tenantB.adminUser,
        company: tenantB.company,
        roles: [tenantB.adminRole],
        permissions: ['audit.view'],
      },
    };

    const resTenantB = await callAdminRouter(reqTenantB);
    assert.strictEqual(resTenantB.statusCode, 200);
    const bLogs = resTenantB.body.logs.filter((l: any) => l.companyId === tenantB.company.id);
    assert.ok(bLogs.length > 0, 'Tenant B deve visualizar seus próprios eventos');
  });

  await t.test('8. Paginação e filtros funcionais', async () => {
    // Filtrar por categoria 'SECURITY'
    const reqFilter = {
      method: 'GET',
      url: '/audit-logs',
      query: { category: 'SECURITY' },
      principal: {
        csrfToken: 'mock-csrf',
        user: tenantA.adminUser,
        company: tenantA.company,
        roles: [tenantA.adminRole],
        permissions: ['audit.view'],
      },
    };

    const resFilter = await callAdminRouter(reqFilter);
    assert.strictEqual(resFilter.statusCode, 200);
    for (const item of resFilter.body.logs) {
      assert.strictEqual(item.category, 'SECURITY', 'Todos os logs filtrados devem pertencer à categoria solicitada');
    }

    // Paginação com limite
    const reqPage = {
      method: 'GET',
      url: '/audit-logs',
      query: { page: '1', limit: '2' },
      principal: {
        csrfToken: 'mock-csrf',
        user: tenantA.adminUser,
        company: tenantA.company,
        roles: [tenantA.adminRole],
        permissions: ['audit.view'],
      },
    };

    const resPage = await callAdminRouter(reqPage);
    assert.strictEqual(resPage.statusCode, 200);
    assert.ok(resPage.body.logs.length <= 2, 'Limite de paginação deve ser respeitado');
    assert.strictEqual(resPage.body.limit, 2);
  });

  await t.test('9. Redação e sanitização de informações sensíveis', () => {
    const rawPayload = {
      username: 'usuario_teste',
      password: 'SuperSecretPassword123!',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz',
      authToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      apiKey: 'sec_key_998877',
      normalData: {
        subField: 'ok',
        clientSecret: 'secret_value',
      },
    };

    const sanitized = sanitizeAuditDetails(rawPayload);
    assert.strictEqual(sanitized.username, 'usuario_teste');
    assert.strictEqual(sanitized.password, '[REDACTED]', 'Campo password deve ser redigido');
    assert.strictEqual(sanitized.passwordHash, '[REDACTED]', 'Campo passwordHash deve ser redigido');
    assert.strictEqual(sanitized.authToken, '[REDACTED]', 'Campo authToken deve ser redigido');
    assert.strictEqual(sanitized.apiKey, '[REDACTED]', 'Campo apiKey deve ser redigido');
    assert.strictEqual(sanitized.normalData.clientSecret, '[REDACTED]', 'Campos aninhados devem ser redigidos');
    assert.strictEqual(sanitized.normalData.subField, 'ok');
  });

  await t.test('10. Imutabilidade e ausência de alteração/exclusão pela API', async () => {
    // Tentar executar PUT ou DELETE em /audit-logs
    const reqPut = {
      method: 'PUT',
      url: '/audit-logs',
      principal: {
        csrfToken: 'mock-csrf',
        user: tenantA.adminUser,
        company: tenantA.company,
        roles: [tenantA.adminRole],
        permissions: ['*'],
      },
    };

    const resPut = await callAdminRouter(reqPut);
    assert.ok(resPut.statusCode === 404 || resPut.statusCode === 405 || !resPut.body, 'Não deve existir rota PUT para audit logs');

    const reqDelete = {
      method: 'DELETE',
      url: '/audit-logs/some-id',
      principal: {
        csrfToken: 'mock-csrf',
        user: tenantA.adminUser,
        company: tenantA.company,
        roles: [tenantA.adminRole],
        permissions: ['*'],
      },
    };

    const resDelete = await callAdminRouter(reqDelete);
    assert.ok(resDelete.statusCode === 404 || resDelete.statusCode === 405 || !resDelete.body, 'Não deve existir rota DELETE para audit logs');
  });
});
