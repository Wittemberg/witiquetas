-- Migration 006: Credenciais de Autenticação e Tabela de Sessões Seguras

-- 1. Adiciona coluna de hash de senha na tabela de usuários
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- 2. Cria tabela de sessões server-side com isolamento tenant composto
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
