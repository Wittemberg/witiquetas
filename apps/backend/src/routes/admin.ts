import { Router, Request, Response } from 'express';
import {
  requireAuthenticatedUser,
  requirePermission,
  requireCsrf,
} from '../middleware/authMiddleware.js';
import {
  NICHES,
  getIntegrationFieldsByNiche,
  SYSTEM_FIELDS,
} from '@witiquetas/label-schema';
import {
  CompanyRepository,
  UserRepository,
  RoleRepository,
  CompanyConfigurationRepository,
  CANONICAL_PERMISSIONS,
  TENANT_MANAGEABLE_PERMISSIONS,
} from '../repositories/adminRepositories.js';
import { SessionRepository } from '../repositories/sessionRepository.js';
import { PasswordService } from '../services/passwordService.js';
import { EffectiveConfigurationService } from '../services/effectiveConfigurationService.js';

const router = Router();

// Todas as rotas de administração exigem usuário autenticado
router.use(requireAuthenticatedUser);

// ==========================================
// 1. EMPRESA (Company)
// ==========================================

/**
 * GET /api/admin/company
 * Retorna dados da empresa do usuário autenticado
 */
router.get('/company', requirePermission('company.view'), async (req: Request, res: Response) => {
  const companyId = req.principal!.company.id;
  const company = await CompanyRepository.findById(companyId);
  if (!company) {
    return res.status(404).json({ error: 'Empresa não encontrada.', code: 'COMPANY_NOT_FOUND' });
  }

  return res.status(200).json(company);
});

/**
 * PUT /api/admin/company
 * Atualiza dados cadastrais da empresa
 */
router.put('/company', requirePermission('company.manage'), requireCsrf, async (req: Request, res: Response) => {
  const companyId = req.principal!.company.id;
  const { name } = req.body;

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'O nome da empresa não pode estar em branco.', code: 'INVALID_NAME' });
    }
  }

  const updated = await CompanyRepository.update(companyId, {
    name: name ? name.trim() : undefined,
  });

  if (!updated) {
    return res.status(404).json({ error: 'Empresa não encontrada.', code: 'COMPANY_NOT_FOUND' });
  }

  return res.status(200).json(updated);
});

// ==========================================
// 2. PERMISSÕES CANÔNICAS (Catalog)
// ==========================================

/**
 * GET /api/admin/permissions
 * Retorna catálogo de 23 permissões administráveis pelo tenant
 * (as 2 permissões devcontrol.* são reservadas exclusivamente à plataforma e não participam do RBAC comercial)
 */
router.get('/permissions', async (_req: Request, res: Response) => {
  return res.status(200).json(TENANT_MANAGEABLE_PERMISSIONS);
});

// ==========================================
// 3. USUÁRIOS (Users)
// ==========================================

function sanitizeTenantUser(u: any, roles?: any[]) {
  const { isDccMaster, ...rest } = u;
  return {
    ...rest,
    ...(roles !== undefined ? { roles } : {}),
  };
}

/**
 * GET /api/admin/users
 * Lista usuários da empresa com seus papéis
 */
router.get('/users', requirePermission('users.view'), async (req: Request, res: Response) => {
  const companyId = req.principal!.company.id;
  const users = await UserRepository.listByCompany(companyId);

  const usersWithRoles = await Promise.all(
    users.map(async (u) => {
      const roles = await RoleRepository.getUserRoles(companyId, u.id);
      return sanitizeTenantUser(u, roles);
    })
  );

  return res.status(200).json(usersWithRoles);
});

/**
 * POST /api/admin/users
 * Cria novo usuário na empresa
 */
