import express, { Request, Response } from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { S3Client, HeadBucketCommand, ListBucketsCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// PostgreSQL Client Pool
const dbUrl = process.env.DATABASE_URL;
let pgPool: Pool | null = null;

if (dbUrl) {
  pgPool = new Pool({
    connectionString: dbUrl,
    connectionTimeoutMillis: 5000,
  });
}

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
  const statusCode = allOk ? 200 : 503;

  res.status(statusCode).json({
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

// Version Response Handler
const handleVersion = (_req: Request, res: Response) => {
  res.json({
    name: 'witiquetas-backend',
    version: '0.1.0',
    phase: 'Fase 0 — Fundação e Validação de Conectividade',
    environment: process.env.NODE_ENV || 'development',
    timezone: process.env.TZ || 'America/Sao_Paulo',
    timestamp: new Date().toISOString(),
  });
};

// Suporta tanto rotas diretas quanto rotas com prefixo /api (conforme Traefik/Nginx)
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

app.listen(PORT, () => {
  console.log(`[Witiquetas Backend] Rodando na porta ${PORT} (ENV: ${process.env.NODE_ENV || 'development'})`);
});
