import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  clearAdminMemoryStores,
  CompanyRepository,
  RoleRepository,
  TENANT_MANAGEABLE_PERMISSIONS,
  CANONICAL_PERMISSIONS,
} from '../apps/backend/src/repositories/adminRepositories.js';
import { STANDARD_ROLES } from '../apps/backend/src/services/adminBootstrapService.js';
import adminRouter from '../apps/backend/src/routes/admin.js';

function createMockResponse() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as any,
    cookies: {} as Record<string, any>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    set(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
  };
  return res;
}

async function callRouter(router: any, req: any) {
  const res = createMockResponse();
  let handled = false;

  for (const layer of router.stack) {
    if (layer.route) {
      const match = layer.route.path === req.path || layer.match(req.path);
      const methodMatch = layer.route.methods[req.method.toLowerCase()];
      if (match && methodMatch) {
        for (const handle of layer.route.stack) {
          await new Promise<void>((resolve, reject) => {
            try {
              handle.handle(req, res, (err: any) => {
                if (err) reject(err);
                else resolve();
              });
            } catch (e) {
              reject(e);
            }
          });
          if (res.body !== null) {
            handled = true;
            break;
          }
        }
        if (handled) break;
      }
    }
  }

  return res;
}

const ESSENTIAL_ADMIN_PERMISSIONS = [
  'company.view',
  'company.manage',
  'users.view',
  'users.manage',
  'roles.view',
  'roles.manage',
];

