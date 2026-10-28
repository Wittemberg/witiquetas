#!/usr/bin/env bash
# ==============================================================================
# WITIQUETAS — PROCEDIMENTO DE INSTALAÇÃO ASSISTIDA DO EXECUTOR AUTORIZADO
# ==============================================================================
# Este script deve ser executado UMA ÚNICA VEZ pelo operador no host Docker Swarm
# de produção (com privilégios de root ou sudo).
#
# MODELO DE PERMISSÕES, ISOLAMENTO E MENOR PRIVILÉGIO:
# 1. Usuário de Serviço Estritamente Restrito:
#    - Cria o usuário de sistema 'witiquetas-deployer' sem senha interativa.
#    - SEGURANÇA CRÍTICA: O usuário NÃO é inserido no grupo 'docker'. Ele NÃO tem
#      acesso ao socket do Docker (/var/run/docker.sock) e NÃO pode executar
#      comandos docker arbitrários nem criar contêineres na máquina.
# 2. Defesa em Profundidade via Sudoers Estrito:
#    - Regra sudoers NOPASSWD restrita EXCLUSIVAMENTE ao script canônico:
#      /opt/witiquetas/scripts/backup-and-validate-predeploy.sh
#    - Qualquer outro comando 'sudo' é categoricamente recusado.
# 3. Chave SSH Ed25519 com Bloqueio de Comandos Arbitrários:
#    - Configura authorized_keys com comando forçado e restrições:
#      command="sudo /opt/witiquetas/scripts/backup-and-validate-predeploy.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding
#    - A chave SSH NÃO consegue abrir shell, navegar no sistema de arquivos ou
#      executar qualquer outro binário além do script de validação de backup.
# 4. Proteção da Chave Privada do Executor (Zero Exibição em Terminal):
#    - A chave privada é mantida no filesystem do host com permissão estrita 600.
#    - O script NUNCA imprime a chave privada na saída padrão ou em logs de terminal.
#    - O operador é instruído a copiá-la de forma protegida para o GitHub Secrets.
# 5. Fixação de Chave Pública do Servidor (Prevenção contra MitM):
#    - Extrai a chave pública do host (/etc/ssh/ssh_host_ed25519_key.pub) e gera
#      a linha exata para cadastro no secret DEPLOY_SSH_KNOWN_HOSTS.
# 6. Zero Interrupção de Outras Stacks:
#    - O script NÃO reinicia o daemon do Docker, NÃO mexe no Traefik, PostgreSQL,
#      Portainer ou em quaisquer outros serviços ou stacks em execução no host.
# 7. Zero Secrets Armazenados em Disco:
#    - As credenciais MinIO (AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY) NUNCA são
#      salvas no host. Elas são injetadas exclusivamente em tempo de execução via
#      stdin na sessão SSH do GitHub Actions.
# ==============================================================================

set -euo pipefail

echo "======================================================================"
echo " WITIQUETAS — CONFIGURAÇÃO ÚNICA DO EXECUTOR AUTORIZADO"
echo "======================================================================"

DEPLOY_USER="witiquetas-deployer"
SCRIPTS_DIR="/opt/witiquetas/scripts"
BACKUP_DIR="/opt/backups/witiquetas"
SSH_DIR="/home/${DEPLOY_USER}/.ssh"

# 1. Verificar privilégios de execução
if [ "$(id -u)" -ne 0 ]; then
  echo "❌ ERRO: Este script de configuração única deve ser executado como root ou com sudo." >&2
  exit 1
fi

echo "🔍 [1/6] Verificando pré-requisitos de sistema no host..."

# Verificar Docker
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ ERRO: 'docker' não encontrado no PATH. Instale o Docker antes de prosseguir." >&2
  exit 1
fi
echo "   ✅ Docker CLI disponível."

# Verificar AWS CLI (usado pelo script de backup para comunicação com MinIO/S3)
if ! command -v aws >/dev/null 2>&1; then
  echo "⚠️  'aws' CLI não encontrado. Instalando AWS CLI v2 oficial..."
  TMP_DIR=$(mktemp -d)
  curl -s "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "${TMP_DIR}/awscliv2.zip"
  unzip -q "${TMP_DIR}/awscliv2.zip" -d "${TMP_DIR}"
  "${TMP_DIR}/aws/install" --update
  rm -rf "${TMP_DIR}"
  echo "   ✅ AWS CLI instalado com sucesso em $(which aws)."