router.post('/users', requirePermission('users.manage'), requireCsrf, async (req: Request, res: Response) => {
  const companyId = req.principal!.company.id;
  const { name, email, password, status, roleIds, isDccMaster, is_dcc_master } = req.body;

  // Decisão Congelada 5: is_dcc_master é atributo de plataforma/legado.
  // Ignorar silenciosamente qualquer tentativa de mass-assignment via API de tenant.
  // Não permitir que o tenant altere ou defina este campo.

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'O nome do usuário é obrigatório.', code: 'INVALID_NAME' });
  }

  try {
    PasswordService.validateEmail(email);
  } catch {
    return res.status(400).json({ error: 'Endereço de e-mail inválido.', code: 'INVALID_EMAIL' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Validação de unicidade global de e-mail
  const existingByEmail = await UserRepository.findByEmail(normalizedEmail);
  if (existingByEmail) {
    return res.status(409).json({ error: 'E-mail já cadastrado na plataforma.', code: 'EMAIL_ALREADY_EXISTS' });
  }

  // Validação de política de senha
  const policy = PasswordService.validatePolicy(password);
  if (!policy.valid) {
    return res.status(400).json({ error: policy.reason, code: 'PASSWORD_POLICY_VIOLATION' });
  }

  // Validação de status
  const userStatus = status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

  // Validação dos perfis informados (anti-IDOR)
  if (Array.isArray(roleIds)) {
    for (const rid of roleIds) {
      const role = await RoleRepository.findById(rid);
      if (!role || role.companyId !== companyId) {
        return res.status(400).json({ error: `Perfil '${rid}' inválido para esta empresa.`, code: 'INVALID_ROLE' });
      }
    }
  }

  const passwordHash = await PasswordService.hash(password);

  const user = await UserRepository.create({
    companyId,
    name: name.trim(),
    email: normalizedEmail,
    status: userStatus,
  });

  await UserRepository.setPassword(user.id, passwordHash);

  if (Array.isArray(roleIds)) {
    for (const rid of roleIds) {
      await RoleRepository.assignUserRole(companyId, user.id, rid);
    }
  }

  const roles = await RoleRepository.getUserRoles(companyId, user.id);

  return res.status(201).json(sanitizeTenantUser(user, roles));
});

/**
 * GET /api/admin/users/:id
 * Detalha usuário específico da empresa (Anti-IDOR)
 */
router.get('/users/:id', requirePermission('users.view'), async (req: Request, res: Response) => {
  const companyId = req.principal!.company.id;
  const targetId = req.params.id;

  const user = await UserRepository.findById(targetId);
  if (!user || user.companyId !== companyId) {
    return res.status(404).json({ error: 'Usuário não encontrado.', code: 'USER_NOT_FOUND' });
  }

  const roles = await RoleRepository.getUserRoles(companyId, user.id);

  return res.status(200).json(sanitizeTenantUser(user, roles));
});

/**
 * PUT /api/admin/users/:id
 * Atualiza dados, status ou perfis de um usuário (Anti-IDOR & Anti-Lockout)
 */
router.put('/users/:id', requirePermission('users.manage'), requireCsrf, async (req: Request, res: Response) => {
  const companyId = req.principal!.company.id;
  const targetId = req.params.id;
  const { name, email, status, roleIds, isDccMaster, is_dcc_master } = req.body;

  // Decisão Congelada 5: is_dcc_master é atributo de plataforma/legado.
  // Ignorar silenciosamente tentativas de mass-assignment via API de tenant.

  const existing = await UserRepository.findById(targetId);
  if (!existing || existing.companyId !== companyId) {
    return res.status(404).json({ error: 'Usuário não encontrado.', code: 'USER_NOT_FOUND' });
  }

  // Validação de nome
  if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
    return res.status(400).json({ error: 'O nome do usuário não pode estar em branco.', code: 'INVALID_NAME' });
  }

  // Validação e unicidade de email
  let normalizedEmail: string | undefined;
  if (email !== undefined) {
    try {
      PasswordService.validateEmail(email);
    } catch {
      return res.status(400).json({ error: 'Endereço de e-mail inválido.', code: 'INVALID_EMAIL' });
    }
    normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail && normalizedEmail !== existing.email) {
      const emailInUse = await UserRepository.findByEmail(normalizedEmail);
      if (emailInUse && emailInUse.id !== targetId) {
        return res.status(409).json({ error: 'E-mail já cadastrado na plataforma.', code: 'EMAIL_ALREADY_EXISTS' });
      }
    }
  }

  const currentRoles = await RoleRepository.getUserRoles(companyId, targetId);
  const currentlyAdmin = currentRoles.some((r) => r.code === 'ADMIN');

  // GUARDA ANTI-LOCKOUT: Inativação de Usuário (P0)
  if (status === 'INACTIVE' && existing.status === 'ACTIVE') {
    if (currentlyAdmin) {
      const activeAdmins = await UserRepository.countActiveAdmins(companyId);
      if (activeAdmins <= 1) {
        return res.status(400).json({
          error: 'Não é permitido inativar o único administrador ativo da empresa.',
          code: 'CANNOT_DEACTIVATE_LAST_ADMIN',
        });
      }
    }
  }

  // GUARDA ANTI-LOCKOUT: Remoção do Perfil ADMIN (P0)
  if (Array.isArray(roleIds)) {
    // Validar se todos os perfis pertencem à empresa
    for (const rid of roleIds) {
      const r = await RoleRepository.findById(rid);
      if (!r || r.companyId !== companyId) {
        return res.status(400).json({ error: `Perfil '${rid}' inválido para esta empresa.`, code: 'INVALID_ROLE' });
      }
    }

    if (currentlyAdmin && existing.status === 'ACTIVE') {
      let targetHasAdmin = false;
      for (const rid of roleIds) {
        const r = await RoleRepository.findById(rid);
        if (r && r.code === 'ADMIN') {
          targetHasAdmin = true;
          break;
        }
      }

      if (!targetHasAdmin) {
        const activeAdmins = await UserRepository.countActiveAdmins(companyId);
        if (activeAdmins <= 1) {
          return res.status(400).json({
            error: 'Não é permitido remover o perfil de Administrador do único administrador ativo da empresa.',
            code: 'CANNOT_REMOVE_LAST_ADMIN_ROLE',
          });
        }
      }
    }

    // Sincronizar perfis
    const currentRoleIds = currentRoles.map((r) => r.id);
    for (const oldRid of currentRoleIds) {
      if (!roleIds.includes(oldRid)) {
        await RoleRepository.removeUserRole(companyId, targetId, oldRid);
      }
    }
    for (const newRid of roleIds) {
      if (!currentRoleIds.includes(newRid)) {
        await RoleRepository.assignUserRole(companyId, targetId, newRid);
      }
    }
  }

  // Atualizar usuário
  const updatedUser = await UserRepository.update(targetId, {
    name: name !== undefined ? name.trim() : undefined,
    email: normalizedEmail,
    status: status !== undefined ? status : undefined,
  });

  // Se o usuário foi inativado, revogar imediatamente todas as suas sessões
  if (status === 'INACTIVE' && existing.status === 'ACTIVE') {
    await SessionRepository.revokeAllForUser(companyId, targetId);
  }

  const updatedRoles = await RoleRepository.getUserRoles(companyId, targetId);

  return res.status(200).json(sanitizeTenantUser(updatedUser, updatedRoles));
});

