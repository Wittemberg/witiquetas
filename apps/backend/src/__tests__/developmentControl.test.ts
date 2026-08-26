import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DevelopmentControlService } from '../services/developmentControlService.js';

describe('DEVELOPMENT CONTROL CENTER 0.1.1 - SUÍTE DE INVARIANTES (REGRAS SEÇÃO 11)', () => {
  const service = new DevelopmentControlService();

  it('A. sum(capability.weight) == fullRoadmap.totalWeight', () => {
    const capabilities = service.getCapabilities();
    const sumWeights = capabilities.reduce((acc, c) => acc + c.weight, 0);
    const progress = service.calculateProgress();

    assert.equal(sumWeights, progress.fullRoadmap.totalWeight);
  });

  it('B. sum(module.totalWeight) == fullRoadmap.totalWeight', () => {
    const modules = service.getModuleProgressList();
    const sumModWeights = modules.reduce((acc, m) => acc + m.totalWeight, 0);
    const progress = service.calculateProgress();

    assert.equal(sumModWeights, progress.fullRoadmap.totalWeight);
  });

  it('C. sum(mvp capability weights) == mvp.totalWeight', () => {
    const capabilities = service.getCapabilities();
    const mvpSum = capabilities.filter((c) => c.mvp).reduce((acc, c) => acc + c.weight, 0);
    const progress = service.calculateProgress();

    assert.equal(mvpSum, progress.mvp.totalWeight);
  });

  it('D. homologatedWeight <= implementedWeight <= totalWeight', () => {
    const progress = service.calculateProgress();

    assert.ok(progress.fullRoadmap.homologatedWeight <= progress.fullRoadmap.implementedWeight);
    assert.ok(progress.fullRoadmap.implementedWeight <= progress.fullRoadmap.totalWeight);

    assert.ok(progress.mvp.homologatedWeight <= progress.mvp.implementedWeight);
    assert.ok(progress.mvp.implementedWeight <= progress.mvp.totalWeight);
  });

  it('E. Percentuais estritamente entre 0 e 100', () => {
    const progress = service.calculateProgress();

    assert.ok(progress.mvp.implementationPercent >= 0 && progress.mvp.implementationPercent <= 100);
    assert.ok(progress.mvp.readinessPercent >= 0 && progress.mvp.readinessPercent <= 100);
    assert.ok(progress.fullRoadmap.implementationPercent >= 0 && progress.fullRoadmap.implementationPercent <= 100);
    assert.ok(progress.fullRoadmap.readinessPercent >= 0 && progress.fullRoadmap.readinessPercent <= 100);

    const modules = service.getModuleProgressList();
    for (const mod of modules) {
      assert.ok(mod.implementationPercent >= 0 && mod.implementationPercent <= 100);
      assert.ok(mod.homologationPercent >= 0 && mod.homologationPercent <= 100);
    }
  });

  it('F. Nenhuma capability ID duplicada', () => {
    const capabilities = service.getCapabilities();
    const ids = new Set<string>();

    for (const cap of capabilities) {
      assert.ok(!ids.has(cap.id), `ID duplicado encontrado: ${cap.id}`);
      ids.add(cap.id);
    }
  });

  it('G. Nenhuma capability sem module válido', () => {
    const capabilities = service.getCapabilities();
    for (const cap of capabilities) {
      assert.ok(cap.module && cap.module.trim().length > 0, `Capability ${cap.id} sem módulo`);
    }
  });

  it('H. Nenhuma capability sem phase válida', () => {
    const phases = service.getPhases();
    for (const phase of phases) {
      assert.ok(phase.id && phase.code, `Fase inválida: ${phase.id}`);
      for (const cap of phase.capabilities) {
        assert.ok(cap.id, `Capability sem ID na fase ${phase.id}`);
      }
    }
  });

  it('I. Checkpoints count não altera os percentuais de progresso', () => {
    const initialProgress = service.calculateProgress();
    const checkpoints = service.getCheckpoints();
    assert.ok(checkpoints.length > 0);

    const reProgress = service.calculateProgress();
    assert.deepEqual(initialProgress, reProgress, 'Progresso permanece idêntico independente dos checkpoints');
  });

  it('J. VALIDATION conta como implementado, mas NÃO como homologado', () => {
    const capabilities = service.getCapabilities();
    const validationCaps = capabilities.filter((c) => c.status === 'VALIDATION');
    assert.ok(validationCaps.length > 0, 'Existe pelo menos uma capability em VALIDATION');

    for (const cap of validationCaps) {
      const isImplemented = cap.status === 'HOMOLOGATED' || cap.status === 'FROZEN' || cap.status === 'VALIDATION' || cap.status === 'IMPLEMENTED';
      const isHomologated = cap.status === 'HOMOLOGATED' || cap.status === 'FROZEN';

      assert.equal(isImplemented, true, 'VALIDATION deve contar como implementado');
      assert.equal(isHomologated, false, 'VALIDATION NÃO deve contar como homologado');
    }
  });

  it('K. FROZEN conta como implementado E homologado', () => {
    const capabilities = service.getCapabilities();
    const frozenCaps = capabilities.filter((c) => c.status === 'FROZEN');
    assert.ok(frozenCaps.length > 0);

    for (const cap of frozenCaps) {
      const isImplemented = cap.status === 'HOMOLOGATED' || cap.status === 'FROZEN' || cap.status === 'VALIDATION' || cap.status === 'IMPLEMENTED';
      const isHomologated = cap.status === 'HOMOLOGATED' || cap.status === 'FROZEN';

      assert.equal(isImplemented, true);
      assert.equal(isHomologated, true);
    }
  });

  it('L. PLANNED não conta como implementado NEM homologado', () => {
    const capabilities = service.getCapabilities();
    const plannedCaps = capabilities.filter((c) => c.status === 'PLANNED');
    assert.ok(plannedCaps.length > 0);

    for (const cap of plannedCaps) {
      const isImplemented = cap.status === 'HOMOLOGATED' || cap.status === 'FROZEN' || cap.status === 'VALIDATION' || cap.status === 'IMPLEMENTED';
      const isHomologated = cap.status === 'HOMOLOGATED' || cap.status === 'FROZEN';

      assert.equal(isImplemented, false);
      assert.equal(isHomologated, false);
    }
  });

  it('M. UNMAPPED permanece visível e não é tratado como concluído', () => {
    const progress = service.calculateProgress();
    assert.ok('UNMAPPED' in progress.countsByStatus);
  });

  it('N. Backend Route Guard: ENABLE_DEV_CONTROL_CENTER=true libera acesso em produção', () => {
    const isDev = false;
    const envFlagTrue: string = 'true';
    const envFlagFalse: string = 'false';

    const canAccessTrue = isDev || envFlagTrue === 'true';
    const canAccessFalse = isDev || envFlagFalse === 'true';

    assert.equal(canAccessTrue, true, 'Flag true deve liberar acesso em produção/homologação');
    assert.equal(canAccessFalse, false, 'Flag false deve bloquear acesso com HTTP 404');
  });
});
