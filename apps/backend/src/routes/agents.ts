import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
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

import {
  AgentsRepository,
  memoryAgentsStore,
  type AgentRecord,
} from '../repositories/agentsRepository.js';

export { memoryAgentsStore as agentsStore };
export type { AgentRecord };

// Helper: Middleware de autenticação exclusiva de agente daemon (SHA-256 + timingSafeEqual)
export async function authenticateAgent(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization || (req.headers['x-agent-token'] as string);
  if (!authHeader) {
    return res.status(401).json({ error: 'Token de agente não fornecido.' });
  }

  const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!rawToken) {
    return res.status(401).json({ error: 'Token de agente vazio ou não fornecido.' });
  }

  const incomingHash = hashToken(rawToken);
  const agent = await AgentsRepository.findByTokenHash(incomingHash);

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

import { parseCookies, getWebSession, SESSION_COOKIE_NAME } from './auth.js';

// Helper: Middleware de autenticação administrativa / web (Sessão Web Server-Side Pré-RBAC + Bearer Admin)
export function authenticateWebUser(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization;

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

  // 2. Cookie de Sessão Web Server-Side (Pré-RBAC):
  // Valida o cookie HttpOnly 'witiquetas_session' contra o store de sessões em memória
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies[SESSION_COOKIE_NAME];

  if (sessionId) {
    const session = getWebSession(sessionId);
    if (session) {
      (req as any).user = {
        id: session.userId,
        companyId: session.companyId,
        role: session.role,
      } as AuthWebUser;
      return next();
    }
    return res.status(401).json({ error: 'Sessão web expirada ou inválida.' });
  }

  // 3. Fail-closed se não possuir sessão válida nem token administrativo
  return res.status(401).json({ error: 'Não autenticado. Forneça uma sessão web válida ou token administrativo.' });
}

export interface PairingCodeRecord {
  pairingCode: string;
  companyId: string;
  companyName: string;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  status: 'PENDING' | 'USED' | 'EXPIRED';
  usedAt?: string;
  agentId?: string;
  agentDetails?: {
    id: string;
    machineName: string;
    os: string;
    architecture: string;
    agentVersion: string;
  };
}

const pairingCodes = new Map<string, PairingCodeRecord>();
const pairingFailedAttempts = new Map<string, { count: number; resetAt: number }>();

function generateUnambiguousPairingCode(): string {
  const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let p1 = '';
  let p2 = '';
  for (let i = 0; i < 4; i++) {
    p1 += chars.charAt(Math.floor(Math.random() * chars.length));
    p2 += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `WIT-${p1}-${p2}`;
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

  const code = generateUnambiguousPairingCode();
  const now = Date.now();
  const expiresAt = now + 15 * 60 * 1000; // 15 minutos de validade

  pairingCodes.set(code, {
    pairingCode: code,
    companyId: targetCompanyId,
    companyName,
    createdBy: user.id,
    createdAt: now,
    expiresAt,
    status: 'PENDING',
  });

  res.json({
    pairingCode: code,
    expiresInSeconds: 900,
    companyName,
    companyId: targetCompanyId,
  });
});

// 1.1 Consultar Status de Pareamento (Exclusivo Web/Admin para polling amigável no modal)
router.get('/pairing-status/:code', authenticateWebUser, async (req: Request, res: Response) => {
  const user = (req as any).user as AuthWebUser;
  const code = (req.params.code || '').toUpperCase().trim();
  const pairing = pairingCodes.get(code);

  if (!pairing) {
    return res.status(404).json({ error: 'Código de pareamento não encontrado.', status: 'EXPIRED' });
  }

  if (user.companyId !== '*' && pairing.companyId !== user.companyId) {
    return res.status(403).json({ error: 'Não autorizado a consultar pareamento de outro tenant.' });
  }

  if (pairing.status === 'PENDING' && Date.now() > pairing.expiresAt) {
    pairing.status = 'EXPIRED';
  }

  let agentRecord: AgentDTO | null = null;
  if (pairing.agentId) {
    const rawAgent = await AgentsRepository.findById(pairing.agentId);
    if (rawAgent) {
      agentRecord = {
        id: rawAgent.id,
        companyId: rawAgent.companyId,
        installationId: rawAgent.installationId,
        machineName: rawAgent.machineName,
        os: rawAgent.os,
        architecture: rawAgent.architecture,
        agentVersion: rawAgent.agentVersion,
        status: rawAgent.status,
        lastSeenAt: rawAgent.lastSeenAt,
        createdAt: rawAgent.createdAt,
      };
    }
  }

  res.json({
    pairingCode: pairing.pairingCode,
    companyId: pairing.companyId,
    status: pairing.status,
    expiresAt: pairing.expiresAt,
    agent: agentRecord || pairing.agentDetails || null,
  });
});