/**
 * POST /api/admin/users/:id/reset-password
 * Redefine a senha de um usuário
 */
router.post('/users/:id/reset-password', requirePermission('users.manage'), requireCsrf, async (req: Request, res: Response) => {
  const companyId = req.principal!.company.id;
  const targetId = req.params.id;
  const { newPassword } = req.body;

  const existing = await UserRepository.findById(targetId);
  if (!existing || existing.companyId !== companyId) {
    return res.status(404).json({ error: 'Usuário não encontrado.', code: 'USER_NOT_FOUND' });
  }

  const policy = PasswordService.validatePolicy(newPassword);
  if (!policy.valid) {
    return res.status(400).json({ error: policy.reason, code: 'PASSWORD_POLICY_VIOLATION' });
  }

  const hash = await PasswordService.hash(newPassword);
  await UserRepository.setPassword(targetId, hash);

  // Revogar sessões ativas do usuário
  await SessionRepository.revokeAllForUser(companyId, targetId);

  return res.status(200).json({ message: 'Senha redefinida com sucesso.' });
});

/**
 * DELETE /api/admin/users/:id
 * Remove usuário (Anti-IDOR & Auto-Lockout)
 */
router.delete('/users/:id', requirePermission('users.manage'), requireCsrf, async (req: Request, res: Response) => {
  const companyId = req.principal!.company.id;
  const targetId = req.params.id;

  const existing = await UserRepository.findById(targetId);
  if (!existing || existing.companyId !== companyId) {
    return res.status(404).json({ error: 'Usuário não encontrado.', code: 'USER_NOT_FOUND' });
  }

  // Não permitir auto-exclusão
  if (targetId === req.principal!.user.id) {
    return res.status(400).json({ error: 'Não é possível excluir o próprio usuário logado.', code: 'CANNOT_DELETE_SELF' });
  }

  // Guarda: não excluir o último admin ativo
  const userRoles = await RoleRepository.getUserRoles(companyId, targetId);
  if (userRoles.some((r) => r.code === 'ADMIN') && existing.status === 'ACTIVE') {
    const activeAdmins = await UserRepository.countActiveAdmins(companyId);
    if (activeAdmins <= 1) {
      return res.status(400).json({
        error: 'Não é possível excluir o único administrador ativo da empresa.',
        code: 'CANNOT_DELETE_LAST_ADMIN',
      });
    }
  }

  await SessionRepository.revokeAllForUser(companyId, targetId);
  await UserRepository.delete(companyId, targetId);

  return res.status(200).json({ success: true, message: 'Usuário excluído com sucesso.' });
});

