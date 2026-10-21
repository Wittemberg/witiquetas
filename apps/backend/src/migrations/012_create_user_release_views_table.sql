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
