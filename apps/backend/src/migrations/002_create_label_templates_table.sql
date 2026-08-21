-- Migration 002: Tabela label_templates para ciclo de vida real dos modelos de etiquetas

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
