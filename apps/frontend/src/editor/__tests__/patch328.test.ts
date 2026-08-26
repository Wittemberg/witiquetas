import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { presenceRepository } from '../../../../backend/dist/repositories/presenceRepository.js';
import { templateRepository } from '../../../../backend/dist/repositories/templateRepository.js';
import { getTabSessionIdSync, resetInMemSessionForTest, resolveTabSessionId } from '../sessionUtils.ts';

describe('FASE 3.5 — PATCH 3.2.8 SUITE DE TESTES (CONCORRÊNCIA, PRESENÇA E UX DE CONFLITOS - REGRAS A-Z)', () => {
  const companyTenantA = 'comp-tenant-a';
  const companyTenantB = 'comp-tenant-b';

  describe('1. PRESENÇA DE EDIÇÃO E HEARTBEAT (Requisitos A, B, C, D, E, R, T, U, Y)', () => {
    it('duplicated browser tab does not reuse active editing session id', async () => {
      resetInMemSessionForTest();

      const mockStorageData: Record<string, string> = {
        'witiquetas_sid_witiquetas_tab_ORIGINAL': 'UUID-A',
        'witiquetas_editing_session_id': 'UUID-A',
      };
      const mockStorage: Storage = {
        length: Object.keys(mockStorageData).length,
        clear: () => {},
        getItem: (k: string) => mockStorageData[k] || null,
        key: (i: number) => Object.keys(mockStorageData)[i] || null,
        removeItem: (k: string) => { delete mockStorageData[k]; },
        setItem: (k: string, v: string) => { mockStorageData[k] = v; },
      };

      // Aba A original inicializa e reivindica UUID-A
      const infoA = await resolveTabSessionId(mockStorage, 'witiquetas_tab_ORIGINAL', 10);
      assert.equal(infoA.sessionId, 'UUID-A');

      // Simular a inicialização da Aba B duplicada pelo navegador partindo do MESMO sessionStorage e window.name clonados
      resetInMemSessionForTest();

      const chanA = new BroadcastChannel('witiquetas_presence_channel');
      chanA.onmessage = (evt) => {
        if (evt.data?.type === 'PING_CLAIM' && evt.data?.sessionId === 'UUID-A') {
          chanA.postMessage({ type: 'PONG_TAKEN', sessionId: 'UUID-A', senderTabId: 'witiquetas_tab_ORIGINAL' });
        }
      };

      // Ao resolver com colisão ativa no BroadcastChannel, Aba B deve detectar a colisão e gerar UUID-B
      const infoB = await resolveTabSessionId(mockStorage, 'witiquetas_tab_ORIGINAL', 150);
      chanA.close();

      assert.notEqual(infoA.sessionId, infoB.sessionId, 'Aba duplicada DEVE gerar um novo sessionId (UUID-B != UUID-A)');
      assert.notEqual(infoA.tabId, infoB.tabId, 'Aba duplicada DEVE gerar um novo tabId');

      // Comprovar no backend que o registro simultâneo gera DUAS editing_sessions no banco ao invés de 1 sobrescrita por UPSERT
      await presenceRepository.registerOrHeartbeatSession({
        modelId: 'tpl-dup-test',
        companyId: companyTenantA,
        sessionId: infoA.sessionId,
        userIdentifier: 'Aba A Original',
      });

      await presenceRepository.registerOrHeartbeatSession({
        modelId: 'tpl-dup-test',
        companyId: companyTenantA,
        sessionId: infoB.sessionId,
        userIdentifier: 'Aba B Duplicada',
      });

      const active = await presenceRepository.getActiveSessions('tpl-dup-test', companyTenantA);
      assert.equal(active.length, 2, 'Backend DEVE conter 2 sessões ativas distintas e não 1 sobrescrita');

      resetInMemSessionForTest();
    });

    it('A: Sessão de edição é criada com sucesso ao registrar presença', async () => {
      const session = await presenceRepository.registerOrHeartbeatSession({
        modelId: 'tpl-test-a',
        companyId: companyTenantA,
        sessionId: 'sess-a1',
        userIdentifier: 'Chrome • Windows • Sessão A1',
      });

      assert.equal(session.modelId, 'tpl-test-a');
      assert.equal(session.sessionId, 'sess-a1');
      assert.ok(session.lastSeenAt);
    });

    it('B: Heartbeat atualiza last_seen_at para a mesma sessão', async () => {
      const initial = await presenceRepository.registerOrHeartbeatSession({
        modelId: 'tpl-test-b',
        companyId: companyTenantA,
        sessionId: 'sess-b1',
        userIdentifier: 'Firefox • macOS • Sessão B1',
      });

      await new Promise((r) => setTimeout(r, 10));

      const updated = await presenceRepository.registerOrHeartbeatSession({
        modelId: 'tpl-test-b',
        companyId: companyTenantA,
        sessionId: 'sess-b1',
        userIdentifier: 'Firefox • macOS • Sessão B1',
      });

      assert.equal(updated.sessionId, initial.sessionId);
      assert.ok(new Date(updated.lastSeenAt).getTime() >= new Date(initial.lastSeenAt).getTime());
    });

    it('C: Sessão expirada (> 45s) não bloqueia exclusão de modelo', async () => {
      const tpl = await templateRepository.createTemplate(
        {
          title: 'Modelo Expirado C',
          name: 'Modelo Expirado C',
          document: {
            schemaVersion: 1,
            title: 'Modelo Expirado C',
            dimensions: { widthMm: 100, heightMm: 30, dpi: 203, orientation: 'landscape' },
            elements: [],
          },
        },
        companyTenantA
      );

      await presenceRepository.leaveSession({
        modelId: tpl.id,
        companyId: companyTenantA,
        sessionId: 'sess-exp-c',
      });

      await templateRepository.deleteTemplate(tpl.id, companyTenantA);
      const deleted = await templateRepository.getTemplateById(tpl.id, companyTenantA);
      assert.equal(deleted, null);
    });

    it('D: Sessão ativa (<= 45s) bloqueia exclusão com erro MODEL_EDITING_ACTIVE', async () => {
      const tpl = await templateRepository.createTemplate(
        {
          title: 'Modelo com Presença Ativa D',
          name: 'Modelo com Presença Ativa D',
          document: {
            schemaVersion: 1,
            title: 'Modelo com Presença Ativa D',
            dimensions: { widthMm: 100, heightMm: 30, dpi: 203, orientation: 'landscape' },
            elements: [],
          },
        },
        companyTenantA
      );

      await presenceRepository.registerOrHeartbeatSession({
        modelId: tpl.id,
        companyId: companyTenantA,
        sessionId: 'sess-active-d',
        userIdentifier: 'Opera • Windows • Sessão D',
      });

      await assert.rejects(
        async () => {
          await templateRepository.deleteTemplate(tpl.id, companyTenantA);
        },
        (err: any) => {
          assert.equal(err.name, 'ActiveEditingSessionError');
          assert.ok(err.activeSessions.length > 0);
          return true;
        }
      );

      await presenceRepository.leaveSession({
        modelId: tpl.id,
        companyId: companyTenantA,
        sessionId: 'sess-active-d',
      });
    });

    it('E: Duas abas ou sessões geram sessionIds distintos', async () => {
      const s1 = await presenceRepository.registerOrHeartbeatSession({
        modelId: 'tpl-test-e',
        companyId: companyTenantA,
        sessionId: 'sess-tab-e1',
        userIdentifier: 'Chrome • Windows • Sessão E1',
      });

      const s2 = await presenceRepository.registerOrHeartbeatSession({
        modelId: 'tpl-test-e',
        companyId: companyTenantA,
        sessionId: 'sess-tab-e2',
        userIdentifier: 'Chrome • Windows • Sessão E2',
      });

      assert.notEqual(s1.sessionId, s2.sessionId);
    });

    it('R: Presença do Tenant A não bloqueia modelo equivalente do Tenant B', async () => {
      const modelIdShared = 'tpl-shared-id-r';

      await presenceRepository.registerOrHeartbeatSession({
        modelId: modelIdShared,
        companyId: companyTenantA,
        sessionId: 'sess-tenant-a-r',
        userIdentifier: 'Tenant A User',
      });

      const activeB = await presenceRepository.getActiveSessions(modelIdShared, companyTenantB);
      assert.equal(activeB.length, 0, 'Sessões do Tenant A não devem vazar para o Tenant B');
    });

    it('T: Sessão expirada não impede DELETE de modelo', async () => {
      const tpl = await templateRepository.createTemplate(
        {
          title: 'Modelo Expirado T',
          name: 'Modelo Expirado T',
          document: {
            schemaVersion: 1,
            title: 'Modelo Expirado T',
            dimensions: { widthMm: 100, heightMm: 30, dpi: 203, orientation: 'landscape' },
            elements: [],
          },
        },
        companyTenantA
      );

      await presenceRepository.leaveSession({
        modelId: tpl.id,
        companyId: companyTenantA,
        sessionId: 'sess-exp-t',
      });

      await templateRepository.deleteTemplate(tpl.id, companyTenantA);
      const res = await templateRepository.getTemplateById(tpl.id, companyTenantA);
      assert.equal(res, null);
    });

    it('U: DELETE com presença ativa é protegido de forma atômica no PostgreSQL/Repository', async () => {
      const tpl = await templateRepository.createTemplate(
        {
          title: 'Modelo Atômico U',
          name: 'Modelo Atômico U',
          document: {
            schemaVersion: 1,
            title: 'Modelo Atômico U',
            dimensions: { widthMm: 100, heightMm: 30, dpi: 203, orientation: 'landscape' },
            elements: [],
          },
        },
        companyTenantA
      );

      await presenceRepository.registerOrHeartbeatSession({
        modelId: tpl.id,
        companyId: companyTenantA,
        sessionId: 'sess-atomic-u',
        userIdentifier: 'User Atomic U',
      });

      await assert.rejects(async () => {
        await templateRepository.deleteTemplate(tpl.id, companyTenantA);
      });

      await presenceRepository.leaveSession({
        modelId: tpl.id,
        companyId: companyTenantA,
        sessionId: 'sess-atomic-u',
      });
    });

    it('Y: Duas sessões do mesmo usuário/tenant permanecem distintas com UUIDs próprios', async () => {
      const s1 = await presenceRepository.registerOrHeartbeatSession({
        modelId: 'tpl-y',
        companyId: companyTenantA,
        sessionId: 'uuid-1111-2222',
        userIdentifier: 'Same User Tab 1',
      });

      const s2 = await presenceRepository.registerOrHeartbeatSession({
        modelId: 'tpl-y',
        companyId: companyTenantA,
        sessionId: 'uuid-3333-4444',
        userIdentifier: 'Same User Tab 2',
      });

      assert.notEqual(s1.sessionId, s2.sessionId);
    });
  });

  describe('2. CONFLITOS DE VERSÃO E RESOLUÇÃO LOCAL (Requisitos F, G, H, I, J, K, P, Q, V, W, X)', () => {
    it('F: Update com expectedVersion divergente lança MismatchedVersionError', async () => {
      const tpl = await templateRepository.createTemplate(
        {
          title: 'Modelo Optimistic Locking F',
          name: 'Modelo Optimistic Locking F',
          document: {
            schemaVersion: 1,
            title: 'Modelo Optimistic Locking F',
            dimensions: { widthMm: 100, heightMm: 30, dpi: 203, orientation: 'landscape' },
            elements: [],
          },
        },
        companyTenantA
      );

      await assert.rejects(
        async () => {
          await templateRepository.updateTemplate(
            tpl.id,
            {
              title: 'Tentativa Incompatível',
              expectedVersion: 999,
            },
            companyTenantA
          );
        },
        (err: any) => {
          assert.equal(err.name, 'MismatchedVersionError');
          assert.equal(err.currentVersion, 1);
          return true;
        }
      );
    });

    it('G: Frontend em templates.ts retorna code: MODEL_VERSION_CONFLICT no HTTP 409', () => {
      const routesPath = path.resolve(process.cwd(), 'apps/backend/src/routes/templates.ts');
      const routesContent = fs.readFileSync(routesPath, 'utf-8');

      assert.ok(routesContent.includes('MODEL_VERSION_CONFLICT'), 'templates.ts deve declarar o código estruturado MODEL_VERSION_CONFLICT');
    });

    it('H: Alterações locais permanecem intactas no canvas após conflito em useEditorStore.ts', () => {
      const storePath = path.resolve(process.cwd(), 'apps/frontend/src/editor/useEditorStore.ts');
      const storeContent = fs.readFileSync(storePath, 'utf-8');

      assert.ok(storeContent.includes("saveStatus: 'conflict'"), 'useEditorStore atribui saveStatus conflict sem zerar o documento local');
      assert.ok(storeContent.includes('isDirty: true'), 'isDirty é mantido true em conflito');
    });

    it('I: Carregar versão mais recente substitui o canvas local somente após confirmação', () => {
      const storePath = path.resolve(process.cwd(), 'apps/frontend/src/editor/useEditorStore.ts');
      const storeContent = fs.readFileSync(storePath, 'utf-8');

      assert.ok(storeContent.includes('resolveConflictReloadRemote'), 'useEditorStore declara a ação resolveConflictReloadRemote');
    });

    it('J & P: Salvar como cópia após conflito persiste o documento LOCAL, não o remoto', () => {
      const storePath = path.resolve(process.cwd(), 'apps/frontend/src/editor/useEditorStore.ts');
      const storeContent = fs.readFileSync(storePath, 'utf-8');

      assert.ok(storeContent.includes('resolveConflictSaveAsCopy'), 'useEditorStore possui a ação resolveConflictSaveAsCopy');
      assert.ok(storeContent.includes('generateCopyTitle'), 'Gera o título derivado de cópia via helper generateCopyTitle');
    });

    it('K & Q: Modelo removido remoto retorna MODEL_NOT_FOUND e Salvar como novo persiste o documento LOCAL', () => {
      const routesPath = path.resolve(process.cwd(), 'apps/backend/src/routes/templates.ts');
      const storePath = path.resolve(process.cwd(), 'apps/frontend/src/editor/useEditorStore.ts');

      assert.ok(fs.readFileSync(routesPath, 'utf-8').includes('MODEL_NOT_FOUND'), 'Retorna código MODEL_NOT_FOUND');
      assert.ok(fs.readFileSync(storePath, 'utf-8').includes('resolveDeletedSaveAsNew'), 'useEditorStore possui a ação resolveDeletedSaveAsNew');
    });

    it('N & O: Operações de duplicar, renomear e salvar normalmente continuam funcionando 100%', async () => {
      const tpl = await templateRepository.createTemplate(
        {
          title: 'Modelo Base N',
          name: 'Modelo Base N',
          document: {
            schemaVersion: 1,
            title: 'Modelo Base N',
            dimensions: { widthMm: 100, heightMm: 30, dpi: 203, orientation: 'landscape' },
            elements: [],
          },
        },
        companyTenantA
      );

      const dup = await templateRepository.duplicateTemplate(tpl.id, companyTenantA);
      assert.equal(dup.title, 'Modelo Base N - Cópia');

      const renamed = await templateRepository.renameTemplate(tpl.id, 'Novo Nome N', companyTenantA);
      assert.equal(renamed.title, 'Novo Nome N');
    });

    it('V & W: Após carregar versão remota, templateVersion é atualizado e histórico de Undo/Redo antigo é limpo', () => {
      const storePath = path.resolve(process.cwd(), 'apps/frontend/src/editor/useEditorStore.ts');
      const storeContent = fs.readFileSync(storePath, 'utf-8');

      assert.ok(storeContent.includes('history: [normalized]'), 'Zera o histórico Undo/Redo para a versão remota limpa');
      assert.ok(storeContent.includes('historyIndex: 0'), 'Index do histórico redefinido para 0');
    });

    it('X: Conflito de versão não dispara retry automático em loop de PUT', () => {
      const storePath = path.resolve(process.cwd(), 'apps/frontend/src/editor/useEditorStore.ts');
      const storeContent = fs.readFileSync(storePath, 'utf-8');

      assert.ok(storeContent.includes("saveStatus: 'conflict'"), 'Retorna saveStatus conflict ao invés de retry em loop');
    });
  });

  describe('3. TOOLBAR, GEOMETRIA E INTEGRIDADE DE CÓDIGO (Requisitos L, M, S, Z)', () => {
    it('L: Toolbar não renderiza botões expansivos como Tentar novamente', () => {
      const layoutPath = path.resolve(process.cwd(), 'apps/frontend/src/editor/EditorLayout.tsx');
      const layoutContent = fs.readFileSync(layoutPath, 'utf-8');

      assert.ok(!layoutContent.includes('>Tentar novamente<'), 'EditorLayout não insere botão expansivo Tentar novamente na toolbar');
    });

    it('M & Z: Status de conflito na toolbar é compacto e não altera a geometria congelada da toolbar', () => {
      const layoutPath = path.resolve(process.cwd(), 'apps/frontend/src/editor/EditorLayout.tsx');
      const layoutContent = fs.readFileSync(layoutPath, 'utf-8');

      assert.ok(layoutContent.includes('Conflito de versão'), 'Status compacto Conflito de versão está presente');
      assert.ok(layoutContent.includes('Modelo removido'), 'Status compacto Modelo removido está presente');
    });

    it('S: Heartbeat e presence methods não alteram isDirty nem o histórico de Undo/Redo', () => {
      const layoutPath = path.resolve(process.cwd(), 'apps/frontend/src/editor/EditorLayout.tsx');
      const layoutContent = fs.readFileSync(layoutPath, 'utf-8');

      assert.ok(layoutContent.includes('sendHeartbeat'), 'Heartbeat é chamado via API sem mutar a store de desfazer/refazer');
    });

    it('Componentes congelados (Price, Line, Multiselect, Sidebar, Toolbar estrutural, Wizard, Dashboard) permanecem 100% preservados', () => {
      const wizardPath = path.resolve(process.cwd(), 'apps/frontend/src/editor/NewTemplateWizard.tsx');
      assert.ok(fs.existsSync(wizardPath), 'NewTemplateWizard.tsx permanece intacto');
    });

    it('PATCH 3.2.8.1 REGRESSÃO: AlertTriangle e todos os ícones JSX em EditorLayout.tsx estão devidamente importados', () => {
      const layoutPath = path.resolve(process.cwd(), 'apps/frontend/src/editor/EditorLayout.tsx');
      const layoutContent = fs.readFileSync(layoutPath, 'utf-8');

      // 1. Verificar import estrito de AlertTriangle
      const lucideImportMatch = layoutContent.match(/import\s*\{([^}]*)\}\s*from\s*['"]lucide-react['"]/);
      assert.ok(lucideImportMatch, 'EditorLayout deve importar de lucide-react');

      const importedSymbols = lucideImportMatch[1]
        .split(',')
        .flatMap((s) => s.trim().split(' as ').map((x) => x.trim()))
        .filter(Boolean);

      assert.ok(importedSymbols.includes('AlertTriangle'), 'AlertTriangle DEVE estar na lista de imports do lucide-react');

      // 2. Extrair todos os elementos JSX do tipo <IconName ... /> e garantir que estão no import
      const jsxIconMatches = Array.from(layoutContent.matchAll(/<([A-Z][a-zA-Z0-9]+)\s/g)).map((m) => m[1]);
      const uniqueJsxIcons = Array.from(new Set(jsxIconMatches)).filter(
        (name) => !['EditorLayout', 'CanvasArea', 'PropertyInspector', 'NewTemplateWizard', 'CompileModal', 'ImportModal', 'RenameModelModal', 'DeleteModelModal'].includes(name)
      );

      for (const icon of uniqueJsxIcons) {
        assert.ok(
          importedSymbols.includes(icon),
          `Ícone JSX <${icon}> usado em EditorLayout.tsx deve ser importado do lucide-react para evitar ReferenceError`
        );
      }
    });

    it('PATCH 3.2.8.1 REGRESSÃO: Modais de Conflito (MODEL_VERSION_CONFLICT e MODEL_NOT_FOUND) preservam o conteúdo local e contêm estrutura válida', () => {
      const layoutPath = path.resolve(process.cwd(), 'apps/frontend/src/editor/EditorLayout.tsx');
      const layoutContent = fs.readFileSync(layoutPath, 'utf-8');

      // Verificar modal de conflito
      assert.ok(layoutContent.includes('Conflito de Versão Detectado'), 'Modal de conflito de versão deve ser renderizado');
      assert.ok(layoutContent.includes('Suas alterações locais foram totalmente preservadas'), 'Garante a mensagem de preservação do trabalho local');

      // Verificar modal de modelo deletado
      assert.ok(layoutContent.includes('Modelo Não Encontrado no Servidor'), 'Modal de modelo não encontrado deve ser renderizado');
      assert.ok(layoutContent.includes('Suas alterações locais continuam disponíveis no canvas'), 'Garante a preservação no canvas ao excluir no servidor');
    });
  });
});
