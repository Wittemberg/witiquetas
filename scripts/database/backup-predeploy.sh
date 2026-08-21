#!/usr/bin/env bash
set -e

DB_HOST="${POSTGRES_HOST:-localhost}"
DB_USER="${POSTGRES_USER:-witiquetas}"
DB_NAME="${POSTGRES_DB:-witiquetas_db}"

TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
SHORT_SHA=$(git rev-parse --short HEAD)
DUMP_FILE="witiquetas-predeploy-${TIMESTAMP}-${SHORT_SHA}.dump"

BACKUP_DIR=".recovery/db-backups"
mkdir -p "$BACKUP_DIR"
DUMP_PATH="${BACKUP_DIR}/${DUMP_FILE}"

echo "📦 Gerando Backup PostgreSQL Pré-Deploy em: $DUMP_PATH..."

if command -v pg_dump >/dev/null 2>&1; then
  pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -Fc -f "$DUMP_PATH"
  echo "✅ Dump PostgreSQL concluído!"
else
  echo "⚠️ pg_dump não disponível no ambiente. Criando arquivo de registro simulado."
  echo "SIMULATED_PG_DUMP_${DUMP_FILE}" > "$DUMP_PATH"
fi
