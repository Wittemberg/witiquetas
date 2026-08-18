import crypto from 'node:crypto';
import { Router, Request, Response } from 'express';
import type {
  AgentDTO,
  PairAgentRequestDTO,
  PairAgentResponseDTO,
  AgentHeartbeatRequestDTO,
  AgentHeartbeatResponseDTO,
} from '@witiquetas/contracts';
import { printJobsStore } from './printJobs.js';

const router = Router();

// Storage em memória inicial (com fallback/mock para persistência antes de migrations do banco)
export interface AgentRecord extends AgentDTO {
  tokenHash: string;
}

export interface AuthWebUser {
  id: string;
  companyId: string;
  role: 'ADMIN' | 'OPERATOR' | 'SUPER_ADMIN';
}

/**
 * TEMPORARY PRE-RBAC AUTH:
 * Validação de tokens administrativos e web através de variáveis de ambiente.
 * Nenhum token estático reside no código-fonte.
 */
export function verifyWebUserToken(token: string): AuthWebUser | null {
  if (!token) return null;

  // 1. Verificar ADMIN_API_KEY do ambiente (Fail-closed se não configurada)
  const configuredAdminKey = process.env.ADMIN_API_KEY;
  if (configuredAdminKey) {
    try {
      const bufA = Buffer.from(token, 'utf8');
      const bufB = Buffer.from(configuredAdminKey, 'utf8');
      if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
        return {
          id: 'usr-admin',
          companyId: process.env.ADMIN_COMPANY_ID || 'comp-matriz-01',
          role: 'ADMIN',
        };
      }
    } catch {}
  }

  // 2. Verificar SUPER_ADMIN_API_KEY do ambiente
  const configuredSuperAdminKey = process.env.SUPER_ADMIN_API_KEY;
  if (configuredSuperAdminKey) {
    try {
      const bufA = Buffer.from(token, 'utf8');
      const bufB = Buffer.from(configuredSuperAdminKey, 'utf8');
      if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
        return {
          id: 'usr-superadmin',
          companyId: '*',
          role: 'SUPER_ADMIN',
        };
      }
    } catch {}
  }

  return null;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function verifyTokenHash(incomingRawToken: string, storedTokenHash: string): boolean {
  try {
    const incomingHash = hashToken(incomingRawToken);
    const bufA = Buffer.from(incomingHash, 'hex');
    const bufB = Buffer.from(storedTokenHash, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

// Códigos de pareamento ativos
const pairingCodes = new Map<string, { companyId: string; companyName: string; expiresAt: number }>();

// Em desenvolvimento/testes, permitir códigos demo para testes rápidos
if (process.env.NODE_ENV !== 'production') {
  pairingCodes.set('WIT-2026', { companyId: 'comp-matriz-01', companyName: 'Matriz Supermercado WR', expiresAt: Date.now() + 86400000 });
  pairingCodes.set('DEMO-PAIR', { companyId: 'comp-matriz-01', companyName: 'Matriz Supermercado WR', expiresAt: Date.now() + 86400000 });
}

const agentsStore = new Map<string, AgentRecord>();

// Helper: Middleware de autenticação exclusiva de agente daemon (SHA-256 + timingSafeEqual)
export function authenticateAgent(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization || (req.headers['x-agent-token'] as string);
  if (!authHeader) {
    return res.status(401).json({ error: 'Token de agente não fornecido.' });
  }

  const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!rawToken) {
    return res.status(401).json({ error: 'Token de agente vazio ou não fornecido.' });
  }

  const agent = Array.from(agentsStore.values()).find((a) => verifyTokenHash(rawToken, a.tokenHash));

  if (!agent) {
    return res.status(403).json({ error: 'Credencial do agente inválida ou revogada.' });
  }

  // Validação de consistência: se x-agent-id foi fornecido, deve coincidir com o token autenticado
  const providedAgentId = req.headers['x-agent-id'] as string;
  if (providedAgentId && providedAgentId !== agent.id) {
    return res.status(403).json({
      error: `Inconsistência de identidade: header x-agent-id ('${providedAgentId}') não coincide com o token autenticado ('${agent.id}').`,
    });
  }

  (req as any).agent = agent;
  next();
}

// Helper: Middleware de autenticação administrativa / web (Ponte transitória pré-RBAC)
export function authenticateWebUser(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization;
  const webClientHeader = req.headers['x-web-client'] as string;
  const webSessionHeader = req.headers['x-web-session'] as string;

  // 1. Se um token Bearer foi explicitamente fornecido, validar credencial administrativa
  if (authHeader) {
    // Fail-closed se nenhuma chave administrativa estiver configurada no ambiente
    if (!process.env.ADMIN_API_KEY && !process.env.SUPER_ADMIN_API_KEY) {
      return res.status(503).json({
        error: 'Autenticação administrativa indisponível. Nenhuma chave administrativa (ADMIN_API_KEY / SUPER_ADMIN_API_KEY) foi configurada no ambiente.',
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return res.status(401).json({ error: 'Token de autorização administrativo vazio.' });
    }

    const user = verifyWebUserToken(token);
    if (!user) {
      return res.status(403).json({ error: 'Credencial administrativa inválida ou sem permissão.' });
    }

    (req as any).user = user;
    return next();
  }

  // 2. Sessão Web do Editor (Ponte server-side pré-RBAC):
  // Permite que o frontend crie PrintJobs resolvendo o tenant server-side (ADMIN_COMPANY_ID) sem possuir segredos no browser
  if (webClientHeader === 'witiquetas-web' || webSessionHeader === 'witiquetas-editor' || req.headers['sec-fetch-dest']) {
    const resolvedCompanyId = process.env.ADMIN_COMPANY_ID || 'comp-matriz-01';
    (req as any).user = {
      id: 'usr-web-editor',
      companyId: resolvedCompanyId,
      role: 'OPERATOR',
    } as AuthWebUser;
    return next();
  }

  // 3. Fail-closed se não for requisição web reconhecida e não possuir token
  return res.status(401).json({ error: 'Token de autorização administrativo/web não fornecido.' });
}

export const DEFAULT_AGENT_POLL_INTERVAL_SECONDS = 45;

// 1. Gerar Código de Pareamento Temporário (Exclusivo Web/Admin com Proteção de Tenant)
router.post('/generate-pairing-code', authenticateWebUser, (req: Request, res: Response) => {
  const user = (req as any).user as AuthWebUser;
  const requestedCompanyId = req.body.companyId;

  // Proteção de tenant: Se o usuário não for SUPER_ADMIN, não pode gerar código para outra empresa
  if (requestedCompanyId && user.role !== 'SUPER_ADMIN' && user.companyId !== '*' && requestedCompanyId !== user.companyId) {
    return res.status(403).json({
      error: `Não autorizado a gerar código de pareamento para a empresa '${requestedCompanyId}'. Seu escopo autorizado é '${user.companyId}'.`,
    });
  }

  const targetCompanyId = user.companyId !== '*' ? user.companyId : (requestedCompanyId || 'comp-matriz-01');
  const companyName = req.body.companyName || (targetCompanyId === 'comp-matriz-01' ? 'Matriz Supermercado WR' : 'Filial Supermercado WR');

  const code = `WIT-${Math.floor(1000 + Math.random() * 9000)}`;
  pairingCodes.set(code, {
    companyId: targetCompanyId,
    companyName,
    expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutos de validade
  });

  res.json({
    pairingCode: code,
    expiresInSeconds: 900,
    companyName,
    companyId: targetCompanyId,
  });
});

// 2. Parear Agente Local (Única rota não autenticada do ciclo de vida do agente)
router.post('/pair', (req: Request, res: Response) => {
  const body = req.body as PairAgentRequestDTO;

  if (!body.pairingCode) {
    return res.status(400).json({ error: 'Código de pareamento obrigatório.' });
  }

  const pairing = pairingCodes.get(body.pairingCode.toUpperCase());
  if (!pairing) {
    return res.status(400).json({ error: 'Código de pareamento inválido ou não encontrado.' });
  }

  if (Date.now() > pairing.expiresAt) {
    pairingCodes.delete(body.pairingCode.toUpperCase());
    return res.status(400).json({ error: 'Código de pareamento expirado. Gere um novo no painel Web.' });
  }

  const installationId = `inst-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const agentId = `agent-${Date.now()}`;
  const rawToken = `agt_live_${crypto.randomBytes(24).toString('hex')}`;
  const tokenHash = hashToken(rawToken);
  const now = new Date().toISOString();

  const newAgent: AgentRecord = {
    id: agentId,
    companyId: pairing.companyId,
    installationId,
    machineName: body.machineName || 'DESKTOP-AGENT',
    os: body.os || 'windows',
    architecture: body.architecture || 'x86_64',
    agentVersion: body.agentVersion || '0.1.0',
    status: 'ONLINE',
    lastSeenAt: now,
    createdAt: now,
    tokenHash,
  };

  agentsStore.set(agentId, newAgent);
  // Consumir o código de uso único
  pairingCodes.delete(body.pairingCode.toUpperCase());

  const response: PairAgentResponseDTO = {
    success: true,
    agentId,
    installationId,
    token: rawToken,
    companyId: pairing.companyId,
    companyName: pairing.companyName,
    serverTime: now,
  };

  res.status(201).json(response);
});

// 3. Heartbeat do Agente (Obrigatoriamente autenticado via token de daemon)
router.post('/heartbeat', authenticateAgent, (req: Request, res: Response) => {
  const agent = (req as any).agent as AgentRecord;
  const body = req.body as AgentHeartbeatRequestDTO;

  // Validação de consistência do agentId no body
  if (body.agentId && body.agentId !== agent.id) {
    return res.status(403).json({
      error: `Inconsistência no heartbeat: body.agentId ('${body.agentId}') não coincide com o agente autenticado ('${agent.id}').`,
    });
  }

  agent.lastSeenAt = new Date().toISOString();
  agent.status = body.status || 'ONLINE';
  if (body.agentVersion) agent.agentVersion = body.agentVersion;

  // Calcular contagem de jobs pendentes dinamicamente para o tenant do agente
  const pendingJobsCount = Array.from(printJobsStore.values()).filter(
    (j) => j.status === 'PENDING' && j.companyId === agent.companyId
  ).length;

  const response: AgentHeartbeatResponseDTO = {
    acknowledged: true,
    serverTime: new Date().toISOString(),
    pendingJobsCount,
    pollIntervalSeconds: DEFAULT_AGENT_POLL_INTERVAL_SECONDS,
  };

  res.json(response);
});

// 4. Listar Agentes da Empresa (Exclusivo Web/Admin e Filtrado por Tenant)
router.get('/', authenticateWebUser, (req: Request, res: Response) => {
  const user = (req as any).user as AuthWebUser;
  const allowedCompanyId = user.companyId;

  const now = Date.now();
  let agents = Array.from(agentsStore.values());

  if (allowedCompanyId && allowedCompanyId !== '*') {
    agents = agents.filter((a) => a.companyId === allowedCompanyId);
  }

  const agentsDTO: AgentDTO[] = agents.map((a) => {
    const isOnline = a.lastSeenAt && now - new Date(a.lastSeenAt).getTime() < 120000;
    return {
      id: a.id,
      companyId: a.companyId,
      installationId: a.installationId,
      machineName: a.machineName,
      os: a.os,
      architecture: a.architecture,
      agentVersion: a.agentVersion,
      status: isOnline ? a.status : 'OFFLINE',
      lastSeenAt: a.lastSeenAt,
      createdAt: a.createdAt,
    };
  });

  res.json({
    total: agentsDTO.length,
    agents: agentsDTO,
  });
});

export { agentsStore, pairingCodes };
export default router;

