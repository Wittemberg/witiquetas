import { pgPool } from '../db.js';
import {
  CANONICAL_PERMISSIONS,
  CompanyRepository,
  UserRepository,
  RoleRepository,
  CompanyConfigurationRepository,
} from '../repositories/adminRepositories.js';
import { PasswordService } from './passwordService.js';
import {
  NICHES,
  DEFAULT_NICHE_PROFILES,
  getAllDefaultNicheProfiles,
  CanonicalElementType,
} from '@witiquetas/label-schema';

export const STANDARD_ROLES = [
  {
    code: 'ADMIN',
    name: 'Administrador da Empresa',
    description: 'Acesso completo a configurações, usuários, papéis, nichos e templates.',
    permissions: [
      'company.view',
      'company.manage',
      'niches.view',
      'niches.manage',
      'elements.view',
      'elements.manage',
      'integrations.view',
      'integrations.manage',
      'users.view',
      'users.manage',
      'roles.view',
      'roles.manage',
      'templates.view',
      'templates.create',
      'templates.edit',
      'templates.delete',
      'print.execute',
      'print.history',
      'printers.view',
      'printers.manage',
      'agents.view',
      'agents.manage',
      'audit.view',
      'devcontrol.view',
    ],
  },
  {
    code: 'DESIGNER',
    name: 'Designer de Etiquetas',
    description: 'Criação e edição de modelos de etiquetas e visualização de nichos/elementos.',
    permissions: [
      'company.view',
      'niches.view',
      'elements.view',
      'integrations.view',
      'templates.view',
      'templates.create',
      'templates.edit',
      'templates.delete',
      'print.execute',
      'print.history',
      'printers.view',
    ],
  },
  {
    code: 'SUPERVISOR',
    name: 'Supervisor de Operações',
    description: 'Supervisão de trabalhos de impressão, relatórios, usuários e histórico.',
    permissions: [
      'company.view',
      'niches.view',
      'users.view',
      'templates.view',
      'print.execute',
      'print.history',
      'printers.view',
      'printers.manage',
      'agents.view',
      'audit.view',
    ],
  },
  {
    code: 'OPERATOR',
    name: 'Operador de Impressão',
    description: 'Execução de trabalhos de impressão na Central e visualização de histórico.',
    permissions: [
      'company.view',
      'niches.view',
      'templates.view',
      'print.execute',
      'print.history',
      'printers.view',
    ],
  },
];

export async function bootstrapAdminData(): Promise<void> {
  console.log('[AdminBootstrap] Inicializando catálogo de permissões e roles padrão...');

  // 1. Inserir ou sincronizar permissões canônicas no banco de dados (se houver pool)
  if (pgPool) {
    for (const perm of CANONICAL_PERMISSIONS) {
      await pgPool.query(
        `INSERT INTO permissions (code, name, description, category)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO UPDATE
         SET name = EXCLUDED.name, description = EXCLUDED.description, category = EXCLUDED.category`,
        [perm.code, perm.name, perm.description, perm.category]
      );
    }
    console.log(`[AdminBootstrap] ${CANONICAL_PERMISSIONS.length} permissões canônicas sincronizadas.`);
  }

  // 2. Garantir a existência da empresa bootstrap 'comp-default'
  const defaultCompanyId = 'comp-default';
  let defaultCompany = await CompanyRepository.findById(defaultCompanyId);
  if (!defaultCompany) {
    defaultCompany = await CompanyRepository.create({
      id: defaultCompanyId,
      name: 'Empresa Padrão',
      legalName: 'Witiquetas Empresa Padrão Ltda',
      document: '00.000.000/0001-00',
      slug: 'default',
      status: 'ACTIVE',
    });
    console.log(`[AdminBootstrap] Empresa padrão '${defaultCompanyId}' criada com sucesso.`);
  }

  // 3. Garantir roles padrão para a empresa 'comp-default'
  for (const stdRole of STANDARD_ROLES) {
    const existingRoles = await RoleRepository.listByCompany(defaultCompanyId);
    let role = existingRoles.find((r) => r.code === stdRole.code);

    if (!role) {
      role = await RoleRepository.create({
        id: `role-default-${stdRole.code.toLowerCase()}`,
        companyId: defaultCompanyId,
        code: stdRole.code,
        name: stdRole.name,
        description: stdRole.description,
        isSystem: true,
      });
      console.log(`[AdminBootstrap] Papel '${stdRole.code}' provisionado para '${defaultCompanyId}'.`);
    }

    // Vincular permissões canônicas do papel
    for (const permCode of stdRole.permissions) {
      await RoleRepository.assignPermission(role.id, permCode);
    }
  }

  // 4. Bootstrap Não-Destrutivo de Nichos, Elementos, Campos e role_niches (Pacote 5.5)
  await bootstrapCompanyNicheProfiles(defaultCompanyId);

  // 5. Bootstrap de Administrador Inicial (suporta override por ENV com fallback padrão de homologação/testes)
  const bootstrapEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@witiquetas.com.br').trim();
  const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Admin@123456';

  if (bootstrapEmail && bootstrapPassword) {
    PasswordService.validateEmail(bootstrapEmail);
    PasswordService.validatePassword(bootstrapPassword);

    const existing = await UserRepository.findByEmail(bootstrapEmail);

    if (existing) {
      if (existing.companyId !== defaultCompanyId) {
        console.warn(
          `[AdminBootstrap] Usuário com email informado já existe associado ao tenant '${existing.companyId}'. Reassociação automática cross-tenant bloqueada por política de segurança.`
        );
      } else {
        console.log(
          '[AdminBootstrap] Usuário administrador inicial já existe no tenant padrão.'
        );
      }
    } else {
      const passwordHash = await PasswordService.hash(bootstrapPassword);
      const newAdmin = await UserRepository.create({
        id: 'usr-admin-default',
        companyId: defaultCompanyId,
        name: 'Administrador do Sistema',
        email: bootstrapEmail,
        status: 'ACTIVE',
        isDccMaster: false,
      });
      await UserRepository.setPassword(newAdmin.id, passwordHash);

      const adminRole = (await RoleRepository.listByCompany(defaultCompanyId)).find(
        (r) => r.code === 'ADMIN'
      );
      if (adminRole) {
        await RoleRepository.assignUserRole(defaultCompanyId, newAdmin.id, adminRole.id);
      }

      console.log(
        `[AdminBootstrap] Usuário administrador bootstrap provisionado com sucesso para tenant '${defaultCompanyId}'. AVISO DE SEGURANÇA: BOOTSTRAP_ADMIN_PASSWORD deve ser removida do ambiente após este primeiro provisionamento.`
      );
    }
  } else {
    console.log('[AdminBootstrap] Nenhuma credencial de bootstrap admin configurada nas variáveis de ambiente.');
  }

  // 6. Atribuição controlada de Master DCC exclusivamente via configuração explícita de plataforma
  const platformMasterEmail = (process.env.PLATFORM_MASTER_DCC_EMAIL || process.env.MASTER_DCC_EMAIL)?.trim();
  if (platformMasterEmail) {
    const userToPromote = await UserRepository.findByEmail(platformMasterEmail);
    if (userToPromote) {
      await UserRepository.setDccMaster(userToPromote.id, true);
      console.log(
        `[AdminBootstrap] Usuário '${platformMasterEmail}' configurado como Master DCC via controle de plataforma.`
      );
    }
  }

  console.log('[AdminBootstrap] Bootstrap concluído com sucesso e 100% idempotente.');
}

