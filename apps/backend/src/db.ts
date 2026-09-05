import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

dotenv.config();

const effectiveDirname = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

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
    path.resolve(effectiveDirname, 'migrations'),
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
    {
      filename: '004_create_print_job_batches_tables.sql',
      sql: `
        CREATE TABLE IF NOT EXISTS print_job_batches (
          id VARCHAR(64) PRIMARY KEY,
          company_id VARCHAR(64) NOT NULL,
          template_id VARCHAR(64) NOT NULL,
          printer_id VARCHAR(64) NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'QUEUED',
          total_records INTEGER NOT NULL DEFAULT 0,
          total_labels INTEGER NOT NULL DEFAULT 0,
          completed_jobs INTEGER NOT NULL DEFAULT 0,
          failed_jobs INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          finished_at TIMESTAMP WITH TIME ZONE
        );
        CREATE INDEX IF NOT EXISTS idx_batches_company_id ON print_job_batches (company_id);
        CREATE INDEX IF NOT EXISTS idx_batches_created_at ON print_job_batches (created_at);
        CREATE INDEX IF NOT EXISTS idx_batches_company_status ON print_job_batches (company_id, status);

        CREATE TABLE IF NOT EXISTS print_job_batch_items (
          id VARCHAR(64) PRIMARY KEY,
          batch_id VARCHAR(64) NOT NULL REFERENCES print_job_batches(id) ON DELETE CASCADE,
          print_job_id VARCHAR(64),
          source_record_id VARCHAR(128) NOT NULL,
          resolved_data JSONB NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 1,
          status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
          error TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_batch_items_batch_id ON print_job_batch_items (batch_id);
        CREATE INDEX IF NOT EXISTS idx_batch_items_job_id ON print_job_batch_items (print_job_id);
      `,
    },
    {
      filename: '005_create_admin_multitenant_rbac_tables.sql',
      sql: `
        CREATE TABLE IF NOT EXISTS companies (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          legal_name VARCHAR(255),
          document VARCHAR(32),
          slug VARCHAR(128) UNIQUE NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_companies_status ON companies (status);
        CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies (slug);

        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(64) PRIMARY KEY,
          company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          CONSTRAINT uq_users_company_id UNIQUE (company_id, id)
        );
        CREATE INDEX IF NOT EXISTS idx_users_company_id ON users (company_id);
        CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
        CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

        CREATE TABLE IF NOT EXISTS roles (
          id VARCHAR(64) PRIMARY KEY,
          company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          code VARCHAR(64) NOT NULL,
          name VARCHAR(128) NOT NULL,
          description TEXT,
          is_system BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          CONSTRAINT uq_roles_company_code UNIQUE (company_id, code),
          CONSTRAINT uq_roles_company_id UNIQUE (company_id, id)
        );
        CREATE INDEX IF NOT EXISTS idx_roles_company_id ON roles (company_id);
        CREATE INDEX IF NOT EXISTS idx_roles_code ON roles (code);

        CREATE TABLE IF NOT EXISTS permissions (
          code VARCHAR(64) PRIMARY KEY,
          name VARCHAR(128) NOT NULL,
          description TEXT NOT NULL,
          category VARCHAR(64) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_permissions_category ON permissions (category);

        CREATE TABLE IF NOT EXISTS role_permissions (
          role_id VARCHAR(64) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
          permission_code VARCHAR(64) NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
          PRIMARY KEY (role_id, permission_code)
        );
        CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions (role_id);
        CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_code ON role_permissions (permission_code);

        CREATE TABLE IF NOT EXISTS user_roles (
          company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          user_id VARCHAR(64) NOT NULL,
          role_id VARCHAR(64) NOT NULL,
          PRIMARY KEY (user_id, role_id),
          CONSTRAINT fk_user_roles_user FOREIGN KEY (company_id, user_id) REFERENCES users(company_id, id) ON DELETE CASCADE,
          CONSTRAINT fk_user_roles_role FOREIGN KEY (company_id, role_id) REFERENCES roles(company_id, id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_user_roles_company_id ON user_roles (company_id);
        CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles (user_id);
        CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles (role_id);

        CREATE TABLE IF NOT EXISTS role_niches (
          role_id VARCHAR(64) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
          niche_id VARCHAR(64) NOT NULL,
          allowed BOOLEAN NOT NULL DEFAULT TRUE,
          PRIMARY KEY (role_id, niche_id)
        );
        CREATE INDEX IF NOT EXISTS idx_role_niches_role_id ON role_niches (role_id);

        CREATE TABLE IF NOT EXISTS company_niches (
          company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          niche_id VARCHAR(64) NOT NULL,
          state VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          PRIMARY KEY (company_id, niche_id)
        );
        CREATE INDEX IF NOT EXISTS idx_company_niches_company_id ON company_niches (company_id);

        CREATE TABLE IF NOT EXISTS company_niche_elements (
          company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          niche_id VARCHAR(64) NOT NULL,
          element_type VARCHAR(64) NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          PRIMARY KEY (company_id, niche_id, element_type)
        );
        CREATE INDEX IF NOT EXISTS idx_company_niche_elements_company ON company_niche_elements (company_id, niche_id);

        CREATE TABLE IF NOT EXISTS company_niche_fields (
          company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          niche_id VARCHAR(64) NOT NULL,
          canonical_field_id VARCHAR(128) NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          PRIMARY KEY (company_id, niche_id, canonical_field_id)
        );
        CREATE INDEX IF NOT EXISTS idx_company_niche_fields_company ON company_niche_fields (company_id, niche_id);
      `,
    },
    {
      filename: '006_create_auth_credentials_and_sessions_tables.sql',
      sql: `
        ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

        CREATE TABLE IF NOT EXISTS sessions (
          id VARCHAR(64) PRIMARY KEY,
          token_hash VARCHAR(64) UNIQUE NOT NULL,
          csrf_token VARCHAR(64) NOT NULL,
          user_id VARCHAR(64) NOT NULL,
          company_id VARCHAR(64) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          revoked_at TIMESTAMP WITH TIME ZONE,
          last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          ip_address VARCHAR(45),
          user_agent TEXT,
          CONSTRAINT fk_sessions_user FOREIGN KEY (company_id, user_id) REFERENCES users(company_id, id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (token_hash);
        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (company_id, user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
        CREATE INDEX IF NOT EXISTS idx_sessions_revoked_at ON sessions (revoked_at);
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

      // Executa o bootstrap idempotente de administração e RBAC
      const { bootstrapAdminData } = await import('./services/adminBootstrapService.js');
      await bootstrapAdminData();
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

