-- Migration 001: Criar tabela de persistencia de agentes locais e tokens de autenticacao daemon
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