// ==========================================
// 4. PAPÉIS E PERMISSÕES (Roles)
// ==========================================

/**
 * GET /api/admin/roles
 * Lista perfis da empresa com suas permissões e contagem de usuários
 */
router.get('/roles', requirePermission('roles.view'), async (req: Request, res: Response) => {
  const companyId = req.principal!.company.id;
  const roles = await RoleRepository.listByCompany(companyId);

  const rolesWithDetails = await Promise.all(
    roles.map(async (r) => {
      const rawPermissions = await RoleRepository.getRolePermissions(r.id);
      const permissions = rawPermissions.filter((p) => !p.startsWith('devcontrol.'));
      const userCount = await RoleRepository.countUsersWithRole(companyId, r.id);
      return {
        ...r,
        permissions,
        userCount,
      };
    })
  );

  return res.status(200).json(rolesWithDetails);
});

/**
 * POST /api/admin/roles
 * Cria novo perfil personalizado na empresa
 */
router.post('/roles', requirePermission('roles.manage'), requireCsrf, async (req: Request, res: Response) => {
  const companyId = req.principal!.company.id;
  const { code, name, description, permissions } = req.body;

  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    return res.status(400).json({ error: 'O código do perfil é obrigatório.', code: 'INVALID_CODE' });
  }

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'O nome do perfil é obrigatório.', code: 'INVALID_NAME' });
  }

  const normalizedCode = code.trim().toUpperCase();

  // Validar unicidade do código na empresa
  const existingRole = await RoleRepository.findByCode(companyId, normalizedCode);
  if (existingRole) {
    return res.status(409).json({ error: `O código de perfil '${normalizedCode}' já existe nesta empresa.`, code: 'ROLE_CODE_ALREADY_EXISTS' });
  }

  // Validar permissões fornecidas (somente as 23 administráveis pelo tenant são aceitas)
  if (Array.isArray(permissions)) {
    for (const perm of permissions) {
      if (!TENANT_MANAGEABLE_PERMISSIONS.some((p) => p.code === perm)) {
        return res.status(400).json({ error: `Permissão inválida ou não administrável pelo tenant: '${perm}'.`, code: 'INVALID_PERMISSION' });
      }
    }
  }

  const role = await RoleRepository.create({
    companyId,
    code: normalizedCode,
    name: name.trim(),
    description: description ? description.trim() : undefined,
  });

  if (Array.isArray(permissions) && permissions.length > 0) {
    await RoleRepository.setRolePermissions(role.id, permissions);
  }

  const finalPermissions = await RoleRepository.getRolePermissions(role.id);

  return res.status(201).json({
    ...role,
    permissions: finalPermissions,
    userCount: 0,
  });
});

/**
 * GET /api/admin/roles/:id
 * Detalha perfil específico da empresa (Anti-IDOR)
 */
router.get('/roles/:id', requirePermission('roles.view'), async (req: Request, res: Response) => {
  const companyId = req.principal!.company.id;
  const roleId = req.params.id;

  const role = await RoleRepository.findById(roleId);
  if (!role || role.companyId !== companyId) {
    return res.status(404).json({ error: 'Perfil não encontrado.', code: 'ROLE_NOT_FOUND' });
  }

  const permissions = await RoleRepository.getRolePermissions(role.id);
  const userCount = await RoleRepository.countUsersWithRole(companyId, role.id);

  return res.status(200).json({
    ...role,
    permissions,
    userCount,
  });
});

/**
 * PUT /api/admin/roles/:id
 * Atualiza nome ou descrição do perfil (Anti-IDOR)
 */
router.put('/roles/:id', requirePermission('roles.manage'), requireCsrf, async (req: Request, res: Response) => {
  const companyId = req.principal!.company.id;
  const roleId = req.params.id;
  const { name, description } = req.body;

  const existing = await RoleRepository.findById(roleId);
  if (!existing || existing.companyId !== companyId) {
    return res.status(404).json({ error: 'Perfil não encontrado.', code: 'ROLE_NOT_FOUND' });
  }

  if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
    return res.status(400).json({ error: 'O nome do perfil não pode estar em branco.', code: 'INVALID_NAME' });
  }

  const updated = await RoleRepository.update(companyId, roleId, {
    name: name !== undefined ? name.trim() : undefined,
    description: description !== undefined ? description.trim() : undefined,
  });

  const permissions = await RoleRepository.getRolePermissions(roleId);
  const userCount = await RoleRepository.countUsersWithRole(companyId, roleId);

  return res.status(200).json({
    ...updated,
    permissions,
    userCount,
  });
});

