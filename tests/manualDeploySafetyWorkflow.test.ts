import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const workflowPath = path.resolve('.github/workflows/docker.yml');

test('1. WORKFLOW SAFETY: Estrutura de gatilhos em docker.yml', () => {
  assert.ok(fs.existsSync(workflowPath), 'docker.yml deve existir');
  const content = fs.readFileSync(workflowPath, 'utf8');

  // Trigger push na main e workflow_dispatch
  assert.ok(content.includes('push:'), 'Deve ter trigger push');
  assert.ok(content.includes('- main'), 'Deve monitorar branch main');
  assert.ok(content.includes('workflow_dispatch:'), 'Deve ter trigger workflow_dispatch');
});

test('2. JOB SEPARATION: CI de candidatos isolado de promocao/deploy em producao', () => {
  const content = fs.readFileSync(workflowPath, 'utf8');

  // Job de build e teste de candidatos
  assert.ok(content.includes('build-and-test-candidates:'), 'Deve existir job build-and-test-candidates');
  assert.ok(
    content.includes('needs: [build-agent-windows, postgres-integration-gate]'),
    'Deve depender dos gates anteriores de agent e postgres'
  );

  // O job build-and-test-candidates NAO pode promover imagens estaveis nem acionar webhook
  const candidateJobSection = content.split('build-and-test-candidates:')[1].split('validate-predeploy-backup:')[0];
  assert.ok(!candidateJobSection.includes('witiquetas-frontend:stable'), 'build-and-test-candidates NAO deve taggear :stable');
  assert.ok(!candidateJobSection.includes('witiquetas-backend:stable'), 'build-and-test-candidates NAO deve taggear backend :stable');
  assert.ok(!candidateJobSection.includes('PORTAINER_WEBHOOK_URL'), 'build-and-test-candidates NAO deve conter webhook Portainer');

  // Deve gerar apenas candidate
  assert.ok(candidateJobSection.includes('candidate-${{ github.sha }}'), 'Deve gerar tag candidate-${{ github.sha }}');
});

test('3. PRE-DEPLOY BACKUP GATE: Execução obrigatória do backup com segredos protegidos e porta SSH 5822', () => {
  const content = fs.readFileSync(workflowPath, 'utf8');

  // 1. Deve existir o job validate-predeploy-backup
  assert.ok(content.includes('validate-predeploy-backup:'), 'Deve existir job validate-predeploy-backup');
  const backupJobSection = content.split('validate-predeploy-backup:')[1].split('deploy-production:')[0];

  // 2. Deve depender de build-and-test-candidates
  assert.ok(backupJobSection.includes('needs: [build-and-test-candidates]'), 'validate-predeploy-backup deve depender de build-and-test-candidates');

  // 3. Deve exigir branch main
  assert.ok(backupJobSection.includes("github.ref == 'refs/heads/main'"), 'validate-predeploy-backup deve exigir branch main');

  // 4. Deve validar segredos do executor e MinIO
  assert.ok(backupJobSection.includes('DEPLOY_HOST'), 'Deve validar DEPLOY_HOST');
  assert.ok(backupJobSection.includes('DEPLOY_SSH_KEY'), 'Deve validar DEPLOY_SSH_KEY');
  assert.ok(backupJobSection.includes('MINIO_ACCESS_KEY_ID'), 'Deve validar MINIO_ACCESS_KEY_ID');
  assert.ok(backupJobSection.includes('MINIO_SECRET_ACCESS_KEY'), 'Deve validar MINIO_SECRET_ACCESS_KEY');

  // 5. Configuração real: porta 5822 e host witiquetas.wrtec.com.br
  assert.ok(backupJobSection.includes('5822'), 'Deve usar porta real 5822');
  assert.ok(backupJobSection.includes('witiquetas.wrtec.com.br'), 'Deve referenciar host real');
  assert.ok(backupJobSection.includes("PRODUCTION_DB || 'witiquetas '"), 'Deve preservar espaço final no banco de dados');

  // 6. Ingestão segura via stdin (zero credenciais em ps aux)
  assert.ok(backupJobSection.includes('ssh -i ~/.ssh/deploy_key -p "$DEPLOY_PORT" -T'), 'Deve usar SSH não interativo com stdin seguro');
  assert.ok(backupJobSection.includes('<<<WITIQUETAS_BACKUP_EVIDENCE_JSON>>>'), 'Deve delimitar evidência de backup');

  // 7. Validação de autenticidade matemática (assinatura de integridade)
  assert.ok(backupJobSection.includes('integritySignature'), 'Deve validar assinatura de integridade');
  assert.ok(backupJobSection.includes('EXPECTED_SIGNATURE'), 'Deve calcular assinatura esperada');

  // 8. Deve publicar artefato da evidência
  assert.ok(backupJobSection.includes('name: backup-evidence-${{ github.sha }}'), 'Deve fazer upload do artifact de evidência');
});

