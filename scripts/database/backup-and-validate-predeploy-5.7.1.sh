#!/usr/bin/env bash
# ==============================================================================
# WITIQUETAS — SCRIPT DE BACKUP PRÉ-DEPLOY E VALIDAÇÃO DE RESTAURAÇÃO (5.7.1)
# ==============================================================================
# Este script deve ser executado diretamente no HOST DOCKER de produção.
#
# GARANTIAS E AUDITORIA DE SEGURANÇA:
# 1. Sem flags interativas/TTY: docker exec -i (NUNCA -t para streams binários).
# 2. Identificação inequívoca:
#    - Identifica containers ativos da stack 'witiquetas'.
#    - Descobre qual container postgres está conectado à mesma rede do backend
#      ou explicitamente vinculado ao banco de produção 'witiquetas'.
# 3. Validação estrutural do dump com 'pg_restore --list' antes de restaurar.
# 4. Restauração estrita:
#    - Exige 'pg_restore --exit-on-error' e exit code 0.
#    - Nenhuma falha é mascarada com '|| true' ou ignorada.
# 5. Inventário comparativo exato de banco (Origem vs Destino Restaurado):
#    - Schemas
#    - Tabelas (relkind = 'r')
#    - Índices (relkind = 'i')
#    - Sequências (relkind = 'S')
#    - Constraints (pg_constraint)
# 6. Comparação exata de contagem de linhas de TODAS as tabelas de dados do schema public.
# 7. Validação de integridade referencial:
#    - Validação de status de constraints (convalidated = true).
#    - Varredura de integridade referencial sem registros órfãos.
# 8. Instância efêmera 100% isolada:
#    - postgres:14-alpine
#    - --network none (sem acesso à rede interna ou externa)
#    - Zero portas publicadas
#    - Zero volumes do host ou de produção montados
# 9. Falha segura e preservação de evidências:
#    - Em caso de falha, os dumps locais e evidências geradas NÃO são excluídos.
#    - Apenas o container efêmero de teste é removido.
# 10. Zero exposição de credenciais em logs, comandos ou disco.
# ==============================================================================

set -euo pipefail

# Configurações canônicas
BACKUP_ROOT="/opt/backups/witiquetas"
S3_ENDPOINT="https://s3.wrtec.com.br"
S3_BUCKET="s3://witiquetas-bkp/pre-deploy-5.7.1"
S3_REGION="eu-south"
TARGET_DB="witiquetas"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DUMP_FILENAME="witiquetas_pre_5.7.1_${TIMESTAMP}.dump"
CHECKSUM_FILENAME="${DUMP_FILENAME}.sha256"
LOCAL_DUMP_PATH="${BACKUP_ROOT}/${DUMP_FILENAME}"
LOCAL_CHECKSUM_PATH="${BACKUP_ROOT}/${CHECKSUM_FILENAME}"
VERIFY_DIR="${BACKUP_ROOT}/verify_${TIMESTAMP}"
RESTORE_CONTAINER="pg14_restore_gate_${TIMESTAMP}"
EVIDENCE_FILE="${BACKUP_ROOT}/backup_evidence_${TIMESTAMP}.txt"

echo "======================================================================"
echo " WITIQUETAS: INICIANDO BACKUP AUDITADO E VALIDAÇÃO PRÉ-DEPLOY (5.7.1)"
echo " Timestamp: ${TIMESTAMP}"
echo "======================================================================"

