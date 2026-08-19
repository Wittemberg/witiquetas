import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

dotenv.config();

export const dbUrl = process.env.DATABASE_URL;
export const isProduction = process.env.NODE_ENV === 'production';
export let pgPool: Pool | null = null;

if (dbUrl) {
  pgPool = new Pool({
    connectionString: dbUrl,
    connectionTimeoutMillis: 5000,
  });
} else if (isProduction) {
  console.error('[Database] FATAL: DATABASE_URL não configurada em produção.');
  process.exit(1);
}

/**
 * Carrega a migration SQL oficial
 */
function getMigrationSql(): string {
  const candidatePaths = [
    path.resolve(__dirname, 'migrations/001_create_agents_table.sql'),
    path.resolve(process.cwd(), 'apps/backend/src/migrations/001_create_agents_table.sql'),
    path.resolve(process.cwd(), 'src/migrations/001_create_agents_table.sql'),
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        return fs.readFileSync(p, 'utf-8');
      } catch {}
    }
  }

  // Schema canônico idêntico à migration 001
  return `
    CREATE TABLE IF NOT EXISTS agents (
      id VARCHAR(64) PRIMARY KEY,
      company_id VARCHAR(64) NOT NULL,
      installation_id VARCHAR(128) UNIQUE NOT NULL,
      machine_name VARCHAR(255) NOT NULL,
      os VARCHAR(32) NOT NULL,
      os_version VARCHAR(64),
      architecture VARCHAR(32) NOT NULL,
      agent_version VARCHAR(32) NOT NULL,
      protocol_version INTEGER NOT NULL DEFAULT 1,
      token_hash VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'ONLINE',
      last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      paired_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMP WITH TIME ZONE,
      metadata JSONB
    );

    CREATE INDEX IF NOT EXISTS idx_agents_company_id ON agents (company_id);
    CREATE INDEX IF NOT EXISTS idx_agents_last_seen_at ON agents (last_seen_at);
    CREATE INDEX IF NOT EXISTS idx_agents_token_hash ON agents (token_hash);
    CREATE INDEX IF NOT EXISTS idx_agents_installation_id ON agents (installation_id);
  `;
}

/**
 * Inicialização e migração defensiva de tabelas de infraestrutura
 */
export async function initDatabase(): Promise<void> {
  if (!pgPool) {
    if (isProduction) {
      console.error('[Database] FATAL: DATABASE_URL não configurada em produção.');
      process.exit(1);
    }
    console.log('[Database] DATABASE_URL não configurada em ambiente dev/test. Operando com storage em memória para testes.');
    return;
  }

  try {
    const client = await pgPool.connect();
    try {
      const migrationSql = getMigrationSql();
      await client.query(migrationSql);
      console.log('[Database] Tabela "agents" e índices verificados/inicializados com sucesso no PostgreSQL.');
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error(`[Database] Erro ao inicializar esquema no PostgreSQL: ${err.message}`);
    if (isProduction) {
      console.error('[Database] FATAL: Falha crítica no bootstrap do banco de dados em produção.');
      process.exit(1);
    }
    throw err;
  }
}
