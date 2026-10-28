import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const backupScriptPath = path.resolve('scripts/database/backup-and-validate-predeploy.sh');
const setupExecutorScriptPath = path.resolve('scripts/deploy/setup-authorized-executor.sh');

test('1. BACKUP SCRIPT INTEGRITY: Existência e permissões defensivas do script canônico', () => {
  assert.ok(fs.existsSync(backupScriptPath), 'backup-and-validate-predeploy.sh deve existir');
  const content = fs.readFileSync(backupScriptPath, 'utf8');

  // Shebang e modo fail-closed estrito
  assert.ok(content.startsWith('#!/usr/bin/env bash'), 'Deve usar bash como interpretador');
  assert.ok(content.includes('set -euo pipefail'), 'Deve usar set -euo pipefail');

  // Trapping de erros e limpeza
  assert.ok(content.includes('trap cleanup EXIT INT TERM'), 'Deve ter trap de cleanup para contenção de falhas');
  assert.ok(content.includes('STATUS="NO-GO"') || content.includes('"status": "NO-GO"'), 'Deve emitir NO-GO em caso de falha');
});

test('2. TARGET DB SANITIZATION: Preservação estrita do nome exato do banco com espaço final', () => {
  const content = fs.readFileSync(backupScriptPath, 'utf8');

  // O banco de produção possui exatamente um espaço ao final: 'witiquetas '
  assert.ok(content.includes('TARGET_DB="${TARGET_DB:-witiquetas }"'), 'Deve preservar default com espaço final "witiquetas "');
  assert.ok(content.includes('TARGET_DB_HEX'), 'Deve auditar representação hexadecimal do nome do banco');
});

test('3. STDIN INGESTION & ZERO SECRETS IN PROCESS ARGS: Leitura de parâmetros via stdin', () => {
  const content = fs.readFileSync(backupScriptPath, 'utf8');

  assert.ok(content.includes('if [ ! -t 0 ]; then'), 'Deve verificar se entrada não é terminal');
  assert.ok(content.includes('AWS_ACCESS_KEY_ID)'), 'Deve ingerir AWS_ACCESS_KEY_ID via stdin');
  assert.ok(content.includes('AWS_SECRET_ACCESS_KEY)'), 'Deve ingerir AWS_SECRET_ACCESS_KEY via stdin');
  assert.ok(content.includes('TARGET_COMMIT_SHA)'), 'Deve ingerir TARGET_COMMIT_SHA via stdin');
  assert.ok(content.includes('EVIDENCE_SIGNING_KEY)'), 'Deve ingerir EVIDENCE_SIGNING_KEY via stdin');
});

test('4. TEN GATES VERIFICATION: O script canônico deve implementar todos os 10 gates de segurança', () => {
  const content = fs.readFileSync(backupScriptPath, 'utf8');

  // Gate 1: Pré-requisitos e disco livre >= 5GB
  assert.ok(content.includes('REQUIRED_KB=5242880'), 'Gate 1: Deve validar mínimo de 5GB livres');
  assert.ok(content.includes('command -v aws'), 'Gate 1: Deve verificar aws CLI');
  assert.ok(content.includes('command -v docker'), 'Gate 1: Deve verificar docker CLI');

  // Gate 2: Identificação inequívoca do container PostgreSQL via Backend e DATABASE_URL
  assert.ok(content.includes('BACKEND_CONTAINERS='), 'Gate 2: Deve identificar backend ativo');
  assert.ok(content.includes('BACKEND_COUNT'), 'Gate 2: Deve checar contagem de backends');
  assert.ok(content.includes('Recusando seleção arbitrária'), 'Gate 2: Deve rejeitar múltiplos backends');
  assert.ok(content.includes('APP_DB_URL='), 'Gate 2: Deve extrair DATABASE_URL efetiva');
  assert.ok(content.includes('localhost'), 'Gate 2: Deve rejeitar localhost/127.0.0.1 em contêineres');

  // Gate 3: Verificação de extensões instaladas
  assert.ok(content.includes('pg_extension'), 'Gate 3: Deve inspecionar extensões');

  // Gate 4: Snapshot consistente T0 via pg_dump -Fc
  assert.ok(content.includes('pg_dump -U postgres -d "${TARGET_DB}" -Fc'), 'Gate 4: Deve gerar dump com -Fc');
  assert.ok(!content.includes('docker exec -it'), 'Não pode conter flag interativa -t em comandos binários');

  // Gate 5: Validação de TOC com pg_restore --list e SHA-256
  assert.ok(content.includes('pg_restore --list'), 'Gate 5: Deve validar TOC com pg_restore --list');
  assert.ok(content.includes('sha256sum'), 'Gate 5: Deve calcular SHA-256');

  // Gate 6: Upload S3/MinIO
  assert.ok(content.includes('aws --endpoint-url'), 'Gate 6: Deve enviar para S3/MinIO');
  assert.ok(content.includes('s3 cp'), 'Gate 6: Deve copiar dump e checksum');

  // Gate 7: Download de validação e conferência de SHA-256 do S3
  assert.ok(content.includes('VERIFY_DIR='), 'Gate 7: Deve baixar cópia em diretório isolado');
  assert.ok(content.includes('DOWNLOAD_SHA'), 'Gate 7: Deve verificar SHA-256 recuperado do S3');

  // Gate 8: Instância efêmera isolada (postgres:14-alpine, --network none)
  assert.ok(content.includes('postgres:14-alpine'), 'Gate 8: Deve usar postgres:14-alpine');
  assert.ok(content.includes('--network none'), 'Gate 8: Container efêmero deve rodar com --network none');

  // Gate 9: Restauração estrita com --exit-on-error
  assert.ok(content.includes('pg_restore -U postgres -d "${TARGET_DB}" --no-owner --exit-on-error'), 'Gate 9: pg_restore com --exit-on-error');

  // Gate 10: Auditoria estrutural, contagem de linhas e Foreign Keys dinâmicas (MATCH SIMPLE / MATCH FULL)
  assert.ok(content.includes('information_schema.columns'), 'Gate 10: Auditoria de colunas');
  assert.ok(content.includes('pg_indexes'), 'Gate 10: Auditoria de índices');
  assert.ok(content.includes('pg_constraint'), 'Gate 10: Auditoria de constraints');
  assert.ok(content.includes('MATCH SIMPLE'), 'Gate 10: Tratamento de semântica MATCH SIMPLE');
  assert.ok(content.includes('MATCH FULL'), 'Gate 10: Tratamento de semântica MATCH FULL');
});