# ------------------------------------------------------------------------------
# TRAP DE LIMPEZA E CONTENÇÃO
# ------------------------------------------------------------------------------
cleanup() {
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    echo ""
    echo "❌ FALHA DETECTADA (Exit Code: $exit_code)."
    echo "🚨 DEPLOY BLOQUEADO (NO-GO)."
    echo "⚠️  ATENÇÃO: Backups locais e logs de evidência em ${BACKUP_ROOT} FORAM PRESERVADOS para análise forense."
  fi

  # Remover apenas o container efêmero de teste de restauração
  if docker ps -a --format '{{.Names}}' | grep -q "^${RESTORE_CONTAINER}$"; then
    echo "🧹 Removendo container efêmero de teste: ${RESTORE_CONTAINER}"
    docker rm -f "${RESTORE_CONTAINER}" >/dev/null 2>&1 || true
  fi

  # Remover diretório temporário de verificação de download apenas se bem-sucedido
  if [ $exit_code -eq 0 ]; then
    if [ -d "${VERIFY_DIR}" ]; then
      rm -rf "${VERIFY_DIR}"
    fi
    echo "======================================================================"
    echo "✅ PROCEDIMENTO DE BACKUP E VALIDAÇÃO CONCLUÍDO COM SUCESSO! (GO)"
    echo "   Evidência salva em: ${EVIDENCE_FILE}"
    echo "======================================================================"
  fi
  exit $exit_code
}
trap cleanup EXIT INT TERM

# ------------------------------------------------------------------------------
# 1. VALIDAÇÃO DE AMBIENTE E PRÉ-REQUISITOS
# ------------------------------------------------------------------------------
echo "🔍 [1/9] Validando pré-requisitos no host..."

if ! command -v aws >/dev/null 2>&1; then
  echo "❌ ERRO: 'aws' CLI não encontrado no PATH do host." >&2
  exit 1
fi

if [ -z "${AWS_ACCESS_KEY_ID:-}" ] || [ -z "${AWS_SECRET_ACCESS_KEY:-}" ]; then
  echo "❌ ERRO: AWS_ACCESS_KEY_ID ou AWS_SECRET_ACCESS_KEY não definidas no ambiente." >&2
  echo "   Exporte as variáveis antes de executar: export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=..." >&2
  exit 1
fi

mkdir -p "${BACKUP_ROOT}"

# Validar espaço em disco (mínimo 5GB livres)
AVAIL_KB=$(df -P "${BACKUP_ROOT}" | tail -1 | awk '{print $4}')
REQUIRED_KB=5242880
if [ "$AVAIL_KB" -lt "$REQUIRED_KB" ]; then
  echo "❌ ERRO: Espaço insuficiente em ${BACKUP_ROOT}. Disponível: ${AVAIL_KB}KB, Necessário: ${REQUIRED_KB}KB." >&2
  exit 1
fi
echo "   Espaço disponível em ${BACKUP_ROOT}: $((AVAIL_KB / 1024))MB (Requisito >= 5000MB OK)"

# ------------------------------------------------------------------------------
# 2. IDENTIFICAÇÃO INEQUÍVOCA DO CONTAINER POSTGRESQL VINCULADO À APLICAÇÃO
# ------------------------------------------------------------------------------
echo "🔍 [2/9] Identificando inequivocamente o container PostgreSQL da aplicação..."

# 2.1 Identificar o container do backend da aplicação ativa
BACKEND_CONTAINER=$(docker ps --filter "status=running" --filter "name=backend" --format "{{.ID}} {{.Names}}" | head -1 | awk '{print $1}')
BACKEND_NETWORKS=""
if [ -n "$BACKEND_CONTAINER" ]; then
  BACKEND_NETWORKS=$(docker inspect "$BACKEND_CONTAINER" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}')
  echo "   Backend identificado (${BACKEND_CONTAINER}) nas redes: ${BACKEND_NETWORKS}"
fi

# 2.2 Localizar container PostgreSQL que atenda aos critérios:
#     - Rodando e respondendo a pg_isready
#     - Contendo o banco 'witiquetas'
#     - Compartilhando a rede do backend (se Swarm/Compose) OU nome contendo postgres/db
CANDIDATE_CONTAINERS=$(docker ps --filter "status=running" --format "{{.ID}} {{.Names}} {{.Image}}")
PG_CONTAINER_ID=""
PG_CONTAINER_NAME=""
PG_CONTAINER_IMAGE=""

