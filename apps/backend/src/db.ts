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
 * Carrega e executa todas as migrations SQL oficiais da pasta migrations/
 */
function getMigrationsList(): Array<{ filename: string; sql: string }> {
  const migrationsDirCandidates = [
    path.resolve(__dirname, 'migrations'),
    path.resolve(process.cwd(), 'apps/backend/src/migrations'),
    path.resolve(process.cwd(), 'src/migrations'),
  ];

  for (const dirPath of migrationsDirCandidates) {
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      try {
        const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.sql')).sort();
        if (files.length > 0) {
          return files.map((filename) => ({
            filename,
            sql: fs.readFileSync(path.join(dirPath, filename), 'utf-8'),
          }));
        }
      } catch {}
    }
  }

  // Schema fallback embutido se a pasta de arquivos SQL não for resolvida no bundle
  return [
    {
      filename: '001_create_agents_table.sql',
      sql: `
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
      `,
    },
    {
      filename: '002_create_label_templates_table.sql',
      sql: `
        CREATE TABLE IF NOT EXISTS label_templates (
          id VARCHAR(64) PRIMARY KEY,
          company_id VARCHAR(64) NOT NULL DEFAULT 'comp-default',
          title VARCHAR(255) NOT NULL,
          description TEXT,
          niche_id VARCHAR(64),
          niche_name VARCHAR(128) NOT NULL DEFAULT 'Geral',
          width_mm REAL NOT NULL DEFAULT 100,
          height_mm REAL NOT NULL DEFAULT 30,
          dpi INTEGER NOT NULL DEFAULT 203,
          orientation VARCHAR(32) NOT NULL DEFAULT 'landscape',
          printer_language VARCHAR(32) NOT NULL DEFAULT 'PPLB',
          document_schema JSONB NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMP WITH TIME ZONE
        );
        CREATE INDEX IF NOT EXISTS idx_templates_company_id ON label_templates (company_id);
        CREATE INDEX IF NOT EXISTS idx_templates_updated_at ON label_templates (updated_at);
        CREATE INDEX IF NOT EXISTS idx_templates_title ON label_templates (title);
        CREATE INDEX IF NOT EXISTS idx_templates_company_title ON label_templates (company_id, title);
        CREATE INDEX IF NOT EXISTS idx_templates_deleted_at ON label_templates (deleted_at);
      `,
    },
    {
      filename: '003_create_editing_sessions_table.sql',
      sql: `
        CREATE TABLE IF NOT EXISTS editing_sessions (
          id VARCHAR(64) PRIMARY KEY,
          model_id VARCHAR(64) NOT NULL,
          company_id VARCHAR(64) NOT NULL,
          session_id VARCHAR(128) NOT NULL,
          user_identifier VARCHAR(128) NOT NULL,
          os VARCHAR(64),
          browser VARCHAR(64),
          device_name VARCHAR(128),
          opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          CONSTRAINT uq_editing_session UNIQUE (company_id, model_id, session_id)
        );
        CREATE INDEX IF NOT EXISTS idx_editing_sessions_query ON editing_sessions (company_id, model_id, last_seen_at);
      `,
    },
  ];
}

/**
 * Inicialização e migração defensiva de tabelas no PostgreSQL
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
      const migrations = getMigrationsList();
      for (const m of migrations) {
        await client.query(m.sql);
        console.log(`[Database] Migration "${m.filename}" verificada/executada com sucesso no PostgreSQL.`);
      }
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

