import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearAdminMemoryStores,
  clearIntegrationMemoryStores,
  CompanyRepository,
  UserRepository,
  RoleRepository,
  IntegrationRepository,
  CANONICAL_PERMISSIONS,
} from '../apps/backend/src/repositories/adminRepositories.js';
import {
  clearSessionMemoryStores,
  SessionService,
} from '../apps/backend/src/services/sessionService.js';
import adminRouter from '../apps/backend/src/routes/admin.js';
import {
  BASE_NAV_ITEMS,
  getEffectiveNavigation,
} from '../apps/frontend/src/shell/navigation.js';

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

test('SUÍTE DE VALIDAÇÃO DO PACOTE 5.6.1 (UX FIXES & EDITING)', async (t) => {
  clearAdminMemoryStores();
  clearIntegrationMemoryStores();
  clearSessionMemoryStores();

  // Setup de Empresas
  const compAlpha = await CompanyRepository.create({
    id: 'comp-alpha-561',
    name: 'Empresa Alpha 561',
    slug: 'alpha-561',
    status: 'ACTIVE',
  });

  const compBeta = await CompanyRepository.create({
    id: 'comp-beta-561',
    name: 'Empresa Beta 561',
    slug: 'beta-561',
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

  const roleViewerAlpha = await RoleRepository.create({
    companyId: compAlpha.id,
    code: 'VIEWER',
    name: 'Visualizador de Integrações Alpha',
    isSystem: false,
  });
  await RoleRepository.setRolePermissions(roleViewerAlpha.id, ['integrations.view']);

  // Perfis da Empresa Beta
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

  // Usuários
  const userAdminAlpha = await UserRepository.create({
    companyId: compAlpha.id,
    name: 'Admin Alpha',
    email: 'admin@alpha561.com',
    passwordHash: 'hash',
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole(compAlpha.id, userAdminAlpha.id, roleAdminAlpha.id);

  const userViewerAlpha = await UserRepository.create({
    companyId: compAlpha.id,
    name: 'Viewer Alpha',
    email: 'viewer@alpha561.com',
    passwordHash: 'hash',
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole(compAlpha.id, userViewerAlpha.id, roleViewerAlpha.id);

  const userAdminBeta = await UserRepository.create({
    companyId: compBeta.id,
    name: 'Admin Beta',
    email: 'admin@beta561.com',
    passwordHash: 'hash',
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole(compBeta.id, userAdminBeta.id, roleAdminBeta.id);

  // Sessões
  const sessionAdminAlpha = await SessionService.createAuthenticatedSession({
    userId: userAdminAlpha.id,
    companyId: compAlpha.id,
  });
  const sessionViewerAlpha = await SessionService.createAuthenticatedSession({
    userId: userViewerAlpha.id,
    companyId: compAlpha.id,
  });
  const sessionAdminBeta = await SessionService.createAuthenticatedSession({
    userId: userAdminBeta.id,
    companyId: compBeta.id,
  });

  const buildAuthReq = (sessionToken: string, csrfToken?: string) => ({
    headers: {
      cookie: `witiquetas_session=${sessionToken}`,
      authorization: `Bearer ${sessionToken}`,
      ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
    },
    cookies: {
      witiquetas_session: sessionToken,
    },
  });

  // Criar uma integração base na Empresa Alpha
  const baseIntegrationAlpha = await IntegrationRepository.create(compAlpha.id, {
    providerType: 'REST',
    providerId: 'bling-v2',
    name: 'Bling V2 Alpha',
    environment: 'SANDBOX',
    baseUrl: 'https://api.bling.com.br/v2',
    credentialRef: 'vault:secret:bling-test',
    status: 'ACTIVE',
  });

  await t.test('Gate A: Usuário com integrations.manage edita campos permitidos (name, baseUrl, credentialRef, environment)', async () => {
    const editPayload = {
      name: 'Bling V2 Alpha Atualizado',
      baseUrl: 'https://api.bling.com.br/v3',
      credentialRef: 'vault:secret:bling-v3-prod',
      environment: 'PRODUCTION',
    };

    const res = await callRouter(adminRouter, {
      method: 'PUT',
      url: `/integrations/${baseIntegrationAlpha.id}`,
      ...buildAuthReq(sessionAdminAlpha.rawToken, sessionAdminAlpha.csrfToken),
      params: { id: baseIntegrationAlpha.id },
      body: editPayload,
    });

    assert.equal(res.statusCode, 200, 'Edição deve retornar 200 para usuário com integrations.manage');
    assert.equal(res.body.name, 'Bling V2 Alpha Atualizado');
    assert.equal(res.body.baseUrl, 'https://api.bling.com.br/v3');
    assert.equal(res.body.credentialRef, 'vault:secret:bling-v3-prod');
    assert.equal(res.body.environment, 'PRODUCTION');
    assert.equal(res.body.providerType, 'REST', 'Provider permanece imutável');
  });

  await t.test('Gate B: Usuário com apenas integrations.view tem acesso bloqueado (403) ao tentar editar', async () => {
    // Leitura permitida
    const getRes = await callRouter(adminRouter, {
      method: 'GET',
      url: `/integrations/${baseIntegrationAlpha.id}`,
      ...buildAuthReq(sessionViewerAlpha.rawToken),
      params: { id: baseIntegrationAlpha.id },
    });
    assert.equal(getRes.statusCode, 200, 'Viewer pode consultar integração');

    // Tentativa de edição bloqueada
    const putRes = await callRouter(adminRouter, {
      method: 'PUT',
      url: `/integrations/${baseIntegrationAlpha.id}`,
      ...buildAuthReq(sessionViewerAlpha.rawToken, sessionViewerAlpha.csrfToken),
      params: { id: baseIntegrationAlpha.id },
      body: { name: 'Hack Name' },
    });
    assert.equal(putRes.statusCode, 403, 'Tentativa de PUT sem integrations.manage deve retornar 403');
  });

  await t.test('Gate C: Anti-IDOR — tentativa de editar integração de outra empresa retorna 404', async () => {
    // AdminBeta tenta alterar integração pertencente a Alpha
    const crossRes = await callRouter(adminRouter, {
      method: 'PUT',
      url: `/integrations/${baseIntegrationAlpha.id}`,
      ...buildAuthReq(sessionAdminBeta.rawToken, sessionAdminBeta.csrfToken),
      params: { id: baseIntegrationAlpha.id },
      body: { name: 'Compromised Name' },
    });

    assert.equal(crossRes.statusCode, 404, 'Tentativa cross-tenant de edição deve retornar 404 Anti-IDOR');

    // Verificar que a integração no Alpha continua intocada
    const checkRes = await IntegrationRepository.findById(compAlpha.id, baseIntegrationAlpha.id);
    assert.equal(checkRes?.name, 'Bling V2 Alpha Atualizado');
  });

  await t.test('Gate D: Opaque credentialRef — backend valida formato e não persiste/expõe segredos puros', async () => {
    // 1. credentialRef que exceda tamanho ou formato inválido
    const tooLong = 'x'.repeat(150);
    const failRes = await callRouter(adminRouter, {
      method: 'PUT',
      url: `/integrations/${baseIntegrationAlpha.id}`,
      ...buildAuthReq(sessionAdminAlpha.rawToken, sessionAdminAlpha.csrfToken),
      params: { id: baseIntegrationAlpha.id },
      body: { credentialRef: tooLong },
    });
    assert.equal(failRes.statusCode, 400, 'credentialRef inválido ou longo deve ser rejeitado com 400');

    // 2. credentialRef válido permanece como referência opaca, sem segredos expostos
    const okRef = 'env:BLING_API_KEY_REF';
    const okRes = await callRouter(adminRouter, {
      method: 'PUT',
      url: `/integrations/${baseIntegrationAlpha.id}`,
      ...buildAuthReq(sessionAdminAlpha.rawToken, sessionAdminAlpha.csrfToken),
      params: { id: baseIntegrationAlpha.id },
      body: { credentialRef: okRef },
    });
    assert.equal(okRes.statusCode, 200);
    assert.equal(okRes.body.credentialRef, okRef);
    assert.equal(typeof okRes.body.credentialRef, 'string');
  });

  await t.test('Gate E & F: Frontend Navigation & Sidebar isolada sem item redundante de integrações', async () => {
    // Gate F: BASE_NAV_ITEMS não deve conter item 'integrations'
    const foundBase = BASE_NAV_ITEMS.some((item) => item.id === 'integrations');
    assert.equal(foundBase, false, 'BASE_NAV_ITEMS não deve conter o módulo integrations');

    // Usuário sem permissões admin mas com integrations.view
    const navViewer = getEffectiveNavigation({
      userId: userViewerAlpha.id,
      companyId: compAlpha.id,
      companyName: compAlpha.name,
      companySlug: compAlpha.slug,
      userName: userViewerAlpha.name,
      userEmail: userViewerAlpha.email,
      roles: ['VIEWER'],
      permissions: ['integrations.view'],
      isDeveloper: false,
    });

    const hasIntegrationsDirectly = navViewer.some((item) => item.id === 'integrations');
    assert.equal(hasIntegrationsDirectly, false, 'Sidebar não deve ter item integrations direto');

    const hasAdmin = navViewer.some((item) => item.id === 'admin');
    assert.equal(hasAdmin, true, 'Admin deve ser exibido na navegação para usuário com integrations.view');

    // Usuário sem qualquer permissão de admin ou integrações
    const navGuest = getEffectiveNavigation({
      userId: 'guest',
      companyId: compAlpha.id,
      companyName: compAlpha.name,
      companySlug: compAlpha.slug,
      userName: 'Guest',
      userEmail: 'guest@alpha.com',
      roles: ['GUEST'],
      permissions: ['templates.view'],
      isDeveloper: false,
    });
    assert.equal(navGuest.some((item) => item.id === 'admin'), false, 'Admin não deve aparecer para quem não tem permissões');
    assert.equal(navGuest.some((item) => item.id === 'integrations'), false, 'Integrações não deve aparecer na sidebar');
  });
});
