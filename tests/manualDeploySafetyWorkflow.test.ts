import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const workflowPath = path.resolve('.github/workflows/docker.yml');

test('1. WORKFLOW SAFETY: Estrutura de gatilhos e input deploy_production em docker.yml', () => {
  assert.ok(fs.existsSync(workflowPath), 'docker.yml deve existir');
  const content = fs.readFileSync(workflowPath, 'utf8');

  // Input de deploy_production deve ser booleano com default false
  assert.ok(content.includes('workflow_dispatch:'), 'Deve ter trigger workflow_dispatch');
  assert.ok(content.includes('deploy_production:'), 'Deve definir input deploy_production');
  assert.ok(content.includes('type: boolean'), 'deploy_production deve ser do tipo boolean');
  assert.ok(content.includes('default: false'), 'deploy_production deve ter default false');
});

test('2. JOB SEPARATION: CI de candidatos isolado de promocao/deploy em producao', () => {
  const content = fs.readFileSync(workflowPath, 'utf8');

  // Job de build e teste de candidatos
  assert.ok(content.includes('build-and-test-candidates:'), 'Deve existir job build-and-test-candidates');
  assert.ok(content.includes('needs: [build-agent-windows, postgres-integration-gate]'), 'Deve depender dos gates anteriores');

  // O job build-and-test-candidates NAO pode promover imagens estaveis nem acionar webhook
  const candidateJobSection = content.split('build-and-test-candidates:')[1].split('deploy-production:')[0];
  assert.ok(!candidateJobSection.includes('witiquetas-frontend:stable'), 'build-and-test-candidates NAO deve taggear :stable');
  assert.ok(!candidateJobSection.includes('witiquetas-backend:stable'), 'build-and-test-candidates NAO deve taggear backend :stable');
  assert.ok(!candidateJobSection.includes('PORTAINER_WEBHOOK_URL'), 'build-and-test-candidates NAO deve conter webhook Portainer');

  // Deve gerar apenas candidate
  assert.ok(candidateJobSection.includes('candidate-${{ github.sha }}'), 'Deve gerar tag candidate-${{ github.sha }}');
});

test('3. PRODUCTION DEPLOY GATE: Job deploy-production estritamente condicionado e protegido', () => {
  const content = fs.readFileSync(workflowPath, 'utf8');

  assert.ok(content.includes('deploy-production:'), 'Deve existir job deploy-production');
  const deployJobSection = content.split('deploy-production:')[1];

  // Deve depender de build-and-test-candidates
  assert.ok(deployJobSection.includes('needs: [build-and-test-candidates]'), 'deploy-production deve depender de build-and-test-candidates');

  // Deve ter environment production
  assert.ok(deployJobSection.includes('environment: production'), 'deploy-production deve estar vinculado a environment: production');

  // Condicional estrita
  assert.ok(deployJobSection.includes("github.ref == 'refs/heads/main'"), 'Deve exigir branch main');
  assert.ok(deployJobSection.includes("github.event_name == 'workflow_dispatch'"), 'Deve exigir evento workflow_dispatch');
  assert.ok(
    deployJobSection.includes('inputs.deploy_production == true') ||
    deployJobSection.includes("inputs.deploy_production == 'true'"),
    'Deve exigir flag deploy_production verdadeira'
  );

  // Promocao e webhook devem estar exclusivamente dentro de deploy-production
  assert.ok(deployJobSection.includes('witiquetas-frontend:stable'), 'deploy-production promove frontend:stable');
  assert.ok(deployJobSection.includes('witiquetas-backend:stable'), 'deploy-production promove backend:stable');
  assert.ok(deployJobSection.includes('PORTAINER_WEBHOOK_URL'), 'deploy-production contem o webhook Portainer');
});

test('4. EVALUATION MATRIX: Simulacao logica de cenarios de disparo', () => {
  function evaluateDeployCondition(ref: string, eventName: string, deployProduction: any): boolean {
    const isMain = ref === 'refs/heads/main';
    const isDispatch = eventName === 'workflow_dispatch';
    const isDeployApproved = deployProduction === true || deployProduction === 'true';
    return isMain && isDispatch && isDeployApproved;
  }

  // Cenario A: Push na main (CI normal) -> NUNCA faz deploy
  assert.equal(evaluateDeployCondition('refs/heads/main', 'push', undefined), false, 'Push na main nao deve autorizar deploy');

  // Cenario B: Push em branch de validacao -> NUNCA faz deploy
  assert.equal(evaluateDeployCondition('refs/heads/validation/5.7.1', 'push', undefined), false, 'Push em validation nao deve autorizar deploy');

  // Cenario C: workflow_dispatch sem flag de deploy (ex: apenas testes manuais) -> NUNCA faz deploy
  assert.equal(evaluateDeployCondition('refs/heads/main', 'workflow_dispatch', false), false, 'dispatch com false nao deve autorizar deploy');
  assert.equal(evaluateDeployCondition('refs/heads/main', 'workflow_dispatch', undefined), false, 'dispatch sem input nao deve autorizar deploy');

  // Cenario D: workflow_dispatch em branch diferente de main mesmo com flag -> NUNCA faz deploy
  assert.equal(evaluateDeployCondition('refs/heads/feature/x', 'workflow_dispatch', true), false, 'dispatch fora da main nao deve autorizar deploy');

  // Cenario E: workflow_dispatch na main COM deploy_production=true -> AUTORIZADO
  assert.equal(evaluateDeployCondition('refs/heads/main', 'workflow_dispatch', true), true, 'dispatch na main com true deve autorizar deploy');
  assert.equal(evaluateDeployCondition('refs/heads/main', 'workflow_dispatch', 'true'), true, 'dispatch na main com string "true" deve autorizar deploy');
});

test('5. WORKFLOW AUDIT: Ausencia de canais alternativos de deploy desprotegidos', () => {
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
