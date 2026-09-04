import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DevelopmentControlService } from '../apps/backend/src/services/developmentControlService.js';

test('1. DCC ROBUSTNESS: JSON normal carrega sem erros', () => {
  const service = new DevelopmentControlService();
  const project = service.getProject();
  assert.equal(project.projectId, 'witiquetas');
});

test('2. DCC ROBUSTNESS: JSON com UTF-8 BOM inicial carrega sem erros', () => {
  const tmpDir = path.resolve('scratch');
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, 'test-bom.json');

  // Grava string JSON prefixada com bytes do BOM UTF-8 (\uFEFF)
  const contentWithBom = '\uFEFF' + JSON.stringify({ test: 'ok', value: 123 });
  fs.writeFileSync(tmpFile, contentWithBom, 'utf8');

  const raw = fs.readFileSync(tmpFile, 'utf8');
  assert.ok(raw.startsWith('\uFEFF'), 'Arquivo temporário deve conter o caractere BOM');

  // Normalização adotada no loader
  const clean = raw.replace(/^\uFEFF/, '');
  const parsed = JSON.parse(clean);
  assert.equal(parsed.test, 'ok');
  assert.equal(parsed.value, 123);

  fs.unlinkSync(tmpFile);
});

test('3. DCC ROBUSTNESS: JSON com sintaxe realmente inválida continua lançando SyntaxError', () => {
  const invalidJson = '{ invalid: syntax, missingQuotes }';
  const clean = invalidJson.replace(/^\uFEFF/, '');
  assert.throws(() => {
    JSON.parse(clean);
  }, /SyntaxError/);
});

test('4. DCC ROBUSTNESS: roadmap.json atual carrega corretamente', () => {
  const service = new DevelopmentControlService();
  const phases = service.getPhases();
  assert.ok(Array.isArray(phases));
  assert.ok(phases.length >= 9, 'Deve conter pelo menos 9 fases mapeadas');
});

test('5. DCC ROBUSTNESS: checkpoints.json atual carrega corretamente', () => {
  const service = new DevelopmentControlService();
  const checkpoints = service.getCheckpoints();
  assert.ok(Array.isArray(checkpoints));
  assert.ok(checkpoints.length > 0, 'Deve conter lista de checkpoints históricos');
});

test('6. DCC ROBUSTNESS: project.json atual carrega corretamente', () => {
  const service = new DevelopmentControlService();
  const project = service.getProject();
  assert.equal(project.name, 'Witiquetas');
});

test('7. DCC ROBUSTNESS: getOverview() retorna objeto completo e válido', () => {
  const service = new DevelopmentControlService();
  const overview = service.getOverview();
  assert.ok(overview, 'Visão geral deve existir');
  assert.ok(overview.progress, 'Progresso deve existir');
  assert.ok(overview.frozenComponents, 'Componentes congelados devem existir');
  assert.ok(overview.modules, 'Módulos devem existir');
});

test('8. DCC ROBUSTNESS: Fase 5 é processada no roadmap', () => {
  const service = new DevelopmentControlService();
  const phases = service.getPhases();
  const phase5 = phases.find((p) => p.id === 'phase-5');
  assert.ok(phase5, 'Fase 5 deve existir no roadmap');
  assert.equal(phase5.status, 'PLANNED', 'Fase 5 deve estar como PLANNED');
  assert.ok(phase5.capabilities.length > 0, 'Fase 5 deve ter capabilities definidas');
});

test('9. DCC ROBUSTNESS: Frozen components são processados no overview', () => {
  const service = new DevelopmentControlService();
  const overview = service.getOverview();
  const frozen = overview.frozenComponents;

  assert.ok(Array.isArray(frozen), 'frozenComponents deve ser um array');
  assert.ok(frozen.length >= 10, 'Deve conter pelo menos 10 componentes congelados');

  const editorFreeze = frozen.find((c) => c.id === 'editor-baseline');
  assert.ok(editorFreeze, 'editor-baseline freeze deve existir');
  assert.equal(editorFreeze.frozenSincePatch, '4.5.5.1');

  const printCenterFreeze = frozen.find((c) => c.id === 'print-center-baseline');
  assert.ok(printCenterFreeze, 'print-center-baseline freeze deve existir');
  assert.equal(printCenterFreeze.frozenSincePatch, '4.5.5.1');
});

test('10. DCC ROBUSTNESS: Totais de Roadmap e MVP permanecem exatos (354, 211, 234, 204)', () => {
  const service = new DevelopmentControlService();
  const overview = service.getOverview();

  assert.equal(overview.progress.fullRoadmap.totalWeight, 354, 'Roadmap totalWeight deve ser 354');
  assert.equal(overview.progress.fullRoadmap.implementedWeight, 234, 'Roadmap implementedWeight deve ser 234');
  assert.equal(overview.progress.fullRoadmap.homologatedWeight, 204, 'Roadmap homologatedWeight deve ser 204');
  assert.equal(overview.progress.fullRoadmap.implementationPercent, 66, 'Roadmap implementationPercent deve ser 66%');
  assert.equal(overview.progress.fullRoadmap.readinessPercent, 58, 'Roadmap readinessPercent deve ser 58%');

  assert.equal(overview.progress.mvp.totalWeight, 211, 'MVP totalWeight deve ser 211');
  assert.equal(overview.progress.mvp.implementedWeight, 199, 'MVP implementedWeight deve ser 199');
  assert.equal(overview.progress.mvp.homologatedWeight, 185, 'MVP homologatedWeight deve ser 185');
  assert.equal(overview.progress.mvp.implementationPercent, 94, 'MVP implementationPercent deve ser 94%');
  assert.equal(overview.progress.mvp.readinessPercent, 88, 'MVP readinessPercent deve ser 88%');
});
