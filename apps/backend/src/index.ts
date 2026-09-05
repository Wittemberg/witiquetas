import express, { Request, Response } from 'express';
import cors from 'cors';
import { S3Client, HeadBucketCommand, ListBucketsCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import { pgPool, initDatabase } from './db.js';

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

// S3 / MinIO Client Setup
const s3Endpoint = process.env.S3_ENDPOINT;
const s3AccessKey = process.env.S3_ACCESS_KEY;
const s3SecretKey = process.env.S3_SECRET_KEY;
const s3Bucket = process.env.S3_BUCKET || 'witiquetas';
const s3Region = process.env.S3_REGION || 'eu-south';

let s3Client: S3Client | null = null;

if (s3Endpoint && s3AccessKey && s3SecretKey) {
  s3Client = new S3Client({
    endpoint: s3Endpoint,
    region: s3Region,
    credentials: {
      accessKeyId: s3AccessKey,
      secretAccessKey: s3SecretKey,
    },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true' || true,
  });
}

// Helper: Test PostgreSQL
async function checkPostgres() {
  if (!pgPool) {
    return {
      status: 'CONFIG_MISSING',
      message: 'DATABASE_URL não está configurada.',
      details: null,
    };
  }
  try {
    const startTime = Date.now();
    const result = await pgPool.query('SELECT NOW() as current_time, current_database() as db_name, version() as version_info');
    const latencyMs = Date.now() - startTime;
    return {
      status: 'OK',
      message: 'Conectado com sucesso ao PostgreSQL.',
      latencyMs,
      details: {
        database: result.rows[0].db_name,
        serverTime: result.rows[0].current_time,
        version: result.rows[0].version_info,
      },
    };
  } catch (error: any) {
    return {
      status: 'ERROR',
      message: 'Falha ao conectar ao PostgreSQL.',
      error: error.message || String(error),
    };
  }
}

// Helper: Test MinIO / S3
async function checkMinIO() {
  if (!s3Client) {
    return {
      status: 'CONFIG_MISSING',
      message: 'Credenciais de S3/MinIO não configuradas (S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY).',
      details: null,
    };
  }
  try {
    const startTime = Date.now();
    // Tenta verificar se o bucket existe
    let bucketStatus = 'OK';
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: s3Bucket }));
    } catch (err: any) {
      // Se der 404, o MinIO respondeu mas o bucket ainda não foi criado
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        bucketStatus = 'BUCKET_NOT_FOUND';
      } else {
        // Tenta listar buckets como fallback para testar a credencial
        await s3Client.send(new ListBucketsCommand({}));
        bucketStatus = 'BUCKET_CHECK_FAILED_BUT_AUTH_OK';
      }
    }

    const latencyMs = Date.now() - startTime;
    return {
      status: 'OK',
      message: 'Conectado com sucesso ao MinIO/S3.',
      latencyMs,
      details: {
        endpoint: s3Endpoint,
        targetBucket: s3Bucket,
        bucketStatus,
      },
    };
  } catch (error: any) {
    return {
      status: 'ERROR',
      message: 'Falha ao conectar ao MinIO/S3.',
      error: error.message || String(error),
    };
  }
}

// Health Check Response Handler
const handleHealthCheck = async (_req: Request, res: Response) => {
  const [postgres, minio] = await Promise.all([
    checkPostgres(),
    checkMinIO(),
  ]);

  const allOk = postgres.status === 'OK' && minio.status === 'OK';

  // O container deve responder 200 mesmo se degradado, permitindo visualizar o dashboard de status
  res.status(200).json({
    status: allOk ? 'HEALTHY' : 'DEGRADED',
    app: 'witiquetas-backend',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    services: {
      postgres,
      minio,
    },
  });
};

import { DevelopmentControlService } from './services/developmentControlService.js';

// Version Response Handler
const handleVersion = (_req: Request, res: Response) => {
  const envCommit = process.env.GIT_COMMIT || process.env.GITHUB_SHA || process.env.RUNNING_SHA || process.env.CANDIDATE_SHA;
  let commit = (envCommit && envCommit !== 'unknown') ? envCommit : '';
  let shortCommit = (process.env.SHORT_SHA && process.env.SHORT_SHA !== 'unknown') ? process.env.SHORT_SHA : '';
  let governanceSha = '';

  try {
    const devService = new DevelopmentControlService();
    const checkpoints = devService.getCheckpoints();
    if (checkpoints && checkpoints.length > 0) {
      governanceSha = checkpoints[0].sha;
      if (!commit) {
        commit = checkpoints[0].sha;
      }
      if (!shortCommit) {
        shortCommit = checkpoints[0].shortSha || checkpoints[0].sha.slice(0, 7);
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
    version: '5.2.0-candidate',
    commit,
    candidateSha: commit,
    runningSha: commit,
    shortCommit,
    shortSha: shortCommit,
    governanceSha,
    status: 'IMPLEMENTED_AWAITING_HOMOLOGATION',
    package: 'PACOTE 5.2 — Autenticação, Sessão e Effective Session Context',
    phase: 'Fase 5 — Administração e Governança da Aplicação',
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

// Suporta tanto rotas diretas quanto rotas com prefixo /api (conforme Traefik/Nginx)
app.use('/auth', authRouter);
app.use('/api/auth', authRouter);

app.use('/session', sessionRouter);
app.use('/api/session', sessionRouter);

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

app.get('/health', handleHealthCheck);
app.get('/api/health', handleHealthCheck);

app.get('/version', handleVersion);
app.get('/api/version', handleVersion);

app.get('/', (_req, res) => {
  res.json({
    message: 'Witiquetas API Backend está operacional.',
    endpoints: {
      health: '/api/health',
      version: '/api/version',
    },
  });
});

app.listen(PORT, async () => {
  console.log(`[Witiquetas Backend] Rodando na porta ${PORT} (ENV: ${process.env.NODE_ENV || 'development'})`);
  try {
    await initDatabase();
  } catch (err: any) {
    console.error('[Database] Falha crítica no bootstrap do banco:', err.message);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
  logAgentDistributionStatus();
});
