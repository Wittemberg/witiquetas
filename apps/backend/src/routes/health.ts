import { Router, Request, Response } from 'express';
import { S3Client, HeadBucketCommand, ListBucketsCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import { pgPool } from '../db.js';

dotenv.config();

const router = Router();

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

/**
 * Helper: Teste de conectividade com PostgreSQL com timeout estrito e consulta somente leitura.
 * NUNCA executa escrita nem migrações durante o healthcheck.
 */
export async function checkPostgres(timeoutMs = 2500) {
  if (!pgPool) {
    return {
      status: 'CONFIG_MISSING',
      message: 'DATABASE_URL não está configurada.',
      details: null,
    };
  }
  try {
    const startTime = Date.now();
    const queryPromise = pgPool.query(
      'SELECT NOW() as current_time, current_database() as db_name, version() as version_info'
    );
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout na verificação do PostgreSQL (${timeoutMs}ms)`)), timeoutMs)
    );

    const result: any = await Promise.race([queryPromise, timeoutPromise]);
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

/**
 * Helper: Teste de conectividade com MinIO / S3.
 */
export async function checkMinIO() {
  if (!s3Client) {
    return {
      status: 'CONFIG_MISSING',
      message: 'Credenciais de S3/MinIO não configuradas (S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY).',
      details: null,
    };
  }
  try {
    const startTime = Date.now();
    let bucketStatus = 'OK';
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: s3Bucket }));
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        bucketStatus = 'BUCKET_NOT_FOUND';
      } else {
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

/**
 * Health Check Geral (/api/health e /health).
 * Retorna HTTP 200 quando dependências essenciais (PostgreSQL) estiverem operacionais.
 * Retorna HTTP 503 quando o PostgreSQL estiver inoperante (evitando falsos positivos no Docker Swarm / Traefik).
 */
export const handleHealthCheck = async (_req: Request, res: Response) => {
  const [postgres, minio] = await Promise.all([
    checkPostgres(),
    checkMinIO(),
  ]);

  const postgresOk = postgres.status === 'OK';

  if (!postgresOk) {
    return res.status(503).json({
      status: 'UNHEALTHY',
      app: 'witiquetas-backend',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
      services: {
        postgres,
        minio,
      },
      error: 'Serviço essencial (PostgreSQL) indisponível.',
    });
  }

  const isFullyHealthy = minio.status === 'OK' || minio.status === 'CONFIG_MISSING';
  const status = isFullyHealthy ? 'HEALTHY' : 'DEGRADED';

  return res.status(200).json({
    status,
    app: 'witiquetas-backend',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    services: {
      postgres,
      minio,
    },
  });
};

/**
 * Liveness Probe (/api/health/live e /health/live).
 * Informa se o processo Node.js está vivo e respondendo a requisições HTTP.
 */
export const handleLivenessCheck = (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ALIVE',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
};

/**
 * Readiness Probe (/api/health/ready e /health/ready).
 * Informa se a instância está pronta para receber tráfego de produção.
 */
export const handleReadinessCheck = async (_req: Request, res: Response) => {
  const postgres = await checkPostgres(2000);
  if (postgres.status !== 'OK') {
    return res.status(503).json({
      status: 'NOT_READY',
      reason: 'PostgreSQL não está operacional.',
      postgres,
      timestamp: new Date().toISOString(),
    });
  }

  return res.status(200).json({
    status: 'READY',
    postgres,
    timestamp: new Date().toISOString(),
  });
};

router.get('/', handleHealthCheck);
router.get('/live', handleLivenessCheck);
router.get('/ready', handleReadinessCheck);

export default router;