/**
 * PUT /api/admin/roles/:id/permissions
 * Atualiza matriz de permissões do perfil (Anti-IDOR & Essential Admin Permissions Guard)
 */
router.put('/roles/:id/permissions', requirePermission('roles.manage'), requireCsrf, async (req: Request, res: Response) => {
  const companyId = req.principal!.company.id;
  const roleId = req.params.id;
  const { permissions } = req.body;

  const role = await RoleRepository.findById(roleId);
  if (!role || role.companyId !== companyId) {
    return res.status(404).json({ error: 'Perfil não encontrado.', code: 'ROLE_NOT_FOUND' });
  }

  if (!Array.isArray(permissions)) {
    return res.status(400).json({ error: 'O campo permissions deve ser uma lista de códigos.', code: 'INVALID_PERMISSIONS_FORMAT' });
  }

  // Validar se todas as permissões existem no catálogo administrável pelo tenant (23 permissões)
  for (const perm of permissions) {
    if (!TENANT_MANAGEABLE_PERMISSIONS.some((p) => p.code === perm)) {
      return res.status(400).json({ error: `Permissão inválida ou não administrável pelo tenant: '${perm}'.`, code: 'INVALID_PERMISSION' });
    }
  }

  // GUARDA ANTI-LOCKOUT: Permissões Essenciais do ADMIN (P0)
  if (role.code === 'ADMIN') {
    const essential = [
      'company.view',
      'company.manage',
      'users.view',
      'users.manage',
      'roles.view',
      'roles.manage',
    ];
    const missing = essential.filter((p) => !permissions.includes(p));
    if (missing.length > 0) {
      return res.status(400).json({
        error: 'Não é permitido remover permissões administrativas essenciais do perfil de Administrador.',
        code: 'CANNOT_STRIP_ESSENTIAL_ADMIN_PERMISSIONS',
        missingPermissions: missing,
      });
    }
  }

  await RoleRepository.setRolePermissions(role.id, permissions);
  const updatedPermissions = await RoleRepository.getRolePermissions(role.id);

  return res.status(200).json({
    roleId: role.id,
    permissions: updatedPermissions,
  });
});

/**
 * DELETE /api/admin/roles/:id
 * Remove perfil personalizado (Anti-IDOR, Sistema, Em Uso)
 */
router.delete('/roles/:id', requirePermission('roles.manage'), requireCsrf, async (req: Request, res: Response) => {
  const companyId = req.principal!.company.id;
  const roleId = req.params.id;

  const role = await RoleRepository.findById(roleId);
  if (!role || role.companyId !== companyId) {
    return res.status(404).json({ error: 'Perfil não encontrado.', code: 'ROLE_NOT_FOUND' });
  }

  // Não permitir exclusão de perfis de sistema (ADMIN, OPERATOR, VIEWER)
  if (role.isSystem) {
    return res.status(400).json({ error: 'Não é permitido excluir perfis padrão de sistema.', code: 'CANNOT_DELETE_SYSTEM_ROLE' });
  }

  // Não permitir exclusão se houver usuários associados
  const userCount = await RoleRepository.countUsersWithRole(companyId, role.id);
  if (userCount > 0) {
    return res.status(400).json({
      error: `Não é possível excluir o perfil pois ele está atribuído a ${userCount} usuário(s).`,
      code: 'ROLE_IN_USE',
      userCount,
    });
  }

  await RoleRepository.delete(companyId, role.id);

  return res.status(200).json({ success: true, message: 'Perfil excluído com sucesso.' });
});

// ==========================================
// 5. NICHOS DA EMPRESA (Niches)
// ==========================================

const CANONICAL_ELEMENT_TYPES = [
  { type: 'text', name: 'Texto' },
  { type: 'price', name: 'Preço' },
  { type: 'date', name: 'Data de Validade/Fabricação' },
  { type: 'barcode', name: 'Código de Barras' },
  { type: 'qrcode', name: 'QR Code' },
  { type: 'line', name: 'Linha Divisória' },
  { type: 'rectangle', name: 'Retângulo / Moldura' },
  { type: 'image', name: 'Imagem / Logomarca' },
];

