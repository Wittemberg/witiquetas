import { pgPool } from '../db.js';
import {
  NICHES,
  getNicheToolboxConfig,
  getIntegrationFieldsByNiche,
  SYSTEM_FIELDS,
} from '@witiquetas/label-schema';
import type {
  CompanyDTO,
  CreateCompanyDTO,
  UpdateCompanyDTO,
  UserDTO,
  CreateUserDTO,
  UpdateUserDTO,
  RoleDTO,
  CreateRoleDTO,
  PermissionCatalogItemDTO,
  CompanyNicheConfigDTO,
  CompanyElementConfigDTO,
  CompanyFieldConfigDTO,
  IntegrationDTO,
  CreateIntegrationDTO,
  UpdateIntegrationDTO,
  IntegrationFieldMappingDTO,
  SetIntegrationMappingsItemDTO,
} from '@witiquetas/contracts';

// ==========================================
// ==========================================
// CANONICAL PERMISSION CATALOG (25 PERMISSÕES OFICIAIS)
// ==========================================
export const CANONICAL_PERMISSIONS: PermissionCatalogItemDTO[] = [
  { code: 'company.view', name: 'Visualizar Empresa', description: 'Visualizar dados e configurações da empresa', category: 'Empresa' },
  { code: 'company.manage', name: 'Gerenciar Empresa', description: 'Cadastrar e atualizar dados da empresa e parâmetros', category: 'Empresa' },
  { code: 'niches.view', name: 'Visualizar Nichos', description: 'Visualizar nichos operacionais configurados', category: 'Nichos' },
  { code: 'niches.manage', name: 'Gerenciar Nichos', description: 'Habilitar ou desabilitar nichos na empresa', category: 'Nichos' },
  { code: 'elements.view', name: 'Visualizar Elementos', description: 'Visualizar elementos permitidos por nicho', category: 'Elementos' },
  { code: 'elements.manage', name: 'Gerenciar Elementos', description: 'Configurar matriz de elementos por nicho', category: 'Elementos' },
  { code: 'integrations.view', name: 'Visualizar Integrações', description: 'Visualizar conectores de ERP e integrações', category: 'Integrações' },
  { code: 'integrations.manage', name: 'Gerenciar Integrações', description: 'Configurar mapeamento de campos e provedores ERP', category: 'Integrações' },
  { code: 'users.view', name: 'Visualizar Usuários', description: 'Visualizar lista de usuários da empresa', category: 'Usuários' },
  { code: 'users.manage', name: 'Gerenciar Usuários', description: 'Criar, editar e alterar status de usuários', category: 'Usuários' },
  { code: 'roles.view', name: 'Visualizar Papéis', description: 'Visualizar papéis de acesso e permissões', category: 'Papéis' },
  { code: 'roles.manage', name: 'Gerenciar Papéis', description: 'Criar e parametrizar papéis e permissões', category: 'Papéis' },
  { code: 'templates.view', name: 'Visualizar Modelos', description: 'Listar e abrir modelos de etiquetas', category: 'Modelos' },
  { code: 'templates.create', name: 'Criar Modelos', description: 'Criar novos modelos de etiquetas', category: 'Modelos' },
  { code: 'templates.edit', name: 'Editar Modelos', description: 'Salvar alterações em modelos de etiquetas', category: 'Modelos' },
  { code: 'templates.delete', name: 'Excluir Modelos', description: 'Remover modelos de etiquetas', category: 'Modelos' },
  { code: 'print.execute', name: 'Executar Impressão', description: 'Disparar trabalhos de impressão para impressoras', category: 'Impressão' },
  { code: 'print.history', name: 'Histórico de Impressão', description: 'Visualizar histórico e status de lotes e trabalhos', category: 'Impressão' },
  { code: 'printers.view', name: 'Visualizar Impressoras', description: 'Listar impressoras cadastradas e descobertas', category: 'Impressoras' },
  { code: 'printers.manage', name: 'Gerenciar Impressoras', description: 'Cadastrar, parear e configurar impressoras', category: 'Impressoras' },
  { code: 'agents.view', name: 'Visualizar Agentes', description: 'Visualizar agentes locais de impressão conectados', category: 'Agentes' },
  { code: 'agents.manage', name: 'Gerenciar Agentes', description: 'Parear, revogar e gerenciar agentes locais', category: 'Agentes' },
  { code: 'audit.view', name: 'Visualizar Auditoria', description: 'Consultar trilha de auditoria e logs de segurança', category: 'Auditoria' },
  { code: 'devcontrol.view', name: 'Visualizar DevControl', description: 'Visualizar métricas e overview do Development Control Center', category: 'Governança' },
  { code: 'devcontrol.manage', name: 'Gerenciar DevControl', description: 'Executar comandos e configurações no DevControl', category: 'Governança' },
];

/**
 * Catálogo das 23 permissões administráveis pelo tenant (exclui permissões de plataforma do DevControl).
 * 25 = catálogo completo da plataforma
 * 23 = catálogo administrável pelo tenant
 */
export const TENANT_MANAGEABLE_PERMISSIONS: PermissionCatalogItemDTO[] = CANONICAL_PERMISSIONS.filter(
  (p) => !p.code.startsWith('devcontrol.')
);

// Stores em memória para testes offline e execução sem PostgreSQL (garantidos via globalThis contra dual-module hazard)
const g = globalThis as any;
g.__WIT_ADMIN_MEM_COMPANIES__ = g.__WIT_ADMIN_MEM_COMPANIES__ || new Map<string, CompanyDTO>();
g.__WIT_ADMIN_MEM_USERS__ = g.__WIT_ADMIN_MEM_USERS__ || new Map<string, UserDTO>();
g.__WIT_ADMIN_MEM_ROLES__ = g.__WIT_ADMIN_MEM_ROLES__ || new Map<string, RoleDTO>();
g.__WIT_ADMIN_MEM_ROLE_PERMS__ = g.__WIT_ADMIN_MEM_ROLE_PERMS__ || new Set<string>();
g.__WIT_ADMIN_MEM_USER_ROLES__ = g.__WIT_ADMIN_MEM_USER_ROLES__ || new Set<string>();
g.__WIT_ADMIN_MEM_ROLE_NICHES__ = g.__WIT_ADMIN_MEM_ROLE_NICHES__ || new Map<string, boolean>();
g.__WIT_ADMIN_MEM_COMPANY_NICHES__ = g.__WIT_ADMIN_MEM_COMPANY_NICHES__ || new Map<string, CompanyNicheConfigDTO>();
g.__WIT_ADMIN_MEM_COMPANY_ELEMENTS__ = g.__WIT_ADMIN_MEM_COMPANY_ELEMENTS__ || new Map<string, CompanyElementConfigDTO>();
g.__WIT_ADMIN_MEM_COMPANY_FIELDS__ = g.__WIT_ADMIN_MEM_COMPANY_FIELDS__ || new Map<string, CompanyFieldConfigDTO>();
g.__WIT_ADMIN_MEM_USER_PASSWORDS__ = g.__WIT_ADMIN_MEM_USER_PASSWORDS__ || new Map<string, string>();
g.__WIT_ADMIN_MEM_INTEGRATIONS__ = g.__WIT_ADMIN_MEM_INTEGRATIONS__ || new Map<string, IntegrationDTO>();
g.__WIT_ADMIN_MEM_INTEGRATION_MAPPINGS__ = g.__WIT_ADMIN_MEM_INTEGRATION_MAPPINGS__ || new Map<string, IntegrationFieldMappingDTO>();

