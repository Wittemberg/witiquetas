import type { EffectiveCompanyConfigurationDTO } from '@witiquetas/contracts';
import {
  NICHES,
  getNicheToolboxConfig,
  getIntegrationFieldsByNiche,
  SYSTEM_FIELDS,
} from '@witiquetas/label-schema';
import {
  CompanyRepository,
  UserRepository,
  RoleRepository,
  CompanyConfigurationRepository,
} from '../repositories/adminRepositories.js';

export interface EffectiveConfigurationOptions {
  companyId: string;
  userId?: string;
}

export const EffectiveConfigurationService = {
  /**
   * Computa a configuração efetiva para uma empresa e opcionalmente um usuário:
   *
   * 1. Empresa deve existir e estar ACTIVE.
   * 2. Se userId for passado, usuário deve pertencer a esta empresa e estar ACTIVE.
   * 3. Nichos Efetivos = Nichos da Plataforma ∩ Nichos Habilitados pela Empresa (state === 'ENABLED')
   *    Se usuário for passado: ∩ Nichos Permitidos pelos papéis do usuário (role_niches).
   * 4. Elementos Efetivos por Nicho = Elementos suportados pela plataforma para o nicho ∩ Elementos Habilitados pela Empresa.
   *    (Elementos manuais gráficos 'text', 'line', 'rectangle', 'image' nunca são bloqueados por integrações externas/ERP).
   * 5. Campos Efetivos por Nicho = Campos do catálogo (integração + sistema) ∩ Campos Habilitados pela Empresa.
   *    (Campos do sistema 'system.*' nunca são bloqueados por integrações ERP).
   * 6. Permissões = União de todas as permissões concedidas aos papéis do usuário na empresa.
   */
  async resolve(options: EffectiveConfigurationOptions): Promise<EffectiveCompanyConfigurationDTO> {
    const { companyId, userId } = options;

    const company = await CompanyRepository.findById(companyId);
    if (!company) {
      throw new Error(`company_not_found: company '${companyId}' not found`);
    }
    if (company.status !== 'ACTIVE') {
      throw new Error(`company_inactive: company '${companyId}' is INACTIVE`);
    }

    let userRoles: any[] = [];
    let userPermissions = new Set<string>();
    let roleAllowedNiches: Set<string> | null = null;

    if (userId) {
      const user = await UserRepository.findById(userId);
      if (!user) {
        throw new Error(`user_not_found: user '${userId}' not found`);
      }
      if (user.companyId !== companyId) {
        throw new Error(`cross_tenant_violation: user '${userId}' belongs to '${user.companyId}', not '${companyId}'`);
      }
      if (user.status !== 'ACTIVE') {
        throw new Error(`user_inactive: user '${userId}' is INACTIVE`);
      }

      userRoles = await RoleRepository.getUserRoles(companyId, userId);
      roleAllowedNiches = new Set<string>();

      // Se o usuário tiver papéis, agrega permissões e restrições de nichos
      for (const role of userRoles) {
        const perms = await RoleRepository.getRolePermissions(role.id);
        for (const p of perms) {
          userPermissions.add(p);
        }

        const nicheAccess = await RoleRepository.getRoleNicheAccess(role.id);
        const configuredNicheIds = Object.keys(nicheAccess);
        if (configuredNicheIds.length === 0) {
          // Se o papel não tem restrições explícitas cadastradas em role_niches, permite todos por padrão
          for (const n of NICHES) {
            roleAllowedNiches.add(n.id);
          }
        } else {
          for (const [nid, allowed] of Object.entries(nicheAccess)) {
            if (allowed) {
              roleAllowedNiches.add(nid);
            }
          }
        }
      }
    }

    // 1. Nichos Habilitados pela Empresa
    const companyNichesConfigs = await CompanyConfigurationRepository.getNiches(companyId);
    const enabledNicheSet = new Set<string>();

    if (companyNichesConfigs.length === 0) {
      // Fallback permissivo para empresa inicial se ainda não configurada: todos os 11 nichos
      for (const n of NICHES) {
        enabledNicheSet.add(n.id);
      }
    } else {
      for (const c of companyNichesConfigs) {
        if (c.state === 'ENABLED') {
          enabledNicheSet.add(c.nicheId);
        }
      }
    }

    // Intersecção: Plataforma ∩ Empresa
    const platformNicheIds = new Set(NICHES.map((n) => n.id));
    const enabledNiches = Array.from(enabledNicheSet).filter((nid) => platformNicheIds.has(nid));

    // Allowed Niches = Enabled Niches (filtrados por papéis do usuário se aplicável)
    let allowedNiches: string[] = enabledNiches;
    if (roleAllowedNiches !== null) {
      if (userRoles.length === 0) {
        // Usuário sem nenhum papel não tem acesso a nichos
        allowedNiches = [];
      } else {
        allowedNiches = enabledNiches.filter((nid) => roleAllowedNiches!.has(nid));
      }
    }

    // 2. Elementos Efetivos por Nicho
    const enabledElementsByNiche: Record<string, string[]> = {};
    const companyElementConfigs = await CompanyConfigurationRepository.getElements(companyId);

    // Mapear elementos explicitamente desabilitados/habilitados pela empresa: key = "nicheId:elementType"
    const elementConfigMap = new Map<string, boolean>();
    for (const ec of companyElementConfigs) {
      elementConfigMap.set(`${ec.nicheId}:${ec.elementType}`, ec.enabled);
    }

    for (const nicheId of enabledNiches) {
      const toolbox = getNicheToolboxConfig(nicheId);
      const platformToolTypes = new Set<string>();
      for (const tool of [...toolbox.recommendedTools, ...toolbox.availableTools]) {
        platformToolTypes.add(tool.elementType);
      }

      // Adicionar explicitamente as formas manuais suportadas
      platformToolTypes.add('text');
      platformToolTypes.add('line');
      platformToolTypes.add('rectangle');
      platformToolTypes.add('image');

      const effectiveElements: string[] = [];
      for (const elType of platformToolTypes) {
        const configKey = `${nicheId}:${elType}`;
        const isConfigured = elementConfigMap.has(configKey);
        // Se configurado, obedece. Se não configurado, default é true (habilitado)
        const isEnabled = isConfigured ? elementConfigMap.get(configKey)! : true;
        if (isEnabled) {
          effectiveElements.push(elType);
        }
      }
      enabledElementsByNiche[nicheId] = effectiveElements;
    }

    // 3. Campos Efetivos por Nicho
    const enabledFieldsByNiche: Record<string, string[]> = {};
    const companyFieldConfigs = await CompanyConfigurationRepository.getFields(companyId);

    // Mapear campos explicitamente desabilitados/habilitados: key = "nicheId:fieldId"
    const fieldConfigMap = new Map<string, boolean>();
    for (const fc of companyFieldConfigs) {
      fieldConfigMap.set(`${fc.nicheId}:${fc.canonicalFieldId}`, fc.enabled);
    }

    for (const nicheId of enabledNiches) {
      const integrationFields = getIntegrationFieldsByNiche(nicheId);
      const allAvailableFields = [...integrationFields, ...SYSTEM_FIELDS];

      const effectiveFields: string[] = [];
      for (const f of allAvailableFields) {
        const configKey = `${nicheId}:${f.id}`;
        const isConfigured = fieldConfigMap.has(configKey);
        // Default é habilitado se não desabilitado explicitamente
        const isEnabled = isConfigured ? fieldConfigMap.get(configKey)! : true;
        if (isEnabled) {
          effectiveFields.push(f.id);
        }
      }
      enabledFieldsByNiche[nicheId] = effectiveFields;
    }

    return {
      company,
      enabledNiches,
      allowedNiches,
      enabledElementsByNiche,
      enabledFieldsByNiche,
      permissions: Array.from(userPermissions),
    };
  },
};