/**
 * GET /api/admin/niches
 * Lista os 11 nichos da plataforma com o status de habilitação para a empresa ativa
 */
router.get('/niches', requirePermission('niches.view'), async (req: Request, res: Response) => {
  const companyId = req.principal!.company.id;
  const configured = await CompanyConfigurationRepository.getNiches(companyId);

  const configMap = new Map<string, { enabled: boolean; isDefault: boolean }>();
  for (const c of configured) {
    configMap.set(c.nicheId, {
      enabled: c.state === 'ENABLED',
      isDefault: Boolean(c.isDefault),
    });
  }

  // Se nenhum nicho tiver sido configurado ainda, todos os 11 iniciam ativos e 'varejo' como default
  const hasConfig = configured.length > 0;

  const result = NICHES.map((n) => {
    const cfg = configMap.get(n.id);
    const enabled = hasConfig ? (cfg ? cfg.enabled : false) : true;
    const isDefault = hasConfig ? (cfg ? cfg.isDefault : false) : n.id === 'niche-gondola';
    return {
      id: n.id,
      name: n.name,
      description: n.description,
      enabled,
      isDefault,
    };
  });

  return res.status(200).json(result);
});

/**
 * PUT /api/admin/niches
 * Atualiza nichos habilitados e nicho padrão da empresa
 */
router.put('/niches', requirePermission('niches.manage'), requireCsrf, async (req: Request, res: Response) => {
  const companyId = req.principal!.company.id;
  const { niches, defaultNicheId } = req.body;

  if (!Array.isArray(niches) || niches.length === 0) {
    return res.status(400).json({ error: 'A lista de nichos deve ser fornecida.', code: 'INVALID_NICHES_LIST' });
  }

  // Validar se todos os nicheIds pertencem aos 11 nichos canônicos
  for (const item of niches) {
    if (!NICHES.some((n) => n.id === item.nicheId)) {
      return res.status(400).json({ error: `Nicho inválido ou desconhecido: '${item.nicheId}'.`, code: 'INVALID_NICHE' });
    }
  }

  // Regra: pelo menos 1 nicho deve permanecer habilitado
  const willBeEnabled = niches.filter((item) => item.enabled === true);
  if (willBeEnabled.length === 0) {
    return res.status(400).json({ error: 'A empresa deve manter pelo menos 1 nicho habilitado.', code: 'CANNOT_DISABLE_ALL_NICHES' });
  }

  // Se defaultNicheId foi especificado, validar que pertence à plataforma e estará habilitado
  if (defaultNicheId) {
    if (!NICHES.some((n) => n.id === defaultNicheId)) {
      return res.status(400).json({ error: `Nicho padrão inválido: '${defaultNicheId}'.`, code: 'INVALID_DEFAULT_NICHE' });
    }
    const defaultItem = niches.find((item) => item.nicheId === defaultNicheId);
    if (defaultItem && defaultItem.enabled === false) {
      return res.status(400).json({ error: 'O nicho padrão da empresa não pode ser desabilitado.', code: 'DEFAULT_NICHE_MUST_BE_ENABLED' });
    }
  }

  // Persistir alterações
  for (const item of niches) {
    const isDefault = defaultNicheId ? item.nicheId === defaultNicheId : undefined;
    await CompanyConfigurationRepository.setNicheState(
      companyId,
      item.nicheId,
      item.enabled ? 'ENABLED' : 'DISABLED',
      isDefault
    );
  }

  // Se defaultNicheId foi passado explicitamente, assegura
  if (defaultNicheId) {
    await CompanyConfigurationRepository.setDefaultNiche(companyId, defaultNicheId);
  }

  const configured = await CompanyConfigurationRepository.getNiches(companyId);
  const configMap = new Map<string, { enabled: boolean; isDefault: boolean }>();
  for (const c of configured) {
    configMap.set(c.nicheId, {
      enabled: c.state === 'ENABLED',
      isDefault: Boolean(c.isDefault),
    });
  }

  const result = NICHES.map((n) => {
    const cfg = configMap.get(n.id);
    return {
      id: n.id,
      name: n.name,
      description: n.description,
      enabled: cfg ? cfg.enabled : false,
      isDefault: cfg ? cfg.isDefault : false,
    };
  });

  return res.status(200).json(result);
});

// ==========================================
// 6. ELEMENTOS VISUAIS POR NICHO (Elements)
// ==========================================

/**
 * GET /api/admin/niches/:nicheId/elements
 * Retorna os 8 elementos visuais canônicos com status de habilitação no nicho
 */
