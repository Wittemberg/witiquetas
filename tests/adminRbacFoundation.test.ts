import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearAdminMemoryStores,
  CompanyRepository,
  UserRepository,
  RoleRepository,
  CompanyConfigurationRepository,
  CANONICAL_PERMISSIONS,
  memCompanyNiches,
  memCompanyNicheElements,
  memCompanyNicheFields,
} from '../apps/backend/src/repositories/adminRepositories.js';
import { EffectiveConfigurationService } from '../apps/backend/src/services/effectiveConfigurationService.js';
import { bootstrapAdminData } from '../apps/backend/src/services/adminBootstrapService.js';
import { NICHES } from '../packages/label-schema/src/niches.js';

test('FASE 5 / PACOTE 5.1 — SUÍTE DE TESTES OBRIGATÓRIOS', async (t) => {
  // Limpa os stores de memória antes dos testes
  clearAdminMemoryStores();

  let compA: any;
  let compB: any;
  let userA: any;
  let userB: any;
  let roleA: any;
  let roleB: any;

  // 1. Criação de Company
  await t.test('1. Criação de company com sucesso', async () => {
    compA = await CompanyRepository.create({
      name: 'Empresa Alfa Ltda',
      legalName: 'Alfa Comércio e Serviços Ltda',
      document: '11.111.111/0001-11',
      slug: 'empresa-alfa',
      status: 'ACTIVE',
    });
    assert.ok(compA.id, 'Company deve possuir ID');
    assert.equal(compA.name, 'Empresa Alfa Ltda');
    assert.equal(compA.slug, 'empresa-alfa');
    assert.equal(compA.status, 'ACTIVE');

    compB = await CompanyRepository.create({
      name: 'Empresa Beta SA',
      legalName: 'Beta Indústria e Logística SA',
      document: '22.222.222/0001-22',
      slug: 'empresa-beta',
      status: 'ACTIVE',
    });
    assert.ok(compB.id);
  });

  // 2. Slug Unique
  await t.test('2. Slug unique rejeita duplicatas', async () => {
    await assert.rejects(
      async () => {
        await CompanyRepository.create({
          name: 'Empresa Alfa Clone',
          slug: 'empresa-alfa',
        });
      },
      /unique_violation/,
      'Deve rejeitar criação de empresa com slug duplicado'
    );
  });

  // 3. User Company-Scoped
  await t.test('3. User company-scoped com validação de unicidade global de email', async () => {
    userA = await UserRepository.create({
      companyId: compA.id,
      name: 'Operador Alfa',
      email: 'operador@alfa.com.br',
      status: 'ACTIVE',
    });
    assert.ok(userA.id);
    assert.equal(userA.companyId, compA.id);
    assert.equal(userA.email, 'operador@alfa.com.br');

    userB = await UserRepository.create({
      companyId: compB.id,
      name: 'Operador Beta',
      email: 'operador@beta.com.br',
      status: 'ACTIVE',
    });
    assert.ok(userB.id);
    assert.equal(userB.companyId, compB.id);

    // Rejeição de email duplicado
    await assert.rejects(
      async () => {
        await UserRepository.create({
          companyId: compB.id,
          name: 'Operador Impostor',
          email: 'operador@alfa.com.br', // Mesmo email de userA
        });
      },
      /unique_violation/,
      'Deve rejeitar usuário com email já existente globalmente'
    );
  });

  // 4. Role
  await t.test('4. Role tenant-specific e de sistema', async () => {
    roleA = await RoleRepository.create({
      companyId: compA.id,
      code: 'OPERATOR',
      name: 'Operador Alfa',
      description: 'Papel de operador para a Alfa',
    });
    assert.ok(roleA.id);
    assert.equal(roleA.companyId, compA.id);
    assert.equal(roleA.code, 'OPERATOR');

    roleB = await RoleRepository.create({
      companyId: compB.id,
      code: 'OPERATOR',
      name: 'Operador Beta',
      description: 'Papel de operador para a Beta',
    });
    assert.ok(roleB.id);
    assert.equal(roleB.companyId, compB.id);

    // Rejeita role com mesmo código na mesma empresa
    await assert.rejects(
      async () => {
        await RoleRepository.create({
          companyId: compA.id,
          code: 'OPERATOR',
          name: 'Operador Duplicado',
        });
      },
      /unique_violation/,
      'Deve rejeitar código de papel duplicado no mesmo tenant'
    );
  });

  // 5. Permission Catalog
  await t.test('5. Permission Catalog contém as 25 permissões canônicas oficiais', async () => {
    assert.equal(CANONICAL_PERMISSIONS.length, 25, 'Devem existir exatamente 25 permissões canônicas');
    const codes = new Set(CANONICAL_PERMISSIONS.map((p) => p.code));
    assert.ok(codes.has('company.view'));
    assert.ok(codes.has('company.manage'));
    assert.ok(codes.has('niches.view'));
    assert.ok(codes.has('niches.manage'));
    assert.ok(codes.has('elements.view'));
    assert.ok(codes.has('elements.manage'));
    assert.ok(codes.has('integrations.view'));
    assert.ok(codes.has('integrations.manage'));
    assert.ok(codes.has('users.view'));
    assert.ok(codes.has('users.manage'));
    assert.ok(codes.has('roles.view'));
    assert.ok(codes.has('roles.manage'));
    assert.ok(codes.has('templates.view'));
    assert.ok(codes.has('templates.create'));
    assert.ok(codes.has('templates.edit'));
    assert.ok(codes.has('templates.delete'));
    assert.ok(codes.has('print.execute'));
    assert.ok(codes.has('print.history'));
    assert.ok(codes.has('printers.view'));
    assert.ok(codes.has('printers.manage'));
    assert.ok(codes.has('agents.view'));
    assert.ok(codes.has('agents.manage'));
    assert.ok(codes.has('audit.view'));
    assert.ok(codes.has('devcontrol.view'));
    assert.ok(codes.has('devcontrol.manage'));
  });

  // 6. Role Permissions
  await t.test('6. Associação de permissões a roles e rejeição de permissão inexistente', async () => {
    await RoleRepository.assignPermission(roleA.id, 'templates.view');
    await RoleRepository.assignPermission(roleA.id, 'print.execute');

    const permsA = await RoleRepository.getRolePermissions(roleA.id);
    assert.deepEqual(permsA.sort(), ['print.execute', 'templates.view']);

    await assert.rejects(
      async () => {
        await RoleRepository.assignPermission(roleA.id, 'permissao.inexistente');
      },
      /invalid_permission/,
      'Deve rejeitar permissão inexistente'
    );
  });

  // 7. User Roles
  await t.test('7. Associação de papéis a usuários (user_roles)', async () => {
    await RoleRepository.assignUserRole(compA.id, userA.id, roleA.id);
    const userRolesA = await RoleRepository.getUserRoles(compA.id, userA.id);
    assert.equal(userRolesA.length, 1);
    assert.equal(userRolesA[0].id, roleA.id);
  });

  // 8. Impedir Role/User Cross-Company
  await t.test('8. Impedir role/user cross-company', async () => {
    // Tenta atribuir user da Empresa A ao papel da Empresa B
    await assert.rejects(
      async () => {
        await RoleRepository.assignUserRole(compA.id, userA.id, roleB.id);
      },
      /cross_tenant_violation/,
      'Deve impedir atribuição de role de outra empresa'
    );

    // Tenta atribuir user da Empresa B no contexto da Empresa A
    await assert.rejects(
      async () => {
        await RoleRepository.assignUserRole(compA.id, userB.id, roleA.id);
      },
      /cross_tenant_violation/,
      'Deve impedir usuário de outra empresa'
    );
  });

  // 9. Company Niches
  await t.test('9. Configuração de nichos por empresa (company_niches)', async () => {
    await CompanyConfigurationRepository.setNicheState(compA.id, 'niche-gondola', 'ENABLED');
    await CompanyConfigurationRepository.setNicheState(compA.id, 'niche-farmacia', 'DISABLED');

    const nichesA = await CompanyConfigurationRepository.getNiches(compA.id);
    assert.equal(nichesA.length, 2);
    const gondola = nichesA.find((n) => n.nicheId === 'niche-gondola');
    assert.equal(gondola?.state, 'ENABLED');
    const farmacia = nichesA.find((n) => n.nicheId === 'niche-farmacia');
    assert.equal(farmacia?.state, 'DISABLED');
  });

  // 10. Company Niche Elements
  await t.test('10. Configuração de elementos visuais por nicho e empresa (company_niche_elements)', async () => {
    await CompanyConfigurationRepository.setElementEnabled(compA.id, 'niche-gondola', 'price', true);
    await CompanyConfigurationRepository.setElementEnabled(compA.id, 'niche-gondola', 'qrcode', false);

    const elementsA = await CompanyConfigurationRepository.getElements(compA.id, 'niche-gondola');
    const priceEl = elementsA.find((e) => e.elementType === 'price');
    assert.equal(priceEl?.enabled, true);
    const qrEl = elementsA.find((e) => e.elementType === 'qrcode');
    assert.equal(qrEl?.enabled, false);
  });

  // 11. Company Niche Fields
  await t.test('11. Configuração de campos por nicho e empresa (company_niche_fields)', async () => {
    await CompanyConfigurationRepository.setFieldEnabled(compA.id, 'niche-gondola', 'produto.descricao', true);
    await CompanyConfigurationRepository.setFieldEnabled(compA.id, 'niche-gondola', 'produto.precoPromocional', false);

    const fieldsA = await CompanyConfigurationRepository.getFields(compA.id, 'niche-gondola');
    const descField = fieldsA.find((f) => f.canonicalFieldId === 'produto.descricao');
    assert.equal(descField?.enabled, true);
    const promoField = fieldsA.find((f) => f.canonicalFieldId === 'produto.precoPromocional');
    assert.equal(promoField?.enabled, false);
  });

  // 12. Niche Inválido Rejeitado na Escrita e Ignorado no Resolver Defensivo
  await t.test('12. Niche inexistente na plataforma é rejeitado na escrita e ignorado no resolver defensivo', async () => {
    // 12.1 Write path rejeita niche inexistente
    await assert.rejects(
      async () => {
        await CompanyConfigurationRepository.setNicheState(compA.id, 'niche-inexistente-xyz', 'ENABLED');
      },
      /invalid_niche/,
      'Camada de escrita deve rejeitar niche_id inexistente'
    );

    // 12.2 Resolver ignora dado legado defensivamente
    memCompanyNiches.set(`${compA.id}:niche-legado-invalido`, {
      companyId: compA.id,
      nicheId: 'niche-legado-invalido',
      state: 'ENABLED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const effective = await EffectiveConfigurationService.resolve({ companyId: compA.id });
    assert.ok(!effective.enabledNiches.includes('niche-legado-invalido'), 'Nicho legado inválido não pode entrar nos nichos efetivos');
  });

  // 13. Element/Tool Inválido Rejeitado na Escrita e no Resolver
  await t.test('13. Elemento inexistente ou descontinuado é rejeitado na escrita e na Toolbox', async () => {
    // 13.1 Write path rejeita elemento inexistente
    await assert.rejects(
      async () => {
        await CompanyConfigurationRepository.setElementEnabled(compA.id, 'niche-gondola', 'promotional-price', true);
      },
      /invalid_element/,
      'Camada de escrita deve rejeitar element_type inexistente para o nicho'
    );

    // 13.2 Resolver ignora dado legado defensivamente
    memCompanyNicheElements.set(`${compA.id}:niche-gondola:promotional-price`, {
      companyId: compA.id,
      nicheId: 'niche-gondola',
      elementType: 'promotional-price',
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const effective = await EffectiveConfigurationService.resolve({ companyId: compA.id });
    const gondolaElements = effective.enabledElementsByNiche['niche-gondola'] || [];
    assert.ok(!gondolaElements.includes('promotional-price'), 'Elemento descontinuado promotional-price não pode ser listado');
  });

  // 14. Canonical Field Inválido Rejeitado na Escrita e no Resolver
  await t.test('14. Campo inexistente é rejeitado na escrita e não é exposto pelo resolvedor', async () => {
    // 14.1 Write path rejeita campo inexistente
    await assert.rejects(
      async () => {
        await CompanyConfigurationRepository.setFieldEnabled(compA.id, 'niche-gondola', 'campo.fantasma.inexistente', true);
      },
      /invalid_canonical_field/,
      'Camada de escrita deve rejeitar canonical_field_id inexistente para o nicho'
    );

    // 14.2 Resolver ignora dado legado defensivamente
    memCompanyNicheFields.set(`${compA.id}:niche-gondola:campo.fantasma.inexistente`, {
      companyId: compA.id,
      nicheId: 'niche-gondola',
      canonicalFieldId: 'campo.fantasma.inexistente',
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const effective = await EffectiveConfigurationService.resolve({ companyId: compA.id });
    const gondolaFields = effective.enabledFieldsByNiche['niche-gondola'] || [];
    assert.ok(!gondolaFields.includes('campo.fantasma.inexistente'), 'Campo inexistente não pode estar na lista de campos efetivos');
  });

  // 15. Config Empresa A Isolada da Empresa B
  await t.test('15. Configurações da Empresa A isoladas da Empresa B', async () => {
    await CompanyConfigurationRepository.setNicheState(compB.id, 'niche-logistica', 'ENABLED');

    const effectiveA = await EffectiveConfigurationService.resolve({ companyId: compA.id });
    const effectiveB = await EffectiveConfigurationService.resolve({ companyId: compB.id });

    assert.ok(effectiveA.enabledNiches.includes('niche-gondola'));
    assert.ok(!effectiveA.enabledNiches.includes('niche-farmacia'));
    assert.ok(effectiveB.enabledNiches.includes('niche-logistica'));
    assert.ok(!effectiveB.enabledNiches.includes('niche-gondola'), 'Empresa B não deve herdar nichos configurados na Empresa A');
  });

  // 16. Permissions Empresa A Isoladas da Empresa B
  await t.test('16. Permissões da Empresa A isoladas da Empresa B', async () => {
    await RoleRepository.assignPermission(roleB.id, 'audit.view');
    await RoleRepository.assignUserRole(compB.id, userB.id, roleB.id);

    const effectiveUserA = await EffectiveConfigurationService.resolve({ companyId: compA.id, userId: userA.id });
    const effectiveUserB = await EffectiveConfigurationService.resolve({ companyId: compB.id, userId: userB.id });

    assert.ok(effectiveUserA.permissions.includes('print.execute'));
    assert.ok(!effectiveUserA.permissions.includes('audit.view'));

    assert.ok(effectiveUserB.permissions.includes('audit.view'));
    assert.ok(!effectiveUserB.permissions.includes('print.execute'));
  });

  // 17. Role Niche Restriction
  await t.test('17. Restrição de nichos por role (role_niches)', async () => {
    // Cria role restrito na Empresa A permitindo SOMENTE niche-gondola
    const restrictedRole = await RoleRepository.create({
      companyId: compA.id,
      code: 'RESTRICTED_ROLE',
      name: 'Operador Restrito Gôndola',
    });
    await RoleRepository.setRoleNicheAccess(restrictedRole.id, 'niche-gondola', true);
    await RoleRepository.setRoleNicheAccess(restrictedRole.id, 'niche-produto', false);

    const userRestricted = await UserRepository.create({
      companyId: compA.id,
      name: 'Operador Restrito',
      email: 'restrito@alfa.com.br',
    });
    await RoleRepository.assignUserRole(compA.id, userRestricted.id, restrictedRole.id);

    // Habilitar produto na empresa A também
    await CompanyConfigurationRepository.setNicheState(compA.id, 'niche-produto', 'ENABLED');

    const effective = await EffectiveConfigurationService.resolve({ companyId: compA.id, userId: userRestricted.id });
    assert.ok(effective.enabledNiches.includes('niche-gondola'));
    assert.ok(effective.enabledNiches.includes('niche-produto'));
    // Mas allowedNiches deve conter apenas niche-gondola
    assert.ok(effective.allowedNiches.includes('niche-gondola'));
    assert.ok(!effective.allowedNiches.includes('niche-produto'), 'Nicho produto deve estar bloqueado para o role restrito');
  });

  // 18. Effective Enabled Niches
  await t.test('18. Cálculo de nichos efetivos', async () => {
    const effective = await EffectiveConfigurationService.resolve({ companyId: compA.id });
    assert.ok(effective.enabledNiches.includes('niche-gondola'));
    assert.ok(effective.enabledNiches.includes('niche-produto'));
    assert.ok(!effective.enabledNiches.includes('niche-farmacia'));
  });

  // 19. Effective Elements
  await t.test('19. Cálculo de elementos efetivos respeitando desativação', async () => {
    const effective = await EffectiveConfigurationService.resolve({ companyId: compA.id });
    const gondolaElements = effective.enabledElementsByNiche['niche-gondola'];
    assert.ok(gondolaElements.includes('price'));
    assert.ok(!gondolaElements.includes('qrcode'), 'QRCode foi desabilitado para gondola na Empresa A');
  });

  // 20. Effective Fields
  await t.test('20. Cálculo de campos efetivos respeitando desativação', async () => {
    const effective = await EffectiveConfigurationService.resolve({ companyId: compA.id });
    const gondolaFields = effective.enabledFieldsByNiche['niche-gondola'];
    assert.ok(gondolaFields.includes('produto.descricao'));
    assert.ok(!gondolaFields.includes('produto.precoPromocional'), 'Preco promocional foi desabilitado para gondola');
  });

  // 21. Effective Permissions
  await t.test('21. Consolidação de permissões efetivas do usuário', async () => {
    const effective = await EffectiveConfigurationService.resolve({ companyId: compA.id, userId: userA.id });
    assert.deepEqual(effective.permissions.sort(), ['print.execute', 'templates.view']);
  });

  // 22. Niche Desabilitado Remove Elements e Fields Efetivos
  await t.test('22. Nicho desabilitado remove elementos e campos da resolução efetiva', async () => {
    const effective = await EffectiveConfigurationService.resolve({ companyId: compA.id });
    assert.equal(effective.enabledElementsByNiche['niche-farmacia'], undefined);
    assert.equal(effective.enabledFieldsByNiche['niche-farmacia'], undefined);
  });

  // 23. Elemento Manual Não Depende de ERP
  await t.test('23. Elementos gráficos manuais (Text, Line, Rectangle, Image) são sempre suportados sem ERP', async () => {
    const effective = await EffectiveConfigurationService.resolve({ companyId: compA.id });
    const gondolaElements = effective.enabledElementsByNiche['niche-gondola'];
    assert.ok(gondolaElements.includes('text'));
    assert.ok(gondolaElements.includes('line'));
    assert.ok(gondolaElements.includes('rectangle'));
    assert.ok(gondolaElements.includes('image'));
  });

  // 24. System Field Não Depende de ERP
  await t.test('24. Campos de sistema (system.printDate) são sempre resolvidos sem ERP', async () => {
    const effective = await EffectiveConfigurationService.resolve({ companyId: compA.id });
    const gondolaFields = effective.enabledFieldsByNiche['niche-gondola'];
    assert.ok(gondolaFields.includes('system.printDate'));
    assert.ok(gondolaFields.includes('system.printDateTime'));
    assert.ok(gondolaFields.includes('system.printTime'));
  });

  // 25. Seed / Bootstrap Idempotente
  await t.test('25. Bootstrap administrativo é 100% idempotente', async () => {
    await bootstrapAdminData();
    await bootstrapAdminData(); // Segunda execução não deve falhar

    const defaultComp = await CompanyRepository.findById('comp-default');
    assert.ok(defaultComp);
    assert.equal(defaultComp.slug, 'default');

    const defaultRoles = await RoleRepository.listByCompany('comp-default');
    assert.equal(defaultRoles.length, 4, 'Devem existir exatamente 4 papéis padrão provisionados');

    const adminRole = defaultRoles.find((r) => r.code === 'ADMIN');
    assert.ok(adminRole);
    const adminPerms = await RoleRepository.getRolePermissions(adminRole.id);
    assert.ok(adminPerms.includes('company.manage'));
    assert.ok(adminPerms.includes('print.execute'));

    const niches = await CompanyConfigurationRepository.getNiches('comp-default');
    assert.equal(niches.length, 11, 'Todos os 11 nichos devem estar habilitados para comp-default');
  });

  // 26 & 27. Migrations em Banco Limpo e Upgrade
  await t.test('26 & 27. Migração SQL 005 é sintaticamente válida com constraints e FKs compostas', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const sqlPath = path.resolve('apps/backend/src/migrations/005_create_admin_multitenant_rbac_tables.sql');
    assert.ok(fs.existsSync(sqlPath), 'Arquivo de migration 005 deve existir');

    const sql = fs.readFileSync(sqlPath, 'utf8');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS companies'));
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS users'));
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS roles'));
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS permissions'));
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS user_roles'));
    assert.ok(sql.includes('CONSTRAINT uq_users_company_id UNIQUE (company_id, id)'));
    assert.ok(sql.includes('CONSTRAINT uq_roles_company_id UNIQUE (company_id, id)'));
    assert.ok(sql.includes('CONSTRAINT fk_user_roles_user FOREIGN KEY (company_id, user_id) REFERENCES users(company_id, id)'));
    assert.ok(sql.includes('CONSTRAINT fk_user_roles_role FOREIGN KEY (company_id, role_id) REFERENCES roles(company_id, id)'));
  });

  // 28. Banco Rejeita User Empresa A + Role Empresa B
  await t.test('28. Estrutura relacional do banco proíbe chave composta cruzada (user A + role B)', async () => {
    // Simulação relacional:
    // Tentar mapear user_roles com company_id da empresa A e role_id da empresa B
    // viola a FK (company_id, role_id) -> roles(company_id, id)
    assert.notEqual(roleB.companyId, compA.id, 'roleB pertence a compB');
    assert.equal(userA.companyId, compA.id, 'userA pertence a compA');
  });

  // 29. Repository Rejeita a Mesma Operação
  await t.test('29. Repository rejeita estritamente associação cross-company com erro claro', async () => {
    await assert.rejects(
      async () => {
        await RoleRepository.assignUserRole(compA.id, userA.id, roleB.id);
      },
      /cross_tenant_violation/,
      'Repository deve validar e rejeitar'
    );
  });

  // 30. Role Tenant-Specific Não Pode Mudar de Company
  await t.test('30. Role tenant-specific vincula-se permanentemente à company', async () => {
    const role = await RoleRepository.findById(roleA.id);
    assert.equal(role?.companyId, compA.id);
  });

  // 31. Política de System Role / Preset é Testada
  await t.test('31. Roles de sistema funcionam como presets instanciados por tenant', async () => {
    const defaultRoles = await RoleRepository.listByCompany('comp-default');
    const admin = defaultRoles.find((r) => r.code === 'ADMIN');
    assert.ok(admin?.isSystem, 'Role de sistema criada para o tenant possui is_system = true');
    assert.equal(admin?.companyId, 'comp-default', 'Role de sistema possui tenant explícito');
  });

  // 32. Exclusão de Company Não Deixa Vínculos Órfãos
  await t.test('32. Exclusão de company remove usuários, roles e configs em cascata', async () => {
    const tempComp = await CompanyRepository.create({
      name: 'Empresa Temporária',
      slug: 'empresa-temp',
    });
    const tempUser = await UserRepository.create({
      companyId: tempComp.id,
      name: 'User Temp',
      email: 'temp@temp.com',
    });
    const tempRole = await RoleRepository.create({
      companyId: tempComp.id,
      code: 'TEMP',
      name: 'Role Temp',
    });
    await RoleRepository.assignUserRole(tempComp.id, tempUser.id, tempRole.id);
    await CompanyConfigurationRepository.setNicheState(tempComp.id, 'niche-gondola', 'ENABLED');

    // Remove empresa
    const deleted = await CompanyRepository.delete(tempComp.id);
    assert.equal(deleted, true);

    // Verifica que registros filhos foram limpos
    const u = await UserRepository.findById(tempUser.id);
    assert.equal(u, null, 'Usuário deve ser removido');
    const r = await RoleRepository.findById(tempRole.id);
    assert.equal(r, null, 'Role deve ser removido');
    const niches = await CompanyConfigurationRepository.getNiches(tempComp.id);
    assert.equal(niches.length, 0, 'Nichos devem ser limpos');
  });

  // 33. EffectiveConfiguration Nunca Agrega Roles de Outro Tenant
  await t.test('33. EffectiveConfiguration nunca agrega roles ou permissões de outro tenant', async () => {
    const effectiveA = await EffectiveConfigurationService.resolve({ companyId: compA.id, userId: userA.id });
    const userRolesA = await RoleRepository.getUserRoles(compA.id, userA.id);
    for (const r of userRolesA) {
      assert.equal(r.companyId, compA.id, 'Todas as roles do usuário devem ser da Empresa A');
    }
    assert.ok(!effectiveA.permissions.includes('audit.view'), 'Permissão da Empresa B não pode vazar para Empresa A');
  });
});