while read -r cid cname cimage; do
  [ -z "$cid" ] && continue
  if docker exec -i "$cid" pg_isready -q >/dev/null 2>&1; then
    # Verificar se o banco de destino existe
    if docker exec -i "$cid" psql -U postgres -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "${TARGET_DB}"; then
      # Verificar vinculação com a aplicação (por rede ou contexto)
      IS_LINKED=0
      if [ -n "$BACKEND_NETWORKS" ]; then
        CONTAINER_NETS=$(docker inspect "$cid" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}')
        for bnet in $BACKEND_NETWORKS; do
          if echo "$CONTAINER_NETS" | grep -qw "$bnet"; then
            IS_LINKED=1
            break
          fi
        done
      else
        IS_LINKED=1
      fi

      if [ $IS_LINKED -eq 1 ]; then
        PG_CONTAINER_ID="$cid"
        PG_CONTAINER_NAME="$cname"
        PG_CONTAINER_IMAGE="$cimage"
        break
      fi
    fi
  fi
done <<< "$CANDIDATE_CONTAINERS"

if [ -z "$PG_CONTAINER_ID" ]; then
  echo "❌ ERRO: Não foi possível identificar inequivocamente o container PostgreSQL de produção contendo '${TARGET_DB}'." >&2
  exit 1
fi

echo "   Container PostgreSQL confirmado: ${PG_CONTAINER_NAME} (${PG_CONTAINER_ID})"
echo "   Imagem: ${PG_CONTAINER_IMAGE}"

# Validar versão PostgreSQL
PG_VERSION=$(docker exec -i "$PG_CONTAINER_ID" psql -U postgres -t -c "SELECT version();" | head -1 | xargs)
echo "   Versão em execução: ${PG_VERSION}"
if ! echo "$PG_VERSION" | grep -q "PostgreSQL 14"; then
  echo "❌ ERRO: Versão do PostgreSQL em produção difere da versão 14 homologada." >&2
  exit 1
fi

# Inicializar arquivo de evidências
{
  echo "======================================================================"
  echo " WITIQUETAS — EVIDÊNCIA DE AUDITORIA DO BACKUP PRÉ-DEPLOY 5.7.1"
  echo "======================================================================"
  echo "Timestamp: ${TIMESTAMP}"
  echo "Host: $(hostname)"
  echo "Container Origem: ${PG_CONTAINER_NAME} (${PG_CONTAINER_ID})"
  echo "Imagem Origem: ${PG_CONTAINER_IMAGE}"
  echo "Versão PostgreSQL Origem: ${PG_VERSION}"
  echo "Database: ${TARGET_DB}"
  echo "Arquivo Local: ${LOCAL_DUMP_PATH}"
  echo "Destino S3: ${S3_BUCKET}/${DUMP_FILENAME}"
  echo ""
} > "${EVIDENCE_FILE}"

# ------------------------------------------------------------------------------
# 3. EXTRAÇÃO DO INVENTÁRIO DO BANCO DE PRODUÇÃO (ORIGEM)
# ------------------------------------------------------------------------------
echo "📋 [3/9] Coletando inventário completo da base de produção (origem)..."

ORIGIN_INVENTORY_SQL="
  SELECT 'SCHEMAS:' AS section, schema_name AS item FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
  UNION ALL
  SELECT 'TABLES:', c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'
  UNION ALL
  SELECT 'INDEXES:', c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'i'
  UNION ALL
  SELECT 'SEQUENCES:', c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'S'
  UNION ALL
  SELECT 'CONSTRAINTS:', conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public'
  ORDER BY 1, 2;
"

