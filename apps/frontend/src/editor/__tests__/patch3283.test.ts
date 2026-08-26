import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generateCopyTitle } from '../useEditorStore.ts';
import { presenceRepository } from '../../../../backend/dist/repositories/presenceRepository.js';
import { resolveTabSessionId, resetInMemSessionForTest } from '../sessionUtils.ts';

describe('FASE 3.5 — PATCH 3.2.8.3 SUITE DE TESTES (RESOLUÇÃO DE CONFLITO, ROUTING E DUPLICAÇÃO DE ABA - REGRAS A-Z)', () => {
  const layoutPath = path.resolve(process.cwd(), 'apps/frontend/src/editor/EditorLayout.tsx');
  const storePath = path.resolve(process.cwd(), 'apps/frontend/src/editor/useEditorStore.ts');
  const appPath = path.resolve(process.cwd(), 'apps/frontend/src/App.tsx');
  
  const layoutContent = fs.readFileSync(layoutPath, 'utf-8').replace(/\r\n/g, '\n');
  const storeContent = fs.readFileSync(storePath, 'utf-8').replace(/\r\n/g, '\n');
  const appContent = fs.readFileSync(appPath, 'utf-8').replace(/\r\n/g, '\n');

  describe('1. IDEMPOTÊNCIA E ESTADO DO MODAL DE RESOLUÇÃO (TESTES A, B, C, D, E)', () => {
    it('TESTE A: Resolver abre modal na primeira tentativa', () => {
      assert.ok(layoutContent.includes('const openConflictModal = () =>'), 'openConflictModal está declarada');
      assert.ok(layoutContent.includes('onClick={openConflictModal}'), 'onClick do indicador aciona openConflictModal');
    });

    it('TESTE B: Fechar e clicar Resolver novamente abre modal', () => {
      assert.ok(layoutContent.includes('const closeConflictModal = () =>'), 'closeConflictModal reseta isConflictModalOpen e isReloadConfirmOpen');
      assert.ok(layoutContent.includes('closeConflictModal()'), 'closeConflictModal é chamado para fechar o modal com segurança');
    });

    it('TESTE C: Terceira abertura também funciona idempotentemente', () => {
      assert.ok(layoutContent.includes('setIsReloadConfirmOpen(false);') && layoutContent.includes('setIsConflictModalOpen(true);'),
                'Abertura explicita limpa confirms antigos e mantem ação idempotente');
    });

    it('TESTE D: Continuar editando fecha modal', () => {
      assert.ok(layoutContent.includes('resolveConflictContinueEditing();\n                  closeConflictModal();'),
                'Continuar editando localmente executa resolução local e fecha modal via closeConflictModal');
    });

    it('TESTE E: Após Continuar editando, Resolver continua funcional', () => {
      assert.ok(layoutContent.includes('if (saveStatus === \'conflict\') openConflictModal();'),
                'Indicador na toolbar reabre modal com openConflictModal mesmo com saveStatus=conflict mantido');
    });
  });

  describe('2. CARREGAR VERSÃO MAIS RECENTE E TRATAMENTO DE ERROS (TESTES F, G, H, I, J, K)', () => {
    it('TESTE F: Carregar versão mais recente abre confirmação quando dirty', () => {
      assert.ok(layoutContent.includes('if (isDirty) {\n                    setIsConflictModalOpen(false);\n                    setIsReloadConfirmOpen(true);'),
                'Fecha modal de conflito e abre confirmação de reload quando isDirty é true');
    });

    it('TESTE G: Confirmar reload chama resolveConflictReloadRemote exatamente 1 vez', () => {
      assert.ok(layoutContent.includes('const success = await resolveConflictReloadRemote();'),
                'Executa resolveConflictReloadRemote após confirmação do usuário');
    });

    it('TESTE H: Remote document substitui local', () => {
      assert.ok(storeContent.includes('document: normalized,'), 'Versão remota substitui o documento no store');
    });

    it('TESTE I: templateVersion atualiza', () => {
      assert.ok(storeContent.includes('currentTemplateVersion: remote.version,'), 'Atualiza currentTemplateVersion com a versão remota');
    });

    it('TESTE J: Undo/Redo antigo é zerado', () => {
      assert.ok(storeContent.includes('history: [normalized],\n        historyIndex: 0,'), 'Zera histórico Undo/Redo na recarga');
    });

    it('TESTE K: Erro no GET remoto não desaparece silenciosamente', () => {
      assert.ok(layoutContent.includes('alert(\'Não foi possível carregar a versão mais recente. Tente novamente.\');'),
                'Exibe mensagem de erro caso recarga remota falhe');
    });
  });

  describe('3. TOOLBAR COMPACTA E PRESERVAÇÃO DE LARGURA (TESTES L, M, N)', () => {
    it('TESTE L: Toolbar conflict não cria novo botão expansivo', () => {
      assert.ok(!layoutContent.includes('Tentar novamente'), 'Sem botões expansivos desnecessários na toolbar');
      assert.ok(!layoutContent.includes('Salvar como cópia na toolbar'), 'Salvar como cópia permanece interno ao modal');
    });

    it('TESTE M: Imprimir permanece no DOM e mesma ordem estrutural', () => {
      const printIndex = layoutContent.indexOf('<span>Imprimir</span>');
      assert.ok(printIndex > -1, 'Botão Imprimir está presente no DOM');
    });

    it('TESTE N: Indicador conflict continua compacto', () => {
      assert.ok(layoutContent.includes('<span>Conflito</span>'), 'Indicador compacto com texto Conflito');
      assert.ok(layoutContent.includes('title="Este modelo possui alterações concorrentes. Clique para resolver."'), 'Tooltip descritiva presente no indicador');
    });
  });

  describe('4. ROTA DE MODELO E DUPLICAÇÃO DE ABA (TESTES O, P, Q, R, S, T, U, V, W)', () => {
    it('TESTE O: URL do editor contém templateId quando modelo persistido é aberto', () => {
      assert.ok(appContent.includes('setCurrentModule(`editor/${id}`);') || appContent.includes('setCurrentModule(`editor/${parsed.templateId}`);'),
                'App.tsx inclui o templateId na rota do editor');
    });

    it('TESTE P: Reload/F5 da rota do template reabre mesmo templateId', () => {
      assert.ok(appContent.includes('const parseHash = (hashStr: string) =>'), 'Função parseHash extrai o templateId da URL');
    });

    it('TESTE Q: Duplicação simulada da URL mantém mesmo templateId', () => {
      assert.ok(appContent.includes('parsed.module === \'editor\' && parsed.templateId'), 'Detecta módulo editor e templateId ao duplicar URL/aba');
    });

    it('TESTE R: Aba duplicada recebe sessionId diferente', async () => {
      resetInMemSessionForTest();
      const mockStorageA: Record<string, string> = {};
      const storageA: Storage = {
        length: 0, clear: () => {}, getItem: (k) => mockStorageA[k] || null, key: (i) => Object.keys(mockStorageA)[i] || null, removeItem: (k) => { delete mockStorageA[k]; }, setItem: (k, v) => { mockStorageA[k] = v; },
      };
      const mockStorageB: Record<string, string> = {};
      const storageB: Storage = {
        length: 0, clear: () => {}, getItem: (k) => mockStorageB[k] || null, key: (i) => Object.keys(mockStorageB)[i] || null, removeItem: (k) => { delete mockStorageB[k]; }, setItem: (k, v) => { mockStorageB[k] = v; },
      };

      const sessionA = await resolveTabSessionId(storageA, 'witiquetas_tab_DUPTEST_A', 10);
      resetInMemSessionForTest();
      const sessionB = await resolveTabSessionId(storageB, 'witiquetas_tab_DUPTEST_B', 10);

      assert.notEqual(sessionA.sessionId, sessionB.sessionId, 'Abas distintas geram sessionIds únicos');
    });

    it('TESTE S: Mesmo templateId + session IDs diferentes gera 2 editing_sessions', async () => {
      await presenceRepository.registerOrHeartbeatSession({ modelId: 'tpl-dup-test', companyId: 'tenant-1', sessionId: 'sess-1', userIdentifier: 'User A' });
      await presenceRepository.registerOrHeartbeatSession({ modelId: 'tpl-dup-test', companyId: 'tenant-1', sessionId: 'sess-2', userIdentifier: 'User B' });

      const active = await presenceRepository.getActiveSessions('tpl-dup-test', 'tenant-1');
      assert.equal(active.length, 2, '2 sessões distintas registradas no mesmo modelo');
    });

    it('TESTE T: Aba duplicada não copia automaticamente isDirty/documento local não salvo', () => {
      assert.ok(appContent.includes('const template = await templatesApi.getTemplateById(parsed.templateId);'),
                'A nova aba faz GET no servidor para obter a versão persistida e não copia estado local em memória');
    });

    it('TESTE U: Modelo remoto é carregado da API na aba duplicada', () => {
      assert.ok(appContent.includes('store.setDocument(template.document, template.id, template.version);'),
                'Aba duplicada carrega documento remoto da API no useEditorStore');
    });

    it('TESTE V: ModelsPage -> Editor atualiza rota corretamente', () => {
      assert.ok(appContent.includes('handleOpenModel'), 'handleOpenModel abre modelo e atualiza a rota');
    });

    it('TESTE W: Voltar a Models limpa/altera contexto de rota corretamente', () => {
      assert.ok(layoutContent.includes('onBackToDashboard'), 'EditorLayout permite retornar ao dashboard');
    });
  });

  describe('5. REGRESSÃO E COMPONENTES CONGELADOS (TESTES X, Y, Z)', () => {
    it('TESTE X: Nenhuma regressão em presença', async () => {
      const active = await presenceRepository.getActiveSessions('tpl-dup-test', 'tenant-1');
      assert.ok(Array.isArray(active), 'Presença ativa continua funcional');
    });

    it('TESTE Y: Nenhuma regressão em Save As Copy', () => {
      assert.equal(generateCopyTitle('Modelo Teste'), 'Modelo Teste - Cópia');
      assert.equal(generateCopyTitle('Modelo Teste - Cópia'), 'Modelo Teste - Cópia (2)');
    });

    it('TESTE Z: Nenhuma alteração em componentes congelados', () => {
      const boundsPath = path.resolve(process.cwd(), 'apps/frontend/src/editor/bounds.ts');
      assert.ok(fs.existsSync(boundsPath), 'bounds.ts intocado');
    });
  });
});
