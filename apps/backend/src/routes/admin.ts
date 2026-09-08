import { Router, Request, Response } from 'express';
import {
  requireAuthenticatedUser,
  requirePermission,
  requireCsrf,
} from '../middleware/authMiddleware.js';
import {
  CompanyRepository,
  UserRepository,
  RoleRepository,
  CANONICAL_PERMISSIONS,
} from '../repositories/adminRepositories.js';
import { SessionRepository } from '../repositories/sessionRepository.js';
import { PasswordService } from '../services/passwordService.js';

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
 * Retorna catálogo canônico de 25 permissões
 */
router.get('/permissions', async (_req: Request, res: Response) => {
  return res.status(200).json(CANONICAL_PERMISSIONS);
});

// ==========================================
// 3. USUÁRIOS (Users)
// ==========================================

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
      return {
        ...u,
        roles,
      };
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
  const { name, email, password, status, roleIds } = req.body;

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

  return res.status(201).json({
    ...user,
    roles,
  });
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

  return res.status(200).json({
    ...user,
    roles,
  });
});

/**
 * PUT /api/admin/users/:id
 * Atualiza dados, status ou perfis de um usuário (Anti-IDOR & Anti-Lockout)
 */
router.put('/users/:id', requirePermission('users.manage'), requireCsrf, async (req: Request, res: Response) => {
  const companyId = req.principal!.company.id;
  const targetId = req.params.id;
  const { name, email, status, roleIds } = req.body;

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

  return res.status(200).json({
    ...updatedUser,
    roles: updatedRoles,
  });
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
      const permissions = await RoleRepository.getRolePermissions(r.id);
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

  // Validar permissões fornecidas
  if (Array.isArray(permissions)) {
    for (const perm of permissions) {
      if (!CANONICAL_PERMISSIONS.some((p) => p.code === perm)) {
        return res.status(400).json({ error: `Permissão inválida: '${perm}'.`, code: 'INVALID_PERMISSION' });
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

  // Validar se todas as permissões existem no catálogo canônico
  for (const perm of permissions) {
    if (!CANONICAL_PERMISSIONS.some((p) => p.code === perm)) {
      return res.status(400).json({ error: `Permissão inválida: '${perm}'.`, code: 'INVALID_PERMISSION' });
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

export default router;