router.get('/niches/:nicheId/elements', requirePermission('elements.view'), async (req: Request, res: Response) => {
  const companyId = req.principal!.company.id;
  const { nicheId } = req.params;

  if (!NICHES.some((n) => n.id === nicheId)) {
    return res.status(404).json({ error: `Nicho '${nicheId}' não encontrado.`, code: 'NICHE_NOT_FOUND' });
  }

  const configured = await CompanyConfigurationRepository.getElements(companyId, nicheId);
  const configMap = new Map<string, boolean>();
  for (const c of configured) {
    configMap.set(c.elementType, c.enabled);
  }

  const result = CANONICAL_ELEMENT_TYPES.map((el) => ({
    elementType: el.type,
    name: el.name,
    enabled: configMap.has(el.type) ? configMap.get(el.type)! : true,
  }));

  return res.status(200).json(result);
});

/**
 * PUT /api/admin/niches/:nicheId/elements
 * Habilita ou desabilita elementos visuais no nicho
 */
router.put('/niches/:nicheId/elements', requirePermission('elements.manage'), requireCsrf, async (req: Request, res: Response) => {
  const companyId = req.principal!.company.id;
  const { nicheId } = req.params;
  const { elements } = req.body;

  if (!NICHES.some((n) => n.id === nicheId)) {
    return res.status(404).json({ error: `Nicho '${nicheId}' não encontrado.`, code: 'NICHE_NOT_FOUND' });
  }

  if (!Array.isArray(elements)) {
    return res.status(400).json({ error: 'A lista de elementos deve ser fornecida.', code: 'INVALID_ELEMENTS_LIST' });
  }

  // Validar se todos os elementos pertencem aos 8 canônicos conhecidos
  for (const item of elements) {
    if (!CANONICAL_ELEMENT_TYPES.some((el) => el.type === item.elementType)) {
      return res.status(400).json({ error: `Elemento visual inválido ou desconhecido: '${item.elementType}'.`, code: 'INVALID_ELEMENT' });
    }
  }

  // Persistir alterações
  for (const item of elements) {
    await CompanyConfigurationRepository.setElementEnabled(
      companyId,
      nicheId,
      item.elementType,
      Boolean(item.enabled)
    );
  }

  const updated = await CompanyConfigurationRepository.getElements(companyId, nicheId);
  return res.status(200).json(updated);
});

// ==========================================
// 7. CAMPOS CANÔNICOS DE DADOS POR NICHO (Fields)
// ==========================================

/**
 * GET /api/admin/niches/:nicheId/fields
 * Retorna os campos canônicos do nicho com flags de ativação, entrada manual e integração
 */
router.get('/niches/:nicheId/fields', requirePermission('niches.view'), async (req: Request, res: Response) => {
  const companyId = req.principal!.company.id;
  const { nicheId } = req.params;

  if (!NICHES.some((n) => n.id === nicheId)) {
    return res.status(404).json({ error: `Nicho '${nicheId}' não encontrado.`, code: 'NICHE_NOT_FOUND' });
  }

  const integrationFields = getIntegrationFieldsByNiche(nicheId);
  const allAvailableFields = [...integrationFields, ...SYSTEM_FIELDS];

  const configured = await CompanyConfigurationRepository.getFields(companyId, nicheId);
  const configMap = new Map<string, { enabled: boolean; manual: boolean; integration: boolean }>();
  for (const c of configured) {
    configMap.set(c.canonicalFieldId, {
      enabled: c.enabled,
      manual: c.availableForManual !== undefined ? c.availableForManual : true,
      integration: c.availableForIntegration !== undefined ? c.availableForIntegration : true,
    });
  }

  const result = allAvailableFields.map((f: any) => {
    const isSystem = SYSTEM_FIELDS.some((sf) => sf.id === f.id);
    const cfg = configMap.get(f.id);
    return {
      fieldId: f.id,
      name: f.label || f.id,
      description: f.description || (isSystem ? 'Campo gerado automaticamente pela plataforma' : f.example || ''),
      type: f.type || (isSystem ? 'system' : 'string'),
      isSystem,
      enabled: cfg ? cfg.enabled : true,
      availableForManual: isSystem ? false : (cfg ? cfg.manual : true),
      availableForIntegration: isSystem ? false : (cfg ? cfg.integration : true),
    };
  });

  return res.status(200).json(result);
});

/**
 * PUT /api/admin/niches/:nicheId/fields
 * Atualiza governança de campos canônicos (ativação, entrada manual e via integração)
 */
