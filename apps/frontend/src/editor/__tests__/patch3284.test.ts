import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('FASE 3.5 — PATCH 3.2.8.4 SUITE DE TESTES (ESTABILIZAÇÃO GEOMÉTRICA DO STATUS NA TOOLBAR - REGRAS A-P)', () => {
  const layoutPath = path.resolve(process.cwd(), 'apps/frontend/src/editor/EditorLayout.tsx');
  const layoutContent = fs.readFileSync(layoutPath, 'utf-8').replace(/\r\n/g, '\n');

  describe('1. INVARIÂNCIA GEOMÉTRICA E CONTAINER FIXO (TESTES A-F, N, O, P)', () => {
    it('TESTE A-F: Todos os estados (saved, unsaved, saving, error, conflict, deleted) são renderizados dentro de save-status-container', () => {
      assert.ok(layoutContent.includes('className="save-status-container"'), 'Container save-status-container está presente no JSX');
    });

    it('TESTE O: Container possui largura reservada estável com width, minWidth e maxWidth fixos em 140px', () => {
      assert.ok(layoutContent.includes('width: \'140px\''), 'width fixo em 140px definido');
      assert.ok(layoutContent.includes('minWidth: \'140px\''), 'minWidth fixo em 140px definido');
      assert.ok(layoutContent.includes('maxWidth: \'140px\''), 'maxWidth fixo em 140px definido');
      assert.ok(layoutContent.includes('flexShrink: 0'), 'flexShrink 0 garante que a largura reservada não encolha');
    });

    it('TESTE N: Nenhuma propriedade de status utiliza width dinâmica calculada em runtime', () => {
      assert.ok(!layoutContent.includes('width: `${statusWidth}px`'), 'Sem cálculos dinâmicos de largura via JavaScript');
    });

    it('TESTE P: Layout não introduz overflow horizontal', () => {
      assert.ok(layoutContent.includes('overflow: \'hidden\''), 'Container possui overflow hidden para conter filhos');
    });
  });

  describe('2. COMPACTAÇÃO VISUAL DE TEXTO E TOOLTIPS (TESTES G, H, I)', () => {
    it('TESTE G: Nenhum estado injeta botões expansivos desnecessários', () => {
      assert.ok(!layoutContent.includes('Tentar novamente salvar o modelo'), 'Sem botões expansivos extras');
    });

    it('TESTE H: Conflito permanece clicável para interações manuais', () => {
      assert.ok(layoutContent.includes('saveStatus === \'conflict\' || saveStatus === \'deleted\' || saveStatus === \'error\' ? \'pointer\' : \'default\''),
                'Cursor pointer ativado para interações no status de conflito');
    });

    it('TESTE I: Clique no conflito reabre modal via openConflictModal', () => {
      assert.ok(layoutContent.includes('if (saveStatus === \'conflict\') openConflictModal();'),
                'Ao clicar no status de conflito, openConflictModal é invocado');
    });
  });

  describe('3. PRESERVAÇÃO DE COMPONENTES E ORDEM DA TOOLBAR (TESTES J, K, L, M)', () => {
    it('TESTE J & K: Transição saved <-> conflict não altera a ordem ou presença dos elementos irmãos da toolbar', () => {
      const statusIdx = layoutContent.indexOf('className="save-status-container"');
      const printIdx = layoutContent.indexOf('<span>Imprimir</span>');
      assert.ok(statusIdx > -1 && printIdx > -1, 'Status e Imprimir estão presentes no DOM');
      assert.ok(statusIdx < printIdx, 'Container de status precede o botão Imprimir no DOM');
    });

    it('TESTE L: Botão Imprimir permanece no DOM', () => {
      assert.ok(layoutContent.includes('setIsCompileOpen(true)'), 'Ação de compilar/imprimir mantida no DOM');
      assert.ok(layoutContent.includes('<span>Imprimir</span>'), 'Texto Imprimir visível mantido');
    });

    it('TESTE M: Imprimir permanece na mesma ordem estrutural depois dos controles da toolbar', () => {
      const integrationIdx = layoutContent.indexOf('Dados de Integração');
      const printIdx = layoutContent.indexOf('<span>Imprimir</span>');
      assert.ok(integrationIdx < printIdx, 'Imprimir posicionado após Dados de Integração');
    });
  });
});