export const memCompanies: Map<string, CompanyDTO> = g.__WIT_ADMIN_MEM_COMPANIES__;
export const memUsers: Map<string, UserDTO> = g.__WIT_ADMIN_MEM_USERS__;
export const memRoles: Map<string, RoleDTO> = g.__WIT_ADMIN_MEM_ROLES__;
export const memRolePermissions: Set<string> = g.__WIT_ADMIN_MEM_ROLE_PERMS__;
export const memUserRoles: Set<string> = g.__WIT_ADMIN_MEM_USER_ROLES__;
export const memRoleNiches: Map<string, boolean> = g.__WIT_ADMIN_MEM_ROLE_NICHES__;
export const memCompanyNiches: Map<string, CompanyNicheConfigDTO> = g.__WIT_ADMIN_MEM_COMPANY_NICHES__;
export const memCompanyNicheElements: Map<string, CompanyElementConfigDTO> = g.__WIT_ADMIN_MEM_COMPANY_ELEMENTS__;
export const memCompanyNicheFields: Map<string, CompanyFieldConfigDTO> = g.__WIT_ADMIN_MEM_COMPANY_FIELDS__;
export const memUserPasswords: Map<string, string> = g.__WIT_ADMIN_MEM_USER_PASSWORDS__;
export const memIntegrations: Map<string, IntegrationDTO> = g.__WIT_ADMIN_MEM_INTEGRATIONS__;
export const memIntegrationMappings: Map<string, IntegrationFieldMappingDTO> = g.__WIT_ADMIN_MEM_INTEGRATION_MAPPINGS__;

export function clearIntegrationMemoryStores(): void {
  memIntegrations.clear();
  memIntegrationMappings.clear();
}

export function clearAdminMemoryStores(): void {
  memCompanies.clear();
  memUsers.clear();
  memRoles.clear();
  memRolePermissions.clear();
  memUserRoles.clear();
  memRoleNiches.clear();
  memCompanyNiches.clear();
  memCompanyNicheElements.clear();
  memCompanyNicheFields.clear();
  memUserPasswords.clear();
  clearIntegrationMemoryStores();
}

