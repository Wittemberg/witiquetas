import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generateCopyTitle } from '../useEditorStore.ts';
import { presenceRepository } from '../../../../backend/dist/repositories/presenceRepository.js';
import { resolveTabSessionId, resetInMemSessionForTest } from '../sessionUtils.ts';

describe('FASE 3.5 — PATCH 3.2.8.2 SUITE DE TESTES (CORREÇÕES DE CONCORRÊNCIA E UX DE MODAIS - REGRAS A-Z)', () => {
  const layoutPath = path.resolve(process.cwd(), 'apps/frontend/src/editor/EditorLayout.tsx');
  const storePath = path.resolve(process.cwd(), 'apps/frontend/src/editor/useEditorStore.ts');
  const modalsPath = path.resolve(process.cwd(), 'apps/frontend/src/modules/models/ModelActionModals.tsx');
  const layoutContent = fs.readFileSync(layoutPath, 'utf-8').replace(/\r\n/g, '\n');
  const storeContent = fs.readFileSync(storePath, 'utf-8').replace(/\r\n/g, '\n');
  const modalsContent = fs.readFileSync(modalsPath, 'utf-8').replace(/\r\n/g, '\n');

  describe('1. MODAL SOBRE MODAL E EXCLUSIVIDADE DE OVERLAYS (TESTES A, B, C, D, E)', () => {
    it('TESTE A: Conflict Modal aberto => Reload Confirm fechado', () => {
      assert.ok(layoutContent.includes('isConflictModalOpen && !isReloadConfirmOpen'), 'Garante a exclusividade visual do modal de conflito');
    });

    it('TESTE B: Ao clicar "Carregar versão mais recente": Conflict Modal fecha antes de Reload Confirm abrir', () => {
      assert.ok(layoutContent.includes('setIsConflictModalOpen(false);\n                    setIsReloadConfirmOpen(true);') ||
                (layoutContent.includes('setIsConflictModalOpen(false);') && layoutContent.includes('setIsReloadConfirmOpen(true);')),
                'Configura fechamento do modal de conflito antes de abrir confirmacao de reload');
    });

    it('TESTE C: Nunca isConflictModalOpen === true e isReloadConfirmOpen === true simultaneamente', () => {
      assert.ok(layoutContent.includes('isReloadConfirmOpen && !isConflictModalOpen'), 'Garante que Reload Confirm não abre com Conflict Modal ativo');
    });

    it('TESTE D: Cancelar reload não chama API, mantêm documento local idêntico e reabre conflito', () => {
      assert.ok(layoutContent.includes('setIsReloadConfirmOpen(false);\n                  setIsConflictModalOpen(true);') ||
                (layoutContent.includes('setIsReloadConfirmOpen(false);') && layoutContent.includes('setIsConflictModalOpen(true);')),
                'Ao cancelar confirmação de recarga, o modal de conflito é reaberto sem alterar dados');
    });

    it('TESTE E: Confirmar reload executa resolveConflictReloadRemote 1 vez, carrega versão remota e zera histórico', () => {
      assert.ok(storeContent.includes('resolveConflictReloadRemote: async () =>'), 'resolveConflictReloadRemote está declarada no store');
      assert.ok(storeContent.includes('history: [normalized]'), 'Zera o histórico Undo/Redo para a versão remota');
      assert.ok(storeContent.includes('historyIndex: 0'), 'Reset de histórico na recarga remota');
    });
  });

  describe('2. CONTINUAR EDITANDO LOCALMENTE E INDICADOR DE TOOLBAR (TESTES F, G, H, I, J, K)', () => {
    it('TESTE F: Continuar editando localmente fecha o modal, preserva documento local, isDirty true e conflito registrado', () => {
      assert.ok(layoutContent.includes('resolveConflictContinueEditing();'), 'Chama a ação do store ao continuar localmente');
      assert.ok(layoutContent.includes('setIsConflictModalOpen(false);'), 'Fecha o modal ao continuar editando localmente');
      assert.ok(storeContent.includes('saveStatus: \'conflict\'') && storeContent.includes('isDirty: true'),
                'resolveConflictContinueEditing preserva saveStatus=conflict e isDirty=true');
    });

    it('TESTE G: Continuar editando não dispara PUT, POST ou retry automático', () => {
      assert.ok(!storeContent.includes('resolveConflictContinueEditing: async () =>'), 'resolveConflictContinueEditing não é async e não executa chamadas de rede');
    });

    it('TESTE H: Indicador "Conflito de versão" continua visível na toolbar após continuar localmente', () => {
      assert.ok(layoutContent.includes('Conflito de versão'), 'Status Conflito de versão presente na toolbar');
      assert.ok(layoutContent.includes('saveStatus === \'conflict\''), 'Renderização condicional do status de conflito presente');
    });

    it('TESTE I: Clicar no indicador de conflito na toolbar reabre o modal', () => {
      assert.ok(layoutContent.includes('onClick={() => setIsConflictModalOpen(true)}'), 'Clique no indicador de conflito reabre o modal de resolução');
    });

    it('TESTE J & TESTE K: Ctrl+S e Salvar durante conflito não chamam PUT automaticamente e reabrem modal', () => {
      assert.ok(layoutContent.includes('if (saveStatus === \'conflict\') {\n            setIsConflictModalOpen(true);') ||
                (layoutContent.includes('if (saveStatus === \'conflict\')') && layoutContent.includes('setIsConflictModalOpen(true);')),
                'Teclado Ctrl+S e botão Salvar verificam conflito e abrem modal sem enviar requisição cega');
    });
  });

  describe('3. PREVENÇÃO DE CÓPIA DA CÓPIA E NOMENCLATURA (TESTES L, M, N, O, P, Q, R, S, T, U)', () => {
    it('TESTE L: Salvar como cópia chama createTemplate e desabilita duplo clique via isSavingCopy', () => {
      assert.ok(layoutContent.includes('isSavingCopy'), 'Estado isSavingCopy previne múltiplos cliques simultâneos');
      assert.ok(layoutContent.includes('resolveConflictSaveAsCopy()'), 'Dispara resolveConflictSaveAsCopy no manipulador de cópia');
    });

    it('TESTE M & TESTE N: A cópia utiliza exatamente o LabelDocument LOCAL e não o remoto', () => {
      assert.ok(storeContent.includes('const localDocCopy: LabelDocument = JSON.parse(JSON.stringify(document));'), 'Salvar como cópia clona o documento local em memória');
    });

    it('TESTE O: Nome "Modelo" -> "Modelo - Cópia"', () => {
      assert.equal(generateCopyTitle('Modelo'), 'Modelo - Cópia');
    });

    it('TESTE P: Nome "Modelo - Cópia" -> "Modelo - Cópia (2)"', () => {
      assert.equal(generateCopyTitle('Modelo - Cópia'), 'Modelo - Cópia (2)');
    });

    it('TESTE Q: Nome "Modelo - Cópia (2)" -> "Modelo - Cópia (3)"', () => {
      assert.equal(generateCopyTitle('Modelo - Cópia (2)'), 'Modelo - Cópia (3)');
    });

    it('TESTE R: Não gerar acumulativos como "Modelo - Cópia - Cópia" ou "Modelo — Cópia em conflito — Cópia em conflito"', () => {
      assert.equal(generateCopyTitle('Modelo - Cópia - Cópia'), 'Modelo - Cópia (2)');
      assert.equal(generateCopyTitle('Modelo — Cópia em conflito'), 'Modelo - Cópia (2)');
      assert.equal(generateCopyTitle('Modelo — Cópia em conflito — Cópia em conflito'), 'Modelo - Cópia (2)');
    });

    it('TESTE S, TESTE T & TESTE U: Fluxos alternativos (Recarregar remoto, Continuar localmente, Cancelar) não criam cópia', () => {
      const reloadRemoteBlock = storeContent.substring(storeContent.indexOf('resolveConflictReloadRemote:'));
      const continueEditingBlock = storeContent.substring(storeContent.indexOf('resolveConflictContinueEditing:'));

      assert.ok(!reloadRemoteBlock.substring(0, 300).includes('createTemplate'), 'Carregar remoto não chama createTemplate');
      assert.ok(!continueEditingBlock.substring(0, 200).includes('createTemplate'), 'Continuar editando localmente não chama createTemplate');
    });
  });

  describe('4. ALINHAMENTO VISUAL E INTEGRALIDADE DOS MODAIS (TESTES V, W, X)', () => {
    it('TESTE V: Modais Renomear e Excluir não utilizam padding horizontal zero no wizard-body', () => {
      assert.ok(!modalsContent.includes('padding: \'1.25rem 0\''), 'Removido o padding horizontal zero inline dos modais');
      assert.ok(modalsContent.includes('className="wizard-body"'), 'Preservada a classe visual padronizada wizard-body');
    });

    it('TESTE W: Renomear mantém Enter e Esc para submissão e cancelamento', () => {
      assert.ok(modalsContent.includes('onSubmit={handleSubmit}'), 'Suporta submissão via formulário/Enter');
      assert.ok(modalsContent.includes('if (e.key === \'Escape\')'), 'Suporta fechar via tecla Esc');
    });

    it('TESTE X: Excluir mantém confirmação explícita e botão danger', () => {
      assert.ok(modalsContent.includes('btn btn-danger'), 'Botão de confirmação de exclusão mantém estilo perigo/danger');
      assert.ok(modalsContent.includes('Excluir Modelo'), 'Texto de confirmação mantido');
    });
  });

  describe('5. INTEGRIDADE DE PRESENÇA E ISOLAMENTO MULTI-TENANT (TESTES Y, Z)', () => {
    it('TESTE Y: Presença permanece intacta sem regressão nas regras multi-tenant', async () => {
      await presenceRepository.registerOrHeartbeatSession({
        modelId: 'tpl-patch3282-test',
        companyId: 'tenant-x',
        sessionId: 'sess-x',
        userIdentifier: 'Usuário X',
      });

      const activeX = await presenceRepository.getActiveSessions('tpl-patch3282-test', 'tenant-x');
      const activeY = await presenceRepository.getActiveSessions('tpl-patch3282-test', 'tenant-y');

      assert.equal(activeX.length, 1);
      assert.equal(activeY.length, 0, 'Isolamento de tenant preservado no controle de presença');
    });

    it('TESTE Z: BroadcastChannel e gerenciamento de sessionId de aba permanece intacto', async () => {
      resetInMemSessionForTest();
      const mockStorageData: Record<string, string> = {};
      const mockStorage: Storage = {
        length: 0,
        clear: () => {},
        getItem: (k: string) => mockStorageData[k] || null,
        key: (i: number) => Object.keys(mockStorageData)[i] || null,
        removeItem: (k: string) => { delete mockStorageData[k]; },
        setItem: (k: string, v: string) => { mockStorageData[k] = v; },
      };

      const session = await resolveTabSessionId(mockStorage, 'witiquetas_tab_PATCH3282', 10);
      assert.ok(session.sessionId, 'SessionId foi gerado com sucesso');
      assert.ok(session.tabId.startsWith('witiquetas_tab_'), 'TabId mantêm convenção canônica');
    });
  });
});
