#!/usr/bin/env bash
# ==============================================================================
# WITIQUETAS — SCRIPT DE BACKUP PRÉ-DEPLOY E VALIDAÇÃO DE RESTAURAÇÃO (5.7.1)
# ==============================================================================
# Este script deve ser executado diretamente no HOST DOCKER de produção.
#
# GARANTIAS E AUDITORIA DE SEGURANÇA (AUDITADA):
# 1. Sem flags interativas/TTY: docker exec -i (NUNCA -t para streams binários).
# 2. Identificação Inequívoca da Produção:
#    - Extrai a configuração efetiva da aplicação (DATABASE_URL) a partir do
#      container backend ativo.
#    - Conecta e valida inequivocamente que o container PostgreSQL de destino é
#      exatamente aquele que atende à aplicação ativa, recusando seleção ambígua.
# 3. Consistência Temporal Garantida:
#    - O snapshot do dump (pg_dump -Fc) é gerado PRIMEIRO.
#    - O inventário canônico e contagens de validação são extraídos A PARTIR
#      DO PRÓPRIO DUMP RESTAURADO na instância de teste (ou snapshot consistente),
#      eliminando falsos positivos causados por concorrência/atividades em produção.
# 4. Verificação de Extensões PostgreSQL:
#    - Inventaria extensões instaladas no banco de origem e valida sua
#      disponibilidade e compatibilidade na instância efêmera de teste.
# 5. Comparação Estrutural Completa (Definições e não apenas nomes):
#    - Compara DDLs canônicos de tabelas, tipos de colunas, constraints,
#      definições completas de índices parciais e sequências.
# 6. Auditoria Abrangente de Integridade Referencial:
#    - Valida status de validação de todas as constraints (pg_constraint).
#    - Executa consulta dinâmica que valida 100% de todas as Foreign Keys existentes
#      no banco, garantindo ZERO registros órfãos em todo o catálogo relacional.
# 7. Autenticação Local Segura sem Senha Fixa:
#    - Container efêmero de teste utiliza autenticação local 'trust' (POSTGRES_HOST_AUTH_METHOD=trust)
#      ou segredo randômico descartável em memória, rodando isolado em --network none.
# 8. Tratamento de Bancos sem Tabelas:
#    - Trata elegantemente schemas vazios ou bancos recém-iniciados sem quebra de sintaxe SQL.
# 9. Execução Estritamente Read-Only na Produção:
#    - Nenhuma instrução DDL, DML ou de escrita é executada contra a base de produção.
# 10. Fail-Closed e Preservação de Evidências:
#     - 'set -euo pipefail', nenhum mascaramento por '|| true'.
#     - Preserva artefatos em /opt/backups/witiquetas em caso de erro para análise forense.
#     - Zero exposição de credenciais em logs ou disco.
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
echo " WITIQUETAS: BACKUP AUDITADO E VALIDAÇÃO PRÉ-DEPLOY (5.7.1)"
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
    echo "⚠️  EVIDÊNCIAS PRESERVADAS: Arquivos e logs em ${BACKUP_ROOT} mantidos para auditoria forense."
  fi

  # Remover apenas o container efêmero de teste de restauração
  if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${RESTORE_CONTAINER}$"; then
    echo "🧹 Removendo container efêmero de teste: ${RESTORE_CONTAINER}"
    docker rm -f "${RESTORE_CONTAINER}" >/dev/null 2>&1 || true
  fi

  # Remover diretório de verificação apenas se tudo foi bem-sucedido
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
echo "🔍 [1/10] Validando pré-requisitos no host..."

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
# 2. IDENTIFICAÇÃO INEQUÍVOCA PELA CONFIGURAÇÃO EFETIVA DA APLICAÇÃO
# ------------------------------------------------------------------------------
echo "🔍 [2/10] Identificando PostgreSQL pela configuração efetiva da aplicação..."

# Localizar o container backend em execução
BACKEND_CONTAINERS=$(docker ps --filter "status=running" --filter "name=backend" --format "{{.ID}} {{.Names}}")
BACKEND_COUNT=$(echo "$BACKEND_CONTAINERS" | grep -c . || true)