// ==========================================
// 1. COMPANY REPOSITORY
// ==========================================
export const CompanyRepository = {
  async create(data: CreateCompanyDTO): Promise<CompanyDTO> {
    const id = data.id || `comp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const status = data.status || 'ACTIVE';
    const now = new Date().toISOString();

    if (pgPool) {
      const res = await pgPool.query(
        `INSERT INTO companies (id, name, legal_name, document, slug, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, name, legal_name AS "legalName", document, slug, status, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [id, data.name, data.legalName || null, data.document || null, data.slug, status, now, now]
      );
      return res.rows[0];
    }

    // Validação slug unique em memória
    for (const comp of memCompanies.values()) {
      if (comp.slug === data.slug) {
        throw new Error(`unique_violation: company with slug '${data.slug}' already exists`);
      }
    }

    const company: CompanyDTO = {
      id,
      name: data.name,
      legalName: data.legalName,
      document: data.document,
      slug: data.slug,
      status,
      createdAt: now,
      updatedAt: now,
    };
    memCompanies.set(id, company);
    return company;
  },

  async findById(id: string): Promise<CompanyDTO | null> {
    if (pgPool) {
      const res = await pgPool.query(
        `SELECT id, name, legal_name AS "legalName", document, slug, status, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM companies WHERE id = $1`,
        [id]
      );
      return res.rows[0] || null;
    }
    return memCompanies.get(id) || null;
  },

  async findBySlug(slug: string): Promise<CompanyDTO | null> {
    if (pgPool) {
      const res = await pgPool.query(
        `SELECT id, name, legal_name AS "legalName", document, slug, status, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM companies WHERE slug = $1`,
        [slug]
      );
      return res.rows[0] || null;
    }
    for (const comp of memCompanies.values()) {
      if (comp.slug === slug) return comp;
    }
    return null;
  },

  async list(): Promise<CompanyDTO[]> {
    if (pgPool) {
      const res = await pgPool.query(
        `SELECT id, name, legal_name AS "legalName", document, slug, status, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM companies ORDER BY created_at ASC`
      );
      return res.rows;
    }
    return Array.from(memCompanies.values());
  },

  async update(id: string, data: UpdateCompanyDTO): Promise<CompanyDTO | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    const now = new Date().toISOString();

    if (pgPool) {
      const res = await pgPool.query(
        `UPDATE companies
         SET name = COALESCE($1, name),
             legal_name = COALESCE($2, legal_name),
             document = COALESCE($3, document),
             slug = COALESCE($4, slug),
             status = COALESCE($5, status),
             updated_at = $6
         WHERE id = $7
         RETURNING id, name, legal_name AS "legalName", document, slug, status, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [data.name ?? null, data.legalName ?? null, data.document ?? null, data.slug ?? null, data.status ?? null, now, id]
      );
      return res.rows[0] || null;
    }

    if (data.slug && data.slug !== existing.slug) {
      for (const comp of memCompanies.values()) {
        if (comp.id !== id && comp.slug === data.slug) {
          throw new Error(`unique_violation: company with slug '${data.slug}' already exists`);
        }
      }
    }

    const updated: CompanyDTO = {
      ...existing,
      name: data.name ?? existing.name,
      legalName: data.legalName ?? existing.legalName,
      document: data.document ?? existing.document,
      slug: data.slug ?? existing.slug,
      status: data.status ?? existing.status,
      updatedAt: now,
    };
    memCompanies.set(id, updated);
    return updated;
  },

  async delete(id: string): Promise<boolean> {
    if (pgPool) {
      const res = await pgPool.query('DELETE FROM companies WHERE id = $1', [id]);
      return (res.rowCount || 0) > 0;
    }
    if (!memCompanies.has(id)) return false;
    memCompanies.delete(id);
    // Cascade delete in memory
    for (const [uid, u] of memUsers.entries()) {
      if (u.companyId === id) memUsers.delete(uid);
    }
    for (const [rid, r] of memRoles.entries()) {
      if (r.companyId === id) memRoles.delete(rid);
    }
    for (const key of Array.from(memUserRoles)) {
      if (key.startsWith(`${id}:`)) memUserRoles.delete(key);
    }
    for (const key of Array.from(memCompanyNiches.keys())) {
      if (key.startsWith(`${id}:`)) memCompanyNiches.delete(key);
    }
    for (const key of Array.from(memCompanyNicheElements.keys())) {
      if (key.startsWith(`${id}:`)) memCompanyNicheElements.delete(key);
    }
    for (const key of Array.from(memCompanyNicheFields.keys())) {
      if (key.startsWith(`${id}:`)) memCompanyNicheFields.delete(key);
    }
    return true;
  },
};

// ==========================================
// 2. USER REPOSITORY
// ==========================================
export const UserRepository = {
  async create(data: CreateUserDTO & { isDccMaster?: boolean }): Promise<UserDTO> {
    const id = data.id || `usr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const status = data.status || 'ACTIVE';
    const isDccMaster = Boolean(data.isDccMaster);
    const now = new Date().toISOString();

    // Validação da empresa existente
    const comp = await CompanyRepository.findById(data.companyId);
    if (!comp) {
      throw new Error(`foreign_key_violation: company '${data.companyId}' not found`);
    }

    if (pgPool) {
      const res = await pgPool.query(
        `INSERT INTO users (id, company_id, name, email, status, is_dcc_master, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, company_id AS "companyId", name, email, status, is_dcc_master AS "isDccMaster", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [id, data.companyId, data.name, data.email.toLowerCase().trim(), status, isDccMaster, now, now]
      );
      return res.rows[0];
    }

    const emailNorm = data.email.toLowerCase().trim();
    for (const u of memUsers.values()) {
      if (u.email === emailNorm) {
        throw new Error(`unique_violation: user with email '${emailNorm}' already exists`);
      }
    }

    const user: UserDTO = {
      id,
      companyId: data.companyId,
      name: data.name,
      email: emailNorm,
      status,
      isDccMaster,
      createdAt: now,
      updatedAt: now,
    };
    memUsers.set(id, user);
    return user;
  },

  async findById(id: string): Promise<UserDTO | null> {
    if (pgPool) {
      const res = await pgPool.query(
        `SELECT id, company_id AS "companyId", name, email, status, is_dcc_master AS "isDccMaster", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM users WHERE id = $1`,
        [id]
      );
      return res.rows[0] || null;
    }
    return memUsers.get(id) || null;
  },

  async findByEmail(email: string): Promise<UserDTO | null> {
    const emailNorm = email.toLowerCase().trim();
    if (pgPool) {
      const res = await pgPool.query(
        `SELECT id, company_id AS "companyId", name, email, status, is_dcc_master AS "isDccMaster", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM users WHERE email = $1`,
        [emailNorm]
      );
      return res.rows[0] || null;
    }
    for (const u of memUsers.values()) {
      if (u.email === emailNorm) return u;
    }
    return null;
  },

  async setPassword(userId: string, passwordHash: string): Promise<void> {
    const now = new Date().toISOString();
    if (pgPool) {
      await pgPool.query(
        `UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3`,
        [passwordHash, now, userId]
      );
      return;
    }
    const user = memUsers.get(userId);
    if (!user) {
      throw new Error(`user_not_found: user '${userId}' not found`);
    }
    memUserPasswords.set(userId, passwordHash);
  },

  async setDccMaster(userId: string, isMaster: boolean): Promise<void> {
    const now = new Date().toISOString();
    if (pgPool) {
      await pgPool.query(
        `UPDATE users SET is_dcc_master = $1, updated_at = $2 WHERE id = $3`,
        [isMaster, now, userId]
      );
      return;
    }
    const user = memUsers.get(userId);
    if (user) {
      user.isDccMaster = isMaster;
      user.updatedAt = now;
    }
  },

  async findByEmailWithPassword(email: string): Promise<(UserDTO & { passwordHash: string | null }) | null> {
    const emailNorm = email.toLowerCase().trim();
    if (pgPool) {
      const res = await pgPool.query(
        `SELECT id, company_id AS "companyId", name, email, status, is_dcc_master AS "isDccMaster", password_hash AS "passwordHash", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM users WHERE email = $1`,
        [emailNorm]
      );
      return res.rows[0] || null;
    }
    for (const u of memUsers.values()) {
      if (u.email === emailNorm) {
        return {
          ...u,
          passwordHash: memUserPasswords.get(u.id) || null,
        };
      }
    }
    return null;
  },

  async findByIdWithPassword(id: string): Promise<(UserDTO & { passwordHash: string | null }) | null> {
    if (pgPool) {
      const res = await pgPool.query(
        `SELECT id, company_id AS "companyId", name, email, status, is_dcc_master AS "isDccMaster", password_hash AS "passwordHash", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM users WHERE id = $1`,
        [id]
      );
      return res.rows[0] || null;
    }
    const u = memUsers.get(id);
    if (!u) return null;
    return {
      ...u,
      passwordHash: memUserPasswords.get(id) || null,
    };
  },

  async listByCompany(companyId: string): Promise<UserDTO[]> {
    if (pgPool) {
      const res = await pgPool.query(
        `SELECT id, company_id AS "companyId", name, email, status, is_dcc_master AS "isDccMaster", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM users WHERE company_id = $1 ORDER BY created_at ASC`,
        [companyId]
      );
      return res.rows;
    }
    return Array.from(memUsers.values()).filter((u) => u.companyId === companyId);
  },

  async update(id: string, data: UpdateUserDTO): Promise<UserDTO | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    const now = new Date().toISOString();

    if (pgPool) {
      const res = await pgPool.query(
        `UPDATE users
         SET name = COALESCE($1, name),
             email = COALESCE($2, email),
             status = COALESCE($3, status),
             updated_at = $4
         WHERE id = $5
         RETURNING id, company_id AS "companyId", name, email, status, is_dcc_master AS "isDccMaster", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [data.name ?? null, data.email ? data.email.toLowerCase().trim() : null, data.status ?? null, now, id]
      );
      return res.rows[0] || null;
    }

    if (data.email) {
      const emailNorm = data.email.toLowerCase().trim();
      for (const u of memUsers.values()) {
        if (u.id !== id && u.email === emailNorm) {
          throw new Error(`unique_violation: user with email '${emailNorm}' already exists`);
        }
      }
      existing.email = emailNorm;
    }
    if (data.name) existing.name = data.name;
    if (data.status) existing.status = data.status;
    existing.updatedAt = now;
    memUsers.set(id, existing);
    return existing;
  },

  async countActiveAdmins(companyId: string): Promise<number> {
    if (pgPool) {
      const res = await pgPool.query(
        `SELECT COUNT(DISTINCT u.id)::int AS count
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id AND ur.company_id = u.company_id
         JOIN roles r ON r.id = ur.role_id AND r.company_id = ur.company_id
         WHERE u.company_id = $1 AND u.status = 'ACTIVE' AND r.code = 'ADMIN'`,
        [companyId]
      );
      return res.rows[0]?.count || 0;
    }

    let count = 0;
    for (const u of memUsers.values()) {
      if (u.companyId === companyId && u.status === 'ACTIVE') {
        const roles = await RoleRepository.getUserRoles(companyId, u.id);
        if (roles.some((r) => r.code === 'ADMIN')) {
          count++;
        }
      }
    }
    return count;
  },

  async delete(companyId: string, id: string): Promise<boolean> {
    if (pgPool) {
      const res = await pgPool.query('DELETE FROM users WHERE id = $1 AND company_id = $2', [id, companyId]);
      return (res.rowCount || 0) > 0;
    }
    const existing = memUsers.get(id);
    if (!existing || existing.companyId !== companyId) return false;
    memUsers.delete(id);
    memUserPasswords.delete(id);
    for (const key of Array.from(memUserRoles)) {
      if (key.startsWith(`${companyId}:${id}:`)) {
        memUserRoles.delete(key);
      }
    }
    return true;
  },
};

