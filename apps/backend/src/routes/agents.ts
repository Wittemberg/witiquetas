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

const pairingCodes = new Map<string, { companyId: string; companyName: string; expiresAt: number }>([
  ['WIT-2026', { companyId: 'comp-matriz-01', companyName: 'Matriz Supermercado WR', expiresAt: Date.now() + 86400000 }],
  ['DEMO-PAIR', { companyId: 'comp-matriz-01', companyName: 'Matriz Supermercado WR', expiresAt: Date.now() + 86400000 }],
]);

const agentsStore = new Map<string, AgentRecord>();

// Helper: Middleware básico de autenticação de agente com SHA-256
export function authenticateAgent(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization || (req.headers['x-agent-token'] as string);
  if (!authHeader) {
    return res.status(401).json({ error: 'Token de agente não fornecido.' });
  }

  const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  const incomingHash = hashToken(rawToken);
  const agent = Array.from(agentsStore.values()).find((a) => a.tokenHash === incomingHash);

  if (!agent) {
    return res.status(403).json({ error: 'Credencial do agente inválida ou revogada.' });
  }

  (req as any).agent = agent;
  next();
}

export const DEFAULT_AGENT_POLL_INTERVAL_SECONDS = 45;

// 1. Gerar Código de Pareamento Temporário
router.post('/generate-pairing-code', (req: Request, res: Response) => {
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

// 2. Parear Agente Local
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

// 3. Heartbeat do Agente
router.post('/heartbeat', (req: Request, res: Response) => {
  const body = req.body as AgentHeartbeatRequestDTO;
  const tokenHeader = req.headers.authorization || (req.headers['x-agent-token'] as string);
  const rawToken = tokenHeader ? tokenHeader.replace(/^Bearer\s+/i, '').trim() : null;

  // Localizar agente pelo token hash, agentId ou installationId
  let agent: AgentRecord | undefined;
  if (rawToken) {
    const incomingHash = hashToken(rawToken);
    agent = Array.from(agentsStore.values()).find((a) => a.tokenHash === incomingHash);
  } else if (body.agentId) {
    agent = agentsStore.get(body.agentId);
  } else if (body.installationId) {
    agent = Array.from(agentsStore.values()).find((a) => a.installationId === body.installationId);
  }

  if (agent) {
    agent.lastSeenAt = new Date().toISOString();
    agent.status = body.status || 'ONLINE';
    if (body.agentVersion) agent.agentVersion = body.agentVersion;
  }

  // Calcular contagem de jobs pendentes dinamicamente para o tenant do agente
  const pendingJobsCount = Array.from(printJobsStore.values()).filter(
    (j) => j.status === 'PENDING' && (!agent || j.companyId === agent.companyId)
  ).length;

  const response: AgentHeartbeatResponseDTO = {
    acknowledged: true,
    serverTime: new Date().toISOString(),
    pendingJobsCount,
    pollIntervalSeconds: DEFAULT_AGENT_POLL_INTERVAL_SECONDS,
  };

  res.json(response);
});



// 4. Listar Agentes da Empresa
router.get('/', (_req: Request, res: Response) => {
  const now = Date.now();
  const agents = Array.from(agentsStore.values()).map((a) => {
    // Definir como OFFLINE se não enviar heartbeat há mais de 2 minutos
    const diffMs = now - new Date(a.lastSeenAt).getTime();
    const isOnline = diffMs < 120000;
    return {
      id: a.id,
      companyId: a.companyId,
      installationId: a.installationId,
      machineName: a.machineName,
      os: a.os,
      architecture: a.architecture,
      agentVersion: a.agentVersion,
      status: isOnline ? 'ONLINE' : 'OFFLINE',
      lastSeenAt: a.lastSeenAt,
      createdAt: a.createdAt,
    };
  });

  res.json({
    total: agents.length,
    agents,
  });
});

export { agentsStore };
export default router;
