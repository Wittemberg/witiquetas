import { pgPool } from '../db.js';
import {
  CANONICAL_PERMISSIONS,
  CompanyRepository,
  RoleRepository,
  CompanyConfigurationRepository,
} from '../repositories/adminRepositories.js';
import { NICHES } from '@witiquetas/label-schema';

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

  // 4. Habilitar todos os 11 nichos para a empresa padrão (retrocompatibilidade total)
  for (const niche of NICHES) {
    await CompanyConfigurationRepository.setNicheState(defaultCompanyId, niche.id, 'ENABLED');
  }

  console.log('[AdminBootstrap] Bootstrap concluído com sucesso e 100% idempotente.');
}