// ==========================================
// 3. ROLE & PERMISSION REPOSITORY
// ==========================================
export const RoleRepository = {
  async create(data: CreateRoleDTO): Promise<RoleDTO> {
    const id = data.id || `role-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    const isSystem = data.isSystem ?? false;

    // Verificar se empresa existe
    const comp = await CompanyRepository.findById(data.companyId);
    if (!comp) {
      throw new Error(`foreign_key_violation: company '${data.companyId}' not found`);
    }

    if (pgPool) {
      const res = await pgPool.query(
        `INSERT INTO roles (id, company_id, code, name, description, is_system, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, company_id AS "companyId", code, name, description, is_system AS "isSystem", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [id, data.companyId, data.code.toUpperCase().trim(), data.name, data.description || null, isSystem, now, now]
      );
      return res.rows[0];
    }

    const codeNorm = data.code.toUpperCase().trim();
    for (const r of memRoles.values()) {
      if (r.companyId === data.companyId && r.code === codeNorm) {
        throw new Error(`unique_violation: role '${codeNorm}' already exists for company '${data.companyId}'`);
      }
    }

    const role: RoleDTO = {
      id,
      companyId: data.companyId,
      code: codeNorm,
      name: data.name,
      description: data.description,
      isSystem,
      createdAt: now,
      updatedAt: now,
    };
    memRoles.set(id, role);
    return role;
  },

  async findById(id: string): Promise<RoleDTO | null> {
    if (pgPool) {
      const res = await pgPool.query(
        `SELECT id, company_id AS "companyId", code, name, description, is_system AS "isSystem", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM roles WHERE id = $1`,
        [id]
      );
      return res.rows[0] || null;
    }
    return memRoles.get(id) || null;
  },

  async listByCompany(companyId: string): Promise<RoleDTO[]> {
    if (pgPool) {
      const res = await pgPool.query(
        `SELECT id, company_id AS "companyId", code, name, description, is_system AS "isSystem", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM roles WHERE company_id = $1 ORDER BY created_at ASC`,
        [companyId]
      );
      return res.rows;
    }
    return Array.from(memRoles.values()).filter((r) => r.companyId === companyId);
  },

  async findByCode(companyId: string, code: string): Promise<RoleDTO | null> {
    const codeNorm = code.toUpperCase().trim();
    if (pgPool) {
      const res = await pgPool.query(
        `SELECT id, company_id AS "companyId", code, name, description, is_system AS "isSystem", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM roles WHERE company_id = $1 AND code = $2`,
        [companyId, codeNorm]
      );
      return res.rows[0] || null;
    }
    for (const r of memRoles.values()) {
      if (r.companyId === companyId && r.code === codeNorm) return r;
    }
    return null;
  },

  async assignPermission(roleId: string, permissionCode: string): Promise<void> {
    const role = await this.findById(roleId);
    if (!role) throw new Error(`foreign_key_violation: role '${roleId}' not found`);

    // Validar se permissionCode é canônico
    const validPerm = CANONICAL_PERMISSIONS.find((p) => p.code === permissionCode);
    if (!validPerm) {
      throw new Error(`invalid_permission: '${permissionCode}' does not exist in canonical catalog`);
    }

    if (pgPool) {
      await pgPool.query(
        `INSERT INTO role_permissions (role_id, permission_code)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [roleId, permissionCode]
      );
      return;
    }
    memRolePermissions.add(`${roleId}:${permissionCode}`);
  },

  async removePermission(roleId: string, permissionCode: string): Promise<void> {
    if (pgPool) {
      await pgPool.query(
        'DELETE FROM role_permissions WHERE role_id = $1 AND permission_code = $2',
        [roleId, permissionCode]
      );
      return;
    }
    memRolePermissions.delete(`${roleId}:${permissionCode}`);
  },

  async getRolePermissions(roleId: string): Promise<string[]> {
    if (pgPool) {
      const res = await pgPool.query(
        'SELECT permission_code AS "permissionCode" FROM role_permissions WHERE role_id = $1',
        [roleId]
      );
      return res.rows.map((r) => r.permissionCode);
    }
    const result: string[] = [];
    const prefix = `${roleId}:`;
    for (const key of memRolePermissions) {
      if (key.startsWith(prefix)) {
        result.push(key.slice(prefix.length));
      }
    }
    return result;
  },

  // USER_ROLES com isolamento multi-tenant estrito
  async assignUserRole(companyId: string, userId: string, roleId: string): Promise<void> {
    const user = await UserRepository.findById(userId);
    if (!user) throw new Error(`user_not_found: user '${userId}' not found`);
    if (user.companyId !== companyId) {
      throw new Error(`cross_tenant_violation: user '${userId}' belongs to company '${user.companyId}', not '${companyId}'`);
    }

    const role = await this.findById(roleId);
    if (!role) throw new Error(`role_not_found: role '${roleId}' not found`);
    if (role.companyId !== companyId) {
      throw new Error(`cross_tenant_violation: role '${roleId}' belongs to company '${role.companyId}', not '${companyId}'`);
    }

    if (pgPool) {
      await pgPool.query(
        `INSERT INTO user_roles (company_id, user_id, role_id)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [companyId, userId, roleId]
      );
      return;
    }
    memUserRoles.add(`${companyId}:${userId}:${roleId}`);
  },

  async removeUserRole(companyId: string, userId: string, roleId: string): Promise<void> {
    if (pgPool) {
      await pgPool.query(
        'DELETE FROM user_roles WHERE company_id = $1 AND user_id = $2 AND role_id = $3',
        [companyId, userId, roleId]
      );
      return;
    }
    memUserRoles.delete(`${companyId}:${userId}:${roleId}`);
  },

  async getUserRoles(companyId: string, userId: string): Promise<RoleDTO[]> {
    if (pgPool) {
      const res = await pgPool.query(
        `SELECT r.id, r.company_id AS "companyId", r.code, r.name, r.description, r.is_system AS "isSystem", r.created_at AS "createdAt", r.updated_at AS "updatedAt"
         FROM roles r
         INNER JOIN user_roles ur ON ur.role_id = r.id AND ur.company_id = r.company_id
         WHERE ur.company_id = $1 AND ur.user_id = $2`,
        [companyId, userId]
      );
      return res.rows;
    }
    const roles: RoleDTO[] = [];
    const prefix = `${companyId}:${userId}:`;
    for (const key of memUserRoles) {
      if (key.startsWith(prefix)) {
        const roleId = key.slice(prefix.length);
        const r = memRoles.get(roleId);
        if (r && r.companyId === companyId) roles.push(r);
      }
    }
    return roles;
  },

  // ROLE_NICHES
  async setRoleNicheAccess(roleId: string, nicheId: string, allowed: boolean): Promise<void> {
    const role = await this.findById(roleId);
    if (!role) throw new Error(`role_not_found: role '${roleId}' not found`);

    if (pgPool) {
      await pgPool.query(
        `INSERT INTO role_niches (role_id, niche_id, allowed)
         VALUES ($1, $2, $3)
         ON CONFLICT (role_id, niche_id) DO UPDATE SET allowed = EXCLUDED.allowed`,
        [roleId, nicheId, allowed]
      );
      return;
    }
    memRoleNiches.set(`${roleId}:${nicheId}`, allowed);
  },

  async getRoleNicheAccess(roleId: string): Promise<Record<string, boolean>> {
    if (pgPool) {
      const res = await pgPool.query(
        'SELECT niche_id AS "nicheId", allowed FROM role_niches WHERE role_id = $1',
        [roleId]
      );
      const map: Record<string, boolean> = {};
      for (const row of res.rows) {
        map[row.nicheId] = row.allowed;
      }
      return map;
    }
    const map: Record<string, boolean> = {};
    const prefix = `${roleId}:`;
    for (const [key, allowed] of memRoleNiches.entries()) {
      if (key.startsWith(prefix)) {
        map[key.slice(prefix.length)] = allowed;
      }
    }
    return map;
  },

  async countUsersWithRole(companyId: string, roleId: string): Promise<number> {
    if (pgPool) {
      const res = await pgPool.query(
        `SELECT COUNT(*)::int AS count
         FROM user_roles
         WHERE company_id = $1 AND role_id = $2`,
        [companyId, roleId]
      );
      return res.rows[0]?.count || 0;
    }

    let count = 0;
    const prefix = `${companyId}:`;
    const suffix = `:${roleId}`;
    for (const key of memUserRoles) {
      if (key.startsWith(prefix) && key.endsWith(suffix)) {
        count++;
      }
    }
    return count;
  },

  async update(companyId: string, roleId: string, data: { name?: string; description?: string }): Promise<RoleDTO | null> {
    const existing = await this.findById(roleId);
    if (!existing || existing.companyId !== companyId) return null;
    const now = new Date().toISOString();

    if (pgPool) {
      const res = await pgPool.query(
        `UPDATE roles
         SET name = COALESCE($1, name),
             description = COALESCE($2, description),
             updated_at = $3
         WHERE id = $4 AND company_id = $5
         RETURNING id, company_id AS "companyId", code, name, description, is_system AS "isSystem", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [data.name ?? null, data.description ?? null, now, roleId, companyId]
      );
      return res.rows[0] || null;
    }

    const updated: RoleDTO = {
      ...existing,
      name: data.name ?? existing.name,
      description: data.description !== undefined ? data.description : existing.description,
      updatedAt: now,
    };
    memRoles.set(roleId, updated);
    return updated;
  },

  async delete(companyId: string, roleId: string): Promise<boolean> {
    const existing = await this.findById(roleId);
    if (!existing || existing.companyId !== companyId) return false;
    if (existing.isSystem) {
      throw new Error(`cannot_delete_system_role: role '${roleId}' is a system role`);
    }

    if (pgPool) {
      const res = await pgPool.query(
        'DELETE FROM roles WHERE id = $1 AND company_id = $2 AND is_system = false',
        [roleId, companyId]
      );
      return (res.rowCount || 0) > 0;
    }

    memRoles.delete(roleId);
    for (const perm of CANONICAL_PERMISSIONS) {
      memRolePermissions.delete(`${roleId}:${perm.code}`);
    }
    for (const key of Array.from(memUserRoles)) {
      if (key.startsWith(`${companyId}:`) && key.endsWith(`:${roleId}`)) {
        memUserRoles.delete(key);
      }
    }
    return true;
  },

  async setRolePermissions(roleId: string, permissions: string[]): Promise<void> {
    const role = await this.findById(roleId);
    if (!role) throw new Error(`role_not_found: role '${roleId}' not found`);

    for (const perm of permissions) {
      if (!CANONICAL_PERMISSIONS.some((p) => p.code === perm)) {
        throw new Error(`invalid_permission: '${perm}' does not exist in canonical catalog`);
      }
    }

    if (pgPool) {
      await pgPool.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
      for (const perm of permissions) {
        await pgPool.query(
          'INSERT INTO role_permissions (role_id, permission_code) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [roleId, perm]
        );
      }
      return;
    }

    for (const perm of CANONICAL_PERMISSIONS) {
      memRolePermissions.delete(`${roleId}:${perm.code}`);
    }
    for (const perm of permissions) {
      memRolePermissions.add(`${roleId}:${perm}`);
    }
  },
};

// ==========================================
// 4. COMPANY CONFIGURATION REPOSITORY
// ==========================================
export const CompanyConfigurationRepository = {
  // NICHES
  async setNicheState(
    companyId: string,
    nicheId: string,
    state: 'ENABLED' | 'DISABLED',
    isDefault?: boolean
  ): Promise<CompanyNicheConfigDTO> {
    const comp = await CompanyRepository.findById(companyId);
    if (!comp) throw new Error(`company_not_found: company '${companyId}' not found`);
    if (!NICHES.some((n) => n.id === nicheId)) {
      throw new Error(`invalid_niche: niche '${nicheId}' does not exist in platform`);
    }

    // Regra: se tentar marcar como default, o nicho precisa ser ENABLED
    let finalState = state;
    if (isDefault === true) {
      finalState = 'ENABLED';
    }

    // Regra de Consistência: Não permitir zero nichos ativos
    if (finalState === 'DISABLED') {
      const existingNiches = await this.getNiches(companyId);
      // Se não houver configuração prévia, todos os 11 estão ativos por padrão.
      const currentActive = existingNiches.length === 0
        ? NICHES.map((n) => n.id)
        : existingNiches.filter((n) => n.state === 'ENABLED').map((n) => n.nicheId);

      const remainingActive = currentActive.filter((id) => id !== nicheId);
      if (remainingActive.length === 0) {
        throw new Error('cannot_disable_all_niches: A empresa deve manter pelo menos 1 nicho habilitado.');
      }

      // Regra: não desativar o nicho padrão
      const currentDefault = existingNiches.find((n) => n.isDefault);
      if (currentDefault && currentDefault.nicheId === nicheId && isDefault !== false) {
        throw new Error('cannot_disable_default_niche: O nicho padrão da empresa não pode ser desativado. Defina outro nicho como padrão antes.');
      }
    }

    const now = new Date().toISOString();

    if (pgPool) {
      if (isDefault === true) {
        // Zera is_default de todos os outros nichos da empresa
        await pgPool.query(
          'UPDATE company_niches SET is_default = FALSE, updated_at = $1 WHERE company_id = $2',
          [now, companyId]
        );
      }

      const res = await pgPool.query(
        `INSERT INTO company_niches (company_id, niche_id, state, is_default, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (company_id, niche_id) DO UPDATE SET
           state = EXCLUDED.state,
           is_default = CASE WHEN $4 IS NULL THEN company_niches.is_default ELSE EXCLUDED.is_default END,
           updated_at = EXCLUDED.updated_at
         RETURNING company_id AS "companyId", niche_id AS "nicheId", state, is_default AS "isDefault", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [companyId, nicheId, finalState, isDefault === true, now, now]
      );
      return res.rows[0];
    }

    // Armazenamento em memória (dev/test)
    if (isDefault === true) {
      const prefix = `${companyId}:`;
      for (const [k, v] of memCompanyNiches.entries()) {
        if (k.startsWith(prefix)) {
          v.isDefault = false;
        }
      }
    }

    const key = `${companyId}:${nicheId}`;
    const existing = memCompanyNiches.get(key);
    const dto: CompanyNicheConfigDTO = {
      companyId,
      nicheId,
      state: finalState,
      isDefault: isDefault !== undefined ? isDefault : existing?.isDefault || false,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
    memCompanyNiches.set(key, dto);
    return dto;
  },

  async setDefaultNiche(companyId: string, nicheId: string): Promise<CompanyNicheConfigDTO> {
    return this.setNicheState(companyId, nicheId, 'ENABLED', true);
  },

  async getNiches(companyId: string): Promise<CompanyNicheConfigDTO[]> {
    if (pgPool) {
      const res = await pgPool.query(
        `SELECT company_id AS "companyId", niche_id AS "nicheId", state, COALESCE(is_default, false) AS "isDefault", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM company_niches WHERE company_id = $1`,
        [companyId]
      );
      return res.rows;
    }
    const list: CompanyNicheConfigDTO[] = [];
    const prefix = `${companyId}:`;
    for (const [key, dto] of memCompanyNiches.entries()) {
      if (key.startsWith(prefix)) list.push(dto);
    }
    return list;
  },

  // ELEMENTS
  async setElementEnabled(companyId: string, nicheId: string, elementType: string, enabled: boolean): Promise<CompanyElementConfigDTO> {
    const comp = await CompanyRepository.findById(companyId);
    if (!comp) throw new Error(`company_not_found: company '${companyId}' not found`);
    if (!NICHES.some((n) => n.id === nicheId)) {
      throw new Error(`invalid_niche: niche '${nicheId}' does not exist in platform`);
    }
    const toolbox = getNicheToolboxConfig(nicheId);
    const validElementTypes = new Set<string>([
      ...toolbox.recommendedTools.map((t) => t.elementType),
      ...toolbox.availableTools.map((t) => t.elementType),
      'text',
      'price',
      'date',
      'barcode',
      'qrcode',
      'line',
      'rectangle',
      'image',
    ]);
    if (!validElementTypes.has(elementType)) {
      throw new Error(`invalid_element: element '${elementType}' is not valid for niche '${nicheId}'`);
    }
    const now = new Date().toISOString();

    if (pgPool) {
      const res = await pgPool.query(
        `INSERT INTO company_niche_elements (company_id, niche_id, element_type, enabled, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (company_id, niche_id, element_type) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at
         RETURNING company_id AS "companyId", niche_id AS "nicheId", element_type AS "elementType", enabled, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [companyId, nicheId, elementType, enabled, now, now]
      );
      return res.rows[0];
    }

    const key = `${companyId}:${nicheId}:${elementType}`;
    const existing = memCompanyNicheElements.get(key);
    const dto: CompanyElementConfigDTO = {
      companyId,
      nicheId,
      elementType,
      enabled,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
    memCompanyNicheElements.set(key, dto);
    return dto;
  },

  async getElements(companyId: string, nicheId?: string): Promise<CompanyElementConfigDTO[]> {
    if (pgPool) {
      let query = `SELECT company_id AS "companyId", niche_id AS "nicheId", element_type AS "elementType", enabled, created_at AS "createdAt", updated_at AS "updatedAt"
                   FROM company_niche_elements WHERE company_id = $1`;
      const params: any[] = [companyId];
      if (nicheId) {
        query += ' AND niche_id = $2';
        params.push(nicheId);
      }
      const res = await pgPool.query(query, params);
      return res.rows;
    }
    const list: CompanyElementConfigDTO[] = [];
    const prefix = nicheId ? `${companyId}:${nicheId}:` : `${companyId}:`;
    for (const [key, dto] of memCompanyNicheElements.entries()) {
      if (key.startsWith(prefix)) list.push(dto);
    }
    return list;
  },

  // FIELDS
  async setFieldConfig(
    companyId: string,
    nicheId: string,
    canonicalFieldId: string,
    config: {
      enabled?: boolean;
      availableForManual?: boolean;
      availableForIntegration?: boolean;
    }
  ): Promise<CompanyFieldConfigDTO> {
    const comp = await CompanyRepository.findById(companyId);
    if (!comp) throw new Error(`company_not_found: company '${companyId}' not found`);
    if (!NICHES.some((n) => n.id === nicheId)) {
      throw new Error(`invalid_niche: niche '${nicheId}' does not exist in platform`);
    }
    const validFields = new Set<string>([
      ...getIntegrationFieldsByNiche(nicheId).map((f) => f.id),
      ...SYSTEM_FIELDS.map((f) => f.id),
    ]);
    if (!validFields.has(canonicalFieldId)) {
      throw new Error(`invalid_canonical_field: field '${canonicalFieldId}' is not valid for niche '${nicheId}'`);
    }

    const isSystemField = SYSTEM_FIELDS.some((f) => f.id === canonicalFieldId);

    // Campos de sistema são mantidos manual: false e integration: false
    const enabled = config.enabled !== undefined ? config.enabled : true;
    const availableForManual = isSystemField ? false : (config.availableForManual !== undefined ? config.availableForManual : true);
    const availableForIntegration = isSystemField ? false : (config.availableForIntegration !== undefined ? config.availableForIntegration : true);

    const now = new Date().toISOString();

    if (pgPool) {
      const res = await pgPool.query(
        `INSERT INTO company_niche_fields (company_id, niche_id, canonical_field_id, enabled, available_for_manual, available_for_integration, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (company_id, niche_id, canonical_field_id) DO UPDATE SET
           enabled = EXCLUDED.enabled,
           available_for_manual = EXCLUDED.available_for_manual,
           available_for_integration = EXCLUDED.available_for_integration,
           updated_at = EXCLUDED.updated_at
         RETURNING company_id AS "companyId", niche_id AS "nicheId", canonical_field_id AS "canonicalFieldId", enabled, available_for_manual AS "availableForManual", available_for_integration AS "availableForIntegration", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [companyId, nicheId, canonicalFieldId, enabled, availableForManual, availableForIntegration, now, now]
      );
      return res.rows[0];
    }

    const key = `${companyId}:${nicheId}:${canonicalFieldId}`;
    const existing = memCompanyNicheFields.get(key);
    const dto: CompanyFieldConfigDTO = {
      companyId,
      nicheId,
      canonicalFieldId,
      enabled,
      availableForManual,
      availableForIntegration,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
    memCompanyNicheFields.set(key, dto);
    return dto;
  },

  async setFieldEnabled(companyId: string, nicheId: string, canonicalFieldId: string, enabled: boolean): Promise<CompanyFieldConfigDTO> {
    return this.setFieldConfig(companyId, nicheId, canonicalFieldId, { enabled });
  },

  async getFields(companyId: string, nicheId?: string): Promise<CompanyFieldConfigDTO[]> {
    if (pgPool) {
      let query = `SELECT company_id AS "companyId", niche_id AS "nicheId", canonical_field_id AS "canonicalFieldId", enabled, COALESCE(available_for_manual, true) AS "availableForManual", COALESCE(available_for_integration, true) AS "availableForIntegration", created_at AS "createdAt", updated_at AS "updatedAt"
                   FROM company_niche_fields WHERE company_id = $1`;
      const params: any[] = [companyId];
      if (nicheId) {
        query += ' AND niche_id = $2';
        params.push(nicheId);
      }
      const res = await pgPool.query(query, params);
      return res.rows;
    }
    const list: CompanyFieldConfigDTO[] = [];
    const prefix = nicheId ? `${companyId}:${nicheId}:` : `${companyId}:`;
    for (const [key, dto] of memCompanyNicheFields.entries()) {
      if (key.startsWith(prefix)) list.push(dto);
    }
    return list;
  },
};

// ==========================================
// 6. INTEGRATION REPOSITORY (FASE 5 / PACOTE 5.6)
// ==========================================
export const IntegrationRepository = {
  async create(companyId: string, data: CreateIntegrationDTO): Promise<IntegrationDTO> {
    const id = data.id || `int-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const status = data.status || 'INACTIVE';
    const environment = data.environment || 'PRODUCTION';
    const baseUrl = data.baseUrl || null;
    const credentialRef = data.credentialRef || null;
    const nicheId = data.nicheId || null;
    const settings = data.settings || {};
    const manifest = data.manifest || {
      manifestVersion: '1',
      providerId: data.providerId,
      displayName: data.name,
      capabilities: [],
      fields: [],
    };
    const now = new Date().toISOString();

    if (pgPool) {
      const query = `
        INSERT INTO integrations (
          id, company_id, name, provider_type, provider_id, status,
          environment, base_url, credential_ref, niche_id, settings, manifest,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING
          id, company_id AS "companyId", name, provider_type AS "providerType",
          provider_id AS "providerId", status, environment, base_url AS "baseUrl",
          credential_ref AS "credentialRef", niche_id AS "nicheId",
          settings, manifest, created_at AS "createdAt", updated_at AS "updatedAt"
      `;
      const res = await pgPool.query(query, [
        id, companyId, data.name, data.providerType, data.providerId, status,
        environment, baseUrl, credentialRef, nicheId, JSON.stringify(settings),
        JSON.stringify(manifest), now, now,
      ]);
      const dto = res.rows[0];
      dto.mappingsCount = 0;
      return dto;
    }

    const dto: IntegrationDTO = {
      id,
      companyId,
      name: data.name,
      providerType: data.providerType,
      providerId: data.providerId,
      status,
      environment,
      baseUrl: baseUrl || undefined,
      credentialRef: credentialRef || undefined,
      nicheId: nicheId || undefined,
      settings,
      manifest: manifest as any,
      mappingsCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    memIntegrations.set(`${companyId}:${id}`, dto);
    return dto;
  },

  async findById(companyId: string, id: string): Promise<IntegrationDTO | null> {
    if (pgPool) {
      const query = `
        SELECT
          i.id, i.company_id AS "companyId", i.name, i.provider_type AS "providerType",
          i.provider_id AS "providerId", i.status, i.environment, i.base_url AS "baseUrl",
          i.credential_ref AS "credentialRef", i.niche_id AS "nicheId",
          i.settings, i.manifest, i.created_at AS "createdAt", i.updated_at AS "updatedAt",
          COUNT(m.id)::int AS "mappingsCount"
        FROM integrations i
        LEFT JOIN integration_field_mappings m ON m.company_id = i.company_id AND m.integration_id = i.id
        WHERE i.company_id = $1 AND i.id = $2
        GROUP BY i.id
      `;
      const res = await pgPool.query(query, [companyId, id]);
      if (res.rows.length === 0) return null;
      return res.rows[0];
    }

    const dto = memIntegrations.get(`${companyId}:${id}`);
    if (!dto) return null;

    let mappingsCount = 0;
    for (const m of memIntegrationMappings.values()) {
      if (m.companyId === companyId && m.integrationId === id) mappingsCount++;
    }
    return { ...dto, mappingsCount };
  },

  async findByCompanyId(companyId: string): Promise<IntegrationDTO[]> {
    return this.listByCompany(companyId);
  },

  async listByCompany(companyId: string): Promise<IntegrationDTO[]> {

    if (pgPool) {
      const query = `
        SELECT
          i.id, i.company_id AS "companyId", i.name, i.provider_type AS "providerType",
          i.provider_id AS "providerId", i.status, i.environment, i.base_url AS "baseUrl",
          i.credential_ref AS "credentialRef", i.niche_id AS "nicheId",
          i.settings, i.manifest, i.created_at AS "createdAt", i.updated_at AS "updatedAt",
          COUNT(m.id)::int AS "mappingsCount"
        FROM integrations i
        LEFT JOIN integration_field_mappings m ON m.company_id = i.company_id AND m.integration_id = i.id
        WHERE i.company_id = $1
        GROUP BY i.id
        ORDER BY i.created_at ASC
      `;
      const res = await pgPool.query(query, [companyId]);
      return res.rows;
    }

    const list: IntegrationDTO[] = [];
    for (const dto of memIntegrations.values()) {
      if (dto.companyId === companyId) {
        let mappingsCount = 0;
        for (const m of memIntegrationMappings.values()) {
          if (m.companyId === companyId && m.integrationId === dto.id) mappingsCount++;
        }
        list.push({ ...dto, mappingsCount });
      }
    }
    return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async update(companyId: string, id: string, data: UpdateIntegrationDTO): Promise<IntegrationDTO | null> {
    const existing = await this.findById(companyId, id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updatedName = data.name !== undefined ? data.name : existing.name;
    const updatedStatus = data.status !== undefined ? data.status : existing.status;
    const updatedEnvironment = data.environment !== undefined ? data.environment : existing.environment;
    const updatedBaseUrl = data.baseUrl !== undefined ? (data.baseUrl || null) : (existing.baseUrl || null);
    const updatedCredentialRef = data.credentialRef !== undefined ? (data.credentialRef || null) : (existing.credentialRef || null);
    const updatedNicheId = data.nicheId !== undefined ? (data.nicheId || null) : (existing.nicheId || null);
    const updatedSettings = data.settings !== undefined ? data.settings : existing.settings;

    if (pgPool) {
      const query = `
        UPDATE integrations SET
          name = $3,
          status = $4,
          environment = $5,
          base_url = $6,
          credential_ref = $7,
          niche_id = $8,
          settings = $9,
          updated_at = $10
        WHERE company_id = $1 AND id = $2
        RETURNING
          id, company_id AS "companyId", name, provider_type AS "providerType",
          provider_id AS "providerId", status, environment, base_url AS "baseUrl",
          credential_ref AS "credentialRef", niche_id AS "nicheId",
          settings, manifest, created_at AS "createdAt", updated_at AS "updatedAt"
      `;
      const res = await pgPool.query(query, [
        companyId, id, updatedName, updatedStatus, updatedEnvironment,
        updatedBaseUrl, updatedCredentialRef, updatedNicheId, JSON.stringify(updatedSettings), now,
      ]);
      if (res.rows.length === 0) return null;
      const dto = res.rows[0];
      dto.mappingsCount = existing.mappingsCount;
      return dto;
    }

    const updatedDto: IntegrationDTO = {
      ...existing,
      name: updatedName,
      status: updatedStatus,
      environment: updatedEnvironment,
      baseUrl: updatedBaseUrl || undefined,
      credentialRef: updatedCredentialRef || undefined,
      nicheId: updatedNicheId || undefined,
      settings: updatedSettings,
      updatedAt: now,
    };
    memIntegrations.set(`${companyId}:${id}`, updatedDto);
    return updatedDto;
  },

  async delete(companyId: string, id: string): Promise<boolean> {
    if (pgPool) {
      const res = await pgPool.query('DELETE FROM integrations WHERE company_id = $1 AND id = $2', [companyId, id]);
      return (res.rowCount || 0) > 0;
    }

    const key = `${companyId}:${id}`;
    if (!memIntegrations.has(key)) return false;
    memIntegrations.delete(key);

    // Cascata in-memory de mappings
    for (const [mKey, m] of memIntegrationMappings.entries()) {
      if (m.companyId === companyId && m.integrationId === id) {
        memIntegrationMappings.delete(mKey);
      }
    }
    return true;
  },
};

// ==========================================
// 7. INTEGRATION MAPPING REPOSITORY (FASE 5 / PACOTE 5.6)
// ==========================================
export const IntegrationMappingRepository = {
  async setMappings(
    companyId: string,
    integrationId: string,
    mappings: SetIntegrationMappingsItemDTO[]
  ): Promise<IntegrationFieldMappingDTO[]> {
    const integration = await IntegrationRepository.findById(companyId, integrationId);
    if (!integration) {
      throw new Error(`integration_not_found: integration '${integrationId}' not found for company '${companyId}'`);
    }

    const now = new Date().toISOString();

    if (pgPool) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          'DELETE FROM integration_field_mappings WHERE company_id = $1 AND integration_id = $2',
          [companyId, integrationId]
        );

        const result: IntegrationFieldMappingDTO[] = [];
        for (const item of mappings) {
          const mapId = `map-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const direction = item.direction || 'READ';
          const enabled = item.enabled !== undefined ? item.enabled : true;
          const dataType = item.dataType || null;

          const insQuery = `
            INSERT INTO integration_field_mappings (
              id, company_id, integration_id, external_field, canonical_field_id,
              direction, enabled, data_type, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING
              id, company_id AS "companyId", integration_id AS "integrationId",
              external_field AS "externalField", canonical_field_id AS "canonicalFieldId",
              direction, enabled, data_type AS "dataType",
              created_at AS "createdAt", updated_at AS "updatedAt"
          `;
          const insRes = await client.query(insQuery, [
            mapId, companyId, integrationId, item.externalField, item.canonicalFieldId,
            direction, enabled, dataType, now, now,
          ]);
          result.push(insRes.rows[0]);
        }
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // In-memory: remove existentes desta integração
    for (const [key, m] of memIntegrationMappings.entries()) {
      if (m.companyId === companyId && m.integrationId === integrationId) {
        memIntegrationMappings.delete(key);
      }
    }

    const result: IntegrationFieldMappingDTO[] = [];
    for (const item of mappings) {
      const mapId = `map-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const dto: IntegrationFieldMappingDTO = {
        id: mapId,
        companyId,
        integrationId,
        externalField: item.externalField,
        canonicalFieldId: item.canonicalFieldId,
        direction: item.direction || 'READ',
        enabled: item.enabled !== undefined ? item.enabled : true,
        dataType: item.dataType,
        createdAt: now,
        updatedAt: now,
      };
      memIntegrationMappings.set(`${companyId}:${integrationId}:${item.externalField}`, dto);
      result.push(dto);
    }
    return result;
  },

  async getMappings(companyId: string, integrationId: string): Promise<IntegrationFieldMappingDTO[]> {
    if (pgPool) {
      const query = `
        SELECT
          id, company_id AS "companyId", integration_id AS "integrationId",
          external_field AS "externalField", canonical_field_id AS "canonicalFieldId",
          direction, enabled, data_type AS "dataType",
          created_at AS "createdAt", updated_at AS "updatedAt"
        FROM integration_field_mappings
        WHERE company_id = $1 AND integration_id = $2
        ORDER BY external_field ASC
      `;
      const res = await pgPool.query(query, [companyId, integrationId]);
      return res.rows;
    }

    const list: IntegrationFieldMappingDTO[] = [];
    for (const m of memIntegrationMappings.values()) {
      if (m.companyId === companyId && m.integrationId === integrationId) {
        list.push(m);
      }
    }
    return list.sort((a, b) => a.externalField.localeCompare(b.externalField));
  },

  async getActiveMappingsByCompany(companyId: string): Promise<IntegrationFieldMappingDTO[]> {
    if (pgPool) {
      const query = `
        SELECT
          m.id, m.company_id AS "companyId", m.integration_id AS "integrationId",
          m.external_field AS "externalField", m.canonical_field_id AS "canonicalFieldId",
          m.direction, m.enabled, m.data_type AS "dataType",
          m.created_at AS "createdAt", m.updated_at AS "updatedAt"
        FROM integration_field_mappings m
        JOIN integrations i ON i.id = m.integration_id AND i.company_id = m.company_id
        WHERE m.company_id = $1 AND i.status = 'ACTIVE' AND m.enabled = true
      `;
      const res = await pgPool.query(query, [companyId]);
      return res.rows;
    }

    const activeIntegrationIds = new Set<string>();
    for (const integ of memIntegrations.values()) {
      if (integ.companyId === companyId && integ.status === 'ACTIVE') {
        activeIntegrationIds.add(integ.id);
      }
    }

    const list: IntegrationFieldMappingDTO[] = [];
    for (const m of memIntegrationMappings.values()) {
      if (m.companyId === companyId && activeIntegrationIds.has(m.integrationId) && m.enabled) {
        list.push(m);
      }
    }
    return list;
  },

  async deleteByIntegration(companyId: string, integrationId: string): Promise<void> {
    if (pgPool) {
      await pgPool.query(
        'DELETE FROM integration_field_mappings WHERE company_id = $1 AND integration_id = $2',
        [companyId, integrationId]
      );
      return;
    }

    for (const [key, m] of memIntegrationMappings.entries()) {
      if (m.companyId === companyId && m.integrationId === integrationId) {
        memIntegrationMappings.delete(key);
      }
    }
  },
};