test('4. PRODUCTION DEPLOY GATE: Proteção estrita, validação de evidência autêntica e fail-closed no Portainer', () => {
  const content = fs.readFileSync(workflowPath, 'utf8');

  assert.ok(content.includes('deploy-production:'), 'Deve existir job deploy-production');
  const deployJobSection = content.split('deploy-production:')[1];

  // 1. Deve depender de build-and-test-candidates E validate-predeploy-backup
  assert.ok(
    deployJobSection.includes('needs: [build-and-test-candidates, validate-predeploy-backup]'),
    'deploy-production deve depender incondicionalmente de build-and-test-candidates e validate-predeploy-backup'
  );

  // 2. Deve ter environment: production (aprovação humana prévia obrigatória)
  assert.ok(deployJobSection.includes('environment: production'), 'deploy-production deve estar vinculado a environment: production');

  // 3. Condicional estrita: apenas branch main
  assert.ok(deployJobSection.includes("github.ref == 'refs/heads/main'"), 'Deve exigir branch main');

  // 4. Deve verificar autenticidade e integridade da evidência (anti-replay estrito)
  assert.ok(deployJobSection.includes('Download Backup Evidence Artifact'), 'Deve baixar artefato de evidência do backup');
  assert.ok(deployJobSection.includes('Strict Pre-Deploy Evidence Verification'), 'Deve validar integridade estrita da evidência');
  assert.ok(deployJobSection.includes('$COMMIT" != "${{ github.sha }}"'), 'Deve impedir replay de evidência com commit diferente');
  assert.ok(deployJobSection.includes('$RUN_ID" != "${{ github.run_id }}"'), 'Deve impedir replay de evidência de run anterior');
  assert.ok(deployJobSection.includes('EXPECTED_SIGNATURE'), 'Deve verificar matematicamente a assinatura de integridade');

  // 5. Promocao e webhook devem estar exclusivamente dentro de deploy-production
  assert.ok(deployJobSection.includes('witiquetas-frontend:stable'), 'deploy-production promove frontend:stable');
  assert.ok(deployJobSection.includes('witiquetas-backend:stable'), 'deploy-production promove backend:stable');
  assert.ok(deployJobSection.includes('PORTAINER_WEBHOOK_URL'), 'deploy-production contem o webhook Portainer');

  // 6. Falha no Webhook Portainer deve ser fatal (não ignorada)
  assert.ok(deployJobSection.includes('PORTAINER_WEBHOOK_URL não configurado! Deploy bloqueado'), 'Falta de webhook deve ser fatal');

  // 7. Guarda estrita de convergência (exit 1 em caso de timeout de convergência)
  assert.ok(
    deployJobSection.includes('ERRO CRÍTICO DE CONVERGÊNCIA (NO-GO)') &&
    deployJobSection.includes('exit 1'),
    'Deve fail-close com exit 1 se convergência falhar'
  );
});

