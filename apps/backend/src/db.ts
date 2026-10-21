import { Pool, type PoolClient } from 'pg';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

dotenv.config();

const effectiveDirname = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

export const dbUrl = process.env.DATABASE_URL;
export const isProduction = process.env.NODE_ENV === 'production';
export let pgPool: Pool | null = null;

export function setPgPool(newPool: Pool | null): void {
  pgPool = newPool;
}

export function getPgPool(): Pool | null {
  return pgPool;
}

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
 * Sanitiza URLs de banco de dados para logging seguro sem expor credenciais.
 */
export function sanitizeDbUrl(rawUrl?: string): string {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return rawUrl.replace(/(:\/\/[^:]+:)[^@]+(@)/, '$1***$2');
  }
}

/**
 * Determina se uma falha de conexão com o PostgreSQL é transitória/recuperável.
 * Cobre falhas de resolução DNS, indisponibilidade momentânea, timeouts e recusa de conexão.
 */
export function isTransientDbError(err: any): boolean {
  if (!err) return false;

  const code = String(err.code || '');
  const message = String(err.message || '').toLowerCase();

  // Erros de rede/DNS do Node.js e sistema operacional
  const transientNetworkCodes = [
    'ENOTFOUND',
    'EAI_AGAIN',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ECONNRESET',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'EPIPE',
    'EADDRNOTAVAIL',
  ];
  if (transientNetworkCodes.includes(code)) {
    return true;
  }

  // SQLSTATEs transitórios do PostgreSQL
  const transientSqlStates = [
    '57P03', // cannot_connect_now
    '53300', // too_many_connections
    '08006', // connection_failure
    '08001', // sqlclient_unable_to_establish_sqlconnection
    '08004', // sqlserver_rejected_establishment_of_sqlconnection
    '57014', // query_canceled / statement_timeout
  ];
  if (transientSqlStates.includes(code)) {
    return true;
  }

  // Padrões de mensagens transitórias
  if (
    message.includes('getaddrinfo') ||
    message.includes('connection terminated unexpectedly') ||
    message.includes('timeout expired') ||
    message.includes('terminating connection due to administrator command') ||
    message.includes('server closed the connection unexpectedly') ||
    message.includes('could not connect to server') ||
    message.includes('connection refused')
  ) {
    return true;
  }

  return false;
}

/**
 * Determina se uma falha é permanente (ex.: autenticação inválida ou banco inexistente),
 * onde retries seriam inúteis e devem ser abortados imediatamente.
 */
export function isPermanentDbError(err: any): boolean {
  if (!err) return false;

  const code = String(err.code || '');
  const message = String(err.message || '').toLowerCase();

  // SQLSTATEs permanentes do PostgreSQL
  const permanentSqlStates = [
    '28P01', // invalid_password
    '28000', // invalid_authorization_specification
    '3D000', // invalid_catalog_name (database não existe)
  ];
  if (permanentSqlStates.includes(code)) {
    return true;
  }

  if (
    message.includes('password authentication failed') ||
    (message.includes('database') && message.includes('does not exist')) ||
    (message.includes('role') && message.includes('does not exist'))
  ) {
    return true;
  }

  return false;
}

export interface DbRetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  totalTimeoutMs?: number;
  backoffFactor?: number;
}

/**
 * Estabelece conexão com o PostgreSQL com política de retry e backoff exponencial.
 * Trata falhas transitórias de DNS e rede, abortando imediatamente diante de falhas permanentes.
 */
