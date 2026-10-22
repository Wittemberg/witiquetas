CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NULL,
  user_name VARCHAR(255) NULL,
  user_email VARCHAR(255) NULL,
  action VARCHAR(64) NOT NULL,
  category VARCHAR(32) NOT NULL,
  severity VARCHAR(16) NOT NULL DEFAULT 'INFO',
  target_id VARCHAR(128) NULL,
  target_type VARCHAR(64) NULL,
  details JSONB NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_company_created ON admin_audit_logs (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_company_category ON admin_audit_logs (company_id, category);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_company_action ON admin_audit_logs (company_id, action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_company_user ON admin_audit_logs (company_id, user_id);