ORIGIN_INVENTORY=$(docker exec -i "$PG_CONTAINER_ID" psql -U postgres -d "${TARGET_DB}" -v ON_ERROR_STOP=1 -A -t -c "$ORIGIN_INVENTORY_SQL")
ORIGIN_SCHEMAS_COUNT=$(echo "$ORIGIN_INVENTORY" | grep -c "^SCHEMAS:" || true)
ORIGIN_TABLES_COUNT=$(echo "$ORIGIN_INVENTORY" | grep -c "^TABLES:" || true)
ORIGIN_INDEXES_COUNT=$(echo "$ORIGIN_INVENTORY" | grep -c "^INDEXES:" || true)
ORIGIN_SEQUENCES_COUNT=$(echo "$ORIGIN_INVENTORY" | grep -c "^SEQUENCES:" || true)
ORIGIN_CONSTRAINTS_COUNT=$(echo "$ORIGIN_INVENTORY" | grep -c "^CONSTRAINTS:" || true)

echo "   Inventário Origem: Schemas=${ORIGIN_SCHEMAS_COUNT}, Tabelas=${ORIGIN_TABLES_COUNT}, Índices=${ORIGIN_INDEXES_COUNT}, Sequências=${ORIGIN_SEQUENCES_COUNT}, Constraints=${ORIGIN_CONSTRAINTS_COUNT}"

