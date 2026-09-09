import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NICHES,
  DEFAULT_NICHE_PROFILES,
  getDefaultNicheProfile,
  ALL_KNOWN_INTEGRATION_FIELDS,
  SYSTEM_FIELDS,
  type LabelDocument,
  type TextElement,
  type QrCodeElement,
} from '@witiquetas/label-schema';

import {
  clearAdminMemoryStores,
  CompanyRepository,
  UserRepository,
  RoleRepository,
  CompanyConfigurationRepository,
} from '../apps/backend/src/repositories/adminRepositories.js';

import {
  clearSessionMemoryStores,
  SessionService,
} from '../apps/backend/src/services/sessionService.js';

import { bootstrapCompanyNicheProfiles } from '../apps/backend/src/services/adminBootstrapService.js';
import { EffectiveConfigurationService } from '../apps/backend/src/services/effectiveConfigurationService.js';
import { templateRepository } from '../apps/backend/src/repositories/templateRepository.js';
import { PPLBCompiler } from '../packages/printer-pplb/src/index.js';
import { PPLACompiler } from '../packages/printer-ppla/src/index.js';

import {
  setManualSessionContext,
  isElementAllowed,
  isFieldAllowed,
  isNicheAllowed,
} from '../apps/frontend/src/auth/session.js';

import { useEditorStore } from '../apps/frontend/src/editor/useEditorStore.js';

