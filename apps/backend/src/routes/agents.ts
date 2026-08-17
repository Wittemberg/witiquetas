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

// Helper: Middleware de autenticação de agente com SHA-256 e timingSafeEqual
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

export const DEFAULT_AGENT_POLL_INTERVAL_SECONDS = 45;

// 1. Gerar Código de Pareamento Temporário (Painel Web / Administrativo)
router.post('/generate-pairing-code', (req: Request, res: Response) => {
  // Proteção: em produção, exigir autenticação administrativa
  if (process.env.NODE_ENV === 'production' && !req.headers.authorization) {
    return res.status(401).json({ error: 'Autorização administrativa necessária para gerar códigos de pareamento em produção.' });
  }

  const { companyId = 'comp-matriz-01', companyName = 'Supermercado WR' } = req.body;
  const code = `WIT-${Math.floor(1000 + Math.random() * 9000)}`;
  pairingCodes.set(code, {
    companyId,
    companyName,
    expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutos de validade
  });

  res.json({
    pairingCode: code,
    expiresInSeconds: 900,
    companyName,
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

// 3. Heartbeat do Agente (Obrigatoriamente autenticado via token)
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

// 4. Listar Agentes da Empresa (Filtrado pelo tenant)
router.get('/', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization || (req.headers['x-agent-token'] as string);
  const rawToken = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : null;
  const callerAgent = rawToken ? Array.from(agentsStore.values()).find((a) => verifyTokenHash(rawToken, a.tokenHash)) : null;

  const now = Date.now();
  let agents = Array.from(agentsStore.values());

  if (callerAgent) {
    agents = agents.filter((a) => a.companyId === callerAgent.companyId);
  }

  const agentsDTO: AgentDTO[] = agents.map((agent) => {
    const isOnline = agent.lastSeenAt && now - new Date(agent.lastSeenAt).getTime() < 120000;
    return {
      id: agent.id,
      companyId: agent.companyId,
      installationId: agent.installationId,
      machineName: agent.machineName,
      os: agent.os,
      architecture: agent.architecture,
      agentVersion: agent.agentVersion,
      status: isOnline ? agent.status : 'OFFLINE',
      lastSeenAt: agent.lastSeenAt,
      createdAt: agent.createdAt,
    };
  });

  res.json({
    total: agentsDTO.length,
    agents: agentsDTO,
  });
});

export { agentsStore, pairingCodes };
export default router;
