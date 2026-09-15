-- 009_create_integrations_and_mappings_tables.sql
-- FASE 5 — PACOTE 5.6: Fundação de Integrações, Manifests e Mapeamento de Campos
-- Isolamento multi-tenant estrito com chaves compostas e integridade referencial

-- 1. INTEGRATIONS (Instâncias de integração por tenant)
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

-- 2. INTEGRATION_FIELD_MAPPINGS (Mapeamentos De-Para declarativos)
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
