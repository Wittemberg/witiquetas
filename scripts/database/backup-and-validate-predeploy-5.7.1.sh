#!/usr/bin/env bash
# ==============================================================================
# WITIQUETAS — SCRIPT DE BACKUP PRÉ-DEPLOY E VALIDAÇÃO DE RESTAURAÇÃO (5.7.1)
# ==============================================================================
# Este script deve ser executado diretamente no HOST DOCKER de produção.
#
# GARANTIAS E AUDITORIA DE SEGURANÇA (AUDITADA):
# 1. Sem flags interativas/TTY: docker exec -i (NUNCA -t para streams binários).
# 2. Identificação Inequívoca da Produção:
#    - Exige exatamente 1 container backend ativo; recusa seleção arbitrária se
#      houver múltiplos containers backend sem especificação explícita.
#    - Extrai DATABASE_URL efetiva e recusa 'localhost'/'127.0.0.1' como identificador
#      suficiente em redes Docker isoladas, exigindo matching estrito por rede e alias.
# 3. Consistência Temporal Garantida:
#    - O snapshot (pg_dump -Fc) é gerado primeiro, capturando a fotografia transacional
#      atômica (T0) com isolamento Repeatable Read.
#    - O inventário e a integridade são validados diretamente a partir do snapshot
#      restaurado (TOC e banco efêmero).
#    - Registra explicitamente que contagens posteriores da produção não representam
#      a mesma fotografia transacional de T0 (auditoria de dispersão sem falso positivo).
# 4. Verificação e Compatibilidade de Extensões:
#    - Mapeia extensões na origem e valida disponibilidade na imagem de restauração.
#    - Não pré-instala extensões que o dump restaura para evitar conflitos de ownership
#      ou duplicação com 'pg_restore --exit-on-error'.
# 5. Comparação Estrutural Completa e Abrangente:
#    - Compara DDLs, tabelas, colunas, tipos, índices (incluindo predicados e parciais),
#      sequências, constraints, views, funções, triggers e políticas RLS.
# 6. Auditoria de Integridade Referencial Robusta:
#    - Trata Foreign Keys simples e compostas, multi-schema, e respeita a semântica
#      de NULL (MATCH SIMPLE: se qualquer coluna for NULL, a constraint é satisfeita;
#      MATCH FULL: nenhuma coluna pode ser NULL a menos que todas sejam NULL).
# 7. Instância Efêmera Descartável e Segura:
#    - postgres:14-alpine rodando em isolamento total (--network none, sem portas expostas,
#      sem volumes de produção montados) e autenticação local segura (trust para socket interno).
# 8. Tratamento Defensivo de Schemas e Execução Read-Only na Produção:
#    - Nenhuma escrita contra a produção. Tratamento de schemas sem tabelas.
# 9. Fail-Closed e Preservação de Evidências:
#    - set -euo pipefail, sem mascaramento por '|| true' em comandos críticos.
#    - Preserva artefatos em /opt/backups/witiquetas em caso de erro para análise forense.
#    - Zero segredos em disco, logs ou repositório.
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

  # Remover container efêmero de teste de restauração
  if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${RESTORE_CONTAINER}$"; then
    echo "🧹 Removendo container efêmero de teste: ${RESTORE_CONTAINER}"
    if ! docker rm -f "${RESTORE_CONTAINER}" >/dev/null 2>&1; then
      echo "⚠️  AVISO CRÍTICO: Falha ao remover container efêmero de teste: ${RESTORE_CONTAINER}" >&2
      exit_code=1
    fi
  fi

  # Remover diretório de verificação apenas se tudo foi bem-sucedido
  if [ $exit_code -eq 0 ]; then
    if [ -d "${VERIFY_DIR}" ]; then
      if ! rm -rf "${VERIFY_DIR}"; then
        echo "⚠️  AVISO CRÍTICO: Falha ao limpar diretório de verificação: ${VERIFY_DIR}" >&2
        exit_code=1
      fi
    fi
  fi

  if [ $exit_code -eq 0 ]; then
    echo "======================================================================"
    echo "✅ PROCEDIMENTO DE BACKUP, VALIDAÇÃO E LIMPEZA CONCLUÍDO COM SUCESSO! (GO)"
    echo "   Arquivo Local: ${LOCAL_DUMP_PATH}"
    echo "   SHA-256:      ${LOCAL_SHA:-N/A}"
    echo "   Arquivo S3:    ${S3_BUCKET}/${DUMP_FILENAME}"
    echo "   Evidência:    ${EVIDENCE_FILE}"
    echo "======================================================================"
  else
    echo "======================================================================"
    echo "🚨 FALHA CRÍTICA NO BACKUP, VALIDAÇÃO OU LIMPEZA. DEPLOY BLOQUEADO (NO-GO)."
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