// 2. Parear Agente Local (Única rota não autenticada do ciclo de vida do agente)
router.post('/pair', async (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const nowMs = Date.now();

  // Rate limit de tentativas de pareamento
  const attempts = pairingFailedAttempts.get(ip) || { count: 0, resetAt: nowMs + 300000 };
  if (nowMs > attempts.resetAt) {
    attempts.count = 0;
    attempts.resetAt = nowMs + 300000;
  }

  if (attempts.count >= 20) {
    return res.status(429).json({ error: 'Muitas tentativas inválidas de pareamento. Aguarde alguns minutos.' });
  }

  const body = req.body as PairAgentRequestDTO;
  const rawCode = (body.pairingCode || '').toUpperCase().trim();

  if (!rawCode) {
    attempts.count++;
    pairingFailedAttempts.set(ip, attempts);
    return res.status(400).json({ error: 'Código de pareamento obrigatório.' });
  }

  const pairing = pairingCodes.get(rawCode);
  if (!pairing) {
    attempts.count++;
    pairingFailedAttempts.set(ip, attempts);
    return res.status(400).json({ error: 'Código de pareamento inválido ou não encontrado.' });
  }

  if (pairing.status === 'USED') {
    attempts.count++;
    pairingFailedAttempts.set(ip, attempts);
    return res.status(409).json({ error: 'Este código de pareamento já foi utilizado por outro Agent.' });
  }

  if (nowMs > pairing.expiresAt || pairing.status === 'EXPIRED') {
    pairing.status = 'EXPIRED';
    attempts.count++;
    pairingFailedAttempts.set(ip, attempts);
    return res.status(400).json({ error: 'Código de pareamento expirado. Gere um novo no painel Web.' });
  }

  // Transição atômica para USED (Uso Único)
  pairing.status = 'USED';
  pairing.usedAt = new Date().toISOString();

  const installationId = body.installationId || `inst-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
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

  await AgentsRepository.save(newAgent);
  pairing.agentId = agentId;
  pairing.agentDetails = {
    id: agentId,
    machineName: newAgent.machineName,
    os: newAgent.os,
    architecture: newAgent.architecture,
    agentVersion: newAgent.agentVersion,
  };

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
router.post('/heartbeat', authenticateAgent, async (req: Request, res: Response) => {
  const agent = (req as any).agent as AgentRecord;
  const body = req.body as AgentHeartbeatRequestDTO;

  // Validação de consistência do agentId no body
  if (body.agentId && body.agentId !== agent.id) {
    return res.status(403).json({
      error: `Inconsistência no heartbeat: body.agentId ('${body.agentId}') não coincide com o agente autenticado ('${agent.id}').`,
    });
  }

  await AgentsRepository.updateHeartbeat(agent.id, body.status || 'ONLINE', body.agentVersion);

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
router.get('/', authenticateWebUser, async (req: Request, res: Response) => {
  const user = (req as any).user as AuthWebUser;
  const allowedCompanyId = user.companyId;

  const now = Date.now();
  const agents = await AgentsRepository.listByCompany(allowedCompanyId);

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

// 5. Revogar / Desconectar Agente (Exclusivo Web/Admin)
router.delete('/:id', authenticateWebUser, async (req: Request, res: Response) => {
  const user = (req as any).user as AuthWebUser;
  const success = await AgentsRepository.revoke(req.params.id, user.companyId);
  if (!success) {
    return res.status(404).json({ error: 'Agente não encontrado ou sem permissão para revogação.' });
  }
  res.json({ success: true, message: 'Agente revogado com sucesso.' });
});

// Resolução determinística do caminho do binário do Agent Windows x64:
// Compatível com CommonJS, ESM, container Docker (WORKDIR /app/apps/backend) e ambiente de desenvolvimento.
export function getAgentWindowsX64Path(): string {
  if (process.env.AGENT_WINDOWS_X64_PATH) {
    return path.resolve(process.env.AGENT_WINDOWS_X64_PATH);
  }

  // 1. Caminho relativo ao módulo compilado (dist/routes -> ../../bin/agents/...)
  if (typeof __dirname !== 'undefined') {
    const fromDirname = path.resolve(__dirname, '../../bin/agents/witiquetas-agent-windows-x64.exe');
    if (fs.existsSync(fromDirname)) return fromDirname;
  }

  // 2. Caminho dentro do container Docker (onde WORKDIR é /app/apps/backend)
  const fromContainerCwd = path.resolve(process.cwd(), 'bin/agents/witiquetas-agent-windows-x64.exe');
  if (fs.existsSync(fromContainerCwd)) return fromContainerCwd;

  // 3. Caminho a partir da raiz do monorepo em desenvolvimento
  const fromMonorepoCwd = path.resolve(process.cwd(), 'apps/backend/bin/agents/witiquetas-agent-windows-x64.exe');
  if (fs.existsSync(fromMonorepoCwd)) return fromMonorepoCwd;

  // Fallback padrão para o container
  return fromContainerCwd;
}

export const AGENT_WINDOWS_X64_PATH = getAgentWindowsX64Path();

// Log de startup determinístico sem segredos
export function logAgentDistributionStatus() {
  const binaryPath = getAgentWindowsX64Path();
  try {
    if (fs.existsSync(binaryPath)) {
      const stats = fs.statSync(binaryPath);
      console.log(`[agent-distribution] windows-x64: FOUND path=${binaryPath} size=${stats.size}`);
    } else {
      console.warn(`[agent-distribution] windows-x64: NOT FOUND path=${binaryPath}`);
    }
  } catch (err: any) {
    console.error(`[agent-distribution] windows-x64: ERROR checking path=${binaryPath}: ${err.message}`);
  }
}

// 5. Diagnóstico de Disponibilidade dos Binários
router.get('/download-status', (_req: Request, res: Response) => {
  const binaryPath = getAgentWindowsX64Path();
  const exists = fs.existsSync(binaryPath);
  let sizeBytes = 0;
  let sha256 = '';

  if (exists) {
    try {
      const stats = fs.statSync(binaryPath);
      sizeBytes = stats.size;
      const buffer = fs.readFileSync(binaryPath);
      sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    } catch {}
  }

  res.json({
    'windows-x64': {
      available: exists && sizeBytes > 1000000,
      version: '0.1.0',
      sizeBytes,
      sha256,
    },
  });
});

// 6. Download Multiplataforma de Binários do Agent (Windows x64 Real / Fail-Closed)
router.get('/download/:platform', (req: Request, res: Response) => {
  const platform = (req.params.platform || '').toLowerCase().replace(/_/g, '-');

  if (platform === 'windows-x64' || platform === 'win-x64') {
    const binaryPath = getAgentWindowsX64Path();
    if (fs.existsSync(binaryPath)) {
      try {
        const stats = fs.statSync(binaryPath);
        if (stats.isFile() && stats.size > 1000000) { // Deve ser arquivo real > 1MB
          const fileBuffer = fs.readFileSync(binaryPath);
          const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

          res.setHeader('Content-Disposition', 'attachment; filename="witiquetas-agent-windows-x64.exe"');
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('X-Agent-Version', '0.1.0');
          res.setHeader('X-Agent-SHA256', sha256);
          res.setHeader('Content-Length', stats.size);
          return res.sendFile(binaryPath);
        } else {
          console.error(`[agent-distribution] AGENT_BINARY_INVALID: path=${binaryPath} size=${stats.size}`);
        }
      } catch (err: any) {
        console.error(`[agent-distribution] AGENT_BINARY_ERROR: ${err.message}`);
      }
    } else {
      console.error(`[agent-distribution] AGENT_BINARY_NOT_FOUND: path=${binaryPath}`);
    }

    // Fail-Closed: NUNCA retornar mock se o binário real não existir
    return res.status(503).json({
      error: 'Agent Windows x64 temporariamente indisponível.',
      platform: 'WINDOWS_X64',
    });
  }

  return res.status(404).json({
    error: `Binário para a plataforma '${req.params.platform}' ainda não está disponível para download público.`,
    status: 'COMING_SOON',
  });
});

export { pairingCodes };
export default router;

