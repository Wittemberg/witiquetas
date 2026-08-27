-- Migration: 004_create_print_job_batches_tables.sql
-- Tabela de Lotes de Impressão (PrintJobBatches)
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

-- Tabela de Itens de Lote de Impressão (PrintJobBatchItems)
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