/**
 * Bootstrap Não-Destrutivo e Idempotente dos Perfis Padrão (Default Niche Profiles - Pacote 5.5)
 *
 * Popula nichos, elementos visuais, campos canônicos e role_niches para empresas novas ou não configuradas.
 * NUNCA sobrescreve parametrizações manuais de empresas já configuradas.
 */
export async function bootstrapCompanyNicheProfiles(companyId: string): Promise<void> {
  const allProfiles = getAllDefaultNicheProfiles();

  // 1. Nichos Efetivos da Empresa (Idempotente: apenas se a empresa ainda não tiver nichos configurados)
  const existingNiches = await CompanyConfigurationRepository.getNiches(companyId);
  if (existingNiches.length === 0) {
    for (const profile of allProfiles) {
      await CompanyConfigurationRepository.setNicheState(companyId, profile.nicheId, 'ENABLED');
    }
    await CompanyConfigurationRepository.setDefaultNiche(companyId, 'niche-gondola');
    console.log(`[AdminBootstrap] 11 nichos padrão habilitados para empresa '${companyId}' (Default: niche-gondola).`);
  }

  // 2. Elementos Visuais por Nicho (Idempotente: apenas se não houver elementos salvos para a empresa)
  const existingElements = await CompanyConfigurationRepository.getElements(companyId);
  if (existingElements.length === 0) {
    const allElementTypes: CanonicalElementType[] = [
      'text',
      'price',
      'barcode',
      'qrcode',
      'line',
      'rectangle',
      'image',
    ];
    for (const profile of allProfiles) {
      for (const elType of allElementTypes) {
        const enabled = profile.defaultElements.includes(elType);
        await CompanyConfigurationRepository.setElementEnabled(companyId, profile.nicheId, elType, enabled);
      }
    }
    console.log(`[AdminBootstrap] Elementos visuais default provisionados para os 11 nichos da empresa '${companyId}'.`);
  }

  // 3. Campos Canônicos por Nicho (Idempotente: apenas se não houver campos salvos para a empresa)
  const existingFields = await CompanyConfigurationRepository.getFields(companyId);
  if (existingFields.length === 0) {
    for (const profile of allProfiles) {
      for (const field of profile.defaultFields) {
        await CompanyConfigurationRepository.setFieldConfig(companyId, profile.nicheId, field.fieldId, {
          enabled: true,
          availableForManual: field.availableForManual,
          availableForIntegration: field.availableForIntegration,
        });
      }
    }
    console.log(`[AdminBootstrap] Campos canônicos default provisionados para os 11 nichos da empresa '${companyId}'.`);
  }

  // 4. Perfis Padrão e Acesso a Nichos (role_niches - Idempotente)
  const roles = await RoleRepository.listByCompany(companyId);
  for (const role of roles) {
    const existingNicheAccess = await RoleRepository.getRoleNicheAccess(role.id);
    if (Object.keys(existingNicheAccess).length === 0) {
      if (role.code === 'ADMIN' || role.code === 'DESIGNER' || role.code === 'SUPERVISOR') {
        for (const profile of allProfiles) {
          await RoleRepository.setRoleNicheAccess(role.id, profile.nicheId, true);
        }
      } else if (role.code === 'OPERATOR') {
        for (const profile of allProfiles) {
          await RoleRepository.setRoleNicheAccess(role.id, profile.nicheId, profile.operationalForOperator);
        }
      }
    }
  }
}