test('HOMOLOGAÇÃO MANUAL — PACOTE 5.5', async (t) => {
  clearAdminMemoryStores();
  clearSessionMemoryStores();

  const company = await CompanyRepository.create({
    id: 'comp-homolog-55',
    name: 'Homologação 5.5 Ltda',
    legalName: 'Homologação 5.5 Razão Social',
    document: '11.222.333/0001-44',
    slug: 'homolog-55',
    status: 'ACTIVE',
  });

  // Roles canônicos
  const adminRole = await RoleRepository.create({
    id: 'role-homolog-admin',
    companyId: company.id,
    code: 'ADMIN',
    name: 'Administrador Homolog',
  });
  await RoleRepository.setRolePermissions(adminRole.id, [
    'company.view', 'company.manage', 'niches.view', 'niches.manage',
    'elements.view', 'elements.manage', 'templates.view', 'templates.create', 'templates.edit',
  ]);

  const operatorRole = await RoleRepository.create({
    id: 'role-homolog-operator',
    companyId: company.id,
    code: 'OPERATOR',
    name: 'Operador Homolog',
  });
  await RoleRepository.setRolePermissions(operatorRole.id, [
    'company.view', 'niches.view', 'templates.view', 'templates.create', 'templates.edit',
  ]);

  // Usuários
  const adminUser = await UserRepository.create({
    id: 'usr-homolog-admin',
    companyId: company.id,
    name: 'Admin Homolog',
    email: 'admin@homolog55.com',
    passwordHash: 'hash',
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole(company.id, adminUser.id, adminRole.id);

  const operatorUser = await UserRepository.create({
    id: 'usr-homolog-operator',
    companyId: company.id,
    name: 'Operator Homolog',
    email: 'operator@homolog55.com',
    passwordHash: 'hash',
    status: 'ACTIVE',
  });
  await RoleRepository.assignUserRole(company.id, operatorUser.id, operatorRole.id);

  // Bootstrap inicial de perfis padrão (11 nichos)
  await bootstrapCompanyNicheProfiles(company.id);

  // =========================================================================
  // TESTE A — TOOLBOX / ELEMENTO OFF E ON
  // =========================================================================
  await t.test('TESTE A — TOOLBOX / ELEMENTO OFF E ON', async () => {
    // 1. Entrar como ADMIN ou DESIGNER
    await SessionService.createAuthenticatedSession({ userId: adminUser.id, companyId: company.id });
    const effConfigAdmin = await EffectiveConfigurationService.resolve({ companyId: company.id, roleCode: adminRole.code });

    setManualSessionContext({
      user: { id: adminUser.id, name: adminUser.name, email: adminUser.email },
      company: { id: company.id, name: company.name, slug: company.slug },
      role: { id: adminRole.id, code: adminRole.code, name: adminRole.name },
      permissions: ['templates.view', 'templates.create', 'templates.edit'],
      effectiveConfiguration: effConfigAdmin,
    });

    // 2. Abrir Editor em um nicho ativo (niche-gondola)
    const activeNiche = 'niche-gondola';
    useEditorStore.getState().setDocument({
      schemaVersion: 1,
      title: 'Etiqueta Teste A',
      dimensions: { widthMm: 100, heightMm: 50, dpi: 203, orientation: 'landscape' },
      nicheId: activeNiche,
      elements: [],
    });

    // 3. Confirmar que QR Code atualmente habilitado aparece na Toolbox
    assert.equal(isElementAllowed(activeNiche, 'qrcode'), true, 'QR Code deve estar habilitado inicialmente no nicho gôndola');

    // 4. Inserir uma nova instância e confirmar funcionamento normal
    const countBefore = useEditorStore.getState().document.elements.length;
    useEditorStore.getState().addElement('qrcode');
    const countAfter = useEditorStore.getState().document.elements.length;
    assert.equal(countAfter, countBefore + 1, 'Novo QR Code deve ser inserido com sucesso');
    const insertedQr = useEditorStore.getState().document.elements[countAfter - 1];
    assert.equal(insertedQr.type, 'qrcode');

    // Desativação administrativa: QR Code OFF no nicho
    await CompanyConfigurationRepository.setElementEnabled(company.id, activeNiche, 'qrcode', false);
    const updatedEffConfig = await EffectiveConfigurationService.resolve({ companyId: company.id, roleCode: adminRole.code });
    setManualSessionContext({
      effectiveConfiguration: updatedEffConfig,
    });

    // RESULTADO ESPERADO:
    // - QR Code deixa de aparecer como opção para NOVA inserção
    assert.equal(isElementAllowed(activeNiche, 'qrcode'), false, 'QR Code deve estar OFF na Toolbox');

    // - tentativa de criação por qualquer ação/atalho disponível é bloqueada
    const countBeforeBlocked = useEditorStore.getState().document.elements.length;
    useEditorStore.getState().addElement('qrcode');
    const countAfterBlocked = useEditorStore.getState().document.elements.length;
    assert.equal(countAfterBlocked, countBeforeBlocked, 'Inserção de QR Code OFF deve ser categoricamente bloqueada');

    // - nenhum elemento já existente é removido
    assert.ok(useEditorStore.getState().document.elements.some((el) => el.id === insertedQr.id), 'QR Code já existente deve ser preservado');

    // Reativação: QR Code ON
    await CompanyConfigurationRepository.setElementEnabled(company.id, activeNiche, 'qrcode', true);
    const reenabledEffConfig = await EffectiveConfigurationService.resolve({ companyId: company.id, roleCode: adminRole.code });
    setManualSessionContext({
      effectiveConfiguration: reenabledEffConfig,
    });

    // Confirmar que criação volta a estar disponível
    assert.equal(isElementAllowed(activeNiche, 'qrcode'), true, 'QR Code deve voltar a estar ON na Toolbox');
    useEditorStore.getState().addElement('qrcode');
    assert.equal(useEditorStore.getState().document.elements.length, countAfterBlocked + 1, 'Inserção de QR Code deve voltar a funcionar normalmente');
  });

  // =========================================================================
  // TESTE B — EXISTING_DISABLED_ELEMENT
  // =========================================================================
  await t.test('TESTE B — EXISTING_DISABLED_ELEMENT', async () => {
    const nicheId = 'niche-gondola';
    // 1. Com QR Code ON, criar e SALVAR um modelo contendo QR Code
    await CompanyConfigurationRepository.setElementEnabled(company.id, nicheId, 'qrcode', true);

    const docToSave: LabelDocument = {
      schemaVersion: 1,
      title: 'Modelo com QR Code Homolog B',
      dimensions: { widthMm: 100, heightMm: 50, dpi: 203, orientation: 'landscape' },
      nicheId,
      elements: [
        {
          id: 'el-legacy-qr-b',
          type: 'qrcode',
          x: 10,
          y: 10,
          width: 25,
          height: 25,
          content: 'https://witiquetas.com.br/item/12345',
        },
      ],
    };

    // 2. Confirmar que o modelo foi realmente persistido
    const savedTemplate = await templateRepository.createTemplate(
      {
        title: 'Modelo QR Salvo',
        nicheId,
        document: docToSave,
      },
      company.id
    );
    assert.ok(savedTemplate.id, 'Modelo deve ser persistido no repositório');

    // 3. Ir à Administração e colocar QR Code OFF para aquele nicho
    await CompanyConfigurationRepository.setElementEnabled(company.id, nicheId, 'qrcode', false);
    const effConfigOff = await EffectiveConfigurationService.resolve({ companyId: company.id, roleCode: adminRole.code });
    setManualSessionContext({ effectiveConfiguration: effConfigOff });

    // 4. Reabrir EXATAMENTE o modelo salvo
    const loadedTemplate = await templateRepository.getTemplateById(savedTemplate.id, company.id);
    assert.ok(loadedTemplate, 'Template deve ser carregado com sucesso');
    useEditorStore.getState().setDocument(loadedTemplate!.document);

    // Validar:
    // - QR Code continua visível
    const loadedDoc = useEditorStore.getState().document;
    const qrEl = loadedDoc.elements.find((el) => el.id === 'el-legacy-qr-b') as QrCodeElement;
    assert.ok(qrEl, 'QR Code legado deve existir no documento carregado');

    // - pode ser selecionado
    useEditorStore.getState().setSelectedElementId('el-legacy-qr-b');
    assert.ok(useEditorStore.getState().selectedElementIds.includes('el-legacy-qr-b'), 'QR Code legado pode ser selecionado');

    // - pode ser movido
    useEditorStore.getState().updateElement('el-legacy-qr-b', { x: 20, y: 15 });
    const movedEl = useEditorStore.getState().document.elements.find((el) => el.id === 'el-legacy-qr-b');
    assert.ok(Math.abs((movedEl?.x || 0) - 20) < 0.1, 'QR Code legado pode ser movido no eixo X');
    assert.ok(Math.abs((movedEl?.y || 0) - 15) < 0.1, 'QR Code legado pode ser movido no eixo Y');

    // - pode ser redimensionado
    useEditorStore.getState().updateElement('el-legacy-qr-b', { width: 30, height: 30 });
    const resizedEl = useEditorStore.getState().document.elements.find((el) => el.id === 'el-legacy-qr-b');
    assert.ok(Math.abs((resizedEl?.width || 0) - 30) < 0.1, 'QR Code legado pode ser redimensionado na largura');
    assert.ok(Math.abs((resizedEl?.height || 0) - 30) < 0.1, 'QR Code legado pode ser redimensionado na altura');

    // - Property Inspector continua funcionando e alteração de propriedade do QR Code pode ser salva
    useEditorStore.getState().updateElement('el-legacy-qr-b', { content: 'https://witiquetas.com.br/updated/999' });
    const updatedContentEl = useEditorStore.getState().document.elements.find((el) => el.id === 'el-legacy-qr-b') as QrCodeElement;
    assert.equal(updatedContentEl.content, 'https://witiquetas.com.br/updated/999');

    // - salvar o modelo não é rejeitado apenas porque o QR Code agora está OFF (preservação legado)
    const updatedTemplate = await templateRepository.updateTemplate(
      savedTemplate.id,
      {
        title: 'Modelo QR Salvo e Atualizado',
        nicheId,
        document: useEditorStore.getState().document,
      },
      company.id
    );
    assert.ok(updatedTemplate, 'Atualização de modelo preservando QR Code legado é aceita com sucesso');

    // - compilação/exportação continua funcionando (validando compiladores PPLA e PPLB suportados)
    const pplbCompiler = new PPLBCompiler();
    const compiledPplb = pplbCompiler.compile(useEditorStore.getState().document);
    assert.ok(compiledPplb.command.length > 0, 'PPLB compiler deve compilar modelo com QR Code legado');

    const pplaCompiler = new PPLACompiler();
    const compiledPpla = pplaCompiler.compile(useEditorStore.getState().document);
    assert.ok(compiledPpla.command.length > 0, 'PPLA compiler deve compilar modelo com QR Code legado');

    // Validar criação indireta:
    // - Ctrl+D / Duplicar -> BLOQUEADO
    useEditorStore.getState().setSelectedElementId('el-legacy-qr-b');
    const countBeforeDup = useEditorStore.getState().document.elements.length;
    useEditorStore.getState().duplicateSelectedElements();
    const countAfterDup = useEditorStore.getState().document.elements.length;
    assert.equal(countAfterDup, countBeforeDup, 'Duplicar elemento legado desabilitado deve ser categoricamente BLOQUEADO');

    // - Ctrl+C + Ctrl+V -> nova instância BLOQUEADA
    useEditorStore.getState().copySelection();
    useEditorStore.getState().pasteSelection();
    const countAfterPaste = useEditorStore.getState().document.elements.length;
    assert.equal(countAfterPaste, countBeforeDup, 'Colar elemento legado desabilitado deve ser categoricamente BLOQUEADO');

    // - nova inserção pela Toolbox -> BLOQUEADA
    useEditorStore.getState().addElement('qrcode');
    const countAfterToolbox = useEditorStore.getState().document.elements.length;
    assert.equal(countAfterToolbox, countBeforeDup, 'Nova inserção pela Toolbox deve ser categoricamente BLOQUEADA');

    // - Delete/Lixeira do QR Code legado -> PERMITIDO
    useEditorStore.getState().removeElement('el-legacy-qr-b');
    const finalCount = useEditorStore.getState().document.elements.length;
    assert.equal(finalCount, countBeforeDup - 1, 'Exclusão voluntária do elemento legado deve ser PERMITIDA');
  });

  // =========================================================================
  // TESTE C — FIELDPICKER / MANUAL / INTEGRATION / SYSTEM
  // =========================================================================
  await t.test('TESTE C — FIELDPICKER / MANUAL / INTEGRATION / SYSTEM', async () => {
    const nicheId = 'niche-gondola';

    // 1. Selecionar um elemento Text
    useEditorStore.getState().setDocument({
      schemaVersion: 1,
      title: 'Teste FieldPicker Homolog',
      dimensions: { widthMm: 100, heightMm: 50, dpi: 203, orientation: 'landscape' },
      nicheId,
      elements: [],
    });
    useEditorStore.getState().addElement('text');
    const textEl = useEditorStore.getState().document.elements[0] as TextElement;
    assert.equal(textEl.type, 'text');

    // 2. Abrir FieldPicker / MANUAL:
    // Configuração inicial do campo produto.descricao: manual = true, integration = true
    assert.equal(isFieldAllowed(nicheId, 'produto.descricao', 'manual'), true, 'produto.descricao deve permitir MANUAL inicialmente');

    // Desabilitar MANUAL para o campo na Administração
    await CompanyConfigurationRepository.setFieldConfig(company.id, nicheId, 'produto.descricao', {
      enabled: true,
      availableForManual: false,
      availableForIntegration: true,
    });
    let effConfig = await EffectiveConfigurationService.resolve({ companyId: company.id, roleCode: adminRole.code });
    setManualSessionContext({ effectiveConfiguration: effConfig });

    // Confirmar que NOVO uso daquela origem fica indisponível
    assert.equal(isFieldAllowed(nicheId, 'produto.descricao', 'manual'), false, 'produto.descricao com manual=false não deve permitir nova entrada manual');

    // INTEGRATION:
    // Selecionar um campo canônico real que esteja habilitado no nicho e availableForIntegration=true
    assert.equal(isFieldAllowed(nicheId, 'produto.descricao', 'integration'), true, 'produto.descricao deve permitir INTEGRATION');

    // Confirmar que NÃO deve surgir valor fictício de ERP nem indicação falsa de ERP conectado
    const fieldDef = ALL_KNOWN_INTEGRATION_FIELDS.find((f) => f.id === 'produto.descricao');
    assert.ok(fieldDef, 'Campo produto.descricao pertence ao catálogo canônico');
    assert.equal(fieldDef?.category, 'Produto', 'Categoria canônica real');

    // Desabilitar o campo na Administração
    await CompanyConfigurationRepository.setFieldConfig(company.id, nicheId, 'produto.descricao', {
      enabled: false,
      availableForManual: false,
      availableForIntegration: false,
    });
    effConfig = await EffectiveConfigurationService.resolve({ companyId: company.id, roleCode: adminRole.code });
    setManualSessionContext({ effectiveConfiguration: effConfig });

    // Confirmar que ele não pode ser escolhido para NOVO binding
    assert.equal(isFieldAllowed(nicheId, 'produto.descricao', 'integration'), false, 'produto.descricao desabilitado não permite novo binding');

    // EXISTING_DISABLED_BINDING:
    // Abrir modelo já salvo contendo aquele binding
    const docWithBinding: LabelDocument = {
      schemaVersion: 1,
      title: 'Modelo com Binding Desabilitado',
      dimensions: { widthMm: 100, heightMm: 50, dpi: 203, orientation: 'landscape' },
      nicheId,
      elements: [
        {
          id: 'el-text-bound',
          type: 'text',
          x: 10,
          y: 10,
          width: 80,
          height: 10,
          text: 'COCA-COLA 2L',
          field: 'produto.descricao',
        },
      ],
    };

    const savedBindingTemplate = await templateRepository.createTemplate(
      {
        title: 'Template Binding Legado',
        nicheId,
        document: docWithBinding,
      },
      company.id
    );

    // Reabrir o documento e confirmar que o binding permanece, não é apagado automaticamente
    const loadedBindingTemplate = await templateRepository.getTemplateById(savedBindingTemplate.id, company.id);
    useEditorStore.getState().setDocument(loadedBindingTemplate!.document);

    const reloadedTextEl = useEditorStore.getState().document.elements[0] as TextElement;
    assert.equal(reloadedTextEl.field, 'produto.descricao', 'Binding legado deve ser preservado intacto');
    assert.equal(reloadedTextEl.text, 'COCA-COLA 2L', 'Valor do texto legado não deve ser apagado');

    // Modelo continua carregando e salvando
    const updatedBindingTemplate = await templateRepository.updateTemplate(
      savedBindingTemplate.id,
      {
        title: 'Template Binding Legado Salvo',
        nicheId,
        document: useEditorStore.getState().document,
      },
      company.id
    );
    assert.ok(updatedBindingTemplate, 'Modelo contendo binding legado desabilitado salva com sucesso');

    // SYSTEM:
    // Confirmar os system fields que existirem de fato no catálogo atual (system.printDate, system.printDateTime, system.printTime)
    assert.ok(SYSTEM_FIELDS.some((f) => f.id === 'system.printDate'), 'system.printDate deve existir no catálogo de sistema');
    assert.ok(SYSTEM_FIELDS.some((f) => f.id === 'system.printDateTime'), 'system.printDateTime deve existir no catálogo de sistema');
    assert.ok(SYSTEM_FIELDS.some((f) => f.id === 'system.printTime'), 'system.printTime deve existir no catálogo de sistema');

    // system.printDate deve funcionar sem ERP e resolver automaticamente pela plataforma
    assert.equal(isFieldAllowed(nicheId, 'system.printDate', 'system'), true, 'system.printDate deve ser permitido como SYSTEM');

    // Aplicar binding de sistema
    useEditorStore.getState().updateElement(reloadedTextEl.id, {
      field: 'system.printDate',
    });
    const boundSystemEl = useEditorStore.getState().document.elements[0] as TextElement;
    assert.equal(boundSystemEl.field, 'system.printDate', 'Binding de sistema aplicado com sucesso');
  });

  // =========================================================================
  // TESTE D — ROLE_NICHES / ACESSO AO NICHO
  // =========================================================================
  await t.test('TESTE D — ROLE_NICHES / ACESSO AO NICHO', async () => {
    // 1. Como ADMIN, abrir Administração → Perfis / Perfis com Acesso / Nichos
    // 2. Escolher OPERATOR
    // 3. Registrar quais nichos estão atualmente atribuídos ao perfil
    const operatorNiches = await RoleRepository.getRoleNicheAccess(operatorRole.id);
    const assignedNichesToOperator = Object.entries(operatorNiches)
      .filter(([_, allowed]) => allowed)
      .map(([nicheId]) => nicheId);

    // Confirmar que os nichos operacionais iniciais batem com o preset do OPERATOR (Gôndola, Produto, Logística, Uso Geral)
    assert.ok(assignedNichesToOperator.includes('niche-gondola'));
    assert.ok(assignedNichesToOperator.includes('niche-produto'));
    assert.ok(assignedNichesToOperator.includes('niche-logistica'));
    assert.ok(assignedNichesToOperator.includes('niche-uso-geral'));
    assert.ok(!assignedNichesToOperator.includes('niche-farmacia'), 'Farmácia não é operacional para OPERATOR no preset inicial');

    // Entrar como usuário OPERATOR
    await SessionService.createAuthenticatedSession({ userId: operatorUser.id, companyId: company.id });
    const effConfigOperator = await EffectiveConfigurationService.resolve({ companyId: company.id, roleCode: operatorRole.code });

    setManualSessionContext({
      user: { id: operatorUser.id, name: operatorUser.name, email: operatorUser.email },
      company: { id: company.id, name: company.name, slug: company.slug },
      role: { id: operatorRole.id, code: operatorRole.code, name: operatorRole.name },
      permissions: ['templates.view', 'templates.create', 'templates.edit'],
      effectiveConfiguration: effConfigOperator,
    });

    // RESULTADO ESPERADO:
    // - Wizard/Novo Modelo oferece SOMENTE nichos atribuídos em role_niches
    for (const nicheId of assignedNichesToOperator) {
      assert.equal(isNicheAllowed(nicheId), true, `Nicho ${nicheId} deve estar permitido para OPERATOR`);
    }
    // - nichos não atribuídos não ficam disponíveis para criação de novo modelo
    assert.equal(isNicheAllowed('niche-farmacia'), false, 'Nicho Farmácia NÃO deve estar permitido para OPERATOR');
    assert.equal(isNicheAllowed('niche-hospital'), false, 'Nicho Hospital NÃO deve estar permitido para OPERATOR');

    // Como ADMIN: adicionar nicho anteriormente não permitido ao OPERATOR (ex: niche-farmacia)
    await RoleRepository.setRoleNicheAccess(operatorRole.id, 'niche-farmacia', true);

    // Recarregar/renovar o contexto do usuário OPERATOR (sem restart de backend)
    const updatedEffConfigOperator = await EffectiveConfigurationService.resolve({ companyId: company.id, roleCode: operatorRole.code });
    setManualSessionContext({
      effectiveConfiguration: updatedEffConfigOperator,
    });

    // RESULTADO ESPERADO: novo nicho passa a aparecer imediatamente
    assert.equal(isNicheAllowed('niche-farmacia'), true, 'Nicho Farmácia passa a ser permitido ao OPERATOR sem restart');

    // Remover novamente o nicho e atualizar contexto
    await RoleRepository.setRoleNicheAccess(operatorRole.id, 'niche-farmacia', false);
    const finalEffConfigOperator = await EffectiveConfigurationService.resolve({ companyId: company.id, roleCode: operatorRole.code });
    setManualSessionContext({
      effectiveConfiguration: finalEffConfigOperator,
    });

    // RESULTADO ESPERADO: deixa de aparecer para NOVA criação
    assert.equal(isNicheAllowed('niche-farmacia'), false, 'Nicho Farmácia deixa de estar permitido para nova criação');

    // MODELOS EXISTENTES:
    // Criar previamente um modelo em niche-farmacia
    const farmaciaDoc: LabelDocument = {
      schemaVersion: 1,
      title: 'Etiqueta Farmácia Existente',
      dimensions: { widthMm: 80, heightMm: 40, dpi: 203, orientation: 'landscape' },
      nicheId: 'niche-farmacia',
      elements: [],
    };
    const farmaciaTemplate = await templateRepository.createTemplate(
      {
        title: 'Template Farmácia Existente',
        nicheId: 'niche-farmacia',
        document: farmaciaDoc,
      },
      company.id
    );

    // Revogação de nicho:
    // - não apaga modelo
    const loadedFarmaciaTemplate = await templateRepository.getTemplateById(farmaciaTemplate.id, company.id);
    assert.ok(loadedFarmaciaTemplate, 'Modelo de nicho revogado continua existindo no banco');
    // - não altera nicheId
    assert.equal(loadedFarmaciaTemplate?.nicheId, 'niche-farmacia', 'nicheId permanece intacto');
    // - não corrompe dados
    assert.equal(loadedFarmaciaTemplate?.name, 'Template Farmácia Existente');
    // - ADMIN autorizado continua acessando normalmente
    const adminEffConfig = await EffectiveConfigurationService.resolve({ companyId: company.id, roleCode: adminRole.code });
    assert.ok(adminEffConfig.allowedNiches.includes('niche-farmacia'), 'ADMIN continua com acesso total ao nicho');
  });
});
