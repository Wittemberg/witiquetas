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
} from '@witiquetas/contracts';

// ==========================================
// CANONICAL PERMISSION CATALOG (24 PERMISSÕES OFICIAIS)
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

export const memCompanies: Map<string, CompanyDTO> = g.__WIT_ADMIN_MEM_COMPANIES__;
export const memUsers: Map<string, UserDTO> = g.__WIT_ADMIN_MEM_USERS__;
export const memRoles: Map<string, RoleDTO> = g.__WIT_ADMIN_MEM_ROLES__;
export const memRolePermissions: Set<string> = g.__WIT_ADMIN_MEM_ROLE_PERMS__;
export const memUserRoles: Set<string> = g.__WIT_ADMIN_MEM_USER_ROLES__;
export const memRoleNiches: Map<string, boolean> = g.__WIT_ADMIN_MEM_ROLE_NICHES__;
export const memCompanyNiches: Map<string, CompanyNicheConfigDTO> = g.__WIT_ADMIN_MEM_COMPANY_NICHES__;
export const memCompanyNicheElements: Map<string, CompanyElementConfigDTO> = g.__WIT_ADMIN_MEM_COMPANY_ELEMENTS__;
export const memCompanyNicheFields: Map<string, CompanyFieldConfigDTO> = g.__WIT_ADMIN_MEM_COMPANY_FIELDS__;

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
  async create(data: CreateUserDTO): Promise<UserDTO> {
    const id = data.id || `usr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const status = data.status || 'ACTIVE';
    const now = new Date().toISOString();

    // Validação da empresa existente
    const comp = await CompanyRepository.findById(data.companyId);
    if (!comp) {
      throw new Error(`foreign_key_violation: company '${data.companyId}' not found`);
    }

    if (pgPool) {
      const res = await pgPool.query(
        `INSERT INTO users (id, company_id, name, email, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, company_id AS "companyId", name, email, status, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [id, data.companyId, data.name, data.email.toLowerCase().trim(), status, now, now]
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
      createdAt: now,
      updatedAt: now,
    };
    memUsers.set(id, user);
    return user;
  },

  async findById(id: string): Promise<UserDTO | null> {
    if (pgPool) {
      const res = await pgPool.query(
        `SELECT id, company_id AS "companyId", name, email, status, created_at AS "createdAt", updated_at AS "updatedAt"
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
        `SELECT id, company_id AS "companyId", name, email, status, created_at AS "createdAt", updated_at AS "updatedAt"
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

  async listByCompany(companyId: string): Promise<UserDTO[]> {
    if (pgPool) {
      const res = await pgPool.query(
        `SELECT id, company_id AS "companyId", name, email, status, created_at AS "createdAt", updated_at AS "updatedAt"
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
         RETURNING id, company_id AS "companyId", name, email, status, created_at AS "createdAt", updated_at AS "updatedAt"`,
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
};

// ==========================================
// 4. COMPANY CONFIGURATION REPOSITORY
// ==========================================
export const CompanyConfigurationRepository = {
  // NICHES
  async setNicheState(companyId: string, nicheId: string, state: 'ENABLED' | 'DISABLED'): Promise<CompanyNicheConfigDTO> {
    const comp = await CompanyRepository.findById(companyId);
    if (!comp) throw new Error(`company_not_found: company '${companyId}' not found`);
    if (!NICHES.some((n) => n.id === nicheId)) {
      throw new Error(`invalid_niche: niche '${nicheId}' does not exist in platform`);
    }
    const now = new Date().toISOString();

    if (pgPool) {
      const res = await pgPool.query(
        `INSERT INTO company_niches (company_id, niche_id, state, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (company_id, niche_id) DO UPDATE SET state = EXCLUDED.state, updated_at = EXCLUDED.updated_at
         RETURNING company_id AS "companyId", niche_id AS "nicheId", state, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [companyId, nicheId, state, now, now]
      );
      return res.rows[0];
    }

    const key = `${companyId}:${nicheId}`;
    const existing = memCompanyNiches.get(key);
    const dto: CompanyNicheConfigDTO = {
      companyId,
      nicheId,
      state,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
    memCompanyNiches.set(key, dto);
    return dto;
  },

  async getNiches(companyId: string): Promise<CompanyNicheConfigDTO[]> {
    if (pgPool) {
      const res = await pgPool.query(
        `SELECT company_id AS "companyId", niche_id AS "nicheId", state, created_at AS "createdAt", updated_at AS "updatedAt"
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
  async setFieldEnabled(companyId: string, nicheId: string, canonicalFieldId: string, enabled: boolean): Promise<CompanyFieldConfigDTO> {
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
    const now = new Date().toISOString();

    if (pgPool) {
      const res = await pgPool.query(
        `INSERT INTO company_niche_fields (company_id, niche_id, canonical_field_id, enabled, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (company_id, niche_id, canonical_field_id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at
         RETURNING company_id AS "companyId", niche_id AS "nicheId", canonical_field_id AS "canonicalFieldId", enabled, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [companyId, nicheId, canonicalFieldId, enabled, now, now]
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
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
    memCompanyNicheFields.set(key, dto);
    return dto;
  },

  async getFields(companyId: string, nicheId?: string): Promise<CompanyFieldConfigDTO[]> {
    if (pgPool) {
      let query = `SELECT company_id AS "companyId", niche_id AS "nicheId", canonical_field_id AS "canonicalFieldId", enabled, created_at AS "createdAt", updated_at AS "updatedAt"
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
