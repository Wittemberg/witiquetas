import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDatabase } from './db.js';
import healthRouter, {
  handleHealthCheck,
  handleLivenessCheck,
  handleReadinessCheck,
  checkPostgres,
  checkMinIO,
} from './routes/health.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração auditada de proxy reverso (Portainer / Traefik / Nginx)
app.set('trust proxy', 1);

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());

import { DevelopmentControlService } from './services/developmentControlService.js';

// Version Response Handler
const handleVersion = (_req: Request, res: Response) => {
  const envCommit = process.env.GIT_COMMIT || process.env.GITHUB_SHA || process.env.RUNNING_SHA || process.env.CANDIDATE_SHA;
  let commit = (envCommit && envCommit !== 'unknown') ? envCommit : '';
  let shortCommit = (process.env.SHORT_SHA && process.env.SHORT_SHA !== 'unknown') ? process.env.SHORT_SHA : '';
  let governanceSha = '';
  let version = '5.7.0-candidate';
  let packageName = 'PACOTE 5.7 — Governança de Impressoras Físicas e Agentes Locais';
  let phase = 'Fase 5 — Administração e Governança da Aplicação';
  let status = 'IMPLEMENTED_AWAITING_HOMOLOGATION';

  try {
    const devService = new DevelopmentControlService();
    const checkpoints = devService.getCheckpoints();
    if (checkpoints && checkpoints.length > 0) {
      const latest = checkpoints[0];
      governanceSha = latest.sha;
      if (!commit) {
        commit = latest.sha;
      }
      if (!shortCommit) {
        shortCommit = latest.shortSha || latest.sha.slice(0, 7);
      }
      if (latest.patch) {
        version = latest.patch;
      }
      if (latest.title) {
        packageName = latest.title;
      }
      if ((latest as any).status) {
        status = (latest as any).status;
      }
    }
  } catch (_e) {
    // Fallback silencioso se arquivos de controle não estiverem disponíveis
  }

  if (!commit) {
    commit = 'unknown';
  }
  if (!shortCommit) {
    shortCommit = commit !== 'unknown' ? commit.slice(0, 7) : 'unknown';
  }
  if (!governanceSha) {
    governanceSha = commit;
  }

  res.json({
    name: 'witiquetas-backend',
    version,
    commit,
    candidateSha: commit,
    runningSha: commit,
    shortCommit,
    shortSha: shortCommit,
    governanceSha,
    status,
    package: packageName,
    phase,
    environment: process.env.NODE_ENV || 'development',
    timezone: process.env.TZ || 'America/Sao_Paulo',
    timestamp: (process.env.BUILT_AT && process.env.BUILT_AT !== 'unknown') ? process.env.BUILT_AT : new Date().toISOString(),
  });
};

import templatesRouter from './routes/templates';
import compileRouter from './routes/compile';
import agentsRouter, { logAgentDistributionStatus } from './routes/agents';
import printersRouter from './routes/printers';
import printJobsRouter from './routes/printJobs';
import qrcodesRouter from './routes/qrcodes';
import authRouter from './routes/auth';
import sessionRouter from './routes/session';
import developmentControlRouter from './routes/developmentControl.js';
import adminRouter from './routes/admin.js';
import updatesRouter from './routes/updates.js';
import { LeaseReaperService } from './services/leaseReaperService.js';

// Suporta tanto rotas diretas quanto rotas com prefixo /api (conforme Traefik/Nginx)
app.use('/auth', authRouter);
app.use('/api/auth', authRouter);

app.use('/session', sessionRouter);
app.use('/api/session', sessionRouter);

app.use('/admin', adminRouter);
app.use('/api/admin', adminRouter);

app.use('/updates', updatesRouter);
app.use('/api/updates', updatesRouter);

app.use('/development-control', developmentControlRouter);
app.use('/api/development-control', developmentControlRouter);

app.use('/templates', templatesRouter);
app.use('/api/templates', templatesRouter);

app.use('/compile', compileRouter);
app.use('/api/compile', compileRouter);

app.use('/agents', agentsRouter);
app.use('/api/agents', agentsRouter);

app.use('/printers', printersRouter);
app.use('/api/printers', printersRouter);

app.use('/print-jobs', printJobsRouter);
app.use('/api/print-jobs', printJobsRouter);

app.use('/qrcodes', qrcodesRouter);
app.use('/api/qrcodes', qrcodesRouter);

// Healthcheck com rotas raiz e prefixo /api
app.use('/health', healthRouter);
app.use('/api/health', healthRouter);

app.get('/version', handleVersion);
app.get('/api/version', handleVersion);

app.get('/', (_req, res) => {
  res.json({
    message: 'Witiquetas API Backend está operacional.',
    endpoints: {
      health: '/api/health',
      live: '/api/health/live',
      ready: '/api/health/ready',
      version: '/api/version',
    },
  });
});

export let isDatabaseReady = false;

export async function bootstrapApplication(): Promise<void> {
  console.log(`[Witiquetas Backend] Inicializando bootstrap do banco (ENV: ${process.env.NODE_ENV || 'development'})...`);
  try {
    await initDatabase();
    isDatabaseReady = true;
    LeaseReaperService.start();
    console.log('[Witiquetas Backend] Bootstrap do banco e LeaseReaper inicializados com sucesso.');
  } catch (err: any) {
    console.error('[Database] Falha crítica no bootstrap do banco:', err.message);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
    throw err;
  }
  logAgentDistributionStatus();
}

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, async () => {
    console.log(`[Witiquetas Backend] Rodando na porta ${PORT} (ENV: ${process.env.NODE_ENV || 'development'})`);
    try {
      await bootstrapApplication();
    } catch (err: any) {
      console.error('[Witiquetas Backend] Inicialização falhou:', err.message);
    }
  });
}

export {
  app,
  handleHealthCheck,
  handleLivenessCheck,
  handleReadinessCheck,
  checkPostgres,
  checkMinIO,
};