export async function connectWithRetry(
  pool: Pool,
  options?: DbRetryOptions
): Promise<PoolClient> {
  const maxRetries = options?.maxRetries ?? (Number(process.env.DB_CONNECT_MAX_RETRIES) || 5);
  const initialDelayMs = options?.initialDelayMs ?? (Number(process.env.DB_CONNECT_INITIAL_DELAY_MS) || 1000);
  const maxDelayMs = options?.maxDelayMs ?? (Number(process.env.DB_CONNECT_MAX_DELAY_MS) || 10000);
  const totalTimeoutMs = options?.totalTimeoutMs ?? (Number(process.env.DB_CONNECT_TOTAL_TIMEOUT_MS) || 30000);
  const backoffFactor = options?.backoffFactor ?? 2;

  const startTime = Date.now();
  let attempt = 0;
  let currentDelay = initialDelayMs;

  while (attempt < maxRetries) {
    attempt++;
    const elapsedMs = Date.now() - startTime;
    if (elapsedMs >= totalTimeoutMs) {
      const timeoutErr = new Error(`[Database] Tempo limite total de conexão com PostgreSQL esgotado (${elapsedMs}ms >= ${totalTimeoutMs}ms).`);
      (timeoutErr as any).code = 'DB_TIMEOUT_EXCEEDED';
      throw timeoutErr;
    }

    try {
      console.log(`[Database] Tentando conexão com PostgreSQL (tentativa ${attempt}/${maxRetries})...`);
      const client = await pool.connect();
      console.log(`[Database] Conexão com PostgreSQL estabelecida com sucesso na tentativa ${attempt}.`);
      return client;
    } catch (err: any) {
      const isPermanent = isPermanentDbError(err);
      const isTransient = isTransientDbError(err);
      const errCode = err.code || 'UNKNOWN';

      if (isPermanent) {
        console.error(`[Database] Erro permanente na conexão com o PostgreSQL detectado (código: ${errCode}). Abortando retries imediatamente.`);
        throw err;
      }

      if (!isTransient) {
        console.warn(`[Database] Erro de conexão não catalogado explicitamente (código: ${errCode}, mensagem: ${err.message}). Tratando como transitório.`);
      }

      if (attempt >= maxRetries) {
        console.error(`[Database] Limite máximo de ${maxRetries} tentativas de conexão com PostgreSQL esgotado.`);
        throw err;
      }

      const nextDelay = Math.min(currentDelay, maxDelayMs);
      console.warn(`[Database] Falha transitória na tentativa ${attempt}/${maxRetries} (código: ${errCode}). Próxima tentativa em ${nextDelay}ms...`);

      await new Promise((resolve) => setTimeout(resolve, nextDelay));
      currentDelay = Math.round(currentDelay * backoffFactor);
    }
  }

  throw new Error(`[Database] Falha crítica ao conectar ao PostgreSQL após ${maxRetries} tentativas.`);
}

/**
 * Carrega e executa todas as migrations SQL oficiais da pasta migrations/
 */