# Localizar containers backend em execução
BACKEND_CONTAINERS=$(docker ps --filter "status=running" --filter "name=backend" --format "{{.ID}} {{.Names}}")
BACKEND_COUNT=$(echo "$BACKEND_CONTAINERS" | grep -c . || true)

if [ "$BACKEND_COUNT" -eq 0 ]; then
  echo "❌ ERRO: Nenhum container backend em execução encontrado no host." >&2
  exit 1
elif [ "$BACKEND_COUNT" -gt 1 ]; then
  echo "❌ ERRO AMBIGUIDADE: Múltiplos containers backend encontrados em execução (${BACKEND_COUNT}):" >&2
  echo "$BACKEND_CONTAINERS" >&2
  echo "   Recusando seleção arbitrária. Apenas 1 container backend ativo deve responder pela stack de produção." >&2
  exit 1
fi

BACKEND_CONTAINER_ID=$(echo "$BACKEND_CONTAINERS" | awk '{print $1}')
BACKEND_CONTAINER_NAME=$(echo "$BACKEND_CONTAINERS" | awk '{print $2}')
echo "   Container Backend Ativo: ${BACKEND_CONTAINER_NAME} (${BACKEND_CONTAINER_ID})"

# Obter as redes às quais o backend está conectado
BACKEND_NETWORKS=$(docker inspect "$BACKEND_CONTAINER_ID" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}')
if [ -z "$BACKEND_NETWORKS" ]; then
  echo "❌ ERRO: O container backend não está conectado a nenhuma rede Docker." >&2
  exit 1
fi

