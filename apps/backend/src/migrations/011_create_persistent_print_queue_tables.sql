-- Migration: 011_create_persistent_print_queue_tables.sql
-- Tabela Central de Jobs de Impressão Persistentes
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

-- Índices de Alta Performance para Fila e Claim
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

-- Tabela Imutável de Auditoria de Eventos e Transições de Impressão
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