export function getMigrationsList(): Array<{ filename: string; sql: string }> {

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
            sql: fs.readFileSync(path.join(dirPath, filename), 'utf-8').replace(/^\uFEFF/, ''),
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
    {
      filename: '007_add_dcc_master_platform_flag.sql',
      sql: `
        ALTER TABLE users ADD COLUMN IF NOT EXISTS is_dcc_master BOOLEAN NOT NULL DEFAULT FALSE;
        CREATE INDEX IF NOT EXISTS idx_users_dcc_master ON users (is_dcc_master);
      `,
    },
    {
      filename: '008_add_niche_defaults_and_field_availability.sql',
      sql: `
        ALTER TABLE company_niches ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;
        CREATE INDEX IF NOT EXISTS idx_company_niches_default ON company_niches (company_id, is_default);
        ALTER TABLE company_niche_fields ADD COLUMN IF NOT EXISTS available_for_manual BOOLEAN NOT NULL DEFAULT TRUE;
        ALTER TABLE company_niche_fields ADD COLUMN IF NOT EXISTS available_for_integration BOOLEAN NOT NULL DEFAULT TRUE;
      `,
    },
    {
      filename: '009_create_integrations_and_mappings_tables.sql',
      sql: `
        CREATE TABLE IF NOT EXISTS integrations (
          id VARCHAR(64) PRIMARY KEY,
          company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          provider_type VARCHAR(32) NOT NULL,
          provider_id VARCHAR(64) NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'INACTIVE',
          environment VARCHAR(32) NOT NULL DEFAULT 'PRODUCTION',
          base_url TEXT,
          credential_ref VARCHAR(128),
          niche_id VARCHAR(64),
          settings JSONB NOT NULL DEFAULT '{}',
          manifest JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          CONSTRAINT uq_integrations_company_id UNIQUE (company_id, id)
        );
        CREATE INDEX IF NOT EXISTS idx_integrations_company_id ON integrations (company_id);
        CREATE INDEX IF NOT EXISTS idx_integrations_provider_type ON integrations (company_id, provider_type);
        CREATE INDEX IF NOT EXISTS idx_integrations_status ON integrations (company_id, status);
        CREATE INDEX IF NOT EXISTS idx_integrations_niche_id ON integrations (company_id, niche_id);

        CREATE TABLE IF NOT EXISTS integration_field_mappings (
          id VARCHAR(64) PRIMARY KEY,
          company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          integration_id VARCHAR(64) NOT NULL,
          external_field VARCHAR(128) NOT NULL,
          canonical_field_id VARCHAR(128) NOT NULL,
          direction VARCHAR(32) NOT NULL DEFAULT 'READ',
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          data_type VARCHAR(64),
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          CONSTRAINT fk_mappings_integration FOREIGN KEY (company_id, integration_id) 
            REFERENCES integrations(company_id, id) ON DELETE CASCADE,
          CONSTRAINT uq_integration_field_mapping UNIQUE (company_id, integration_id, external_field)
        );
        CREATE INDEX IF NOT EXISTS idx_field_mappings_integration ON integration_field_mappings (company_id, integration_id);
        CREATE INDEX IF NOT EXISTS idx_field_mappings_canonical ON integration_field_mappings (company_id, canonical_field_id);
      `,
    },
    {
      filename: '010_create_printers_table.sql',
      sql: `
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'uq_agents_company_id'
          ) THEN
            ALTER TABLE agents ADD CONSTRAINT uq_agents_company_id UNIQUE (company_id, id);
          END IF;
        END $$;

        CREATE TABLE IF NOT EXISTS printers (
          id VARCHAR(64) PRIMARY KEY,
          company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          model_id VARCHAR(64) NOT NULL,
          manufacturer VARCHAR(64),
          protocol VARCHAR(32) NOT NULL,
          dpi INTEGER NOT NULL DEFAULT 203,
          connection_type VARCHAR(32) NOT NULL,
          ip VARCHAR(64),
          port INTEGER DEFAULT 9100,
          spooler_name VARCHAR(255),
          serial_port VARCHAR(64),
          baud_rate INTEGER DEFAULT 9600,
          serial_flow_control VARCHAR(32) DEFAULT 'RTS_CTS',
          agent_id VARCHAR(64),
          location VARCHAR(100),
          is_default BOOLEAN NOT NULL DEFAULT FALSE,
          status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
          settings JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          CONSTRAINT uq_printers_company_id UNIQUE (company_id, id),
          CONSTRAINT fk_printer_agent FOREIGN KEY (company_id, agent_id) 
            REFERENCES agents(company_id, id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_printers_company_id ON printers (company_id);
        CREATE INDEX IF NOT EXISTS idx_printers_status ON printers (company_id, status);
        CREATE INDEX IF NOT EXISTS idx_printers_agent_id ON printers (company_id, agent_id);
        CREATE UNIQUE INDEX IF NOT EXISTS uq_printers_company_default ON printers (company_id) WHERE is_default = TRUE;
      `,
    },
    {
      filename: '011_create_persistent_print_queue_tables.sql',
      sql: `
        CREATE TABLE IF NOT EXISTS print_jobs (
          id VARCHAR(64) PRIMARY KEY,
          company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          printer_id VARCHAR(64) NOT NULL REFERENCES printers(id) ON DELETE RESTRICT,
          batch_id VARCHAR(64) REFERENCES print_job_batches(id) ON DELETE SET NULL,
          batch_item_id VARCHAR(64),
          idempotency_key VARCHAR(128),
          status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
          language VARCHAR(16) NOT NULL,
          encoding VARCHAR(32) NOT NULL DEFAULT 'windows-1252',
          copies INTEGER NOT NULL DEFAULT 1,
          copy_strategy VARCHAR(32) NOT NULL DEFAULT 'EMBEDDED_IN_PAYLOAD',
          payload TEXT NOT NULL,
          payload_base64 TEXT NOT NULL,
          payload_bytes_length INTEGER NOT NULL,
          checksum_sha256 VARCHAR(64) NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          max_attempts INTEGER NOT NULL DEFAULT 3,
          lease_id VARCHAR(64),
          claimed_by_agent_id VARCHAR(64) REFERENCES agents(id) ON DELETE SET NULL,
          attempt_id VARCHAR(64),
          claimed_at TIMESTAMP WITH TIME ZONE,
          lease_expires_at TIMESTAMP WITH TIME ZONE,
          delivered_to_transport_at TIMESTAMP WITH TIME ZONE,
          completed_at TIMESTAMP WITH TIME ZONE,
          execution_time_ms BIGINT,
          error TEXT,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_print_jobs_claim_queue 
          ON print_jobs (company_id, printer_id, status, created_at) 
          WHERE status = 'PENDING';

        CREATE INDEX IF NOT EXISTS idx_print_jobs_lease_sweeper 
          ON print_jobs (status, lease_expires_at) 
          WHERE status IN ('CLAIMED', 'DOWNLOADED', 'DELIVERING');

        CREATE INDEX IF NOT EXISTS idx_print_jobs_company_created 
          ON print_jobs (company_id, created_at DESC);

        CREATE UNIQUE INDEX IF NOT EXISTS idx_print_jobs_company_idempotency 
          ON print_jobs (company_id, idempotency_key) 
          WHERE idempotency_key IS NOT NULL;

        CREATE TABLE IF NOT EXISTS print_job_events (
          id BIGSERIAL PRIMARY KEY,
          job_id VARCHAR(64) NOT NULL REFERENCES print_jobs(id) ON DELETE CASCADE,
          company_id VARCHAR(64) NOT NULL,
          from_status VARCHAR(32),
          to_status VARCHAR(32) NOT NULL,
          agent_id VARCHAR(64),
          lease_id VARCHAR(64),
          attempt_id VARCHAR(64),
          execution_time_ms BIGINT,
          error TEXT,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_print_job_events_job_id 
          ON print_job_events (job_id, created_at ASC);

        CREATE INDEX IF NOT EXISTS idx_print_job_events_company_created 
          ON print_job_events (company_id, created_at DESC);
      `,
    },
    {
      filename: '012_create_user_release_views_table.sql',
      sql: `
        CREATE TABLE IF NOT EXISTS user_release_views (
          company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          user_id VARCHAR(64) NOT NULL,
          release_version VARCHAR(32) NOT NULL,
          viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          PRIMARY KEY (company_id, user_id, release_version),
          CONSTRAINT fk_user_release_views_user FOREIGN KEY (company_id, user_id) REFERENCES users(company_id, id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_user_release_views_user ON user_release_views (company_id, user_id);
        CREATE INDEX IF NOT EXISTS idx_user_release_views_version ON user_release_views (release_version);
      `,
    },
  ];
}

