-- 010_create_printers_table.sql
-- FASE 5 — PACOTE 5.7: Governança de Impressoras e Agentes Locais
-- Persistência relacional de impressoras com isolamento multi-tenant estrito

-- 1. Garante constraint unique composta em agents (company_id, id) para FK same-tenant
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_agents_company_id'
  ) THEN
    ALTER TABLE agents ADD CONSTRAINT uq_agents_company_id UNIQUE (company_id, id);
  END IF;
END $$;

-- 2. Tabela de Impressoras Físicas por Tenant
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

-- 3. Índices de consulta e isolamento
CREATE INDEX IF NOT EXISTS idx_printers_company_id ON printers (company_id);
CREATE INDEX IF NOT EXISTS idx_printers_status ON printers (company_id, status);
CREATE INDEX IF NOT EXISTS idx_printers_agent_id ON printers (company_id, agent_id);

-- 4. Índice parcial único: no máximo 1 impressora default por tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_printers_company_default ON printers (company_id) WHERE is_default = TRUE;
