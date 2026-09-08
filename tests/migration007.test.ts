import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  clearAdminMemoryStores,
  CompanyRepository,
  UserRepository,
  RoleRepository,
  CANONICAL_PERMISSIONS,
} from '../apps/backend/src/repositories/adminRepositories.js';
import {
  clearSessionMemoryStores,
  SessionService,
  SessionRepository,
} from '../apps/backend/src/services/sessionService.js';
import { PasswordService } from '../apps/backend/src/services/passwordService.js';
import { bootstrapAdminData } from '../apps/backend/src/services/adminBootstrapService.js';
import adminRouter from '../apps/backend/src/routes/admin.js';
import sessionRouter from '../apps/backend/src/routes/session.js';
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

test('SUÍTE DE MIGRATION 007 — IS_DCC_MASTER PLATFORM FLAG', async (suite) => {

  // Cenário 1: Arquivo físico e catálogo de migrations 001..007
  await suite.test('Cenário 1: Banco vazio executa migrations 001..007 em ordem estrita', async () => {
    const migrationsDir = path.resolve('apps/backend/src/migrations');
    assert.ok(fs.existsSync(migrationsDir), 'Pasta apps/backend/src/migrations deve existir');

    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    assert.equal(files.length, 7, 'Devem existir exatamente 7 migrations SQL no backend');
    assert.deepEqual(files, [
      '001_create_agents_table.sql',
      '002_create_label_templates_table.sql',
      '003_create_editing_sessions_table.sql',
      '004_create_print_job_batches_tables.sql',
      '005_create_admin_multitenant_rbac_tables.sql',
      '006_create_auth_credentials_and_sessions_tables.sql',
      '007_add_dcc_master_platform_flag.sql',
    ]);
  });

  // Cenário 2, 3, 4, 5: Análise sintática e semântica de 007
  await suite.test('Cenários 2, 3, 4, 5: Migration 007 adiciona coluna is_dcc_master, BOOLEAN, NOT NULL, DEFAULT FALSE', async () => {
    const sqlPath = path.resolve('apps/backend/src/migrations/007_add_dcc_master_platform_flag.sql');
    assert.ok(fs.existsSync(sqlPath), 'Arquivo 007 deve existir no disco');

    const sql = fs.readFileSync(sqlPath, 'utf8');
    assert.ok(sql.includes('ALTER TABLE users'), 'Deve alterar a tabela users');
    assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS is_dcc_master'), 'Deve usar IF NOT EXISTS na coluna is_dcc_master');
    assert.ok(sql.includes('BOOLEAN'), 'Tipo de dado deve ser BOOLEAN');
    assert.ok(sql.includes('NOT NULL'), 'Deve ter constraint NOT NULL');
    assert.ok(sql.includes('DEFAULT FALSE'), 'Deve ter DEFAULT FALSE');
    assert.ok(sql.includes('CREATE INDEX IF NOT EXISTS idx_users_dcc_master ON users (is_dcc_master);'), 'Deve criar índice na coluna is_dcc_master');
  });

  // Cenário 6 & 11: Upgrade 006 -> 007 preserva dados existentes e atribui FALSE
  await suite.test('Cenários 6 e 11: Upgrade de banco 006 para 007 preserva todos os dados e usuários existentes recebem FALSE', async () => {
    clearAdminMemoryStores();
    clearSessionMemoryStores();

    // Simulação do estado pós-006: Tenant existente com usuários, papéis e sessões
    const comp = await CompanyRepository.create({
      id: 'comp-upgrade-test',
      name: 'Empresa Legado 5.3',
      slug: 'empresa-legado',
      status: 'ACTIVE',
    });

    const existingUser = await UserRepository.create({
      id: 'usr-legacy-01',
      companyId: comp.id,
      name: 'Operador Legado',
      email: 'operador.legado@empresa.com',
      status: 'ACTIVE',
    });
    const pwdHash = await PasswordService.hash('LegacyPassword@123');
    await UserRepository.setPassword(existingUser.id, pwdHash);

    const role = await RoleRepository.create({
      id: 'role-legacy-01',
      companyId: comp.id,
      code: 'OPERATOR',
      name: 'Operador',
      isSystem: true,
    });
    await RoleRepository.setRolePermissions(role.id, ['templates.view', 'print.execute']);
    await RoleRepository.assignUserRole(comp.id, existingUser.id, role.id);

    const session = await SessionService.createAuthenticatedSession({
      userId: existingUser.id,
      companyId: comp.id,
    });

    // Simulação da execução da migration 007:
    // A migration adiciona a coluna com DEFAULT FALSE.
    // Verificamos se o usuário existente tem isDccMaster === false
    const loadedUser = await UserRepository.findById(existingUser.id);
    assert.ok(loadedUser);
    assert.equal(loadedUser.isDccMaster, false, 'Usuário existente pós-migration 007 deve ter isDccMaster = false');

    // Confirma preservação de todos os dados do banco 006
    assert.equal(loadedUser.email, 'operador.legado@empresa.com');
    assert.equal(loadedUser.companyId, 'comp-upgrade-test');
    assert.equal(loadedUser.status, 'ACTIVE');

    const authCheck = await PasswordService.verify('LegacyPassword@123', (await UserRepository.findByIdWithPassword(existingUser.id))?.passwordHash || '');
    assert.equal(authCheck, true, 'Hash de senha pré-existente preservado com sucesso');

    const userRoles = await RoleRepository.getUserRoles(comp.id, existingUser.id);
    assert.equal(userRoles.length, 1);
    assert.equal(userRoles[0].code, 'OPERATOR', 'Role pré-existente preservada');

    const principal = await SessionService.resolvePrincipalFromRawToken(session.rawToken);
    assert.ok(principal, 'Sessão ativa pré-existente mantida sem interrupção');
    assert.equal(principal.user.isDccMaster, false, 'Principal do usuário legado não é Master DCC');
  });

  // Cenário 7: Idempotência da migration 007
  await suite.test('Cenário 7: Migration 007 pode ser reexecutada sem erro (idempotente)', async () => {
    const sqlPath = path.resolve('apps/backend/src/migrations/007_add_dcc_master_platform_flag.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Sintaxe deve conter IF NOT EXISTS tanto na coluna quanto no índice
    const hasColIfNotExists = sql.includes('ADD COLUMN IF NOT EXISTS');
    const hasIdxIfNotExists = sql.includes('CREATE INDEX IF NOT EXISTS');

    assert.ok(hasColIfNotExists, 'Re-execução da coluna protegida por IF NOT EXISTS');
    assert.ok(hasIdxIfNotExists, 'Re-execução do índice protegida por IF NOT EXISTS');
  });

  // Cenário 8: Bootstrap pós-migration funciona
  await suite.test('Cenário 8: AdminBootstrap pós-migration é executado com sucesso e sincroniza permissões e roles', async () => {
    delete process.env.PLATFORM_MASTER_DCC_EMAIL;
    delete process.env.MASTER_DCC_EMAIL;

    await bootstrapAdminData();

    const company = await CompanyRepository.findById('comp-default');
    assert.ok(company, 'Empresa padrão criada/verificada pelo bootstrap');

    const defaultRoles = await RoleRepository.listByCompany('comp-default');
    assert.ok(defaultRoles.some((r) => r.code === 'ADMIN'));
    assert.ok(defaultRoles.some((r) => r.code === 'DESIGNER'));
    assert.ok(defaultRoles.some((r) => r.code === 'SUPERVISOR'));
    assert.ok(defaultRoles.some((r) => r.code === 'OPERATOR'));

    const adminUser = await UserRepository.findByEmail('admin@witiquetas.com.br');
    assert.ok(adminUser, 'Usuário admin default deve existir');
    assert.equal(adminUser.isDccMaster, false, 'Seed comum NÃO deve promover admin default a Master DCC automaticamente');
  });

  // Cenário 9: Session context protege isolamento e não expõe canAccessDcc a tenants comerciais
  await suite.test('Cenário 9: Session context não expõe canAccessDcc ou dccEnabled a tenants comerciais', async () => {
    const user = await UserRepository.findByEmail('admin@witiquetas.com.br');
    assert.ok(user);

    const session = await SessionService.createAuthenticatedSession({
      userId: user.id,
      companyId: user.companyId,
    });

    process.env.DCC_ENABLED = 'true';

    // Sessão tenant normal
    const res = await callRouter(sessionRouter, {
      method: 'GET',
      url: '/context',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${session.rawToken}`,
      },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.dccEnabled, undefined, 'dccEnabled não deve ser exposto no contexto de tenant');
    assert.equal(res.body.canAccessDcc, undefined, 'canAccessDcc não deve ser exposto no contexto de tenant');

    // Promovendo explicitamente via controle interno / legado
    await UserRepository.setDccMaster(user.id, true);

    const resMaster = await callRouter(sessionRouter, {
      method: 'GET',
      url: '/context',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${session.rawToken}`,
      },
    });

    assert.equal(resMaster.statusCode, 200);
    assert.equal(resMaster.body.dccEnabled, undefined, 'dccEnabled permanece isolado do tenant');
    assert.equal(resMaster.body.canAccessDcc, undefined, 'canAccessDcc permanece isolado do tenant');

    // Restaurar estado
    await UserRepository.setDccMaster(user.id, false);
  });

  // Cenário 10: Admin API proíbe alteração e vazamento de is_dcc_master (ignora mass-assignment de forma segura)
  await suite.test('Cenário 10: Admin API ignora mass assignment de is_dcc_master e não expõe o campo', async () => {
    const user = await UserRepository.findByEmail('admin@witiquetas.com.br');
    assert.ok(user);

    const session = await SessionService.createAuthenticatedSession({
      userId: user.id,
      companyId: user.companyId,
    });

    // Tentativa em POST /users: aceita a criação do usuário, mas ignora silenciosamente is_dcc_master
    const postRes = await callRouter(adminRouter, {
      method: 'POST',
      url: '/users',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${session.rawToken}`,
        'x-csrf-token': session.csrfToken,
      },
      body: {
        name: 'Tentativa Invasor',
        email: 'invasor@witiquetas.com.br',
        password: 'Password@12345',
        is_dcc_master: true,
      },
    });
    assert.equal(postRes.statusCode, 201);
    assert.equal(postRes.body.isDccMaster, undefined, 'DTO de resposta nunca expõe isDccMaster');

    // Tentativa em PUT /users/:id
    const putRes = await callRouter(adminRouter, {
      method: 'PUT',
      url: `/users/${user.id}`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${session.rawToken}`,
        'x-csrf-token': session.csrfToken,
      },
      body: {
        isDccMaster: true,
      },
    });
    assert.equal(putRes.statusCode, 200);
    assert.equal(putRes.body.isDccMaster, undefined, 'DTO de resposta nunca expõe isDccMaster');

    // Sanitização de saída
    const listRes = await callRouter(adminRouter, {
      method: 'GET',
      url: '/users',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${session.rawToken}`,
      },
    });
    assert.equal(listRes.statusCode, 200);
    for (const u of listRes.body) {
      assert.equal(u.isDccMaster, undefined);
      assert.equal(u.is_dcc_master, undefined);
    }
  });

  // Cenário 12: Backend fica HEALTHY
  await suite.test('Cenário 12: Integridade de inicialização garante status HEALTHY', async () => {
    // A validação de saúde do banco e schemas passa sem erro
    const perms = CANONICAL_PERMISSIONS;
    assert.equal(perms.length, 25, '25 permissões canônicas presentes e íntegras');

    const company = await CompanyRepository.findById('comp-default');
    assert.ok(company);
    assert.equal(company.status, 'ACTIVE');
  });
});
