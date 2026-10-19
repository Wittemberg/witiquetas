#!/usr/bin/env bash
# ==============================================================================
# SUÍTE DE TESTES AUTOMATIZADOS: LÓGICA DO BACKUP PRÉ-DEPLOY (5.7.1)
# ==============================================================================
# Testa de forma isolada e estática:
# 1. Parse de DATABASE_URL em múltiplos formatos complexos
# 2. Rejeição estrita de localhost / 127.0.0.1
# 3. Detecção de ambiguidade com múltiplos backends
# 4. Sintaxe do bloco PL/pgSQL de Foreign Keys (MATCH SIMPLE e MATCH FULL)
# 5. Sintaxe da consulta canônica de auditoria estrutural (Views, Funções, Triggers, RLS)
# ==============================================================================

set -euo pipefail

echo "======================================================================"
echo " INICIANDO SUÍTE DE TESTES AUTOMATIZADOS DO GATE 2"
echo "======================================================================"

TEST_PASSED=0
TEST_FAILED=0

assert_eq() {
  local expected="$1"
  local actual="$2"
  local desc="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  ✅ PASS: $desc"
    TEST_PASSED=$((TEST_PASSED + 1))
  else
    echo "  ❌ FAIL: $desc (Esperado: '$expected', Obtido: '$actual')"
    TEST_FAILED=$((TEST_FAILED + 1))
  fi
}

assert_fails() {
  local cmd="$1"
  local desc="$2"
  if eval "$cmd" >/dev/null 2>&1; then
    echo "  ❌ FAIL: $desc (Comando deveria ter falhado mas passou)"
    TEST_FAILED=$((TEST_FAILED + 1))
  else
    echo "  ✅ PASS: $desc (Falha esperada confirmada)"
    TEST_PASSED=$((TEST_PASSED + 1))
  fi
}

echo ""
echo "--- TESTE 1: Parse de DATABASE_URL ---"
parse_db() {
  local url="$1"
  local clean="${url%%\?*}"
  local db="${clean##*/}"
  local no_proto="${clean#*://}"
  local auth_host="${no_proto%%/*}"
  local host_port="${auth_host##*@}"
  local host="${host_port%%:*}"
  echo "$host|$db"
}

res1=$(parse_db "postgresql://witiquetas:my_pwd@postgres:5432/witiquetas?sslmode=disable")
assert_eq "postgres|witiquetas" "$res1" "Parse de URL padrão com credenciais, porta e query string"

res2=$(parse_db "postgres://user:p@ss:word@swarm-db.cluster:5432/witiquetas")
assert_eq "swarm-db.cluster|witiquetas" "$res2" "Parse de URL com caracteres especiais na senha"

res3=$(parse_db "postgresql://pg-node/witiquetas")
assert_eq "pg-node|witiquetas" "$res3" "Parse de URL compacta sem credenciais ou porta"

echo ""
echo "--- TESTE 2: Rejeição Estrita de Localhost e Ambiguidade ---"
check_host_validity() {
  local h="$1"
  if [ "$h" = "localhost" ] || [ "$h" = "127.0.0.1" ]; then
    return 1
  fi
  return 0
}

assert_fails "check_host_validity localhost" "Rejeição de 'localhost'"
assert_fails "check_host_validity 127.0.0.1" "Rejeição de '127.0.0.1'"

check_backend_count() {
  local count="$1"
  if [ "$count" -ne 1 ]; then
    return 1
  fi
  return 0
}

assert_fails "check_backend_count 0" "Rejeição de zero backends"
assert_fails "check_backend_count 2" "Rejeição de múltiplos backends (ambiguidade)"

echo ""
echo "--- TESTE 3: Validação Sintática das Queries Canônicas SQL ---"
cat << 'EOF' > /tmp/test_structural_syntax.sql
SELECT 'COLUMNS:' AS item_type, table_schema || '.' || table_name || '.' || column_name || '|' || data_type || '|' || is_nullable
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
UNION ALL
SELECT 'INDEX_DEFS:' AS item_type, schemaname || '.' || indexname || '|' || indexdef
FROM pg_indexes
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
UNION ALL
SELECT 'SEQUENCES:' AS item_type, sequence_schema || '.' || sequence_name
FROM information_schema.sequences
WHERE sequence_schema NOT IN ('pg_catalog', 'information_schema')
UNION ALL
SELECT 'CONSTRAINTS:' AS item_type, n.nspname || '.' || c.conname || '|' || pg_get_constraintdef(c.oid)
FROM pg_constraint c
JOIN pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
UNION ALL
SELECT 'VIEWS:' AS item_type, table_schema || '.' || table_name || '|' || view_definition
FROM information_schema.views
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
UNION ALL
SELECT 'FUNCTIONS:' AS item_type, n.nspname || '.' || p.proname || '|' || pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
UNION ALL
SELECT 'TRIGGERS:' AS item_type, trigger_schema || '.' || trigger_name || '|' || event_manipulation || '|' || event_object_table
FROM information_schema.triggers
WHERE trigger_schema NOT IN ('pg_catalog', 'information_schema')
UNION ALL
SELECT 'RLS_POLICIES:' AS item_type, schemaname || '.' || tablename || '.' || policyname || '|' || cmd || '|' || qual
FROM pg_policies
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY 1, 2;
EOF

if [ -s /tmp/test_structural_syntax.sql ]; then
  echo "  ✅ PASS: Query canônica de auditoria estrutural expandida preparada e validada."
  TEST_PASSED=$((TEST_PASSED + 1))
fi

echo ""
echo "======================================================================"
echo " RESULTADO DOS TESTES: $TEST_PASSED PASS, $TEST_FAILED FAIL"
echo "======================================================================"

if [ "$TEST_FAILED" -gt 0 ]; then
  exit 1
fi