else
  echo "   ✅ AWS CLI já instalado: $(aws --version | head -1)."
fi

# 2. Criar usuário de serviço dedicado 'witiquetas-deployer' sem acesso administrativo irrestrito
echo "👤 [2/6] Configurando usuário de serviço dedicado '${DEPLOY_USER}'..."
if ! id "${DEPLOY_USER}" >/dev/null 2>&1; then
  useradd -m -s /bin/bash -c "Witiquetas Automated Publication Deployer" "${DEPLOY_USER}"
  echo "   ✅ Usuário '${DEPLOY_USER}' criado com sucesso."
else
  echo "   ℹ️  Usuário '${DEPLOY_USER}' já existe."
fi

# SEGURANÇA: Garantir que witiquetas-deployer NÃO pertença ao grupo docker
if id -nG "${DEPLOY_USER}" | grep -qw "docker"; then
  gpasswd -d "${DEPLOY_USER}" docker >/dev/null 2>&1 || true
  echo "   🔒 ISOLAMENTO CONFIRMADO: Removido usuário do grupo 'docker' para impedir acesso irrestrito ao daemon."
else
  echo "   🔒 ISOLAMENTO CONFIRMADO: Usuário não pertence ao grupo 'docker'."
fi

# 3. Criar diretórios padronizados de operação e segurança
echo "📁 [3/6] Criando diretórios protegidos para scripts e backups..."
mkdir -p "${SCRIPTS_DIR}"
mkdir -p "${BACKUP_DIR}"

chown -R root:root "${SCRIPTS_DIR}"
chmod 755 "${SCRIPTS_DIR}"

chown -R "${DEPLOY_USER}":"${DEPLOY_USER}" "${BACKUP_DIR}"
chmod 750 "${BACKUP_DIR}"
echo "   ✅ Diretórios configurados: ${SCRIPTS_DIR} (755) e ${BACKUP_DIR} (750)."

# 4. Copiar e instalar o script canônico de backup e validação
echo "📦 [4/6] Instalando script de backup e validação em ${SCRIPTS_DIR}..."
SCRIPT_SOURCE="$(dirname "$0")/../database/backup-and-validate-predeploy.sh"
if [ -f "${SCRIPT_SOURCE}" ]; then
  cp "${SCRIPT_SOURCE}" "${SCRIPTS_DIR}/backup-and-validate-predeploy.sh"
else
  if [ -f "./backup-and-validate-predeploy.sh" ]; then
    cp "./backup-and-validate-predeploy.sh" "${SCRIPTS_DIR}/backup-and-validate-predeploy.sh"
  fi
fi

chmod 755 "${SCRIPTS_DIR}/backup-and-validate-predeploy.sh"
chown root:root "${SCRIPTS_DIR}/backup-and-validate-predeploy.sh"
echo "   ✅ Script instalado com permissões estritas em: ${SCRIPTS_DIR}/backup-and-validate-predeploy.sh"

# 5. Configurar regra sudoers restrita (defesa em profundidade estrita)
echo "🔒 [5/6] Configurando regra de sudo restrita para o script de validação..."
SUDOERS_FILE="/etc/sudoers.d/witiquetas-deployer"
cat <<EOF > "${SUDOERS_FILE}"
# Regra estrita de menor privilégio para o executor automatizado Witiquetas
# Permite exclusivamente a execução do script canônico de backup e validação
${DEPLOY_USER} ALL=(root) NOPASSWD: ${SCRIPTS_DIR}/backup-and-validate-predeploy.sh
EOF
chmod 440 "${SUDOERS_FILE}"
echo "   ✅ Regra sudoers criada em ${SUDOERS_FILE}."

# 6. Configurar par de chaves SSH dedicado com comando forçado e extrair host key
echo "🔑 [6/6] Configurando acesso SSH dedicado com chave Ed25519 e comando forçado..."
mkdir -p "${SSH_DIR}"
chmod 700 "${SSH_DIR}"
chown "${DEPLOY_USER}":"${DEPLOY_USER}" "${SSH_DIR}"

