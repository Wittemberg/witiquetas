import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import agentsRouter, {
  pairingCodes,
  hashToken,
} from '../apps/backend/src/routes/agents.js';
import { AgentsRepository, memoryAgentsStore } from '../apps/backend/src/repositories/agentsRepository.js';
import { formatLastSeen } from '../apps/frontend/src/agent/agentStatusUtils.js';
import type { AgentDTO, AgentStatus } from '@witiquetas/contracts';

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
      } else {
        res.statusCode = 404;
        res.body = { error: 'Route not found' };
      }
      resolve(res);
    });
  });
}

const TEST_ADMIN_KEY = 'test-admin-api-key-5720';

test('SUÍTE PACKAGE 5.7.2.x — AGENT OPERATIONAL UX CONSISTENCY & RECONNECT FLOW', async (t) => {
  process.env.ADMIN_API_KEY = TEST_ADMIN_KEY;
  process.env.ADMIN_COMPANY_ID = 'comp-matriz-01';

  // =========================================================================
  // GATE 1: FORMATADOR DE ÚLTIMA CONEXÃO (formatLastSeen)
  // =========================================================================
  await t.test('Gate 1: formatLastSeen formata tempos relativos sem quebrar ou exibir datas brutas', () => {
    const now = Date.now();

    // 1. Recente (segundos)
    const justNowIso = new Date(now - 15 * 1000).toISOString();
    assert.match(formatLastSeen(justNowIso), /^\d+s atrás$/);

    // 2. Minutos atrás
    const minsAgoIso = new Date(now - 12 * 60 * 1000).toISOString();
    assert.equal(formatLastSeen(minsAgoIso), '12 min atrás');

    // 3. 22 horas atrás (Cenário Real do enunciado)
    const hours22AgoIso = new Date(now - 22 * 60 * 60 * 1000).toISOString();
    assert.equal(formatLastSeen(hours22AgoIso), '22h atrás');

    // 4. Dias atrás
    const daysAgoIso = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(formatLastSeen(daysAgoIso), '3d atrás');

    // 5. Casos limites: undefined, vazio, inválido
    assert.equal(formatLastSeen(undefined), 'Nunca');
    assert.equal(formatLastSeen(''), 'Nunca');
    assert.equal(formatLastSeen('invalid-iso-date'), 'Nunca');
  });

  // =========================================================================
  // GATE 2: CONTRATO DE ESTADOS CANÔNICOS DO AGENT (ONLINE, OFFLINE, REVOKED, ETC)
  // =========================================================================
  await t.test('Gate 2: @witiquetas/contracts define estados canônicos de AgentStatus', () => {
    const contractsFile = path.resolve('packages/contracts/src/index.ts');
    const content = fs.readFileSync(contractsFile, 'utf-8');

    assert.ok(content.includes('ONLINE'), 'Deve incluir estado ONLINE');
    assert.ok(content.includes('OFFLINE'), 'Deve incluir estado OFFLINE');
    assert.ok(content.includes('PAIRING'), 'Deve incluir estado PAIRING');
    assert.ok(content.includes('REVOKED'), 'Deve incluir estado REVOKED');
    assert.ok(content.includes('ERROR'), 'Deve incluir estado ERROR');
  });

  // =========================================================================
  // GATE 3: COMPONENTIZAÇÃO DE STATUS E MODAIS COMPARTILHADOS
  // =========================================================================
  await t.test('Gate 3: Componentes AgentStatusBadge, ReconnectAgentModal e AgentDetailsModal existem e são exportados', () => {
    const badgePath = path.resolve('apps/frontend/src/agent/AgentStatusBadge.tsx');
    const reconnectPath = path.resolve('apps/frontend/src/agent/ReconnectAgentModal.tsx');
    const detailsPath = path.resolve('apps/frontend/src/agent/AgentDetailsModal.tsx');

    assert.ok(fs.existsSync(badgePath), 'AgentStatusBadge.tsx deve existir');
    assert.ok(fs.existsSync(reconnectPath), 'ReconnectAgentModal.tsx deve existir');
    assert.ok(fs.existsSync(detailsPath), 'AgentDetailsModal.tsx deve existir');

    const badgeContent = fs.readFileSync(badgePath, 'utf-8');
    assert.ok(badgeContent.includes('agent-status-badge-online'), 'Badge deve ter testid para online');
    assert.ok(badgeContent.includes('agent-status-badge-offline'), 'Badge deve ter testid para offline');
    assert.ok(badgeContent.includes('agent-status-badge-revoked'), 'Badge deve ter testid para revogado');

    const reconnectContent = fs.readFileSync(reconnectPath, 'utf-8');
    assert.ok(reconnectContent.includes('Reconectar Agent de Impressão'), 'Modal deve ter título correto');
    assert.ok(reconnectContent.includes('reconnect-agent-modal'), 'Modal deve ter testid');
    assert.ok(reconnectContent.includes('Verificar Conexão Agora'), 'Modal deve ter ação de verificação ativa');
    assert.ok(reconnectContent.includes('Reinstalar / Novo Pareamento'), 'Modal deve ter opção de reinstalação quando necessário');

    const detailsContent = fs.readFileSync(detailsPath, 'utf-8');
    assert.ok(detailsContent.includes('Detalhes do Agent de Impressão'), 'Modal de detalhes deve ter título correto');
    assert.ok(detailsContent.includes('agent-details-modal'), 'Modal de detalhes deve ter testid');
  });

  // =========================================================================
  // GATE 4: CONSISTÊNCIA OPERACIONAL DO DASHBOARD (App.tsx)
  // =========================================================================
  await t.test('Gate 4: App.tsx (Dashboard) possui estrutura operacional idêntica à Administração', () => {
    const appPath = path.resolve('apps/frontend/src/App.tsx');
    const content = fs.readFileSync(appPath, 'utf-8');

    // Dashboard Agent Card
    assert.ok(content.includes('data-testid="dashboard-agent-card"'), 'Deve conter testid do card de Agent no Dashboard');
    assert.ok(content.includes('AgentStatusBadge'), 'Dashboard deve reutilizar AgentStatusBadge');
    assert.ok(content.includes('formatLastSeen'), 'Dashboard deve reutilizar formatLastSeen');
    assert.ok(content.includes('Última conexão'), 'Dashboard deve exibir label de Última conexão');

    // Comportamento dos botões no Dashboard conforme o estado
    assert.ok(content.includes('Adicionar Agent'), 'Zero agents: exibe Adicionar Agent');
    assert.ok(content.includes('Detalhes'), 'Online: ação principal é Detalhes');
    assert.ok(content.includes('Reconectar'), 'Offline: ação principal é Reconectar');
    assert.ok(content.includes('Administração'), 'Exibe link de acesso direto à Administração');

    // Presença dos modais operacionais
    assert.ok(content.includes('ReconnectAgentModal'), 'Dashboard deve renderizar ReconnectAgentModal');
    assert.ok(content.includes('AgentDetailsModal'), 'Dashboard deve renderizar AgentDetailsModal');
  });

  // =========================================================================
  // GATE 5: CONSISTÊNCIA OPERACIONAL DA ADMINISTRAÇÃO (AgentsAdminView.tsx)
  // =========================================================================
  await t.test('Gate 5: AgentsAdminView.tsx possui Reconectar como ação principal para Offline e Detalhes para Online', () => {
    const adminPath = path.resolve('apps/frontend/src/modules/admin/AgentsAdminView.tsx');
    const content = fs.readFileSync(adminPath, 'utf-8');

    // Banner Superior
    assert.ok(content.includes('Adicionar Novo Agent'), 'Ação superior deve ser renomeada para Adicionar Novo Agent');
    assert.ok(content.includes('Baixar Instalador'), 'Download deve ser apresentado como Baixar Instalador');
    assert.ok(content.includes('cadastrado(s)'), 'Deve distinguir agentes cadastrados de conectados');

    // Cards
    assert.ok(content.includes('AgentStatusBadge'), 'Admin deve usar AgentStatusBadge compartilhado');
    assert.ok(content.includes('formatLastSeen'), 'Admin deve usar formatLastSeen compartilhado');

    // Reconectar como ação principal em Offline, Revogar como secundária destrutiva
    assert.ok(content.includes('Reconectar'), 'Card offline deve conter ação Reconectar');
    assert.ok(content.includes('btn-danger'), 'Revogar deve permanecer estilizado como ação de perigo');
    assert.ok(content.includes('window.confirm'), 'Revogação deve exigir confirmação explícita do operador');

    // Modais integrados
    assert.ok(content.includes('ReconnectAgentModal'), 'Admin deve conter ReconnectAgentModal');
    assert.ok(content.includes('AgentDetailsModal'), 'Admin deve conter AgentDetailsModal');
  });

  // =========================================================================
  // GATE 6: ZERO-TERMINAL UX COMPLIANCE
  // =========================================================================
  await t.test('Gate 6: Modais voltados ao cliente não contêm termos como "Passo a passo no terminal" ou "Abra PowerShell"', () => {
    const pairModalPath = path.resolve('apps/frontend/src/agent/PairAgentModal.tsx');
    const downloadModalPath = path.resolve('apps/frontend/src/agent/DownloadAgentModal.tsx');
    const reconnectModalPath = path.resolve('apps/frontend/src/agent/ReconnectAgentModal.tsx');

    const pairContent = fs.readFileSync(pairModalPath, 'utf-8');
    const downloadContent = fs.readFileSync(downloadModalPath, 'utf-8');
    const reconnectContent = fs.readFileSync(reconnectModalPath, 'utf-8');

    // Não pode conter frases proibidas
    const forbiddenPhrases = [
      'Passo a passo no terminal',
      'Execute ...exe no terminal',
      'Abra PowerShell',
      'Execute CMD',
    ];

    for (const phrase of forbiddenPhrases) {
      assert.equal(pairContent.includes(phrase), false, `PairAgentModal não pode conter "${phrase}"`);
      assert.equal(downloadContent.includes(phrase), false, `DownloadAgentModal não pode conter "${phrase}"`);
      assert.equal(reconnectContent.includes(phrase), false, `ReconnectAgentModal não pode conter "${phrase}"`);
    }
  });

  // =========================================================================
  // GATE 7: OFFLINE NÃO VIRA ONLINE ARTIFICIALMENTE & RECONNECT NÃO GERA TOKEN ESPÚRIO
  // =========================================================================
  await t.test('Gate 7: Backend NÃO permite tornar agente Online sem heartbeat real e Reconectar não gera código espúrio', async () => {
    const agentId = 'agent-offline-test-5720';
    const token = 'agt_live_test_offline_5720';
    const tokenHash = hashToken(token);
    const oldTimestamp = new Date(Date.now() - 3600 * 1000).toISOString(); // 1 hora atrás

    // Salva agente offline no store
    await AgentsRepository.save({
      id: agentId,
      companyId: 'comp-matriz-01',
      installationId: 'inst-offline-5720',
      machineName: 'SUPORTE-OFFLINE',
      os: 'windows',
      architecture: 'x86_64',
      agentVersion: '0.1.0',
      status: 'ONLINE', // no banco pode ter sido online no passado
      lastSeenAt: oldTimestamp,
      createdAt: oldTimestamp,
      tokenHash,
    });

    // 1. Consulta lista: status calculado dinamicamente deve ser estritamente OFFLINE
    const reqList = {
      method: 'GET',
      url: '/',
      headers: { authorization: `Bearer ${TEST_ADMIN_KEY}` },
    };
    const resList = await callRouter(agentsRouter, reqList);
    assert.equal(resList.statusCode, 200);

    const found = resList.body.agents.find((a: any) => a.id === agentId);
    assert.ok(found, 'Agente deve estar cadastrado');
    assert.equal(found.status, 'OFFLINE', 'Agente com heartbeat antigo deve ser retornado como OFFLINE');

    // 2. Não existe endpoint mágico de "forçar online" sem heartbeat do daemon
    const reqFakeReconnect = {
      method: 'POST',
      url: `/${agentId}/force-online`,
      headers: { authorization: `Bearer ${TEST_ADMIN_KEY}` },
    };
    const resFakeReconnect = await callRouter(agentsRouter, reqFakeReconnect);
    assert.ok([404, 405].includes(resFakeReconnect.statusCode), 'Não deve existir rota para falsear status online');
  });

  // =========================================================================
  // GATE 8: REVOGAÇÃO E ISOLAMENTO ANTI-IDOR / MULTI-TENANT
  // =========================================================================
  await t.test('Gate 8: Revogação bloqueia agente, isola tenants e não permite reconexão silenciosa', async () => {
    const agentTenantA = 'agent-tenant-a-5720';
    const tokenA = 'agt_token_tenant_a_5720';

    await AgentsRepository.save({
      id: agentTenantA,
      companyId: 'comp-empresa-a',
      installationId: 'inst-a-5720',
      machineName: 'TERMINAL-A',
      os: 'windows',
      architecture: 'x86_64',
      agentVersion: '0.1.0',
      status: 'ONLINE',
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      tokenHash: hashToken(tokenA),
    });

    // 1. Tenant Matriz tenta revogar agente de Tenant A -> Fail-closed 404
    const reqCrossRevoke = {
      method: 'DELETE',
      url: `/${agentTenantA}`,
      params: { id: agentTenantA },
      headers: { authorization: `Bearer ${TEST_ADMIN_KEY}` }, // comp-matriz-01
    };
    const resCrossRevoke = await callRouter(agentsRouter, reqCrossRevoke);
    assert.equal(resCrossRevoke.statusCode, 404, 'Cross-tenant delete deve ser bloqueado com 404');

    // 2. Revogação legítima pelo próprio tenant ou super-admin
    const superAdminKey = 'test-superadmin-key-5720';
    process.env.SUPER_ADMIN_API_KEY = superAdminKey;

    const reqValidRevoke = {
      method: 'DELETE',
      url: `/${agentTenantA}`,
      params: { id: agentTenantA },
      headers: { authorization: `Bearer ${superAdminKey}` },
    };
    const resValidRevoke = await callRouter(agentsRouter, reqValidRevoke);
    assert.equal(resValidRevoke.statusCode, 200);
    assert.equal(resValidRevoke.body.success, true);

    // 3. Agente revogado não pode enviar heartbeat nem autenticar (403)
    const reqHeartbeat = {
      method: 'POST',
      url: '/heartbeat',
      headers: { authorization: `Bearer ${tokenA}` },
      body: {
        protocolVersion: 1,
        agentId: agentTenantA,
        installationId: 'inst-a-5720',
        agentVersion: '0.1.0',
        status: 'ONLINE',
        uptimeSeconds: 10,
        memoryUsageMb: 20,
        printersCount: 1,
        localQueueSize: 0,
        activeJobsCount: 0,
      },
    };
    const resHeartbeat = await callRouter(agentsRouter, reqHeartbeat);
    assert.equal(resHeartbeat.statusCode, 403, 'Agente revogado deve ser estritamente bloqueado com 403');
  });
});