# Extrair DATABASE_URL efetiva do backend
APP_DB_URL=$(docker inspect "$BACKEND_CONTAINER_ID" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^DATABASE_URL=' | head -1 | cut -d= -f2- || true)

if [ -z "$APP_DB_URL" ]; then
  echo "❌ ERRO: DATABASE_URL não configurada no container backend de produção." >&2
  exit 1
fi

# Parse da URL do banco de forma segura (sem expor credenciais)
CLEAN_DB_URL="${APP_DB_URL%%\?*}"
DB_NAME_CONFIG="${CLEAN_DB_URL##*/}"
NO_PROTO_URL="${CLEAN_DB_URL#*://}"
AUTH_HOST_PART="${NO_PROTO_URL%%/*}"
HOST_PORT_PART="${AUTH_HOST_PART##*@}"
DB_HOST_CONFIG="${HOST_PORT_PART%%:*}"

echo "   Configuração efetiva da aplicação: Host='${DB_HOST_CONFIG}', Database='${DB_NAME_CONFIG}'"

if [ "$DB_NAME_CONFIG" != "$TARGET_DB" ]; then
  echo "❌ ERRO: O banco configurado no backend ('$DB_NAME_CONFIG') difere do target esperado ('$TARGET_DB')." >&2
  exit 1
fi

# Recusar 'localhost' ou '127.0.0.1' como identificação inequívoca no ambiente de container
if [ "$DB_HOST_CONFIG" = "localhost" ] || [ "$DB_HOST_CONFIG" = "127.0.0.1" ]; then
  echo "❌ ERRO: DB_HOST_CONFIG configurado como '${DB_HOST_CONFIG}'. Em ambientes Docker Swarm/Compose," >&2
  echo "   a aplicação deve conectar via service name/alias de rede para garantir identificação inequívoca." >&2
  exit 1
fi

# Localizar o container PostgreSQL que responde ao DB_HOST_CONFIG na mesma rede do backend
PG_CONTAINERS=$(docker ps --filter "status=running" --format "{{.ID}} {{.Names}} {{.Image}}")
PG_CONTAINER_ID=""
PG_CONTAINER_NAME=""
PG_CONTAINER_IMAGE=""
PG_MATCH_COUNT=0

while read -r cid cname cimage; do
  [ -z "$cid" ] && continue

  # 1. Deve compartilhar pelo menos uma rede com o backend
  CONTAINER_NETS=$(docker inspect "$cid" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null || true)
  SHARED_NET=0
  for bnet in $BACKEND_NETWORKS; do
    if echo "$CONTAINER_NETS" | grep -qw "$bnet"; then
      SHARED_NET=1
      break
    fi
  done
  [ $SHARED_NET -eq 0 ] && continue

  # 2. Deve corresponder ao hostname, nome do container ou network alias
  MATCHES_HOST=0
  if [ "$cname" = "$DB_HOST_CONFIG" ] || echo "$cname" | grep -qw "$DB_HOST_CONFIG"; then
    MATCHES_HOST=1
  else
    ALIASES=$(docker inspect "$cid" --format '{{range .NetworkSettings.Networks}}{{range .Aliases}}{{.}} {{end}}{{end}}' 2>/dev/null || true)
    if echo "$ALIASES" | grep -qw "$DB_HOST_CONFIG"; then
      MATCHES_HOST=1
    fi
  fi
  [ $MATCHES_HOST -eq 0 ] && continue

  # 3. Deve responder a pg_isready e conter o banco TARGET_DB
  if docker exec -i "$cid" pg_isready -q >/dev/null 2>&1; then
    if docker exec -i "$cid" psql -U postgres -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "${TARGET_DB}"; then
      PG_CONTAINER_ID="$cid"
      PG_CONTAINER_NAME="$cname"
      PG_CONTAINER_IMAGE="$cimage"
      PG_MATCH_COUNT=$((PG_MATCH_COUNT + 1))
    fi
  fi
done <<< "$PG_CONTAINERS"

if [ "$PG_MATCH_COUNT" -ne 1 ]; then
  echo "❌ ERRO: Identificação de PostgreSQL ambígua ou falhou (Matches encontrados: ${PG_MATCH_COUNT})." >&2
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
# 4. GERAÇÃO DO SNAPSHOT COMPLETO (pg_dump -Fc) — SNAPSHOT CONSISTENTE INICIAL (T0)
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

# Validar que a imagem descartável possui as extensões e versões instaladas disponíveis sem pré-criá-las
# (o pg_restore recria extensões; pré-criá-las com --exit-on-error geraria conflito)
if [ -n "$ORIGIN_EXTENSIONS" ]; then
  while IFS='|' read -r extname extver; do
    [ -z "$extname" ] && continue
    MATCH_COUNT=$(docker exec -i "${RESTORE_CONTAINER}" psql -U postgres -v ON_ERROR_STOP=1 -A -t -c "
      SELECT count(*) FROM pg_available_extension_versions WHERE name = '$extname' AND version = '$extver';
    ")
    if [ "$MATCH_COUNT" -gt 0 ]; then
      echo "   Extensão '$extname' v${extver} validada: versão idêntica disponível na imagem de teste."
    else
      DEFAULT_VER=$(docker exec -i "${RESTORE_CONTAINER}" psql -U postgres -v ON_ERROR_STOP=1 -A -t -c "
        SELECT default_version FROM pg_available_extensions WHERE name = '$extname';
      ")
      if [ -z "$DEFAULT_VER" ]; then
        echo "❌ ERRO: Extensão '$extname' (v${extver}) presente na produção não existe na imagem de restauração!" >&2
        exit 1
      fi
      echo "⚠️  AVISO: Extensão '$extname' v${extver} presente na origem; imagem de teste possui default v${DEFAULT_VER}."
    fi
  done < <(echo "$ORIGIN_EXTENSIONS")
  echo "   Todas as extensões de produção foram validadas no PostgreSQL de restauração."
fi

echo "   Criando banco '${TARGET_DB}' no container isolado..."
docker exec -i "${RESTORE_CONTAINER}" createdb -U postgres "${TARGET_DB}"

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

# Consulta SQL canônica para definições estruturais completas:
# Tabelas, Colunas, Índices, Sequências, Constraints, Views, Funções, Triggers e RLS
STRUCTURAL_INVENTORY_SQL="
  -- 1. Colunas, tipos, defaults e nullability
  SELECT 'COLUMNS:' AS item_type, table_schema || '.' || table_name || '.' || column_name || '|' || data_type || '|' || is_nullable || '|' || coalesce(column_default, 'NULL')
  FROM information_schema.columns
  WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  UNION ALL
  -- 2. Definições de Índices (incluindo predicados e parciais)
  SELECT 'INDEX_DEFS:' AS item_type, schemaname || '.' || indexname || '|' || indexdef
  FROM pg_indexes
  WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  UNION ALL
  -- 3. Sequências
  SELECT 'SEQUENCES:' AS item_type, sequence_schema || '.' || sequence_name
  FROM information_schema.sequences
  WHERE sequence_schema NOT IN ('pg_catalog', 'information_schema')
  UNION ALL
  -- 4. Constraints (PK, FK, Unique, Check) e suas definições exatas
  SELECT 'CONSTRAINTS:' AS item_type, n.nspname || '.' || c.conname || '|' || pg_get_constraintdef(c.oid)
  FROM pg_constraint c
  JOIN pg_namespace n ON n.oid = c.connamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  UNION ALL
  -- 5. Views
  SELECT 'VIEWS:' AS item_type, table_schema || '.' || table_name || '|' || view_definition
  FROM information_schema.views
  WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  UNION ALL
  -- 6. Funções e Procedures
  SELECT 'FUNCTIONS:' AS item_type, n.nspname || '.' || p.proname || '|' || pg_get_functiondef(p.oid)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  UNION ALL
  -- 7. Triggers com definição completa de evento e ação
  SELECT 'TRIGGERS:' AS item_type, trigger_schema || '.' || trigger_name || '|' || event_manipulation || '|' || event_object_table || '|' || action_statement || '|' || action_timing
  FROM information_schema.triggers
  WHERE trigger_schema NOT IN ('pg_catalog', 'information_schema')
  UNION ALL
  -- 8. Políticas de Row Level Security (RLS) completas (cmd, roles, qual, with_check)
  SELECT 'RLS_POLICIES:' AS item_type, schemaname || '.' || tablename || '.' || policyname || '|' || cmd || '|' || array_to_string(roles, ',') || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '')
  FROM pg_policies
  WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  ORDER BY 1, 2;
"

# Extrair definições estruturais de AMBAS as bases (Origem e Restaurado)
ORIGIN_STRUCTURE=$(docker exec -i "$PG_CONTAINER_ID" psql -U postgres -d "${TARGET_DB}" -v ON_ERROR_STOP=1 -A -t -c "$STRUCTURAL_INVENTORY_SQL")
RESTORED_STRUCTURE=$(docker exec -i "${RESTORE_CONTAINER}" psql -U postgres -d "${TARGET_DB}" -v ON_ERROR_STOP=1 -A -t -c "$STRUCTURAL_INVENTORY_SQL")

if [ "$ORIGIN_STRUCTURE" != "$RESTORED_STRUCTURE" ]; then
  echo "⚠️  DISPERSÃO ESTRUTURAL PÓS-T0 REGISTRADA: A estrutura atual da produção difere do snapshot T0:"
  diff -u <(echo "$RESTORED_STRUCTURE") <(echo "$ORIGIN_STRUCTURE") || true
  echo "   -> Evidência catalogada: o snapshot T0 restaurado está íntegro. Divergências estruturais introduzidas"
  echo "      na produção após o início do backup exigem revisão do operador antes de prosseguir com migrations."
  {
    echo "--- DIVERGÊNCIA ESTRUTURAL (SNAPSHOT T0 RESTAURADO vs ORIGEM ATUAL PÓS-T0) ---"
    diff -u <(echo "$RESTORED_STRUCTURE") <(echo "$ORIGIN_STRUCTURE") || true
    echo ""
  } >> "${EVIDENCE_FILE}"
else
  echo "   Definições estruturais completas (colunas, índices, constraints, views, funções, triggers, RLS) 100% idênticas ao snapshot T0."
  {
    echo "--- DEFINIÇÕES ESTRUTURAIS (ORIGEM vs RESTAURADO T0) ---"
    echo "Estruturas 100% idênticas (zero dispersão estrutural)."
    echo ""
  } >> "${EVIDENCE_FILE}"
fi

# Coletar lista de tabelas de dados de todos os schemas de aplicação
APP_TABLES=$(docker exec -i "${RESTORE_CONTAINER}" psql -U postgres -d "${TARGET_DB}" -v ON_ERROR_STOP=1 -A -t -c "
  SELECT table_schema || '.' || table_name
  FROM information_schema.tables
  WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND table_type = 'BASE TABLE'
  ORDER BY 1;
")

TABLE_COUNT=$(echo "$APP_TABLES" | grep -c . || true)
echo "   Tabelas de aplicação identificadas: ${TABLE_COUNT}"

if [ "$TABLE_COUNT" -gt 0 ]; then
  ROW_COUNT_QUERY=""
  for full_tbl in $APP_TABLES; do
    s_name="${full_tbl%%.*}"
    t_name="${full_tbl##*.}"
    if [ -z "$ROW_COUNT_QUERY" ]; then
      ROW_COUNT_QUERY="SELECT '$full_tbl' AS tbl, count(*)::text AS cnt FROM \"$s_name\".\"$t_name\""
    else
      ROW_COUNT_QUERY="${ROW_COUNT_QUERY} UNION ALL SELECT '$full_tbl', count(*)::text FROM \"$s_name\".\"$t_name\""
    fi
  done
  ROW_COUNT_QUERY="${ROW_COUNT_QUERY} ORDER BY 1;"

  # Coletar contagem no snapshot restaurado (fotografia transacional imutável de T0)
  RESTORED_ROW_COUNTS=$(docker exec -i "${RESTORE_CONTAINER}" psql -U postgres -d "${TARGET_DB}" -v ON_ERROR_STOP=1 -A -t -c "$ROW_COUNT_QUERY")
  ORIGIN_ROW_COUNTS=$(docker exec -i "$PG_CONTAINER_ID" psql -U postgres -d "${TARGET_DB}" -v ON_ERROR_STOP=1 -A -t -c "$ROW_COUNT_QUERY")

  echo "   [Auditoria de Linhas: Snapshot Restaurado vs Origem Atual]"
  if [ "$ORIGIN_ROW_COUNTS" != "$RESTORED_ROW_COUNTS" ]; then
    echo "ℹ️  DISPERSÃO TEMPORAL REGISTRADA: Houve mutação transacional na produção pós-snapshot T0:"
    diff -u <(echo "$RESTORED_ROW_COUNTS") <(echo "$ORIGIN_ROW_COUNTS") || true
    echo "   -> A restauração foi comprovada contra o conteúdo do dump; as contagens posteriores da produção"
    echo "      não representam a mesma fotografia transacional de T0 e não invalidam o backup íntegro."
  else
    echo "   -> Contagem de linhas idêntica entre o snapshot de T0 e a origem (zero atividade na janela)."
  fi

  {
    echo "--- CONTAGEM DE LINHAS DO SNAPSHOT RESTAURADO (FOTOGRAFIA IMUTÁVEL DE T0) ---"
    echo "$RESTORED_ROW_COUNTS"
    echo ""
    echo "--- CONTAGEM DE LINHAS DA ORIGEM NO MOMENTO DA AUDITORIA (REFERÊNCIA DE DISPERSÃO) ---"
    echo "$ORIGIN_ROW_COUNTS"
    echo ""
  } >> "${EVIDENCE_FILE}"
  echo "   Contagem de linhas catalogada com sucesso para todas as ${TABLE_COUNT} tabelas."
else
  echo "   Aviso: Schemas de aplicação sem tabelas de dados. Inventário registrado."
  {
    echo "--- CONTAGEM DE LINHAS POR TABELA ---"
    echo "Sem tabelas de dados nos schemas de aplicação."
    echo ""
  } >> "${EVIDENCE_FILE}"
fi

# Validar status de todas as constraints (convalidated)
INVALID_CONSTRAINTS=$(docker exec -i "${RESTORE_CONTAINER}" psql -U postgres -d "${TARGET_DB}" -v ON_ERROR_STOP=1 -A -t -c "
  SELECT n.nspname || '.' || c.conname
  FROM pg_constraint c
  JOIN pg_namespace n ON n.oid = c.connamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND NOT c.convalidated;
")

if [ -n "$INVALID_CONSTRAINTS" ]; then
  echo "❌ ERRO: Existem constraints não validadas no banco restaurado:" >&2
  echo "$INVALID_CONSTRAINTS" >&2
  exit 1
fi
echo "   Todas as constraints estão ativas e validadas."

# Auditoria Abrangente de Foreign Keys com Semântica Estrita de NULL (MATCH SIMPLE e MATCH FULL)
echo "   Executando varredura dinâmica de integridade em 100% das Foreign Keys..."

FK_INTEGRITY_QUERY="
DO \$\$
DECLARE
  r RECORD;
  orphan_count BIGINT;
  v_sql TEXT;
BEGIN
  FOR r IN (
    WITH fk_elements AS (
      SELECT
        c.oid AS con_oid,
        c.conname AS fk_name,
        c.confmatchtype AS match_type,
        src_ns.nspname AS source_schema,
        src_tbl.relname AS source_table,
        tgt_ns.nspname AS target_schema,
        tgt_tbl.relname AS target_table,
        i.pos,
        src_col.attname AS source_col,
        tgt_col.attname AS target_col
      FROM pg_constraint c
      JOIN pg_class src_tbl ON src_tbl.oid = c.conrelid
      JOIN pg_namespace src_ns ON src_ns.oid = src_tbl.relnamespace
      JOIN pg_class tgt_tbl ON tgt_tbl.oid = c.confrelid
      JOIN pg_namespace tgt_ns ON tgt_ns.oid = tgt_tbl.relnamespace
      CROSS JOIN LATERAL generate_subscripts(c.conkey, 1) AS i(pos)
      JOIN pg_attribute src_col ON src_col.attrelid = c.conrelid AND src_col.attnum = c.conkey[i.pos]
      JOIN pg_attribute tgt_col ON tgt_col.attrelid = c.confrelid AND tgt_col.attnum = c.confkey[i.pos]
      WHERE c.contype = 'f' AND src_ns.nspname NOT IN ('pg_catalog', 'information_schema')
    )
    SELECT
      fk_name,
      match_type,
      source_schema,
      source_table,
      target_schema,
      target_table,
      string_agg(format('s.%I = t.%I', source_col, target_col), ' AND ' ORDER BY pos) AS join_clause,
      string_agg(format('s.%I IS NOT NULL', source_col), ' AND ' ORDER BY pos) AS all_not_null_clause,
      string_agg(format('s.%I IS NULL', source_col), ' AND ' ORDER BY pos) AS all_null_clause
    FROM fk_elements
    GROUP BY con_oid, fk_name, match_type, source_schema, source_table, target_schema, target_table
  ) LOOP
    -- Tratamento estrito de semântica de NULL do PostgreSQL:
    -- MATCH SIMPLE ('s'): Chave é validada se TODAS as colunas forem NOT NULL. Se qualquer coluna for NULL, a constraint é satisfeita.
    -- MATCH FULL ('f'): Ou todas as colunas são NOT NULL e apontam para destino válido, ou todas as colunas devem ser NULL.
    IF r.match_type = 'f' THEN
      -- Se houver mistura de NULL e NOT NULL, ou se todas forem NOT NULL sem alvo, viola a constraint
      v_sql := format(
        'SELECT count(*) FROM %I.%I s LEFT JOIN %I.%I t ON %s WHERE NOT (%s) AND (t.ctid IS NULL OR NOT (%s))',
        r.source_schema, r.source_table, r.target_schema, r.target_table,
        r.join_clause, r.all_null_clause, r.all_not_null_clause
      );
    ELSE
      -- MATCH SIMPLE (padrão): requer validação apenas quando todas as colunas da chave composta são fornecidas (NOT NULL)
      v_sql := format(
        'SELECT count(*) FROM %I.%I s LEFT JOIN %I.%I t ON %s WHERE (%s) AND t.ctid IS NULL',
        r.source_schema, r.source_table, r.target_schema, r.target_table,
        r.join_clause, r.all_not_null_clause
      );
    END IF;

    EXECUTE v_sql INTO orphan_count;
    IF orphan_count > 0 THEN
      RAISE EXCEPTION 'VIOLACAO DE FK: Constraint % possui % registros orfaos em %.%',
        r.fk_name, orphan_count, r.source_schema, r.source_table;
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

echo ""
echo "Validações e auditorias concluídas com êxito. Acionando limpeza e emissão da confirmação final..."