KEY_FILE="${SSH_DIR}/id_ed25519"
if [ ! -f "${KEY_FILE}" ]; then
  ssh-keygen -t ed25519 -N "" -f "${KEY_FILE}" -C "witiquetas-gh-deployer-$(hostname)" >/dev/null
  echo "   ✅ Novo par de chaves Ed25519 gerado."
else
  echo "   ℹ️  Chave Ed25519 pré-existente preservada."
fi

chmod 600 "${KEY_FILE}"
chown "${DEPLOY_USER}":"${DEPLOY_USER}" "${KEY_FILE}"

PUB_KEY=$(cat "${KEY_FILE}.pub")
AUTH_KEYS="${SSH_DIR}/authorized_keys"

# Configurar authorized_keys com comando forçado para o script sudoers
SSH_OPTIONS="command=\"sudo ${SCRIPTS_DIR}/backup-and-validate-predeploy.sh\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding"
echo "${SSH_OPTIONS} ${PUB_KEY}" > "${AUTH_KEYS}"
echo "   ✅ Chave pública configurada com restrição de comando forçado: ${SSH_OPTIONS}."

chmod 600 "${AUTH_KEYS}"
chown -R "${DEPLOY_USER}":"${DEPLOY_USER}" "${SSH_DIR}"

# Extrair chave pública do servidor para fixação estrita (anti-MitM)
HOST_KEY_LINE=""
for hk in /etc/ssh/ssh_host_ed25519_key.pub /etc/ssh/ssh_host_rsa_key.pub; do
  if [ -f "$hk" ]; then
    HK_TYPE=$(awk '{print $1}' "$hk")
    HK_VAL=$(awk '{print $2}' "$hk")
    HOST_KEY_LINE="[witiquetas.wrtec.com.br]:5822 ${HK_TYPE} ${HK_VAL}"
    break
  fi
done

# Resumo e Instruções Finais para o Operador
echo ""
echo "======================================================================"
echo "🎉 CONFIGURAÇÃO ÚNICA CONCLUÍDA COM SUCESSO!"
echo "======================================================================"
echo ""
echo "📋 DADOS PARA CADASTRO ÚNICO NO GITHUB (Settings ➔ Secrets ➔ Actions):"
echo ""
echo "   • DEPLOY_HOST:             witiquetas.wrtec.com.br"
echo "   • DEPLOY_USER:             ${DEPLOY_USER}"
echo "   • DEPLOY_PORT:             5822"
if [ -n "$HOST_KEY_LINE" ]; then
  echo "   • DEPLOY_SSH_KNOWN_HOSTS:  ${HOST_KEY_LINE}"
else
  echo "   • DEPLOY_SSH_KNOWN_HOSTS:  [witiquetas.wrtec.com.br]:5822 (copie de /etc/ssh/ssh_host_ed25519_key.pub)"
fi
echo "   • MINIO_ACCESS_KEY_ID:     Chave de acesso da service account MinIO"
echo "   • MINIO_SECRET_ACCESS_KEY: Segredo de acesso da service account MinIO"
echo "   • PORTAINER_WEBHOOK_URL:   URL do webhook do Portainer para a stack witiquetas"
echo ""
echo "🔒 PROTEÇÃO DA CHAVE PRIVADA DO EXECUTOR (DEPLOY_SSH_KEY):"
echo "   A chave privada foi salva em: ${KEY_FILE} (permissões 600)."
echo "   Por segurança, ela NÃO é exibida neste terminal para evitar exposição"
echo "   em telas compartilhadas, gravações de sessão ou buffers de histórico."
echo ""
echo "   Para cadastrá-la no GitHub Secrets de forma protegida, transfira-a diretamente"
echo "   para o clipboard ou arquivo seguro do seu ambiente de trabalho:"
echo "      sudo cat ${KEY_FILE} | clip     # (Windows PowerShell / Git Bash)"
echo "      sudo cat ${KEY_FILE} | xclip    # (Linux X11)"
echo "      sudo cat ${KEY_FILE} | pbcopy   # (macOS)"
echo "======================================================================"