router.put('/niches/:nicheId/fields', requirePermission('niches.manage'), requireCsrf, async (req: Request, res: Response) => {
  const companyId = req.principal!.company.id;
  const { nicheId } = req.params;
  const { fields } = req.body;

  if (!NICHES.some((n) => n.id === nicheId)) {
    return res.status(404).json({ error: `Nicho '${nicheId}' não encontrado.`, code: 'NICHE_NOT_FOUND' });
  }

  if (!Array.isArray(fields)) {
    return res.status(400).json({ error: 'A lista de campos deve ser fornecida.', code: 'INVALID_FIELDS_LIST' });
  }

  const integrationFields = getIntegrationFieldsByNiche(nicheId);
  const validFields = new Set<string>([
    ...integrationFields.map((f) => f.id),
    ...SYSTEM_FIELDS.map((f) => f.id),
  ]);

  for (const item of fields) {
    if (!validFields.has(item.fieldId)) {
      return res.status(400).json({ error: `Campo canônico inválido para o nicho '${nicheId}': '${item.fieldId}'.`, code: 'INVALID_FIELD' });
    }
  }

  // Persistir alterações
  for (const item of fields) {
    await CompanyConfigurationRepository.setFieldConfig(companyId, nicheId, item.fieldId, {
      enabled: item.enabled,
      availableForManual: item.availableForManual,
      availableForIntegration: item.availableForIntegration,
    });
  }

  const updated = await CompanyConfigurationRepository.getFields(companyId, nicheId);
  return res.status(200).json(updated);
});

// ==========================================
// 8. PREVIEW DE CONFIGURAÇÃO EFETIVA (Effective Preview)
// ==========================================

/**
 * GET /api/admin/niches/effective-preview
 * Retorna o snapshot da configuração efetiva da empresa para validação visual antes de publicar
 */
router.get('/niches/effective-preview', requirePermission('niches.view'), async (req: Request, res: Response) => {
  const companyId = req.principal!.company.id;
  const effectiveConfig = await EffectiveConfigurationService.resolve({ companyId });
  return res.status(200).json(effectiveConfig);
});

// ==========================================
// 9. NICHOS PERMITIDOS POR PERFIL (Role Niches)
// ==========================================

/**
 * GET /api/admin/roles/:id/niches
 * Retorna restrição de nichos permitidos por papel (Anti-IDOR)
 */
router.get('/roles/:id/niches', requirePermission('roles.view'), async (req: Request, res: Response) => {
  const companyId = req.principal!.company.id;
  const roleId = req.params.id;

  const role = await RoleRepository.findById(roleId);
  if (!role || role.companyId !== companyId) {
    return res.status(404).json({ error: 'Perfil não encontrado.', code: 'ROLE_NOT_FOUND' });
  }

  const nicheAccess = await RoleRepository.getRoleNicheAccess(role.id);
  return res.status(200).json({
    roleId: role.id,
    nicheAccess,
  });
});

/**
 * PUT /api/admin/roles/:id/niches
 * Atualiza nichos permitidos por papel (Anti-IDOR)
 */
router.put('/roles/:id/niches', requirePermission('roles.manage'), requireCsrf, async (req: Request, res: Response) => {
  const companyId = req.principal!.company.id;
  const roleId = req.params.id;
  const { nicheAccess } = req.body;

  const role = await RoleRepository.findById(roleId);
  if (!role || role.companyId !== companyId) {
    return res.status(404).json({ error: 'Perfil não encontrado.', code: 'ROLE_NOT_FOUND' });
  }

  if (!nicheAccess || typeof nicheAccess !== 'object') {
    return res.status(400).json({ error: 'nicheAccess deve ser um objeto com mapeamento de nichos.', code: 'INVALID_NICHE_ACCESS_FORMAT' });
  }

  // Validar se todas as chaves pertencem aos 11 nichos canônicos
  for (const nid of Object.keys(nicheAccess)) {
    if (!NICHES.some((n) => n.id === nid)) {
      return res.status(400).json({ error: `Nicho inválido ou desconhecido: '${nid}'.`, code: 'INVALID_NICHE' });
    }
  }

  for (const [nid, allowed] of Object.entries(nicheAccess)) {
    await RoleRepository.setRoleNicheAccess(role.id, nid, Boolean(allowed));
  }

  const updated = await RoleRepository.getRoleNicheAccess(role.id);
  return res.status(200).json({
    roleId: role.id,
    nicheAccess: updated,
  });
});

export default router;
