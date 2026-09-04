import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

test('1. METADATA REGRESSION: version.json do frontend contém metadados canônicos do Hotfix 4.5.6.1', () => {
  const versionJsonPath = path.resolve('apps/frontend/public/version.json');
  assert.ok(fs.existsSync(versionJsonPath), 'apps/frontend/public/version.json deve existir');

  const content = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));

  assert.equal(content.name, 'witiquetas-frontend', 'name deve ser witiquetas-frontend');
  assert.equal(content.version, '4.5.6.1-hotfix', 'version deve ser 4.5.6.1-hotfix e não stale');
  assert.equal(content.status, 'HOMOLOGATED_FROZEN', 'status deve ser HOMOLOGATED_FROZEN');
  assert.equal(
    content.package,
    'HOTFIX 4.5.6.1 — Restaurar DCC + Preview da Central',
    'package deve ser o Hotfix 4.5.6.1'
  );
  assert.equal(content.phase, 'Fase 4 — baseline congelado / transição para Fase 5', 'phase deve estar declarada');
  assert.equal(content.governanceSha, 'ec6434f9402ca98a9a81410b9c5fcaac7097d019', 'governanceSha deve apontar para o commit base do freeze');
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