test('5. EVALUATION MATRIX: Simulação lógica de cenários operacionais', () => {
  interface DeployScenario {
    ref: string;
    candidatesPassed: boolean;
    backupPassed: boolean;
    evidenceMatchesCommit: boolean;
    evidenceMatchesRun: boolean;
    evidenceAuthentic: boolean;
    humanApproved: boolean;
  }

  function canDeployToProduction(s: DeployScenario): boolean {
    const isMain = s.ref === 'refs/heads/main';
    return isMain &&
      s.candidatesPassed &&
      s.backupPassed &&
      s.evidenceMatchesCommit &&
      s.evidenceMatchesRun &&
      s.evidenceAuthentic &&
      s.humanApproved;
  }

  // Cenário 1: Branch secundária (ex: feature/x ou validation) -> BLOQUEADO
  assert.equal(canDeployToProduction({
    ref: 'refs/heads/feature/nova-tela',
    candidatesPassed: true,
    backupPassed: true,
    evidenceMatchesCommit: true,
    evidenceMatchesRun: true,
    evidenceAuthentic: true,
    humanApproved: true,
  }), false, 'Branch fora da main não pode realizar deploy');

  // Cenário 2: Falha no build/teste de candidatos na main -> BLOQUEADO
  assert.equal(canDeployToProduction({
    ref: 'refs/heads/main',
    candidatesPassed: false,
    backupPassed: true,
    evidenceMatchesCommit: true,
    evidenceMatchesRun: true,
    evidenceAuthentic: true,
    humanApproved: true,
  }), false, 'Falha em candidatos deve bloquear deploy');

  // Cenário 3: Falha no backup ou na restauração efêmera -> BLOQUEADO
  assert.equal(canDeployToProduction({
    ref: 'refs/heads/main',
    candidatesPassed: true,
    backupPassed: false,
    evidenceMatchesCommit: true,
    evidenceMatchesRun: true,
    evidenceAuthentic: true,
    humanApproved: true,
  }), false, 'Falha no backup deve bloquear deploy incondicionalmente');

  // Cenário 4: Evidência forjada ou adulterada (falha de assinatura) -> BLOQUEADO
  assert.equal(canDeployToProduction({
    ref: 'refs/heads/main',
    candidatesPassed: true,
    backupPassed: true,
    evidenceMatchesCommit: true,
    evidenceMatchesRun: true,
    evidenceAuthentic: false,
    humanApproved: true,
  }), false, 'Evidência com assinatura inautêntica deve ser sumariamente bloqueada');

  // Cenário 5: Sem aprovação humana no ambiente Production -> BLOQUEADO
  assert.equal(canDeployToProduction({
    ref: 'refs/heads/main',
    candidatesPassed: true,
    backupPassed: true,
    evidenceMatchesCommit: true,
    evidenceMatchesRun: true,
    evidenceAuthentic: true,
    humanApproved: false,
  }), false, 'Ausência de aprovação humana no ambiente Production deve manter deploy suspenso');

  // Cenário 6: Todos os requisitos atendidos: main, candidatos OK, backup OK, evidência autêntica e aprovado -> GO
  assert.equal(canDeployToProduction({
    ref: 'refs/heads/main',
    candidatesPassed: true,
    backupPassed: true,
    evidenceMatchesCommit: true,
    evidenceMatchesRun: true,
    evidenceAuthentic: true,
    humanApproved: true,
  }), true, 'Fluxo completo aprovado deve autorizar promoção e deploy');
});

test('6. WORKFLOW AUDIT: Ausência de canais alternativos de deploy desprotegidos', () => {
  const workflowsDir = path.resolve('.github/workflows');
  const files = fs.readdirSync(workflowsDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));

  for (const file of files) {
    if (file === 'docker.yml') continue;
    const filePath = path.join(workflowsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');

    assert.ok(
      !content.includes('PORTAINER_WEBHOOK_URL'),
      `Workflow alternativo ${file} NAO pode conter PORTAINER_WEBHOOK_URL`
    );
    assert.ok(
      !content.includes(':stable'),
      `Workflow alternativo ${file} NAO pode promover tags :stable`
    );
  }
});
