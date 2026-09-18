import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clearAdminMemoryStores,
  clearIntegrationMemoryStores,
  CompanyRepository,
  UserRepository,
  RoleRepository,
  IntegrationRepository,
  IntegrationMappingRepository,
  CANONICAL_PERMISSIONS,
  TENANT_MANAGEABLE_PERMISSIONS,
} from '../apps/backend/src/repositories/adminRepositories.js';
import {
  clearSessionMemoryStores,
  SessionService,
} from '../apps/backend/src/services/sessionService.js';
import adminRouter from '../apps/backend/src/routes/admin.js';
import { EffectiveConfigurationService } from '../apps/backend/src/services/effectiveConfigurationService.js';
import {
  CANONICAL_CAPABILITIES,
  IntegrationManifestSchema,
  ALL_KNOWN_INTEGRATION_FIELDS,
  SYSTEM_FIELDS,
} from '@witiquetas/label-schema';
import { INTEGRATION_PRESETS } from '@witiquetas/contracts';
import { getMigrationsList } from '../apps/backend/src/db.js';
import { ZPLCompiler } from '../packages/printer-core/src/zplCompiler.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createMockResponse() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as any,
    cookies: {} as Record<string, any>,
    clearedCookies: [] as any[],
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

  req.headers = req.headers || {};
  if (req.cookies && !req.headers.cookie) {
    req.headers.cookie = Object.entries(req.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
  if (!req.path && req.url) {
    req.path = req.url.split('?')[0];
  }

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

test('SUÍTE COMPLETA DE VALIDAÇÃO — PACOTE 5.6 (INTEGRATION FOUNDATION)', async (t) => {
  // Limpeza de estado para testes isolados
  clearAdminMemoryStores();
  clearIntegrationMemoryStores();
  clearSessionMemoryStores();

  // Setup de Empresas de Teste
  const compAlpha = await CompanyRepository.create({
    id: 'comp-alpha-56',
    name: 'Empresa Alpha Varejo',
    slug: 'alpha-56',
    status: 'ACTIVE',
  });

  const compBeta = await CompanyRepository.create({
    id: 'comp-beta-56',
    name: 'Empresa Beta Saúde',
    slug: 'beta-56',
    status: 'ACTIVE',
  });

  // Perfis da Empresa Alpha
  const roleAdminAlpha = await RoleRepository.create({
    companyId: compAlpha.id,
    code: 'ADMIN',
    name: 'Administrador Alpha',
    isSystem: true,
  });
  await RoleRepository.setRolePermissions(
    roleAdminAlpha.id,
    CANONICAL_PERMISSIONS.map((p) => p.code)
  );


  const roleOperatorAlpha = await RoleRepository.create({
    companyId: compAlpha.id,
    code: 'OPERATOR',
    name: 'Operador Alpha',
    isSystem: true,
  });
  await RoleRepository.setRolePermissions(roleOperatorAlpha.id, ['integrations.view']);

  const roleNoIntegrations = await RoleRepository.create({
    companyId: compAlpha.id,
    code: 'GUEST',
    name: 'Visitante Sem Integrações',
    isSystem: false,
  });
  await RoleRepository.setRolePermissions(roleNoIntegrations.id, ['company.view']);

  // Usuários da Empresa Alpha
  const userAdminAlpha = await UserRepository.create({
    companyId: compAlpha.id,
    name: 'Admin Alpha',
    email: 'admin@alpha56.com',
    passwordHash: 'hashed_pw',
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole(compAlpha.id, userAdminAlpha.id, roleAdminAlpha.id);

  const userOperatorAlpha = await UserRepository.create({
    companyId: compAlpha.id,
    name: 'Operador Alpha',
    email: 'operador@alpha56.com',
    passwordHash: 'hashed_pw',
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole(compAlpha.id, userOperatorAlpha.id, roleOperatorAlpha.id);

  const userGuestAlpha = await UserRepository.create({
    companyId: compAlpha.id,
    name: 'Guest Alpha',
    email: 'guest@alpha56.com',
    passwordHash: 'hashed_pw',
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole(compAlpha.id, userGuestAlpha.id, roleNoIntegrations.id);

  // Perfis e Usuário da Empresa Beta (para testes cross-tenant)
  const roleAdminBeta = await RoleRepository.create({
    companyId: compBeta.id,
    code: 'ADMIN',
    name: 'Administrador Beta',
    isSystem: true,
  });
  await RoleRepository.setRolePermissions(
    roleAdminBeta.id,
    CANONICAL_PERMISSIONS.map((p) => p.code)
  );


  const userAdminBeta = await UserRepository.create({
    companyId: compBeta.id,
    name: 'Admin Beta',
    email: 'admin@beta56.com',
    passwordHash: 'hashed_pw',
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole(compBeta.id, userAdminBeta.id, roleAdminBeta.id);

  // Sessões de Autenticação
  const sessionAdminAlpha = await SessionService.createAuthenticatedSession({
    userId: userAdminAlpha.id,
    companyId: compAlpha.id,
  });
  const sessionOperatorAlpha = await SessionService.createAuthenticatedSession({
    userId: userOperatorAlpha.id,
    companyId: compAlpha.id,
  });
  const sessionGuestAlpha = await SessionService.createAuthenticatedSession({
    userId: userGuestAlpha.id,
    companyId: compAlpha.id,
  });
  const sessionAdminBeta = await SessionService.createAuthenticatedSession({
    userId: userAdminBeta.id,
    companyId: compBeta.id,
  });

  // Helper para montar requisição autenticada
  const buildAuthReq = (sessionToken: string, csrfToken?: string, extraHeaders: Record<string, string> = {}) => ({
    headers: {
      cookie: `witiquetas_session=${sessionToken}`,
      authorization: `Bearer ${sessionToken}`,
      ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      ...extraHeaders,
    },
    cookies: {
      witiquetas_session: sessionToken,
    },
  });

  // ==========================================
  // GATE 1: MIGRATION 009 & DDL CONSISTENCY
  // ==========================================
  await t.test('Gate 1: Migration 009 e DDL contêm chaves compostas e constraints multi-tenant', async () => {
    const migrations = getMigrationsList();
    const migration009 = migrations.find((m) => m.filename.includes('009_create_integrations'));
    assert.ok(migration009, 'Migration 009 deve estar registrada na lista de migrations do db.ts');

    const ddlContent = migration009.sql;
    assert.match(ddlContent, /CREATE TABLE IF NOT EXISTS integrations/i, 'DDL deve criar a tabela integrations');
    assert.match(ddlContent, /CREATE TABLE IF NOT EXISTS integration_field_mappings/i, 'DDL deve criar a tabela integration_field_mappings');
    assert.match(ddlContent, /CONSTRAINT uq_integrations_company_id UNIQUE \(company_id, id\)/i, 'Tabela integrations deve ter constraint UNIQUE (company_id, id)');
    assert.match(ddlContent, /fk_mappings_integration/i, 'Tabela mappings deve ter FK composta fk_mappings_integration');
    assert.match(ddlContent, /credential_ref VARCHAR\(128\)/i, 'Tabela integrations deve ter coluna credential_ref opaca');
    assert.doesNotMatch(ddlContent, /password|secret|token_value|auth_secret/i, 'DDL NÃO deve conter colunas de senha ou segredos');
  });



  // ==========================================
  // GATE 2: REPOSITÓRIO DE INTEGRAÇÕES & ISOLAMENTO
  // ==========================================
  let createdIntegrationId = '';
  await t.test('Gate 2: IntegrationRepository opera CRUD com isolamento estrito', async () => {
    const created = await IntegrationRepository.create(compAlpha.id, {
      id: 'integ-alpha-pos',
      name: 'Startwo PDV Loja 1',
      providerType: 'REST',
      providerId: 'startwo-retail-v1',
      status: 'ACTIVE',
      environment: 'PRODUCTION',
      baseUrl: 'https://pdv.alpha.com/api',
      credentialRef: 'vault://alpha/pos-token',
      settings: { timeoutMs: 5000 },
      manifest: {
        manifestVersion: '1.0',
        providerId: 'startwo-retail-v1',
        displayName: 'Startwo Varejo',
        capabilities: ['products.read', 'prices.read'],
        fields: [
          { externalField: 'CODIGO', label: 'Código Item', type: 'string' },
          { externalField: 'PRECO', label: 'Preço Venda', type: 'decimal' },
        ],
      },
    });

    assert.equal(created.id, 'integ-alpha-pos');
    assert.equal(created.companyId, compAlpha.id);
    assert.equal(created.status, 'ACTIVE');
    createdIntegrationId = created.id;

    // Consulta por empresa Alpha
    const alphaList = await IntegrationRepository.listByCompany(compAlpha.id);
    assert.equal(alphaList.length, 1);
    assert.equal(alphaList[0].id, 'integ-alpha-pos');

    // Consulta por empresa Beta (Isolamento total: zero itens)
    const betaList = await IntegrationRepository.listByCompany(compBeta.id);
    assert.equal(betaList.length, 0, 'Empresa Beta não pode ver integrações da Empresa Alpha');

    // Update
    const updated = await IntegrationRepository.update(compAlpha.id, created.id, {
      name: 'Startwo PDV Loja 1 (Atualizado)',
    });
    assert.equal(updated?.name, 'Startwo PDV Loja 1 (Atualizado)');
  });

  // ==========================================
  // GATE 3: MANIFEST VALIDATION & 6 CAPABILITIES CANÔNICAS
  // ==========================================
  await t.test('Gate 3: Validação de Manifesto aceita estritamente o catálogo de 6 capabilities', async () => {
    assert.equal(CANONICAL_CAPABILITIES.length, 6, 'Catálogo canônico aprovado deve ter EXATAMENTE 6 capabilities');
    assert.deepEqual(
      Array.from(CANONICAL_CAPABILITIES),
      ['products.read', 'prices.read', 'inventory.read', 'logistics.read', 'healthcare.read', 'customers.read'],
      'As 6 capabilities canônicas devem ser exatamente as aprovadas'
    );

    // Manifesto válido com capabilities permitidas
    const validManifest = {
      manifestVersion: '1.0',
      providerId: 'test-prov',
      displayName: 'Test Provider',
      capabilities: ['products.read', 'prices.read', 'logistics.read'],
      fields: [
        { externalField: 'SKU', label: 'SKU Code', type: 'string' },
      ],
    };
    const validResult = IntegrationManifestSchema.safeParse(validManifest);
    assert.ok(validResult.success, 'Manifesto com capabilities canônicas deve ser válido');

    // Rejeição de orders.read (não aprovada para o Pacote 5.6)
    const ordersManifest = {
      ...validManifest,
      capabilities: ['products.read', 'orders.read'],
    };
    const ordersResult = IntegrationManifestSchema.safeParse(ordersManifest);
    assert.equal(ordersResult.success, false, 'Manifesto com orders.read deve ser rejeitado');

    // Rejeição de capability desconhecida/inventada
    const invalidCapManifest = {
      ...validManifest,
      capabilities: ['products.read', 'unknown.capability'],
    };
    const invalidCapResult = IntegrationManifestSchema.safeParse(invalidCapManifest);
    assert.equal(invalidCapResult.success, false, 'Manifesto com capability desconhecida deve ser rejeitado');

    // Rejeição de propriedades espúrias (.strict())
    const extraPropsManifest = {
      ...validManifest,
      maliciousScript: 'alert(1)',
    };
    const extraPropsResult = IntegrationManifestSchema.safeParse(extraPropsManifest);
    assert.equal(extraPropsResult.success, false, 'Manifesto com propriedades extras não permitidas deve ser rejeitado por .strict()');

    // Todos os presets canônicos passam na validação
    for (const preset of INTEGRATION_PRESETS) {
      const pResult = IntegrationManifestSchema.safeParse(preset.manifest);
      assert.ok(pResult.success, `Preset ${preset.presetId} deve passar na validação estrita de manifesto`);
    }
  });

  // ==========================================
  // GATE 4: FIELD MAPPINGS & RESTRIÇÕES DE NAMESPACE
  // ==========================================
  await t.test('Gate 4: Mapeamentos de campos de-para e proibição de namespace system', async () => {
    // 1. Mapeamento válido
    const validMappings = [
      { externalField: 'CODIGO', canonicalFieldId: 'produto.sku', direction: 'READ' as const, enabled: true },
      { externalField: 'PRECO', canonicalFieldId: 'produto.preco', direction: 'READ' as const, enabled: true },
    ];
    const saved = await IntegrationMappingRepository.setMappings(compAlpha.id, createdIntegrationId, validMappings);
    assert.equal(saved.length, 2);

    const retrieved = await IntegrationMappingRepository.getMappings(compAlpha.id, createdIntegrationId);
    assert.equal(retrieved.length, 2);

    // 2. Proibição de mapeamento para namespace 'system' via API administrativa
    const systemMappingReq = {
      method: 'PUT',
      url: `/integrations/${createdIntegrationId}/mappings`,
      ...buildAuthReq(sessionAdminAlpha.rawToken, sessionAdminAlpha.csrfToken),
      body: {
        mappings: [
          { externalField: 'DATA_HORA', canonicalFieldId: 'system.printDateTime', direction: 'READ' },
        ],
      },
    };
    const sysRes = await callRouter(adminRouter, systemMappingReq);
    assert.equal(sysRes.statusCode, 400);
    assert.equal(sysRes.body.code, 'SYSTEM_NAMESPACE_RESERVED', 'Mapeamento para namespace system deve ser proibido');

    // 3. Proibição de campo canônico inexistente
    const unknownFieldReq = {
      method: 'PUT',
      url: `/integrations/${createdIntegrationId}/mappings`,
      ...buildAuthReq(sessionAdminAlpha.rawToken, sessionAdminAlpha.csrfToken),
      body: {
        mappings: [
          { externalField: 'CAMPO_X', canonicalFieldId: 'produto.inexistente_123', direction: 'READ' },
        ],
      },
    };
    const unkRes = await callRouter(adminRouter, unknownFieldReq);
    assert.equal(unkRes.statusCode, 400);
    assert.equal(unkRes.body.code, 'UNKNOWN_CANONICAL_FIELD');
  });

  // ==========================================
  // GATE 5: RBAC & CSRF PROTECTION
  // ==========================================
  await t.test('Gate 5: RBAC e CSRF em endpoints de integração', async () => {
    // 1. GET /integrations com integrations.view (Operador) -> Permitido
    const opGetReq = {
      method: 'GET',
      url: '/integrations',
      ...buildAuthReq(sessionOperatorAlpha.rawToken),
    };
    const opGetRes = await callRouter(adminRouter, opGetReq);
    assert.equal(opGetRes.statusCode, 200);
    assert.ok(Array.isArray(opGetRes.body));

    // 2. POST /integrations com integrations.view (Operador sem integrations.manage) -> 403 Forbidden
    const opPostReq = {
      method: 'POST',
      url: '/integrations',
      ...buildAuthReq(sessionOperatorAlpha.rawToken, sessionOperatorAlpha.csrfToken),
      body: {
        name: 'Tentativa de Criar',
        providerType: 'REST',
        providerId: 'custom-rest-v1',
        manifest: INTEGRATION_PRESETS[0].manifest,
      },
    };
    const opPostRes = await callRouter(adminRouter, opPostReq);
    assert.equal(opPostRes.statusCode, 403, 'Usuário apenas com integrations.view deve receber 403 em POST');

    // 3. POST /integrations sem token CSRF -> 403 Forbidden (CSRF_TOKEN_INVALID)
    const noCsrfReq = {
      method: 'POST',
      url: '/integrations',
      ...buildAuthReq(sessionAdminAlpha.rawToken), // Sem CSRF
      body: {
        name: 'Tentativa Sem CSRF',
        providerType: 'REST',
        providerId: 'custom-rest-v1',
        manifest: INTEGRATION_PRESETS[0].manifest,
      },
    };
    const noCsrfRes = await callRouter(adminRouter, noCsrfReq);
    assert.equal(noCsrfRes.statusCode, 403);
    assert.ok(['CSRF_TOKEN_MISSING', 'CSRF_TOKEN_INVALID'].includes(noCsrfRes.body.code));


    // 4. Usuário sem integrations.view (Guest) -> 403 Forbidden em GET
    const guestGetReq = {
      method: 'GET',
      url: '/integrations',
      ...buildAuthReq(sessionGuestAlpha.rawToken),
    };
    const guestGetRes = await callRouter(adminRouter, guestGetReq);
    assert.equal(guestGetRes.statusCode, 403, 'Usuário sem permissão integrations.view deve receber 403');
  });

  // ==========================================
  // GATE 6: ANTI-IDOR & CROSS-TENANT DEFENSE
  // ==========================================
  await t.test('Gate 6: Anti-IDOR retorna 404 estrito em tentativas cross-tenant', async () => {
    // Admin Beta tenta acessar a integração da Empresa Alpha
    const betaGetAlphaReq = {
      method: 'GET',
      url: `/integrations/${createdIntegrationId}`,
      ...buildAuthReq(sessionAdminBeta.rawToken),
    };
    const betaGetAlphaRes = await callRouter(adminRouter, betaGetAlphaReq);
    assert.equal(betaGetAlphaRes.statusCode, 404, 'Tentativa de ler integração de outra empresa deve retornar 404 estrito');
    assert.equal(betaGetAlphaRes.body.code, 'INTEGRATION_NOT_FOUND');

    // Admin Beta tenta alterar a integração da Empresa Alpha
    const betaPutAlphaReq = {
      method: 'PUT',
      url: `/integrations/${createdIntegrationId}`,
      ...buildAuthReq(sessionAdminBeta.rawToken, sessionAdminBeta.csrfToken),
      body: { name: 'Adulterado por Beta' },
    };
    const betaPutAlphaRes = await callRouter(adminRouter, betaPutAlphaReq);
    assert.equal(betaPutAlphaRes.statusCode, 404, 'Tentativa de alterar integração de outra empresa deve retornar 404');

    // Admin Beta tenta alterar mapeamentos da integração da Empresa Alpha
    const betaPutMapReq = {
      method: 'PUT',
      url: `/integrations/${createdIntegrationId}/mappings`,
      ...buildAuthReq(sessionAdminBeta.rawToken, sessionAdminBeta.csrfToken),
      body: { mappings: [{ externalField: 'X', canonicalFieldId: 'produto.sku' }] },
    };
    const betaPutMapRes = await callRouter(adminRouter, betaPutMapReq);
    assert.equal(betaPutMapRes.statusCode, 404, 'Tentativa de alterar mapeamento de outra empresa deve retornar 404');

    // Admin Beta tenta excluir a integração da Empresa Alpha
    const betaDelAlphaReq = {
      method: 'DELETE',
      url: `/integrations/${createdIntegrationId}`,
      ...buildAuthReq(sessionAdminBeta.rawToken, sessionAdminBeta.csrfToken),
    };
    const betaDelAlphaRes = await callRouter(adminRouter, betaDelAlphaReq);
    assert.equal(betaDelAlphaRes.statusCode, 404, 'Tentativa de deletar integração de outra empresa deve retornar 404');

    // Tentativa de spoofing: Usuário Alpha envia companyId: 'comp-beta-56' no body de POST
    const spoofReq = {
      method: 'POST',
      url: '/integrations',
      ...buildAuthReq(sessionAdminAlpha.rawToken, sessionAdminAlpha.csrfToken),
      body: {
        name: 'Tentativa de Spoofing de Tenant',
        companyId: compBeta.id, // Forjando companyId
        providerType: 'CSV',
        providerId: 'csv-generic-v1',
        manifest: INTEGRATION_PRESETS[2].manifest,
      },
    };
    const spoofRes = await callRouter(adminRouter, spoofReq);
    assert.equal(spoofRes.statusCode, 201);
    assert.equal(spoofRes.body.companyId, compAlpha.id, 'companyId deve ser forçado para o principal autenticado');
    await IntegrationRepository.delete(compAlpha.id, spoofRes.body.id);
  });


  // ==========================================
  // GATE 7: EFFECTIVE CONFIGURATION & ZERO-INTEGRATION POLICY (OPÇÃO A)
  // ==========================================
  await t.test('Gate 7: Resolução canônica de campos com e sem integração ativa (Opção A)', async () => {
    // Empresa recém-criada (compBeta) sem integrações
    const betaConfig = await EffectiveConfigurationService.resolve({ companyId: compBeta.id });
    assert.equal(betaConfig.activeIntegrations.length, 0, 'Empresa nova deve ter ZERO integrações ativas');

    const betaGondolaAvail = betaConfig.fieldsAvailabilityByNiche['niche-gondola'];
    assert.ok(betaGondolaAvail, 'Disponibilidade de nicho-gondola deve existir');

    // Regra Opção A: Para qualquer campo de catálogo em empresa sem integração ativa: availableForIntegration = false
    assert.equal(betaGondolaAvail['produto.descricao']?.integration, false, 'Sem integração ativa: availableForIntegration deve ser false');
    assert.equal(betaGondolaAvail['produto.preco']?.integration, false, 'Sem integração ativa: availableForIntegration deve ser false');
    assert.equal(betaGondolaAvail['produto.sku']?.integration, false, 'Sem integração ativa: availableForIntegration deve ser false');

    // Empresa Alpha possui 1 integração ativa com mapeamentos para 'produto.sku' e 'produto.preco'
    const alphaConfig = await EffectiveConfigurationService.resolve({ companyId: compAlpha.id });
    assert.equal(alphaConfig.activeIntegrations.length, 1);
    const alphaGondolaAvail = alphaConfig.fieldsAvailabilityByNiche['niche-gondola'];

    // Mapeados e ativos: availableForIntegration = true
    assert.equal(alphaGondolaAvail['produto.sku']?.integration, true, 'Campo mapeado em integração ativa deve ter availableForIntegration = true');
    assert.equal(alphaGondolaAvail['produto.preco']?.integration, true, 'Campo mapeado em integração ativa deve ter availableForIntegration = true');

    // Campo NÃO mapeado (ex: produto.descricao): availableForIntegration = false
    assert.equal(alphaGondolaAvail['produto.descricao']?.integration, false, 'Campo NÃO mapeado deve permanecer availableForIntegration = false');

    // Se desativar a integração da empresa Alpha:
    await IntegrationRepository.update(compAlpha.id, createdIntegrationId, { status: 'INACTIVE' });
    const alphaDeactivatedConfig = await EffectiveConfigurationService.resolve({ companyId: compAlpha.id });
    const alphaDeactAvail = alphaDeactivatedConfig.fieldsAvailabilityByNiche['niche-gondola'];
    assert.equal(alphaDeactAvail['produto.sku']?.integration, false, 'Com integração inativa: availableForIntegration deve ser false');
  });

  // ==========================================
  // GATE 8: PRESERVAÇÃO PERPÉTUA DE CAMPOS DE SISTEMA
  // ==========================================
  await t.test('Gate 8: Campos de sistema preservados perpetuamente independentemente de integrações', async () => {
    const config = await EffectiveConfigurationService.resolve({ companyId: compBeta.id });
    const gondolaFields = config.enabledFieldsByNiche['niche-gondola'];
    const gondolaAvail = config.fieldsAvailabilityByNiche['niche-gondola'];

    for (const sf of SYSTEM_FIELDS) {
      assert.ok(gondolaFields.includes(sf.id), `Campo de sistema '${sf.id}' deve estar presente na lista de campos efetivos`);
      assert.equal(gondolaAvail[sf.id]?.manual, false, `Campo de sistema '${sf.id}' não deve ser manual`);
      assert.equal(gondolaAvail[sf.id]?.integration, false, `Campo de sistema '${sf.id}' não deve ser integração externa`);
    }
  });

  // ==========================================
  // GATE 9: PRESERVAÇÃO DE MODELOS LEGADOS & FREEZE POLICY
  // ==========================================
  await t.test('Gate 9: Baseline congelado do Editor e compilação ZPL permanecem intactos', async () => {
    const doc: any = {
      schemaVersion: 1,
      title: 'Etiqueta Teste Integrações',
      dimensions: {
        widthMm: 100,
        heightMm: 50,
        dpi: 203,
      },
      elements: [
        {
          id: 'el-text-1',
          type: 'text',
          x: 10,
          y: 10,
          width: 80,
          height: 15,
          text: '{produto.descricao}',
          field: 'produto.descricao',
          fontFamily: 'Arial',
          fontSize: 12,
        },
        {
          id: 'el-system-date',
          type: 'text',
          x: 10,
          y: 30,
          width: 80,
          height: 10,
          text: '{system.printDateTime}',
          field: 'system.printDateTime',
          fontFamily: 'Arial',
          fontSize: 10,
        },
      ],
    };

    const compiler = new ZPLCompiler();
    const result = compiler.compile(doc);
    assert.ok(result.command, 'ZPLCompiler deve compilar com sucesso');
    assert.ok(result.command.length > 0);
  });


  // ==========================================
  // GATE 10: ZERO SECRETS AUDIT
  // ==========================================
  await t.test('Gate 10: Auditoria de secrets assegura que senhas e chaves brutas nunca são persistidas', async () => {
    // 1. credentialRef aceita string opaca de identificação (<= 128 chars)
    const validOpaqueRef = 'vault://secret-manager/wr-erp-2026';
    const integ = await IntegrationRepository.create(compAlpha.id, {
      id: 'integ-audit-test',
      name: 'Integração Auditoria',
      providerType: 'SQL',
      providerId: 'totvs-protheus-v1',
      credentialRef: validOpaqueRef,
      manifest: INTEGRATION_PRESETS[1].manifest,
    });
    assert.equal(integ.credentialRef, validOpaqueRef);

    // 2. credentialRef com mais de 128 chars é rejeitado pelo endpoint
    const longRef = 'A'.repeat(129);
    const rejectLongReq = {
      method: 'POST',
      url: '/integrations',
      ...buildAuthReq(sessionAdminAlpha.rawToken, sessionAdminAlpha.csrfToken),
      body: {
        name: 'Tentativa Chave Longa',
        providerType: 'REST',
        providerId: 'custom-rest-v1',
        credentialRef: longRef,
        manifest: INTEGRATION_PRESETS[0].manifest,
      },
    };
    const rejectLongRes = await callRouter(adminRouter, rejectLongReq);
    assert.equal(rejectLongRes.statusCode, 400);
    assert.equal(rejectLongRes.body.code, 'INVALID_CREDENTIAL_REF');

    // 3. Manifesto não contém campo de credenciais/senhas
    const manifestKeys = Object.keys(INTEGRATION_PRESETS[0].manifest);
    assert.ok(!manifestKeys.includes('password'));
    assert.ok(!manifestKeys.includes('apiKey'));
    assert.ok(!manifestKeys.includes('secret'));
  });
});
