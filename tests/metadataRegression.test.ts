import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

test('1. METADATA REGRESSION: version.json do frontend contém metadados canônicos do Hotfix 4.5.6.1', () => {
  const versionJsonPath = path.resolve('apps/frontend/public/version.json');
  assert.ok(fs.existsSync(versionJsonPath), 'apps/frontend/public/version.json deve existir');

  const content = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));

  const checkpointsPath = path.resolve('docs/development-control/checkpoints.json');
  const checkpoints = JSON.parse(fs.readFileSync(checkpointsPath, 'utf8')).checkpoints;
  const latestCheckpoint = checkpoints[0];

  assert.equal(content.name, 'witiquetas-frontend', 'name deve ser witiquetas-frontend');
  assert.equal(content.version, latestCheckpoint.patch, 'version deve ser o patch do último checkpoint e não stale');
  assert.ok(content.status === 'HOMOLOGATED_FROZEN' || content.status === 'IMPLEMENTED_AWAITING_HOMOLOGATION');
  assert.ok(!content.version.includes('4.3.0'), 'version não pode ser o valor stale do Pacote 4.3');
  assert.ok(content.package.includes('5.2') || content.package.includes('5.1') || content.package.includes('4.5.6.1'), 'package deve ser compatível com o release');
});

test('2. METADATA REGRESSION: version.json coincide com o último checkpoint de governança', () => {
  const checkpointsPath = path.resolve('docs/development-control/checkpoints.json');
  const checkpoints = JSON.parse(fs.readFileSync(checkpointsPath, 'utf8')).checkpoints;
  const latestCheckpoint = checkpoints[0];

  const versionJson = JSON.parse(fs.readFileSync(path.resolve('apps/frontend/public/version.json'), 'utf8'));

  assert.equal(versionJson.version, latestCheckpoint.patch, 'version deve corresponder ao patch do último checkpoint');
  assert.equal(versionJson.candidateSha, latestCheckpoint.sha, 'candidateSha deve corresponder ao SHA do checkpoint de governança');
});

test('3. METADATA REGRESSION: Dockerfile do frontend não contém literais stale de pacotes antigos', () => {
  const dockerfilePath = path.resolve('apps/frontend/Dockerfile');
  assert.ok(fs.existsSync(dockerfilePath), 'apps/frontend/Dockerfile deve existir');

  const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8');

  assert.ok(!dockerfileContent.includes('PACOTE 4.3'), 'Dockerfile NUNCA deve conter o literal estático PACOTE 4.3');
  assert.ok(!dockerfileContent.includes('4.3.0-candidate'), 'Dockerfile NUNCA deve conter a versão hardcoded 4.3.0-candidate');
  assert.ok(dockerfileContent.includes('inject-version-metadata.js'), 'Dockerfile deve invocar o script estrutural inject-version-metadata.js');
});

test('4. METADATA REGRESSION: Script inject-version-metadata.js injeta SHA de build preservando governança', () => {
  const scriptPath = path.resolve('apps/frontend/scripts/inject-version-metadata.js');
  assert.ok(fs.existsSync(scriptPath), 'Script inject-version-metadata.js deve existir');

  const tmpFile = path.resolve('scratch/temp-version-test.json');
  const initialData = {
    name: 'witiquetas-frontend',
    version: '4.5.6-governance',
    commit: 'ec6434f9402ca98a9a81410b9c5fcaac7097d019',
    candidateSha: 'ec6434f9402ca98a9a81410b9c5fcaac7097d019',
    runningSha: 'ec6434f9402ca98a9a81410b9c5fcaac7097d019',
    shortCommit: 'ec6434f',
    shortSha: 'ec6434f',
    governanceSha: 'ec6434f9402ca98a9a81410b9c5fcaac7097d019',
    status: 'HOMOLOGATED_FROZEN',
    package: 'PACOTE 4.5.6 — Freeze Formal do Editor + Central de Impressão e Reconciliação do DCC / Roadmap',
    phase: 'Fase 4 — baseline congelado / transição para Fase 5',
    timestamp: '2026-09-04T12:00:00Z',
  };

  fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
  fs.writeFileSync(tmpFile, JSON.stringify(initialData, null, 2), 'utf8');

  const testSha = '1234567890abcdef1234567890abcdef12345678';
  const testShortSha = '1234567';
  const testBuiltAt = '2026-09-04T13:00:00Z';

  execFileSync(process.execPath, [scriptPath, tmpFile, testSha, testShortSha, testBuiltAt]);

  const updatedData = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));

  // Valida injeção de SHAs do build
  assert.equal(updatedData.commit, testSha, 'commit deve ser atualizado para o SHA de build');
  assert.equal(updatedData.candidateSha, testSha, 'candidateSha deve ser atualizado para o SHA de build');
  assert.equal(updatedData.runningSha, testSha, 'runningSha deve ser atualizado para o SHA de build');
  assert.equal(updatedData.shortCommit, testShortSha, 'shortCommit deve ser atualizado');
  assert.equal(updatedData.shortSha, testShortSha, 'shortSha deve ser atualizado');
  assert.equal(updatedData.builtAt, testBuiltAt, 'builtAt deve ser atualizado');

  // Valida preservação estrita da governança
  assert.equal(updatedData.name, 'witiquetas-frontend', 'name deve ser preservado');
  assert.equal(updatedData.version, '4.5.6-governance', 'version deve ser preservado');
  assert.equal(updatedData.status, 'HOMOLOGATED_FROZEN', 'status deve ser preservado');
  assert.equal(updatedData.package, initialData.package, 'package deve ser preservado');
  assert.equal(updatedData.phase, initialData.phase, 'phase deve ser preservado');
  assert.equal(updatedData.governanceSha, initialData.governanceSha, 'governanceSha deve ser preservado');

  // Limpeza
  fs.unlinkSync(tmpFile);
});

