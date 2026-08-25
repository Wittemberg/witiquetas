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