test('5. EVIDENCE ARTIFACT BINDING & SIGNATURE: Geração de evidência estruturada com assinatura criptográfica HMAC-SHA256', () => {
  const content = fs.readFileSync(backupScriptPath, 'utf8');

  assert.ok(content.includes('EVIDENCE_JSON='), 'Deve definir caminho do arquivo de evidência JSON');
  assert.ok(content.includes('"targetCommitSha": "${TARGET_COMMIT_SHA}"'), 'Evidência deve conter commit SHA');
  assert.ok(content.includes('"workflowRunId": "${WORKFLOW_RUN_ID}"'), 'Evidência deve conter run ID');
  assert.ok(content.includes('"status": "GO"'), 'Evidência deve conter status GO');
  assert.ok(content.includes('"dumpSha256": "${LOCAL_SHA}"'), 'Evidência deve conter hash SHA-256');
  assert.ok(content.includes('openssl dgst -sha256 -hmac'), 'Deve calcular assinatura HMAC-SHA256 com chave secreta');
  assert.ok(content.includes('"integritySignature": "${INTEGRITY_SIGNATURE}"'), 'Evidência deve incluir assinatura');
  assert.ok(content.includes('<<<WITIQUETAS_BACKUP_EVIDENCE_JSON>>>'), 'Deve emitir delimitadores na saída padrão');
});

test('6. SETUP EXECUTOR SCRIPT: Bloqueio estrito de privilégios de docker e execução forçada via SSH', () => {
  assert.ok(fs.existsSync(setupExecutorScriptPath), 'setup-authorized-executor.sh deve existir');
  const content = fs.readFileSync(setupExecutorScriptPath, 'utf8');

  // Usuário de serviço restrito
  assert.ok(content.includes('DEPLOY_USER="witiquetas-deployer"'), 'Deve configurar usuário witiquetas-deployer');
  assert.ok(content.includes('useradd'), 'Deve criar usuário dedicado');

  // ISOLAMENTO DOCKER: Usuário NÃO pode pertencer ao grupo docker
  assert.ok(
    !content.includes('usermod -aG docker'),
    'Usuário witiquetas-deployer NÃO deve pertencer ao grupo docker (evita acesso irrestrito ao daemon)'
  );

  // Diretório de backups com permissões restritas (750)
  assert.ok(content.includes('chmod 750'), 'Deve configurar permissão restrita 750 no diretório de backups');

  // Regra sudoers restrita exclusivamente ao script de backup
  assert.ok(content.includes('/etc/sudoers.d/witiquetas-deployer'), 'Deve configurar arquivo sudoers dedicado');
  assert.ok(
    content.includes('NOPASSWD: ${SCRIPTS_DIR}/backup-and-validate-predeploy.sh'),
    'Regra sudoers deve ser restrita apenas ao script de backup pré-deploy'
  );

  // Chave SSH Ed25519 com comando forçado e opções defensivas
  assert.ok(content.includes('ed25519'), 'Deve usar par de chaves Ed25519');
  assert.ok(
    content.includes('command=\\"sudo ${SCRIPTS_DIR}/backup-and-validate-predeploy.sh\\"'),
    'authorized_keys deve forçar exclusivamente o comando do script de backup'
  );
  assert.ok(
    content.includes('no-port-forwarding,no-X11-forwarding,no-agent-forwarding'),
    'authorized_keys deve restringir port, X11 e agent forwarding'
  );

  // Proteção da chave privada do executor (zero exibição no terminal)
  assert.ok(!content.includes('echo "${KEY_FILE}"'), 'Não deve imprimir o conteúdo da chave privada');
  assert.ok(!content.includes('cat "${KEY_FILE}"\n'), 'Não deve despejar a chave privada no terminal');
  assert.ok(content.includes('chmod 600 "${KEY_FILE}"'), 'Deve proteger arquivo da chave privada com 600');

  // Fixação de chave pública do host (anti-MitM)
  assert.ok(content.includes('DEPLOY_SSH_KNOWN_HOSTS'), 'Deve gerar/instruir configuração de DEPLOY_SSH_KNOWN_HOSTS');

  // Zero secrets em disco
  assert.ok(!content.includes('AWS_ACCESS_KEY_ID='), 'Script não deve gravar credenciais MinIO em variáveis estáticas');
  assert.ok(!content.includes('AWS_SECRET_ACCESS_KEY='), 'Script não deve gravar segredos MinIO em variáveis estáticas');
});