test('5. METADATA REGRESSION: Dockerfile do backend aceita build-args e exporta variáveis canônicas de release', () => {
  const dockerfilePath = path.resolve('apps/backend/Dockerfile');
  assert.ok(fs.existsSync(dockerfilePath), 'apps/backend/Dockerfile deve existir');

  const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8');

  assert.ok(dockerfileContent.includes('ARG GITHUB_SHA=unknown'), 'Dockerfile do backend deve declarar ARG GITHUB_SHA');
  assert.ok(dockerfileContent.includes('ARG SHORT_SHA=unknown'), 'Dockerfile do backend deve declarar ARG SHORT_SHA');
  assert.ok(dockerfileContent.includes('ARG BUILT_AT=unknown'), 'Dockerfile do backend deve declarar ARG BUILT_AT');
  assert.ok(dockerfileContent.includes('ENV GIT_COMMIT=$GITHUB_SHA'), 'Dockerfile do backend deve exportar ENV GIT_COMMIT');
  assert.ok(dockerfileContent.includes('ENV CANDIDATE_SHA=$GITHUB_SHA'), 'Dockerfile do backend deve exportar ENV CANDIDATE_SHA');
  assert.ok(dockerfileContent.includes('ENV RUNNING_SHA=$GITHUB_SHA'), 'Dockerfile do backend deve exportar ENV RUNNING_SHA');
  assert.ok(dockerfileContent.includes('ENV SHORT_SHA=$SHORT_SHA'), 'Dockerfile do backend deve exportar ENV SHORT_SHA');
  assert.ok(dockerfileContent.includes('ENV BUILT_AT=$BUILT_AT'), 'Dockerfile do backend deve exportar ENV BUILT_AT');
});

test('6. METADATA REGRESSION: docker.yml passa build-args para o backend e valida /api/version', () => {
  const workflowPath = path.resolve('.github/workflows/docker.yml');
  assert.ok(fs.existsSync(workflowPath), 'docker.yml deve existir');

  const workflowContent = fs.readFileSync(workflowPath, 'utf8');

  // Backend build-args
  assert.ok(workflowContent.includes('file: apps/backend/Dockerfile'), 'Deve construir apps/backend/Dockerfile');
  assert.ok(workflowContent.includes('GITHUB_SHA=${{ github.sha }}'), 'Deve repassar GITHUB_SHA');
  assert.ok(workflowContent.includes('SHORT_SHA=${{ steps.vars.outputs.short_sha }}'), 'Deve repassar SHORT_SHA');
  assert.ok(workflowContent.includes('BUILT_AT=${{ steps.vars.outputs.built_at }}'), 'Deve repassar BUILT_AT');

  // Smoke test endpoint /api/version
  assert.ok(workflowContent.includes('/api/version'), 'docker.yml deve validar o endpoint /api/version');
  assert.ok(workflowContent.includes('CI_BACKEND_COMMIT'), 'docker.yml deve auditar o commit retornado pelo backend');
});

test('7. METADATA REGRESSION: backend index.ts resolve metadados dinamicamente sem SHA hardcodado', () => {
  const indexPath = path.resolve('apps/backend/src/index.ts');
  assert.ok(fs.existsSync(indexPath), 'apps/backend/src/index.ts deve existir');

  const indexContent = fs.readFileSync(indexPath, 'utf8');

  // Não deve conter SHA hardcodado no handleVersion
  assert.ok(!indexContent.includes("commit: '8bf4a733e78eeea75115b7788ac6a598714c1292'"), 'NÃO deve ter commit hardcoded');
  assert.ok(!indexContent.includes("runningSha: '8bf4a733e78eeea75115b7788ac6a598714c1292'"), 'NÃO deve ter runningSha hardcoded');
  assert.ok(!indexContent.includes("candidateSha: '8bf4a733e78eeea75115b7788ac6a598714c1292'"), 'NÃO deve ter candidateSha hardcoded');

  // Deve ler dinamicamente de env vars e DevelopmentControlService
  assert.ok(indexContent.includes('process.env.GIT_COMMIT'), 'Deve ler process.env.GIT_COMMIT');
  assert.ok(indexContent.includes('DevelopmentControlService'), 'Deve utilizar DevelopmentControlService para checkpoints');
});
