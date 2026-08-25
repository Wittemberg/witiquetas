import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('1. RELEASE SAFETY: Documentação Canônica RELEASE-SAFETY.md e INCIDENT-RECOVERY.md', () => {
  const safetyDocPath = path.resolve('docs/operations/RELEASE-SAFETY.md');
  const recoveryDocPath = path.resolve('docs/operations/INCIDENT-RECOVERY.md');

  assert.ok(fs.existsSync(safetyDocPath), 'RELEASE-SAFETY.md deve existir');
  assert.ok(fs.existsSync(recoveryDocPath), 'INCIDENT-RECOVERY.md deve existir');

  const safetyContent = fs.readFileSync(safetyDocPath, 'utf8');
  assert.ok(safetyContent.includes('PUSH != DEPLOY'), 'Deve declarar PUSH != DEPLOY');
  assert.ok(safetyContent.includes('BUILD VERDE != PRODUÇÃO'), 'Deve declarar BUILD VERDE != PRODUÇÃO');
  assert.ok(safetyContent.includes('candidate-'), 'Deve documentar a tag candidate');
  assert.ok(safetyContent.includes('stable'), 'Deve documentar a tag stable');
});

test('2. SAFETY SCRIPTS: Scripts de Checkpoint, Rollback e Backup de Banco', () => {
  const checkpointPs1 = path.resolve('scripts/safety/create-checkpoint.ps1');
  const checkpointSh = path.resolve('scripts/safety/create-checkpoint.sh');
  const rollbackPs1 = path.resolve('scripts/release/rollback-production.ps1');
  const rollbackSh = path.resolve('scripts/release/rollback-production.sh');
  const dbBackupPs1 = path.resolve('scripts/database/backup-predeploy.ps1');

  assert.ok(fs.existsSync(checkpointPs1), 'create-checkpoint.ps1 deve existir');
  assert.ok(fs.existsSync(checkpointSh), 'create-checkpoint.sh deve existir');
  assert.ok(fs.existsSync(rollbackPs1), 'rollback-production.ps1 deve existir');
  assert.ok(fs.existsSync(rollbackSh), 'rollback-production.sh deve existir');
  assert.ok(fs.existsSync(dbBackupPs1), 'backup-predeploy.ps1 deve existir');

  const rollbackContent = fs.readFileSync(rollbackPs1, 'utf8');
  assert.ok(rollbackContent.includes('previousStableSha'), 'Script de rollback deve resolver a release anterior');
  assert.ok(!rollbackContent.includes('npm run build'), 'Rollback NUNCA deve executar rebuild');
});

test('3. RELEASE MANIFEST & GIT HOOKS: Validação de Estrutura do Manifesto e Pre-Commit Hook', () => {
  const manifestPath = path.resolve('docs/releases/release-manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'release-manifest.json deve existir');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.ok(manifest.commitSha, 'Manifesto deve conter commitSha');
  assert.ok(manifest.previousStableSha, 'Manifesto deve conter previousStableSha');
  assert.ok(manifest.frontendImage, 'Manifesto deve conter frontendImage');
  assert.ok(manifest.backendImage, 'Manifesto deve conter backendImage');

  const preCommitPath = path.resolve('.githooks/pre-commit');
  const prePushPath = path.resolve('.githooks/pre-push');
  assert.ok(fs.existsSync(preCommitPath), '.githooks/pre-commit deve existir');
  assert.ok(fs.existsSync(prePushPath), '.githooks/pre-push deve existir');
});

test('4. CSS SIZE GUARD & CRITICAL FILE AUDIT: Proteção Contra Redução Abrupta de CSS', () => {
  const cssPath = path.resolve('apps/frontend/src/index.css');
  const cssCode = fs.readFileSync(cssPath, 'utf8');

  // Size guard: mínimo de 800 linhas para impedir o acidente do 224599d (-832 linhas)
  const lineCount = cssCode.split('\n').length;
  assert.ok(lineCount >= 800, `index.css deve ter pelo menos 800 linhas. Atual: ${lineCount}`);

  const gitIgnorePath = path.resolve('.gitignore');
  const gitIgnore = fs.readFileSync(gitIgnorePath, 'utf8');
  assert.ok(gitIgnore.includes('.recovery/'), '.gitignore deve ignorar a pasta .recovery/');
});

test('5. CI DEPLOY GUARD: Janela de Polling de 150s (30x5s), 3 Estados e Auto-Rollback Dual-Stack', () => {
  const workflowPath = path.resolve('.github/workflows/docker.yml');
  assert.ok(fs.existsSync(workflowPath), 'docker.yml deve existir');

  const workflowContent = fs.readFileSync(workflowPath, 'utf8');
  assert.ok(workflowContent.includes('seq 1 30'), 'Guard deve realizar 30 tentativas');
  assert.ok(workflowContent.includes('sleep 5'), 'Guard deve pausar 5s entre tentativas');
  assert.ok(workflowContent.includes('150 segundos'), 'Guard deve declarar a janela total de 150 segundos');
  assert.ok(workflowContent.includes('RELATÓRIO DE MÉTRICAS DO DEPLOY PORTAINER'), 'Guard deve incluir relatório de métricas de convergência');
  assert.ok(workflowContent.includes('prev_front_digest'), 'Guard deve re-apontar frontend stable em caso de falha');
  assert.ok(workflowContent.includes('prev_back_digest'), 'Guard deve re-apontar backend stable em caso de falha');
});