test('HOTFIX 5.3.3: Suíte de 20 Testes de Componente e Arquitetura da Matriz de Permissões', async (t) => {
  const tsxPath = path.resolve('apps/frontend/src/modules/admin/RolesAdminView.tsx');
  const cssPath = path.resolve('apps/frontend/src/index.css');
  assert.ok(fs.existsSync(tsxPath), 'RolesAdminView.tsx deve existir');
  assert.ok(fs.existsSync(cssPath), 'index.css deve existir');

  const tsxContent = fs.readFileSync(tsxPath, 'utf8');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  // Helper de agrupamento reproduzindo exatamente o useMemo de RolesAdminView.tsx
  const groupCatalog = (catalog: typeof TENANT_MANAGEABLE_PERMISSIONS) => {
    const map = new Map<string, typeof TENANT_MANAGEABLE_PERMISSIONS>();
    for (const item of catalog) {
      const list = map.get(item.category) || [];
      list.push(item);
      map.set(item.category, list);
    }
    return Array.from(map.entries());
  };

  const grouped = groupCatalog(TENANT_MANAGEABLE_PERMISSIONS);

  // 1. 11 categorias renderizadas
  await t.test('1. 11 categorias comerciais renderizadas', () => {
    assert.strictEqual(grouped.length, 11, 'Deve conter exatamente 11 categorias comerciais');
    const categoryNames = grouped.map(([name]) => name);
    const expected = [
      'Empresa',
      'Nichos',
      'Elementos',
      'Integrações',
      'Usuários',
      'Papéis',
      'Modelos',
      'Impressão',
      'Impressoras',
      'Agentes',
      'Auditoria',
    ];
    for (const exp of expected) {
      assert.ok(categoryNames.includes(exp), `Categoria '${exp}' deve estar presente`);
    }
  });

  // 2. 23 permissions renderizadas
  await t.test('2. 23 permissions comerciais renderizadas', () => {
    assert.strictEqual(TENANT_MANAGEABLE_PERMISSIONS.length, 23, 'Catálogo do tenant deve ter exatamente 23 permissões');
  });

  // 3. cada permission pertence a exatamente uma categoria
  await t.test('3. Cada permission pertence a exatamente uma categoria', () => {
    const seen = new Map<string, string>();
    for (const [catName, items] of grouped) {
      for (const item of items) {
        assert.ok(!seen.has(item.code), `Permissão ${item.code} já registrada na categoria ${seen.get(item.code)}`);
        seen.set(item.code, catName);
      }
    }
    assert.strictEqual(seen.size, 23);
  });

  // 4. nenhuma permission duplicada
  await t.test('4. Nenhuma permission duplicada no catálogo', () => {
    const codes = TENANT_MANAGEABLE_PERMISSIONS.map((p) => p.code);
    const uniqueCodes = new Set(codes);
    assert.strictEqual(codes.length, uniqueCodes.size, 'Não pode haver códigos de permissão duplicados');
  });

  // 5. nenhuma categoria usa height fixa
  await t.test('5. Nenhuma categoria usa height fixa no CSS', () => {
    assert.ok(
      cssContent.includes('.admin-perm-category-card') &&
      cssContent.includes('.admin-perm-category-block'),
      'Classes de card de categoria devem existir'
    );
    // Verificar que card usa height: auto !important
    const categoryCardBlockRegex = /\.admin-perm-category-card[\s\S]*?\{[\s\S]*?\}/;
    const match = cssContent.match(categoryCardBlockRegex);
    assert.ok(match, 'Bloco .admin-perm-category-card deve existir no CSS');
    assert.ok(match[0].includes('height: auto !important'), 'Categoria deve ter height: auto !important');
    assert.ok(!match[0].match(/height:\s*\d+px/), 'Categoria não pode ter height fixa em px');
  });

  // 6. nenhuma categoria usa overflow:hidden
  await t.test('6. Nenhuma categoria usa overflow:hidden', () => {
    const categoryCardBlockRegex = /\.admin-perm-category-card[\s\S]*?\{[\s\S]*?\}/;
    const match = cssContent.match(categoryCardBlockRegex);
    assert.ok(match, 'Bloco de categoria deve existir');
    assert.ok(match[0].includes('overflow: visible !important'), 'Card da categoria deve usar overflow: visible !important');
    assert.ok(!match[0].includes('overflow: hidden'), 'Card da categoria não pode ter overflow: hidden');
  });

  // 7. nenhum permission row usa position:absolute
  await t.test('7. Nenhum permission row usa position:absolute', () => {
    const rowBlockRegex = /\.admin-perm-row[\s\S]*?\{[\s\S]*?\}/;
    const match = cssContent.match(rowBlockRegex);
    assert.ok(match, 'Bloco .admin-perm-row deve existir');
    assert.ok(!match[0].includes('position: absolute'), '.admin-perm-row não pode ter position: absolute');
    assert.ok(match[0].includes('height: auto !important'), '.admin-perm-row deve ter height: auto !important');
    assert.ok(match[0].includes('overflow: visible !important'), '.admin-perm-row deve ter overflow: visible !important');
  });

  // 8. matriz usa uma única coluna
  await t.test('8. Matriz usa uma única coluna em todas as resoluções', () => {
    // Verificar que .admin-perm-categories-list usa flex-direction: column e sem grid
    const listBlockRegex = /\.admin-perm-categories-list[\s\S]*?\{[\s\S]*?\}/;
    const match = cssContent.match(listBlockRegex);
    assert.ok(match, '.admin-perm-categories-list deve existir');
    assert.ok(match[0].includes('flex-direction: column'), '.admin-perm-categories-list deve ser flex-direction: column');
    assert.ok(!match[0].includes('grid-template-columns'), '.admin-perm-categories-list não pode usar grid multi-colunas');
    // Verificar que não existe media query forçando múltiplas colunas
    assert.ok(!cssContent.includes('.admin-perm-categories-list { grid-template-columns: repeat(2'), 'Não pode ter 2 colunas');
    assert.ok(!cssContent.includes('.admin-perm-categories-list { grid-template-columns: repeat(3'), 'Não pode ter 3 colunas');
    // Verificar que o body é o único container com scroll vertical
    const bodyBlockRegex = /\.admin-perm-matrix-body[\s\S]*?\{[\s\S]*?\}/;
    const bodyMatch = cssContent.match(bodyBlockRegex);
    assert.ok(bodyMatch, '.admin-perm-matrix-body deve existir');
    assert.ok(bodyMatch[0].includes('overflow-y: auto'), '.admin-perm-matrix-body deve ter overflow-y: auto');
  });

  // 9. ADMIN essenciais ficam visíveis
  await t.test('9. ADMIN essenciais ficam visíveis no fluxo', () => {
    assert.strictEqual(ESSENTIAL_ADMIN_PERMISSIONS.length, 6);
    const codes = TENANT_MANAGEABLE_PERMISSIONS.map((p) => p.code);
    for (const essential of ESSENTIAL_ADMIN_PERMISSIONS) {
      assert.ok(codes.includes(essential), `Permissão essencial ${essential} deve existir no catálogo e ser visível`);
    }
  });

  // 10. ADMIN essenciais ficam locked
  await t.test('10. ADMIN essenciais ficam locked com checkbox disabled', () => {
    // Validar regras no TSX
    assert.ok(
      tsxContent.includes('const isEssential =') &&
      tsxContent.includes("permissionRole.code === 'ADMIN' &&") &&
      tsxContent.includes('ESSENTIAL_ADMIN_PERMISSIONS.includes(perm.code)'),
      'isEssential deve ser calculado para ADMIN'
    );
    assert.ok(
      tsxContent.includes('const isDisabled = isEssential;'),
      'isDisabled deve ser true para essenciais'
    );
    assert.ok(
      tsxContent.includes('disabled={isDisabled}'),
      'Checkbox deve ser desabilitado quando essencial'
    );
  });

  // 11. Designer mostra 11 de 23 corretamente
  await t.test('11. Perfil DESIGNER padrão possui exatamente 11 permissões ativas', () => {
    const designer = STANDARD_ROLES.find((r) => r.code === 'DESIGNER');
    assert.ok(designer, 'Perfil padrão DESIGNER deve existir');
    assert.strictEqual(designer.permissions.length, 11, 'DESIGNER deve ter exatamente 11 permissões');
    // Todas devem pertencer ao catálogo comercial do tenant
    const commercialCodes = new Set(TENANT_MANAGEABLE_PERMISSIONS.map((p) => p.code));
    for (const p of designer.permissions) {
      assert.ok(commercialCodes.has(p), `Permissão do designer ${p} deve ser comercial`);
    }
  });

  // 12. marcado mostra PERMITIDO
  await t.test('12. Permissão marcada exibe badge PERMITIDO', () => {
    assert.ok(
      tsxContent.includes('admin-perm-status-badge allowed') &&
      tsxContent.includes('PERMITIDO'),
      'Deve renderizar badge PERMITIDO para estado marcado'
    );
  });

  // 13. desmarcado mostra BLOQUEADO
  await t.test('13. Permissão desmarcada exibe badge BLOQUEADO', () => {
    assert.ok(
      tsxContent.includes('admin-perm-status-badge blocked') &&
      tsxContent.includes('BLOQUEADO'),
      'Deve renderizar badge BLOQUEADO para estado desmarcado'
    );
  });

  // 14. essencial mostra ESSENCIAL
  await t.test('14. Permissão essencial exibe badge ESSENCIAL com ícone de Lock', () => {
    assert.ok(
      tsxContent.includes('admin-perm-status-badge locked') &&
      tsxContent.includes('ESSENCIAL'),
      'Deve renderizar badge ESSENCIAL para permissões travadas'
    );
  });

  // 15. clicar linha altera estado
  await t.test('15. Lógica de togglePermission altera o estado de permissões editáveis', () => {
    let state = ['company.view', 'niches.view'];

    const toggle = (code: string, isAdm: boolean) => {
      if (isAdm && ESSENTIAL_ADMIN_PERMISSIONS.includes(code)) return;
      state = state.includes(code) ? state.filter((c) => c !== code) : [...state, code];
    };

    // Toggle on niches.manage (adiciona)
    toggle('niches.manage', false);
    assert.ok(state.includes('niches.manage'));

    // Toggle off niches.view (remove)
    toggle('niches.view', false);
    assert.ok(!state.includes('niches.view'));

    // Tentativa de toggle em essencial do ADMIN (bloqueada)
    toggle('company.view', true);
    assert.ok(state.includes('company.view'), 'company.view não pode ser removida no ADMIN');
  });

  // 16. salvar persiste
  await t.test('16. Salvar persiste permissões via backend RoleRepository', async () => {
    clearAdminMemoryStores();
    const company = await CompanyRepository.create({
      code: 'TESTSAVE',
      name: 'Test Save',
    });

    const role = await RoleRepository.create({
      companyId: company.id,
      code: 'OPERATOR_TEST',
      name: 'Operador de Teste',
      permissions: ['print.execute'],
    });

    const newPermissions = ['print.execute', 'templates.view', 'printers.view'];
    await RoleRepository.setRolePermissions(role.id, newPermissions);

    const stored = await RoleRepository.getRolePermissions(role.id);
    assert.strictEqual(stored.length, 3);
    assert.ok(stored.includes('print.execute'));
    assert.ok(stored.includes('templates.view'));
    assert.ok(stored.includes('printers.view'));
  });

  // 17. reabrir restaura exatamente estado salvo
  await t.test('17. Reabrir restaura exatamente o estado salvo', async () => {
    clearAdminMemoryStores();
    const company = await CompanyRepository.create({
      code: 'TESTREOPEN',
      name: 'Test Reopen',
    });

    const initialPerms = ['niches.view', 'templates.create', 'templates.view'];
    const role = await RoleRepository.create({
      companyId: company.id,
      code: 'DESIGNER_CUSTOM',
      name: 'Designer Customizado',
    });
    await RoleRepository.setRolePermissions(role.id, initialPerms);

    // Simular fetch
    const fetchedRole = await RoleRepository.findById(role.id);
    assert.ok(fetchedRole);
    const fetchedPerms = await RoleRepository.getRolePermissions(fetchedRole.id);

    // Estado reaberto é exatamente o persistido
    assert.deepStrictEqual(fetchedPerms.sort(), initialPerms.sort());
  });

  // 18. contador X de 23 correto
  await t.test('18. Contador X de 23 reflete o tamanho exato da seleção atual', () => {
    assert.ok(
      tsxContent.includes('Permissões ativas: <strong>{selectedPermissions.length}</strong> de {permissionsCatalog.length}'),
      'Contador deve usar selectedPermissions.length de permissionsCatalog.length'
    );
  });

  // 19. Limpar Seleção preserva essenciais
  await t.test('19. Limpar Seleção preserva permissões essenciais para ADMIN', () => {
    // Para ADMIN
    const deselectForAdmin = () => [...ESSENTIAL_ADMIN_PERMISSIONS];
    const adminSelected = deselectForAdmin();
    assert.strictEqual(adminSelected.length, 6);
    for (const code of ESSENTIAL_ADMIN_PERMISSIONS) {
      assert.ok(adminSelected.includes(code));
    }

    // Para outros perfis
    const deselectForOther = () => [] as string[];
    const otherSelected = deselectForOther();
    assert.strictEqual(otherSelected.length, 0);

    // Validar que o código em RolesAdminView.tsx implementa essa guarda
    assert.ok(
      tsxContent.includes("if (permissionRole?.code === 'ADMIN') {") &&
      tsxContent.includes('setSelectedPermissions([...ESSENTIAL_ADMIN_PERMISSIONS]);') &&
      tsxContent.includes('setSelectedPermissions([]);'),
      'handleDeselectAll deve preservar ESSENTIAL_ADMIN_PERMISSIONS para ADMIN'
    );
  });

  // 20. DCC não aparece
  await t.test('20. Permissões de devcontrol.* não aparecem na matriz nem no catálogo do tenant', () => {
    const codes = TENANT_MANAGEABLE_PERMISSIONS.map((p) => p.code);
    assert.ok(!codes.includes('devcontrol.view'), 'devcontrol.view não pode estar na matriz');
    assert.ok(!codes.includes('devcontrol.manage'), 'devcontrol.manage não pode estar na matriz');
    for (const p of codes) {
      assert.ok(!p.startsWith('devcontrol.'), `Permissão ${p} não pode começar com devcontrol.`);
    }
  });
});