/**
 * Identificador constante de 64-bit para Advisory Lock de sessão do Witiquetas.
 * Derivado de hash estável para evitar colisões com outros módulos do PostgreSQL.
 * O Advisory Lock de sessão é liberado automaticamente caso o processo caia ou
 * a conexão dedicada seja encerrada.
 */
export const WITIQUETAS_MIGRATION_LOCK_ID = 6289650392694114130n;

/**
 * Calcula o checksum SHA-256 de uma migration SQL após normalização de quebras de linha (CRLF/LF).
 */
export function calculateMigrationChecksum(sql: string): string {
  const normalized = sql.replace(/\r\n/g, '\n').trim();
  return crypto.createHash('sha256').update(normalized, 'utf-8').digest('hex');
}

/**
 * Cria a tabela de controle de migrations schema_migrations se não existir.
 */
export async function ensureSchemaMigrationsTable(client: PoolClient): Promise<void> {
  const ddl = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      execution_time_ms BIGINT NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_schema_migrations_filename ON schema_migrations (filename);
  `;
  await client.query(ddl);
}

export interface AppliedMigrationRecord {
  id: number;
  filename: string;
  checksum: string;
  applied_at: Date;
  execution_time_ms: number;
}

/**
 * Obtém o mapa de migrations já aplicadas no banco de dados.
 */
export async function getAppliedMigrations(
  client: PoolClient
): Promise<Map<string, AppliedMigrationRecord>> {
  const res = await client.query<AppliedMigrationRecord>(
    'SELECT id, filename, checksum, applied_at, execution_time_ms FROM schema_migrations ORDER BY id ASC'
  );
  const map = new Map<string, AppliedMigrationRecord>();
  for (const row of res.rows) {
    map.set(row.filename, row);
  }
  return map;
}

export interface MigrationLockOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

/**
 * Adquire um Advisory Lock de sessão exclusivo no PostgreSQL para migrações.
 * Utiliza polling não-bloqueante com pg_try_advisory_lock para respeitar o timeout definido.
 */
export async function acquireMigrationLock(
  client: PoolClient,
  options?: MigrationLockOptions
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? (Number(process.env.MIGRATION_LOCK_TIMEOUT_MS) || 30000);
  const pollIntervalMs = options?.pollIntervalMs ?? (Number(process.env.MIGRATION_LOCK_POLL_INTERVAL_MS) || 500);

  const startTime = Date.now();
  const lockIdStr = WITIQUETAS_MIGRATION_LOCK_ID.toString();

  while (true) {
    const res = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1::bigint) AS locked',
      [lockIdStr]
    );

    const locked = res.rows[0]?.locked === true;
    if (locked) {
      console.log(`[Database] Advisory Lock de migração adquirido com sucesso (Lock ID: ${lockIdStr}).`);
      return;
    }

    const elapsed = Date.now() - startTime;
    if (elapsed >= timeoutMs) {
      const err = new Error(
        `[Database] MIGRATION_LOCK_TIMEOUT: Não foi possível adquirir o lock exclusivo de migrações após ${elapsed}ms (timeout: ${timeoutMs}ms). Outra réplica pode estar em processo de migração.`
      );
      (err as any).code = 'MIGRATION_LOCK_TIMEOUT';
      throw err;
    }

    console.log(
      `[Database] Lock de migração em uso por outra réplica. Aguardando ${pollIntervalMs}ms (${elapsed}ms/${timeoutMs}ms decorridos)...`
    );
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

/**
 * Libera o Advisory Lock de sessão no PostgreSQL.
 */
export async function releaseMigrationLock(client: PoolClient): Promise<boolean> {
  const lockIdStr = WITIQUETAS_MIGRATION_LOCK_ID.toString();
  const res = await client.query<{ unlocked: boolean }>(
    'SELECT pg_advisory_unlock($1::bigint) AS unlocked',
    [lockIdStr]
  );
  const unlocked = res.rows[0]?.unlocked === true;
  if (unlocked) {
    console.log(`[Database] Advisory Lock de migração liberado com sucesso (Lock ID: ${lockIdStr}).`);
  } else {
    console.warn(`[Database] Aviso: pg_advisory_unlock retornou false para o Lock ID ${lockIdStr} (lock não pertencia a esta sessão ou já havia sido liberado).`);
  }
  return unlocked;
}

export interface MigrationExecutionResult {
  applied: string[];
  skipped: string[];
  totalTimeMs: number;
}

/**
 * Executa as migrations com verificação de idempotência, imutabilidade por checksum e transações dedicadas.
 */
export async function executeMigrationsWithControl(
  client: PoolClient,
  migrations: Array<{ filename: string; sql: string }>
): Promise<MigrationExecutionResult> {
  await ensureSchemaMigrationsTable(client);
  const appliedMigrations = await getAppliedMigrations(client);

  const applied: string[] = [];
  const skipped: string[] = [];
  const overallStart = Date.now();

  for (const m of migrations) {
    const currentChecksum = calculateMigrationChecksum(m.sql);
    const existing = appliedMigrations.get(m.filename);

    if (existing) {
      if (existing.checksum !== currentChecksum) {
        const errorMsg = `[Database] MIGRATION_CHECKSUM_MISMATCH: A migration "${m.filename}" já aplicada possui checksum divergente do arquivo local! Registrado: ${existing.checksum}, Local: ${currentChecksum}. Migrations aplicadas são imutáveis.`;
        console.error(errorMsg);
        const err = new Error(errorMsg);
        (err as any).code = 'MIGRATION_CHECKSUM_MISMATCH';
        (err as any).filename = m.filename;
        (err as any).recordedChecksum = existing.checksum;
        (err as any).currentChecksum = currentChecksum;
        throw err;
      }

      console.log(`[Database] Migration "${m.filename}" já aplicada anteriormente com sucesso. Ignorando.`);
      skipped.push(m.filename);
      continue;
    }

    // Executa a migration pendente em transação atômica dedicada
    console.log(`[Database] Aplicando migration pendente "${m.filename}" (checksum: ${currentChecksum.slice(0, 8)}...)...`);
    const migStart = Date.now();
    try {
      await client.query('BEGIN');
      await client.query(m.sql);
      const executionTimeMs = Date.now() - migStart;
      await client.query(
        'INSERT INTO schema_migrations (filename, checksum, execution_time_ms) VALUES ($1, $2, $3)',
        [m.filename, currentChecksum, executionTimeMs]
      );
      await client.query('COMMIT');

      console.log(`[Database] Migration "${m.filename}" aplicada com sucesso em ${executionTimeMs}ms.`);
      applied.push(m.filename);
      appliedMigrations.set(m.filename, {
        id: -1,
        filename: m.filename,
        checksum: currentChecksum,
        applied_at: new Date(),
        execution_time_ms: executionTimeMs,
      });
    } catch (migErr: any) {
      console.error(`[Database] Falha crítica ao executar migration "${m.filename}". Realizando ROLLBACK da transação: ${migErr.message}`);
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr: any) {
        console.error(`[Database] Erro ao executar ROLLBACK: ${rollbackErr.message}`);
      }
      throw migErr;
    }
  }

  return {
    applied,
    skipped,
    totalTimeMs: Date.now() - overallStart,
  };
}

export interface InitDatabaseOptions extends DbRetryOptions {
  migrationLockTimeoutMs?: number;
  migrationLockPollIntervalMs?: number;
  skipMigrations?: boolean;
}

/**
 * Inicialização e migração defensiva de tabelas no PostgreSQL com proteção de concorrência por Advisory Lock.
 */
export async function initDatabase(options?: InitDatabaseOptions): Promise<void> {
  if (!pgPool) {
    if (isProduction) {
      console.error('[Database] FATAL: DATABASE_URL não configurada em produção.');
      process.exit(1);
    }
    console.log('[Database] DATABASE_URL não configurada em ambiente dev/test. Operando com storage em memória para testes.');
    return;
  }

  let client: PoolClient | null = null;
  let lockAcquired = false;

  try {
    client = await connectWithRetry(pgPool, options);

    if (!options?.skipMigrations) {
      // 1. Adquire Advisory Lock de sessão exclusivo na mesma conexão dedicada
      await acquireMigrationLock(client, {
        timeoutMs: options?.migrationLockTimeoutMs,
        pollIntervalMs: options?.migrationLockPollIntervalMs,
      });
      lockAcquired = true;

      // 2. Executa as migrations com controle de histórico e atomicidade
      const migrations = getMigrationsList();
      const result = await executeMigrationsWithControl(client, migrations);
      console.log(
        `[Database] Ciclo de migrações concluído: ${result.applied.length} aplicadas, ${result.skipped.length} já presentes (${result.totalTimeMs}ms).`
      );
    }

    // 3. Executa o bootstrap idempotente de administração e RBAC
    const { bootstrapAdminData } = await import('./services/adminBootstrapService.js');
    await bootstrapAdminData();
  } catch (err: any) {
    console.error(`[Database] Erro ao inicializar esquema no PostgreSQL: ${err.message}`);
    if (isProduction) {
      console.error('[Database] FATAL: Falha crítica no bootstrap do banco de dados em produção.');
      process.exit(1);
    }
    throw err;
  } finally {
    if (lockAcquired && client) {
      try {
        await releaseMigrationLock(client);
      } catch (unlockErr: any) {
        console.warn(`[Database] Falha ao liberar advisory lock de migrações: ${unlockErr.message}`);
      }
    }
    if (client) {
      client.release();
    }
  }
}