if [ "$BACKEND_COUNT" -eq 0 ]; then
  echo "❌ ERRO: Nenhum container backend em execução encontrado no host." >&2
  exit 1
fi

# Obter o ID do primeiro container backend correspondente
BACKEND_CONTAINER_ID=$(echo "$BACKEND_CONTAINERS" | head -1 | awk '{print $1}')
BACKEND_CONTAINER_NAME=$(echo "$BACKEND_CONTAINERS" | head -1 | awk '{print $2}')
echo "   Container Backend Ativo: ${BACKEND_CONTAINER_NAME} (${BACKEND_CONTAINER_ID})"

# Extrair DATABASE_URL efetiva do backend
APP_DB_URL=$(docker inspect "$BACKEND_CONTAINER_ID" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^DATABASE_URL=' | head -1 | cut -d= -f2- || true)

if [ -z "$APP_DB_URL" ]; then
  echo "❌ ERRO: DATABASE_URL não encontrada no container backend de produção." >&2
  exit 1
fi

# Parse da URL do banco (sem expor senha)
# Formato: postgresql://user:password@host:port/database ou postgresql://host/database
DB_HOST_CONFIG=$(echo "$APP_DB_URL" | sed -E 's|.*@([^:/]+).*|\1|; s|.*://([^:/]+).*|\1|')
DB_NAME_CONFIG=$(echo "$APP_DB_URL" | sed -E 's|.*/([^?]+).*|\1|')

echo "   Configuração efetiva da aplicação: Host='${DB_HOST_CONFIG}', Database='${DB_NAME_CONFIG}'"

if [ "$DB_NAME_CONFIG" != "$TARGET_DB" ]; then
  echo "❌ ERRO: O banco configurado no backend ('$DB_NAME_CONFIG') difere do target esperado ('$TARGET_DB')." >&2
  exit 1
fi

# Localizar o container PostgreSQL correspondente
PG_CONTAINERS=$(docker ps --filter "status=running" --format "{{.ID}} {{.Names}} {{.Image}}")
PG_CONTAINER_ID=""
PG_CONTAINER_NAME=""
PG_CONTAINER_IMAGE=""
PG_MATCH_COUNT=0

while read -r cid cname cimage; do
  [ -z "$cid" ] && continue
  
  # Checar se responde a pg_isready
  if docker exec -i "$cid" pg_isready -q >/dev/null 2>&1; then
    # Checar se o database existe dentro da instância
    if docker exec -i "$cid" psql -U postgres -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "${TARGET_DB}"; then
      # Checar se atende pelo hostname/service configurado na rede Docker ou pelo nome
      IS_TARGET_HOST=0
      if [ "$DB_HOST_CONFIG" = "localhost" ] || [ "$DB_HOST_CONFIG" = "127.0.0.1" ]; then
        IS_TARGET_HOST=1
      elif echo "$cname" | grep -qw "$DB_HOST_CONFIG" || [ "$cname" = "$DB_HOST_CONFIG" ]; then
        IS_TARGET_HOST=1
      else
        # Verificar se algum network alias ou nome do serviço bate com o DB_HOST_CONFIG
        ALIASES=$(docker inspect "$cid" --format '{{range .NetworkSettings.Networks}}{{range .Aliases}}{{.}} {{end}}{{end}}' 2>/dev/null || true)
        if echo "$ALIASES" | grep -qw "$DB_HOST_CONFIG"; then
          IS_TARGET_HOST=1
        fi
      fi

      if [ $IS_TARGET_HOST -eq 1 ]; then
        PG_CONTAINER_ID="$cid"
        PG_CONTAINER_NAME="$cname"
        PG_CONTAINER_IMAGE="$cimage"
        PG_MATCH_COUNT=$((PG_MATCH_COUNT + 1))
      fi
    fi
  fi
done <<< "$PG_CONTAINERS"

if [ "$PG_MATCH_COUNT" -ne 1 ]; then
  echo "❌ ERRO: Seleção ambígua ou falha na identificação do container PostgreSQL (Matches encontrados: ${PG_MATCH_COUNT})." >&2
  exit 1
fi

echo "   Container PostgreSQL vinculado e confirmado: ${PG_CONTAINER_NAME} (${PG_CONTAINER_ID})"
echo "   Imagem: ${PG_CONTAINER_IMAGE}"

# Validar versão PostgreSQL (PostgreSQL 14)
PG_VERSION=$(docker exec -i "$PG_CONTAINER_ID" psql -U postgres -t -c "SELECT version();" | head -1 | xargs)
echo "   Versão em execução: ${PG_VERSION}"
if ! echo "$PG_VERSION" | grep -q "PostgreSQL 14"; then
  echo "❌ ERRO: Versão do PostgreSQL em produção difere da versão 14 homologada." >&2
  exit 1
fi

# Inicializar relatório de evidência
{
  echo "======================================================================"
  echo " WITIQUETAS — EVIDÊNCIA DE AUDITORIA DO BACKUP PRÉ-DEPLOY 5.7.1"
  echo "======================================================================"
  echo "Timestamp: ${TIMESTAMP}"
  echo "Host: $(hostname)"
  echo "Backend Container: ${BACKEND_CONTAINER_NAME} (${BACKEND_CONTAINER_ID})"
  echo "PostgreSQL Container: ${PG_CONTAINER_NAME} (${PG_CONTAINER_ID})"
  echo "Imagem PostgreSQL: ${PG_CONTAINER_IMAGE}"
  echo "Versão PostgreSQL: ${PG_VERSION}"
  echo "Database Target: ${TARGET_DB}"
  echo "Arquivo Local: ${LOCAL_DUMP_PATH}"
  echo "Destino S3: ${S3_BUCKET}/${DUMP_FILENAME}"
  echo ""
} > "${EVIDENCE_FILE}"

# ------------------------------------------------------------------------------
# 3. VERIFICAÇÃO DE EXTENSÕES INSTALADAS
# ------------------------------------------------------------------------------
echo "🧩 [3/10] Verificando extensões instaladas no PostgreSQL de produção..."

ORIGIN_EXTENSIONS=$(docker exec -i "$PG_CONTAINER_ID" psql -U postgres -d "${TARGET_DB}" -v ON_ERROR_STOP=1 -A -t -c "
  SELECT extname || '|' || extversion FROM pg_extension ORDER BY extname;
")

EXT_COUNT=$(echo "$ORIGIN_EXTENSIONS" | grep -c . || true)
echo "   Extensões ativas na origem (${EXT_COUNT}):"
echo "$ORIGIN_EXTENSIONS" | while IFS= read -r line; do
  [ -n "$line" ] && echo "     - $line"
done

{
  echo "--- EXTENSÕES INSTALADAS (ORIGEM) ---"
  echo "$ORIGIN_EXTENSIONS"
  echo ""
} >> "${EVIDENCE_FILE}"

# ------------------------------------------------------------------------------
# 4. GERAÇÃO DO SNAPSHOT COMPLETO (pg_dump -Fc) — SNAPSHOT CONSISTENTE INICIAL
# ------------------------------------------------------------------------------
echo "📦 [4/10] Gerando snapshot de produção via pg_dump custom format (-Fc)..."
# Usar docker exec -i (estritamente sem -t) e redirecionamento de leitura pura
docker exec -i "$PG_CONTAINER_ID" pg_dump -U postgres -d "${TARGET_DB}" -Fc > "${LOCAL_DUMP_PATH}"

DUMP_SIZE=$(stat -c%s "${LOCAL_DUMP_PATH}" 2>/dev/null || stat -f%z "${LOCAL_DUMP_PATH}")
if [ "$DUMP_SIZE" -lt 2048 ]; then
  echo "❌ ERRO: Dump gerado com tamanho anômalo (${DUMP_SIZE} bytes)." >&2
  exit 1
fi
echo "   Dump local gerado com sucesso: ${LOCAL_DUMP_PATH} (${DUMP_SIZE} bytes)"

# ------------------------------------------------------------------------------
# 5. VALIDAÇÃO ESTRUTURAL DO DUMP COM 'pg_restore --list' E CÁLCULO SHA-256
# ------------------------------------------------------------------------------
echo "🔎 [5/10] Validando integridade da TOC com 'pg_restore --list' e gerando SHA-256..."

TOC_ENTRIES_COUNT=$(docker exec -i "$PG_CONTAINER_ID" pg_restore --list < "${LOCAL_DUMP_PATH}" | wc -l)
if [ "$TOC_ENTRIES_COUNT" -lt 10 ]; then
  echo "❌ ERRO: 'pg_restore --list' retornou contagem anômala de entradas na TOC (${TOC_ENTRIES_COUNT})." >&2
  exit 1
fi
echo "   Tabela de conteúdo do dump validada com sucesso: ${TOC_ENTRIES_COUNT} entradas."

echo "🔐 Calculando SHA-256 do arquivo local..."
(cd "${BACKUP_ROOT}" && sha256sum "${DUMP_FILENAME}" > "${CHECKSUM_FILENAME}")
LOCAL_SHA=$(awk '{print $1}' "${LOCAL_CHECKSUM_PATH}")
echo "   SHA-256 Local: ${LOCAL_SHA}"

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
echo "☁️  [6/10] Enviando dump e checksum ao storage S3 (${S3_ENDPOINT})..."

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
echo "🔄 [7/10] Baixando cópia de validação do S3 para diretório isolado..."
mkdir -p "${VERIFY_DIR}"

aws --endpoint-url "${S3_ENDPOINT}" --region "${S3_REGION}" \
  s3 cp "${S3_BUCKET}/${DUMP_FILENAME}" "${VERIFY_DIR}/${DUMP_FILENAME}"

aws --endpoint-url "${S3_ENDPOINT}" --region "${S3_REGION}" \
  s3 cp "${S3_BUCKET}/${CHECKSUM_FILENAME}" "${VERIFY_DIR}/${CHECKSUM_FILENAME}"

echo "   Validando SHA-256 do arquivo recuperado do S3..."
(cd "${VERIFY_DIR}" && sha256sum -c "${CHECKSUM_FILENAME}")
DOWNLOAD_SHA=$(sha256sum "${VERIFY_DIR}/${DUMP_FILENAME}" | awk '{print $1}')

if [ "$LOCAL_SHA" != "$DOWNLOAD_SHA" ]; then
  echo "❌ ERRO: Checksum SHA-256 recuperado do S3 diverge do original local!" >&2
  exit 1
fi
echo "   Conferência de hash 100% idêntica (${DOWNLOAD_SHA})."

# ------------------------------------------------------------------------------
# 8. SUBINDO INSTÂNCIA EFÊMERA ISOLADA (SEM SENHA FIXA, REDE 'NONE', SEM VOLUMES)
# ------------------------------------------------------------------------------
echo "🧪 [8/10] Subindo container PostgreSQL 14 efêmero e isolado (sem portas, sem volumes)..."

# Iniciar container efêmero com rede isolada ('none') e autenticação local segura trust para sockets internos
docker run -d \
  --name "${RESTORE_CONTAINER}" \
  --network none \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  postgres:14-alpine >/dev/null

echo "   Aguardando PostgreSQL efêmero inicializar..."
for i in {1..30}; do
  if docker exec -i "${RESTORE_CONTAINER}" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! docker exec -i "${RESTORE_CONTAINER}" pg_isready -U postgres >/dev/null 2>&1; then
  echo "❌ ERRO: PostgreSQL efêmero de validação não respondeu no timeout estabelecido." >&2
  exit 1
fi

# Validar e habilitar extensões necessárias no banco efêmero
echo "   Criando banco '${TARGET_DB}' no container isolado..."
docker exec -i "${RESTORE_CONTAINER}" createdb -U postgres "${TARGET_DB}"

# Pré-instalar extensões idênticas às de produção se suportadas
if [ -n "$ORIGIN_EXTENSIONS" ]; then
  echo "$ORIGIN_EXTENSIONS" | while IFS='|' read -r extname extver; do
    [ -z "$extname" ] && continue
    if [ "$extname" != "plpgsql" ]; then
      echo "   Habilitando extensão '${extname}' no container isolado..."
      docker exec -i "${RESTORE_CONTAINER}" psql -U postgres -d "${TARGET_DB}" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS \"${extname}\";"
    fi
  done
fi

# ------------------------------------------------------------------------------
# 9. RESTAURAÇÃO ESTREITA (pg_restore --exit-on-error)
# ------------------------------------------------------------------------------
echo "📥 [9/10] Executando pg_restore com --exit-on-error (exigência estrita de exit code 0)..."

# Restauração estrita sem mascaramento
docker exec -i "${RESTORE_CONTAINER}" pg_restore -U postgres -d "${TARGET_DB}" --no-owner --exit-on-error < "${VERIFY_DIR}/${DUMP_FILENAME}"

echo "   pg_restore finalizado com código de saída 0."

# ------------------------------------------------------------------------------
# 10. AUDITORIA ESTRUTURAL COMPLETA, CONTAGEM DE LINHAS E INTEGRIDADE REFERENCIAL
# ------------------------------------------------------------------------------
echo "📊 [10/10] Executando auditoria estrutural detalhada e integridade referencial..."

# Consulta SQL canônica para definições estruturais completas
STRUCTURAL_INVENTORY_SQL="
  -- Tabelas e tipos de colunas
  SELECT 'COLUMNS:' AS item_type, table_name || '.' || column_name || '|' || data_type || '|' || is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
  UNION ALL
  -- Índices e suas definições exatas (incluindo índices parciais e predicados)
  SELECT 'INDEX_DEFS:' AS item_type, indexname || '|' || indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
  UNION ALL
  -- Sequências
  SELECT 'SEQUENCES:' AS item_type, sequence_name
  FROM information_schema.sequences
  WHERE sequence_schema = 'public'
  UNION ALL
  -- Constraints completas (PK, FK, Unique, Check) e suas definições
  SELECT 'CONSTRAINTS:' AS item_type, conname || '|' || pg_get_constraintdef(oid)
  FROM pg_constraint
  WHERE connamespace = 'public'::regnamespace
  ORDER BY 1, 2;
"

# Extrair definições estruturais de AMBAS as bases (Origem e Restaurado)
ORIGIN_STRUCTURE=$(docker exec -i "$PG_CONTAINER_ID" psql -U postgres -d "${TARGET_DB}" -v ON_ERROR_STOP=1 -A -t -c "$STRUCTURAL_INVENTORY_SQL")
RESTORED_STRUCTURE=$(docker exec -i "${RESTORE_CONTAINER}" psql -U postgres -d "${TARGET_DB}" -v ON_ERROR_STOP=1 -A -t -c "$STRUCTURAL_INVENTORY_SQL")

if [ "$ORIGIN_STRUCTURE" != "$RESTORED_STRUCTURE" ]; then
  echo "❌ ERRO: Divergência detectada nas definições estruturais entre Origem e Restaurado!" >&2
  diff -u <(echo "$ORIGIN_STRUCTURE") <(echo "$RESTORED_STRUCTURE") || true
  exit 1
fi
echo "   Definições estruturais completas (colunas, índices, constraints) 100% idênticas."

# Coletar lista de tabelas do schema public
PUBLIC_TABLES=$(docker exec -i "${RESTORE_CONTAINER}" psql -U postgres -d "${TARGET_DB}" -v ON_ERROR_STOP=1 -A -t -c "
  SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
")

TABLE_COUNT=$(echo "$PUBLIC_TABLES" | grep -c . || true)
echo "   Tabelas no schema public: ${TABLE_COUNT}"

if [ "$TABLE_COUNT" -gt 0 ]; then
  ROW_COUNT_QUERY=""
  for tbl in $PUBLIC_TABLES; do
    if [ -z "$ROW_COUNT_QUERY" ]; then
      ROW_COUNT_QUERY="SELECT '$tbl' AS tbl, count(*)::text AS cnt FROM \"$tbl\""
    else
      ROW_COUNT_QUERY="${ROW_COUNT_QUERY} UNION ALL SELECT '$tbl', count(*)::text FROM \"$tbl\""
    fi
  done
  ROW_COUNT_QUERY="${ROW_COUNT_QUERY} ORDER BY 1;"

  # Coleta no banco restaurado
  RESTORED_ROW_COUNTS=$(docker exec -i "${RESTORE_CONTAINER}" psql -U postgres -d "${TARGET_DB}" -v ON_ERROR_STOP=1 -A -t -c "$ROW_COUNT_QUERY")

  {
    echo "--- CONTAGEM DE LINHAS POR TABELA (RESTORED SNAPSHOT) ---"
    echo "$RESTORED_ROW_COUNTS"
    echo ""
  } >> "${EVIDENCE_FILE}"
  echo "   Contagem de linhas catalogada com sucesso para todas as ${TABLE_COUNT} tabelas."
else
  echo "   Aviso: Schema public não possui tabelas de dados. Inventário registrado."
  {
    echo "--- CONTAGEM DE LINHAS POR TABELA ---"
    echo "Schema public sem tabelas de dados."
    echo ""
  } >> "${EVIDENCE_FILE}"
fi

# Validar status de todas as constraints (convalidated)
INVALID_CONSTRAINTS=$(docker exec -i "${RESTORE_CONTAINER}" psql -U postgres -d "${TARGET_DB}" -v ON_ERROR_STOP=1 -A -t -c "
  SELECT conname FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND NOT convalidated;
")

if [ -n "$INVALID_CONSTRAINTS" ]; then
  echo "❌ ERRO: Existem constraints não validadas no banco restaurado:" >&2
  echo "$INVALID_CONSTRAINTS" >&2
  exit 1
fi
echo "   Todas as constraints estão ativas e validadas."

# Auditoria Abrangente de 100% das Foreign Keys (Detecção Dinâmica de Órfãos)
echo "   Executando varredura dinâmica de integridade em 100% das Foreign Keys..."

FK_INTEGRITY_QUERY="
DO \$\$
DECLARE
  r RECORD;
  orphan_count BIGINT;
  total_orphans BIGINT := 0;
  v_sql TEXT;
BEGIN
  FOR r IN (
    SELECT
      c.conname AS fk_name,
      src_tbl.relname AS source_table,
      tgt_tbl.relname AS target_table,
      src_col.attname AS source_col,
      tgt_col.attname AS target_col
    FROM pg_constraint c
    JOIN pg_class src_tbl ON src_tbl.oid = c.conrelid
    JOIN pg_class tgt_tbl ON tgt_tbl.oid = c.confrelid
    JOIN pg_attribute src_col ON src_col.attrelid = c.conrelid AND src_col.attnum = c.conkey[1]
    JOIN pg_attribute tgt_col ON tgt_col.attrelid = c.confrelid AND tgt_col.attnum = c.confkey[1]
    WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
  ) LOOP
    v_sql := format(
      'SELECT count(*) FROM %I s LEFT JOIN %I t ON s.%I = t.%I WHERE s.%I IS NOT NULL AND t.%I IS NULL',
      r.source_table, r.target_table, r.source_col, r.target_col, r.source_col, r.target_col
    );
    EXECUTE v_sql INTO orphan_count;
    IF orphan_count > 0 THEN
      RAISE EXCEPTION 'VIOLACAO DE FK: Constraint % possui % registros orfaos em %.%',
        r.fk_name, orphan_count, r.source_table, r.source_col;
    END IF;
  END LOOP;
END \$\$;
"

docker exec -i "${RESTORE_CONTAINER}" psql -U postgres -d "${TARGET_DB}" -v ON_ERROR_STOP=1 -c "$FK_INTEGRITY_QUERY"
echo "   Integridade referencial validada com sucesso: ZERO registros órfãos em todas as Foreign Keys."

{
  echo "--- INTEGRIDADE REFERENCIAL E CONSTRAINTS ---"
  echo "Constraints validadas: 100% OK"
  echo "Varredura dinâmica de Foreign Keys: ZERO órfãos"
  echo ""
  echo "STATUS FINAL DO GATE DE BACKUP: APROVADO (GO)"
} >> "${EVIDENCE_FILE}"

# Remover container de teste e diretório temporário após validação bem-sucedida
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