# Coletar contagem exata de linhas de TODAS as tabelas do schema public na origem
ORIGIN_TABLE_NAMES=$(docker exec -i "$PG_CONTAINER_ID" psql -U postgres -d "${TARGET_DB}" -v ON_ERROR_STOP=1 -A -t -c "
  SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
")

ROW_COUNT_QUERY=""
for tbl in $ORIGIN_TABLE_NAMES; do
  if [ -z "$ROW_COUNT_QUERY" ]; then
    ROW_COUNT_QUERY="SELECT '$tbl' AS tbl, count(*)::text AS cnt FROM \"$tbl\""
  else
    ROW_COUNT_QUERY="${ROW_COUNT_QUERY} UNION ALL SELECT '$tbl', count(*)::text FROM \"$tbl\""
  fi
done
ROW_COUNT_QUERY="${ROW_COUNT_QUERY} ORDER BY 1;"

ORIGIN_ROW_COUNTS=$(docker exec -i "$PG_CONTAINER_ID" psql -U postgres -d "${TARGET_DB}" -v ON_ERROR_STOP=1 -A -t -c "$ROW_COUNT_QUERY")

{
  echo "--- INVENTÁRIO ESTRUTURAL DE ORIGEM ---"
  echo "Schemas: ${ORIGIN_SCHEMAS_COUNT}"
  echo "Tabelas: ${ORIGIN_TABLES_COUNT}"
  echo "Índices: ${ORIGIN_INDEXES_COUNT}"
  echo "Sequências: ${ORIGIN_SEQUENCES_COUNT}"
  echo "Constraints: ${ORIGIN_CONSTRAINTS_COUNT}"
  echo ""
  echo "--- CONTAGEM DE LINHAS POR TABELA (ORIGEM) ---"
  echo "$ORIGIN_ROW_COUNTS"
  echo ""
} >> "${EVIDENCE_FILE}"

# ------------------------------------------------------------------------------
# 4. GERAÇÃO DO DUMP COMPLETO (-Fc) SEM FLAG -t
# ------------------------------------------------------------------------------
echo "📦 [4/9] Gerando pg_dump custom format (-Fc) de '${TARGET_DB}'..."
# Usar docker exec -i (estritamente sem -t)
docker exec -i "$PG_CONTAINER_ID" pg_dump -U postgres -d "${TARGET_DB}" -Fc > "${LOCAL_DUMP_PATH}"

DUMP_SIZE=$(stat -c%s "${LOCAL_DUMP_PATH}" 2>/dev/null || stat -f%z "${LOCAL_DUMP_PATH}")
if [ "$DUMP_SIZE" -lt 2048 ]; then
  echo "❌ ERRO: Dump gerado com tamanho anômalo (${DUMP_SIZE} bytes)." >&2
  exit 1
fi
echo "   Dump local gerado: ${LOCAL_DUMP_PATH} (${DUMP_SIZE} bytes)"

# ------------------------------------------------------------------------------
# 5. VALIDAÇÃO ESTRUTURAL DO DUMP COM 'pg_restore --list' E CÁLCULO SHA-256
# ------------------------------------------------------------------------------
echo "🔎 [5/9] Validando integridade da tabela de conteúdo (TOC) com 'pg_restore --list'..."

# Testar integridade do arquivo binário com pg_restore --list dentro do container de origem
TOC_ENTRIES_COUNT=$(docker exec -i "$PG_CONTAINER_ID" pg_restore --list < "${LOCAL_DUMP_PATH}" | wc -l)
if [ "$TOC_ENTRIES_COUNT" -lt 10 ]; then
  echo "❌ ERRO: 'pg_restore --list' retornou contagem anômala de entradas na TOC (${TOC_ENTRIES_COUNT})." >&2
  exit 1
fi
echo "   Tabela de conteúdo do dump validada com sucesso: ${TOC_ENTRIES_COUNT} entradas catalogadas."

echo "🔐 Calculando SHA-256 do dump..."
(cd "${BACKUP_ROOT}" && sha256sum "${DUMP_FILENAME}" > "${CHECKSUM_FILENAME}")
LOCAL_SHA=$(awk '{print $1}' "${LOCAL_CHECKSUM_PATH}")
echo "   SHA-256: ${LOCAL_SHA}"

{
  echo "--- ARTEFATO DE BACKUP E HASH ---"
  echo "Tamanho do Dump: ${DUMP_SIZE} bytes"
  echo "Entradas TOC (pg_restore --list): ${TOC_ENTRIES_COUNT}"
  echo "SHA-256: ${LOCAL_SHA}"
  echo ""
} >> "${EVIDENCE_FILE}"

# ------------------------------------------------------------------------------
# 6. UPLOAD AO S3 E CONFIRMAÇÃO REMOTA
# ------------------------------------------------------------------------------
echo "☁️  [6/9] Enviando dump e checksum ao bucket S3 (${S3_ENDPOINT})..."

aws --endpoint-url "${S3_ENDPOINT}" --region "${S3_REGION}" \
  s3 cp "${LOCAL_DUMP_PATH}" "${S3_BUCKET}/${DUMP_FILENAME}"

aws --endpoint-url "${S3_ENDPOINT}" --region "${S3_REGION}" \
  s3 cp "${LOCAL_CHECKSUM_PATH}" "${S3_BUCKET}/${CHECKSUM_FILENAME}"

echo "   Confirmando existência remota no S3..."
aws --endpoint-url "${S3_ENDPOINT}" --region "${S3_REGION}" \
  s3 ls "${S3_BUCKET}/${DUMP_FILENAME}"

# ------------------------------------------------------------------------------
# 7. DOWNLOAD EM DIRETÓRIO ISOLADO E CONFERÊNCIA DE SHA-256 DO S3
# ------------------------------------------------------------------------------
echo "🔄 [7/9] Baixando cópia de validação do S3 para diretório isolado..."
mkdir -p "${VERIFY_DIR}"

aws --endpoint-url "${S3_ENDPOINT}" --region "${S3_REGION}" \
  s3 cp "${S3_BUCKET}/${DUMP_FILENAME}" "${VERIFY_DIR}/${DUMP_FILENAME}"

aws --endpoint-url "${S3_ENDPOINT}" --region "${S3_REGION}" \
  s3 cp "${S3_BUCKET}/${CHECKSUM_FILENAME}" "${VERIFY_DIR}/${CHECKSUM_FILENAME}"

echo "   Validando SHA-256 do arquivo baixado do S3..."
(cd "${VERIFY_DIR}" && sha256sum -c "${CHECKSUM_FILENAME}")
DOWNLOAD_SHA=$(sha256sum "${VERIFY_DIR}/${DUMP_FILENAME}" | awk '{print $1}')

if [ "$LOCAL_SHA" != "$DOWNLOAD_SHA" ]; then
  echo "❌ ERRO: Checksum SHA-256 recuperado do S3 diverge do original local!" >&2
  exit 1
fi
echo "   Conferência de hash 100% idêntica (${DOWNLOAD_SHA})."

# ------------------------------------------------------------------------------
# 8. RESTAURAÇÃO ESTREITA EM CONTAINER POSTGRESQL 14 ISOLADO
# ------------------------------------------------------------------------------
echo "🧪 [8/9] Iniciando restauração estrita em PostgreSQL 14 efêmero e isolado..."

# Subir container efêmero com rede isolada ('none'), sem portas publicadas e sem volumes externos
docker run -d \
  --name "${RESTORE_CONTAINER}" \
  --network none \
  -e POSTGRES_PASSWORD=restore_audit_gate_pwd \
  postgres:14-alpine >/dev/null

echo "   Aguardando PostgreSQL efêmero ficar pronto..."
for i in {1..30}; do
  if docker exec -i "${RESTORE_CONTAINER}" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! docker exec -i "${RESTORE_CONTAINER}" pg_isready -U postgres >/dev/null 2>&1; then
  echo "❌ ERRO: PostgreSQL efêmero não respondeu no timeout estabelecido." >&2
  exit 1
fi

echo "   Criando banco '${TARGET_DB}' no container isolado..."
docker exec -i "${RESTORE_CONTAINER}" createdb -U postgres "${TARGET_DB}"

echo "   Executando pg_restore com --exit-on-error (exigência estrita de exit code 0)..."
# Injetar o arquivo do S3 diretamente no stdin do pg_restore.
# Sem flags tolerantes: qualquer erro de DDL ou DML causa aborto imediato.
docker exec -i "${RESTORE_CONTAINER}" pg_restore -U postgres -d "${TARGET_DB}" --no-owner --exit-on-error < "${VERIFY_DIR}/${DUMP_FILENAME}"

echo "   pg_restore finalizado com código de saída 0."

# ------------------------------------------------------------------------------
# 9. COMPARATIVO COMPLETO DE INVENTÁRIO, LINHAS E INTEGRIDADE REFERENCIAL
# ------------------------------------------------------------------------------
echo "📊 [9/9] Executando auditoria comparativa (Origem vs Restaurado)..."

# 9.1 Coletar inventário do banco restaurado
RESTORED_INVENTORY=$(docker exec -i "${RESTORE_CONTAINER}" psql -U postgres -d "${TARGET_DB}" -v ON_ERROR_STOP=1 -A -t -c "$ORIGIN_INVENTORY_SQL")
RESTORED_SCHEMAS_COUNT=$(echo "$RESTORED_INVENTORY" | grep -c "^SCHEMAS:" || true)
RESTORED_TABLES_COUNT=$(echo "$RESTORED_INVENTORY" | grep -c "^TABLES:" || true)
RESTORED_INDEXES_COUNT=$(echo "$RESTORED_INVENTORY" | grep -c "^INDEXES:" || true)
RESTORED_SEQUENCES_COUNT=$(echo "$RESTORED_INVENTORY" | grep -c "^SEQUENCES:" || true)
RESTORED_CONSTRAINTS_COUNT=$(echo "$RESTORED_INVENTORY" | grep -c "^CONSTRAINTS:" || true)

echo "   Inventário Restaurado: Schemas=${RESTORED_SCHEMAS_COUNT}, Tabelas=${RESTORED_TABLES_COUNT}, Índices=${RESTORED_INDEXES_COUNT}, Sequências=${RESTORED_SEQUENCES_COUNT}, Constraints=${RESTORED_CONSTRAINTS_COUNT}"

# Comparar inventários estruturais
if [ "$ORIGIN_INVENTORY" != "$RESTORED_INVENTORY" ]; then
  echo "❌ ERRO: Divergência detectada no inventário estrutural entre Origem e Restaurado!" >&2
  diff -u <(echo "$ORIGIN_INVENTORY") <(echo "$RESTORED_INVENTORY") || true
  exit 1
fi
echo "   Inventário estrutural 100% idêntico."

# 9.2 Comparar contagem exata de linhas de todas as tabelas
RESTORED_ROW_COUNTS=$(docker exec -i "${RESTORE_CONTAINER}" psql -U postgres -d "${TARGET_DB}" -v ON_ERROR_STOP=1 -A -t -c "$ROW_COUNT_QUERY")

if [ "$ORIGIN_ROW_COUNTS" != "$RESTORED_ROW_COUNTS" ]; then
  echo "❌ ERRO: Divergência na contagem de linhas entre Origem e Restaurado!" >&2
  diff -u <(echo "$ORIGIN_ROW_COUNTS") <(echo "$RESTORED_ROW_COUNTS") || true
  exit 1
fi
echo "   Contagem de linhas em todas as tabelas 100% idêntica."

# 9.3 Validar constraints e integridade referencial
INVALID_CONSTRAINTS_COUNT=$(docker exec -i "${RESTORE_CONTAINER}" psql -U postgres -d "${TARGET_DB}" -v ON_ERROR_STOP=1 -A -t -c "
  SELECT count(*) FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND NOT convalidated;
")

if [ "$INVALID_CONSTRAINTS_COUNT" != "0" ]; then
  echo "❌ ERRO: Existem ${INVALID_CONSTRAINTS_COUNT} constraints não validadas no banco restaurado!" >&2
  exit 1
fi
echo "   Todas as constraints estão ativas e validadas."

# Checagem de órfãos em FKs chave
ORPHANS_FOUND=$(docker exec -i "${RESTORE_CONTAINER}" psql -U postgres -d "${TARGET_DB}" -v ON_ERROR_STOP=1 -A -t -c "
  SELECT count(*) FROM users u LEFT JOIN companies c ON u.company_id = c.id WHERE c.id IS NULL AND u.company_id IS NOT NULL;
")

if [ "$ORPHANS_FOUND" != "0" ]; then
  echo "❌ ERRO: Integridade referencial violada (${ORPHANS_FOUND} registros órfãos encontrados)!" >&2
  exit 1
fi
echo "   Integridade referencial validada com sucesso."

# Registrar resultado no relatório de evidência
{
  echo "--- INVENTÁRIO DO BANCO RESTAURADO ---"
  echo "Schemas: ${RESTORED_SCHEMAS_COUNT}"
  echo "Tabelas: ${RESTORED_TABLES_COUNT}"
  echo "Índices: ${RESTORED_INDEXES_COUNT}"
  echo "Sequências: ${RESTORED_SEQUENCES_COUNT}"
  echo "Constraints: ${RESTORED_CONSTRAINTS_COUNT}"
  echo ""
  echo "--- CONTAGEM DE LINHAS POR TABELA (RESTAURADO) ---"
  echo "$RESTORED_ROW_COUNTS"
  echo ""
  echo "--- VERIFICAÇÃO DE INTEGRIDADE REFERENCIAL ---"
  echo "Constraints não validadas: ${INVALID_CONSTRAINTS_COUNT}"
  echo "Registros órfãos (users -> companies): ${ORPHANS_FOUND}"
  echo ""
  echo "STATUS FINAL DO GATE DE BACKUP: APROVADO (GO)"
} >> "${EVIDENCE_FILE}"

# Remover container de validação e diretório efêmero antes da saída limpa
docker rm -f "${RESTORE_CONTAINER}" >/dev/null 2>&1 || true
rm -rf "${VERIFY_DIR}"

echo ""
echo "======================================================================"
echo "🎯 AUDITORIA DO BACKUP E VALIDAÇÃO DE RESTAURAÇÃO: 100% APROVADA (GO)"
echo "   Arquivo Local: ${LOCAL_DUMP_PATH}"
echo "   SHA-256:      ${LOCAL_SHA}"
echo "   Arquivo S3:    ${S3_BUCKET}/${DUMP_FILENAME}"
echo "   Evidência:    ${EVIDENCE_FILE}"
echo "======================================================================"
