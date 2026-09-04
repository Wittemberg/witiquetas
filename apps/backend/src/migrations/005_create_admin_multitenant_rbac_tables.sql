-- 005_create_admin_multitenant_rbac_tables.sql
-- FASE 5 — PACOTE 5.1: Fundação de Administração, Multiempresa e RBAC
-- Isolamento multi-tenant estrito no banco de dados com chaves compostas e constraints relacionais

-- 1. COMPANIES (Empresas / Tenants)
CREATE TABLE IF NOT EXISTS companies (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  legal_name VARCHAR(255),
  document VARCHAR(32),
  slug VARCHAR(128) UNIQUE NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_companies_status ON companies (status);
CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies (slug);

-- 2. USERS (Usuários vinculados a empresa com email único global)
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_users_company_id UNIQUE (company_id, id)
);
CREATE INDEX IF NOT EXISTS idx_users_company_id ON users (company_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

-- 3. ROLES (Papéis do sistema/empresa - tenant-scoped com FK para company_id)
CREATE TABLE IF NOT EXISTS roles (
  id VARCHAR(64) PRIMARY KEY,
  company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_roles_company_code UNIQUE (company_id, code),
  CONSTRAINT uq_roles_company_id UNIQUE (company_id, id)
);
CREATE INDEX IF NOT EXISTS idx_roles_company_id ON roles (company_id);
CREATE INDEX IF NOT EXISTS idx_roles_code ON roles (code);

-- 4. PERMISSIONS (Catálogo canônico imutável de permissões da plataforma)
CREATE TABLE IF NOT EXISTS permissions (
  code VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(64) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_permissions_category ON permissions (category);

-- 5. ROLE_PERMISSIONS (Mapeamento de permissões aos papéis)
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id VARCHAR(64) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_code VARCHAR(64) NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_code)
);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions (role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_code ON role_permissions (permission_code);

-- 6. USER_ROLES (Vínculo de papéis a usuários com restrição relacional cross-company estrita)
-- Constraint de FK composta garante que (company_id, user_id) e (company_id, role_id)
-- pertençam obrigatoriamente à MESMA empresa, impossibilitando user da Empresa A ter role da Empresa B no banco!
CREATE TABLE IF NOT EXISTS user_roles (
  company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL,
  role_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (company_id, user_id) REFERENCES users(company_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (company_id, role_id) REFERENCES roles(company_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_roles_company_id ON user_roles (company_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles (role_id);

-- 7. ROLE_NICHES (Restrição seletiva de nichos permitidos por papel)
CREATE TABLE IF NOT EXISTS role_niches (
  role_id VARCHAR(64) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  niche_id VARCHAR(64) NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (role_id, niche_id)
);
CREATE INDEX IF NOT EXISTS idx_role_niches_role_id ON role_niches (role_id);

-- 8. COMPANY_NICHES (Nichos operacionais habilitados por empresa)
CREATE TABLE IF NOT EXISTS company_niches (
  company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  niche_id VARCHAR(64) NOT NULL,
  state VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, niche_id)
);
CREATE INDEX IF NOT EXISTS idx_company_niches_company_id ON company_niches (company_id);

-- 9. COMPANY_NICHE_ELEMENTS (Elementos visuais habilitados por nicho e empresa)
CREATE TABLE IF NOT EXISTS company_niche_elements (
  company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  niche_id VARCHAR(64) NOT NULL,
  element_type VARCHAR(64) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, niche_id, element_type)
);
CREATE INDEX IF NOT EXISTS idx_company_niche_elements_company ON company_niche_elements (company_id, niche_id);

-- 10. COMPANY_NICHE_FIELDS (Campos canônicos habilitados por nicho e empresa)
CREATE TABLE IF NOT EXISTS company_niche_fields (
  company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  niche_id VARCHAR(64) NOT NULL,
  canonical_field_id VARCHAR(128) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, niche_id, canonical_field_id)
);
CREATE INDEX IF NOT EXISTS idx_company_niche_fields_company ON company_niche_fields (company_id, niche_id);
