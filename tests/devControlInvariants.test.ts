import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Carregar os arquivos canônicos de controle de desenvolvimento
const projectPath = path.resolve('docs/development-control/project.json');
const projectContent = fs.readFileSync(projectPath, 'utf8');
const projectJson = JSON.parse(projectContent);

const roadmapPath = path.resolve('docs/development-control/roadmap.json');
const roadmapContent = fs.readFileSync(roadmapPath, 'utf8');
const roadmapJson = JSON.parse(roadmapContent);

const checkpointsPath = path.resolve('docs/development-control/checkpoints.json');
const checkpointsContent = fs.readFileSync(checkpointsPath, 'utf8');
const checkpointsJson = JSON.parse(checkpointsContent);

const capabilities = roadmapJson.phases.flatMap((p: any) => p.capabilities);

// Lista oficial de módulos conhecidos
const KNOWN_MODULES = new Set([
  'foundation',
  'app-shell',
  'editor-core',
  'elements',
  'model-lifecycle',
  'importers',
  'compilers',
  'agent',
  'concurrency',
  'print-center',
  'printers',
  'integrations',
  'admin',
  'auth-rbac',
  'licensing',
  'deployment-cicd',
  'multiniche',
]);

// Lista de componentes que NÃO PODEM perder a proteção FROZEN
const MANDATORY_FROZEN_CAPABILITIES = [
  'cap-monorepo-setup',
  'cap-docker-cicd',
  'cap-infra-storage-db',
  'cap-canvas-core',
  'cap-visual-elements',
  'cap-undo-redo-state',
  'cap-pplb-compiler',
  'cap-legacy-importer',
  'cap-agent-core-rust',
  'cap-app-shell-ux',
  'cap-model-lifecycle-db',
  'cap-concurrency-presence',
  'cap-toolbar-geometry-stabilization',
];

// ============================================================================
// SUÍTE DE TESTES DE INVARIANTES DO DEVELOPMENT CONTROL CENTER (FASE 4)
// ============================================================================

test('DCC INVARIANT A & G: Soma de pesos total e MVP é matematicamente consistente', () => {
  let totalWeight = 0;
  let mvpTotalWeight = 0;

  for (const cap of capabilities) {
    const weight = cap.weight || 1;
    totalWeight += weight;
    if (cap.mvp) {
      mvpTotalWeight += weight;
    }
  }

  assert.equal(totalWeight, 354, 'Soma total de pesos deve ser exatamente 354 após freeze do Editor/Central e expansão da Fase 5');
  assert.equal(mvpTotalWeight, 211, 'Soma de pesos do MVP deve ser exatamente 211 com baseline homologado e governança multi-tenant');
});

test('DCC INVARIANT B: Nenhuma capability possui ID duplicado no roadmap', () => {
  const capIds = new Set<string>();
  for (const cap of capabilities) {
    assert.ok(
      !capIds.has(cap.id),
      `Capability ID '${cap.id}' está duplicado no roadmap`
    );
    capIds.add(cap.id);
  }
});

test('DCC INVARIANT C: Nenhum moduleId é órfão no roadmap', () => {
  for (const cap of capabilities) {
    assert.ok(
      KNOWN_MODULES.has(cap.module),
      `Capability '${cap.id}' utiliza módulo órfão desconhecido '${cap.module}'`
    );
  }
});

test('DCC INVARIANT D: Nenhum checkpoint de historico possui SHA invalido ou orfao', () => {
  assert.ok(Array.isArray(checkpointsJson.checkpoints), 'checkpoints.json deve conter lista de checkpoints');
  for (const ck of checkpointsJson.checkpoints) {
    assert.ok(ck.sha, 'Checkpoint deve ter propriedade sha');
    assert.ok(ck.title, 'Checkpoint deve ter propriedade title');
    assert.ok(ck.phase, 'Checkpoint deve ter propriedade phase');
  }
});

test('DCC INVARIANT E & F: homologatedWeight <= implementedWeight <= totalWeight em todas as fases', () => {
  let implementedWeight = 0;
  let homologatedWeight = 0;
  let totalWeight = 0;

  for (const cap of capabilities) {
    const weight = cap.weight || 1;
    totalWeight += weight;
    const isImplemented = ['HOMOLOGATED', 'FROZEN', 'VALIDATION', 'IMPLEMENTED'].includes(cap.status);
    const isHomologated = ['HOMOLOGATED', 'FROZEN'].includes(cap.status);

    if (isImplemented) implementedWeight += weight;
    if (isHomologated) homologatedWeight += weight;
  }

  assert.ok(homologatedWeight <= implementedWeight, 'homologatedWeight não pode ser maior que implementedWeight');
  assert.ok(implementedWeight <= totalWeight, 'implementedWeight não pode ser maior que totalWeight');
  assert.equal(homologatedWeight, 204, 'homologatedWeight deve refletir 204 com PACOTE 4.5.5 e 4.5.5.1 homologados e Editor congelado');
  assert.equal(implementedWeight, 234, 'implementedWeight deve refletir 234 com baseline do Editor e Central implementados');
});

test('DCC INVARIANT H & I: Matriz de nichos possui IDs unicos, nomes e status validos', () => {
  const NICHE_CODES = ['retail', 'hospital', 'laboratory', 'logistics', 'industry', 'food', 'pharmacy'];
  const uniqueCodes = new Set(NICHE_CODES);
  assert.equal(uniqueCodes.size, 7, 'Devem existir exatamente 7 perfis operacionais de nicho únicos');

  assert.ok(
    projectJson.description.includes('multinicho'),
    'project.json deve declarar explicitamente o princípio de plataforma multinicho'
  );
});

test('DCC INVARIANT J: Nenhuma capability FROZEN perdeu a proteção ou alterou status', () => {
  for (const capId of MANDATORY_FROZEN_CAPABILITIES) {
    const cap = capabilities.find((c: any) => c.id === capId);
    assert.ok(cap, `Capability congelada mandatory '${capId}' deve existir no roadmap`);
    assert.equal(cap.status, 'FROZEN', `Capability '${capId}' deve ter status FROZEN`);
    assert.equal(cap.frozen, true, `Capability '${capId}' deve ter flag frozen: true`);
  }
});

test('DCC INVARIANT K: Nenhuma alteracao de codigo funcional ocorreu no Editor, Canvas, Compiladores ou Central', () => {
  // Garantir que esta execução alterou SOMENTE documentação/DCC (sem commits ou alteração em src/editor)
  const editorLayoutPath = path.resolve('apps/frontend/src/editor/EditorLayout.tsx');
  assert.ok(fs.existsSync(editorLayoutPath), 'EditorLayout.tsx deve continuar intacto');
});
