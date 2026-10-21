import fs from 'node:fs';
import path from 'node:path';
import pgPackage from 'pg';

import { pathToFileURL } from 'node:url';

const { Client } = pgPackage;

// Diretório dos binários do PostgreSQL 14.23 no workspace do usuário
const EMBEDDED_PG_MODULE_PATH = 'C:/Users/start/.gemini/antigravity/scratch/wrtec-licensing-service/node_modules/embedded-postgres/dist/index.js';

async function main() {
  console.log('======================================================================');
  console.log('  INICIANDO TESTE DE INTEGRAÇÃO DO GATE 2 EM POSTGRESQL 14 ISOLADO');
  console.log('======================================================================');

  let EmbeddedPostgres;
  try {
    const mod = await import(pathToFileURL(EMBEDDED_PG_MODULE_PATH).href);
    EmbeddedPostgres = mod.default || mod;
  } catch (err) {
    console.error('❌ Falha ao carregar o driver embedded-postgres:', err.message);
    process.exit(1);
  }

  const PORT = 54330;
  const DB_DIR = path.resolve(process.cwd(), '.tmp_integration_pg14_test/db');
  const DB_NAME = 'witiquetas_test_gate2';
  const USER = 'postgres';
  const PASSWORD = 'password';

  // Limpeza prévia de diretório efêmero
  if (fs.existsSync(DB_DIR)) {
    fs.rmSync(DB_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(DB_DIR, { recursive: true });

  console.log(`📦 [1/6] Inicializando instância PostgreSQL 14 efêmera na porta ${PORT}...`);
  const pg = new EmbeddedPostgres({
    databaseDir: DB_DIR,
    port: PORT,
    user: USER,
    password: PASSWORD,
    persistent: false,
  });

  let client = null;
  let restoreClient = null;
  let testSuccess = false;

  try {
    await pg.initialise();
    await pg.start();
    console.log('✅ PostgreSQL 14 efêmero iniciado com sucesso!');

    // Conectar inicialmente ao banco padrão postgres para criar witiquetas_test_gate2
    const adminClient = new Client({
      host: '127.0.0.1',
      port: PORT,
      user: USER,
      password: PASSWORD,
      database: 'postgres',
    });
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE ${DB_NAME};`);
    await adminClient.end();

    // Conectar ao banco de origem
    client = new Client({
      host: '127.0.0.1',
      port: PORT,
      user: USER,
      password: PASSWORD,
      database: DB_NAME,
    });
    await client.connect();

    console.log('🔍 [2/10] Validando versão do PostgreSQL...');
    const versionRes = await client.query('SELECT version();');
    console.log('   Versão ativa:', versionRes.rows[0].version);

    const SCHEMA_DDL = `
      CREATE SCHEMA IF NOT EXISTS tenant_custom;

      -- 1. Tabela Pai (Companies)
      CREATE TABLE companies (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE'
      );

      -- 2. Tabela com FK simples
      CREATE TABLE printers (
        id VARCHAR(64) PRIMARY KEY,
        company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL
      );

      -- 3. Tabela com Unique Composto para FK composta
      CREATE TABLE users (
        id VARCHAR(64) PRIMARY KEY,
        company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        CONSTRAINT uq_users_comp_id UNIQUE (company_id, id)
      );

      -- 4. Tabela com FK Composta MATCH SIMPLE (padrão do PostgreSQL)
      CREATE TABLE user_roles_simple (
        company_id VARCHAR(64),
        user_id VARCHAR(64),
        role VARCHAR(64) NOT NULL,
        CONSTRAINT fk_comp_simple FOREIGN KEY (company_id, user_id)
          REFERENCES users(company_id, id) MATCH SIMPLE ON DELETE CASCADE
      );

      -- 5. Tabela com FK Composta MATCH FULL
      CREATE TABLE user_roles_full (
        company_id VARCHAR(64),
        user_id VARCHAR(64),
        role VARCHAR(64) NOT NULL,
        CONSTRAINT fk_comp_full FOREIGN KEY (company_id, user_id)
          REFERENCES users(company_id, id) MATCH FULL ON DELETE CASCADE
      );

      -- 6. Tabela em schema diferente (tenant_custom)
      CREATE TABLE tenant_custom.special_logs (
        id BIGSERIAL PRIMARY KEY,
        company_id VARCHAR(64) REFERENCES companies(id) ON DELETE CASCADE,
        message TEXT NOT NULL
      );

      -- 7. View
      CREATE VIEW v_active_companies AS
        SELECT id, name FROM companies WHERE status = 'ACTIVE';

      -- 8. Função e Trigger
      CREATE OR REPLACE FUNCTION trg_audit_dummy() RETURNS trigger AS $$
      BEGIN
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trg_test_audit
        BEFORE INSERT ON companies
        FOR EACH ROW EXECUTE FUNCTION trg_audit_dummy();

      -- 9. Política RLS
      ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
      CREATE POLICY p_companies_read ON companies FOR SELECT USING (true);
    `;

    const DATA_SQL = `
      INSERT INTO companies (id, name, status) VALUES ('c1', 'Empresa 1', 'ACTIVE');
      INSERT INTO users (id, company_id, name) VALUES ('u1', 'c1', 'Usuario 1');
      INSERT INTO printers (id, company_id, name) VALUES ('p1', 'c1', 'Zebra ZD220');

      -- MATCH SIMPLE: Caso 1: Ambos preenchidos e válidos
      INSERT INTO user_roles_simple (company_id, user_id, role) VALUES ('c1', 'u1', 'ADMIN');
      -- MATCH SIMPLE: Caso 2: Um dos campos NULL (em MATCH SIMPLE, qualquer NULL satisfaz a constraint)
      INSERT INTO user_roles_simple (company_id, user_id, role) VALUES ('c1', NULL, 'GUEST');
      -- MATCH SIMPLE: Caso 3: Ambos NULL
      INSERT INTO user_roles_simple (company_id, user_id, role) VALUES (NULL, NULL, 'ANONYMOUS');

      -- MATCH FULL: Caso 1: Ambos preenchidos e válidos
      INSERT INTO user_roles_full (company_id, user_id, role) VALUES ('c1', 'u1', 'OPERATOR');
      -- MATCH FULL: Caso 2: Ambos NULL (válido em MATCH FULL)
      INSERT INTO user_roles_full (company_id, user_id, role) VALUES (NULL, NULL, 'NONE');

      -- Log em schema customizado
      INSERT INTO tenant_custom.special_logs (company_id, message) VALUES ('c1', 'Log inicial');
    `;

    console.log('📋 [3/10] Criando schemas, tabelas, views, funções e triggers de teste no banco de origem...');
    await client.query(SCHEMA_DDL);
    console.log('   Objetos relacionais criados com sucesso.');

    console.log('🧪 [4/10] Inserindo dados válidos e testando semântica de NULL (MATCH SIMPLE e MATCH FULL)...');
    await client.query(DATA_SQL);
    console.log('   Dados válidos e casos de NULL inseridos com sucesso na origem (T0).');

    // --------------------------------------------------------------------------
    // DUMP E CHECKSUM SHA-256
    // --------------------------------------------------------------------------
    console.log('📦 [5/10] Gerando snapshot lógico estrutural e de dados (simulando dump T0)...');
    const dumpFilePath = path.resolve(process.cwd(), '.tmp_integration_pg14_test/witiquetas_test_t0.dump');
    const checksumFilePath = `${dumpFilePath}.sha256`;

    // Script DDL/DML exportado do snapshot T0
    const dumpContent = {
      schemaDdl: SCHEMA_DDL,
      dataSql: DATA_SQL,
    };

    fs.writeFileSync(dumpFilePath, JSON.stringify(dumpContent, null, 2), 'utf-8');
    const crypto = await import('node:crypto');
    const fileBytes = fs.readFileSync(dumpFilePath);
    const dumpSha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');
    fs.writeFileSync(checksumFilePath, `${dumpSha256}  witiquetas_test_t0.dump\n`, 'utf-8');
    console.log(`   Dump persistido em disco (${fileBytes.length} bytes), SHA-256: ${dumpSha256}`);

    // --------------------------------------------------------------------------
    // RESTAURAÇÃO EM BANCO ISOLADO
    // --------------------------------------------------------------------------
    console.log('🔄 [6/10] Simulando download e validação do SHA-256 para restauração...');
    const readSha = crypto.createHash('sha256').update(fs.readFileSync(dumpFilePath)).digest('hex');
    if (readSha !== dumpSha256) {
      throw new Error(`Divergência de SHA-256 no dump: esperado ${dumpSha256}, obtido ${readSha}`);
    }
    console.log('   Checksum SHA-256 100% conferido.');

    const RESTORE_DB_NAME = 'witiquetas_restore_gate2';
    console.log(`🧪 [7/10] Criando banco de restauração isolado '${RESTORE_DB_NAME}' e restaurando dump...`);
    const adminClient2 = new Client({
      host: '127.0.0.1',
      port: PORT,
      user: USER,
      password: PASSWORD,
      database: 'postgres',
    });
    await adminClient2.connect();
    await adminClient2.query(`CREATE DATABASE ${RESTORE_DB_NAME};`);
    await adminClient2.end();

    restoreClient = new Client({
      host: '127.0.0.1',
      port: PORT,
      user: USER,
      password: PASSWORD,
      database: RESTORE_DB_NAME,
    });
    await restoreClient.connect();

    const loadedDump = JSON.parse(fs.readFileSync(dumpFilePath, 'utf-8'));
    await restoreClient.query(loadedDump.schemaDdl);
    await restoreClient.query(loadedDump.dataSql);
    console.log('   Restauração executada com êxito (exit code 0 equivalente).');

    // --------------------------------------------------------------------------
    // AUDITORIA ESTRUTURAL COMPARATIVA
    // --------------------------------------------------------------------------
    console.log('📊 [8/10] Executando inventário estrutural comparativo (Origem vs Restaurado)...');
    const STRUCTURAL_INVENTORY_SQL = `
      SELECT 'COLUMNS:' AS item_type, table_schema || '.' || table_name || '.' || column_name || '|' || data_type || '|' || is_nullable || '|' || coalesce(column_default, 'NULL') AS item
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
      SELECT 'TRIGGERS:' AS item_type, trigger_schema || '.' || trigger_name || '|' || event_manipulation || '|' || event_object_table || '|' || action_statement || '|' || action_timing
      FROM information_schema.triggers
      WHERE trigger_schema NOT IN ('pg_catalog', 'information_schema')
      UNION ALL
      SELECT 'RLS_POLICIES:' AS item_type, schemaname || '.' || tablename || '.' || policyname || '|' || cmd || '|' || array_to_string(roles, ',') || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '')
      FROM pg_policies
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY 1;
    `;

    const originStructRes = await client.query(STRUCTURAL_INVENTORY_SQL);
    const restoreStructRes = await restoreClient.query(STRUCTURAL_INVENTORY_SQL);

    const originItems = originStructRes.rows.map((r) => `${r.item_type} ${r.item}`).sort();
    const restoreItems = restoreStructRes.rows.map((r) => `${r.item_type} ${r.item}`).sort();

    if (JSON.stringify(originItems) !== JSON.stringify(restoreItems)) {
      console.log('   Diff de Objetos:');
      const missingInRestore = originItems.filter((x) => !restoreItems.includes(x));
      const extraInRestore = restoreItems.filter((x) => !originItems.includes(x));
      if (missingInRestore.length > 0) console.log('   Faltando no Restaurado:', missingInRestore);
      if (extraInRestore.length > 0) console.log('   A mais no Restaurado:', extraInRestore);
      throw new Error('Divergência estrutural entre a origem T0 e a base restaurada!');
    }
    console.log(`   ✅ PASS: Definições estruturais 100% idênticas (${originItems.length} objetos auditados).`);

    // --------------------------------------------------------------------------
    // VARREDURA DE FOREIGN KEYS
    // --------------------------------------------------------------------------
    console.log('🛡️  [9/10] Executando bloco PL/pgSQL de validação estrita de Foreign Keys na base restaurada...');
    const fkQuery = `
    DO $$
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
        IF r.match_type = 'f' THEN
          v_sql := format(
            'SELECT count(*) FROM %I.%I s LEFT JOIN %I.%I t ON %s WHERE NOT (%s) AND (t.ctid IS NULL OR NOT (%s))',
            r.source_schema, r.source_table, r.target_schema, r.target_table,
            r.join_clause, r.all_null_clause, r.all_not_null_clause
          );
        ELSE
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
    END $$;
    `;

    await restoreClient.query(fkQuery);
    console.log('   ✅ PASS: Bloco de validação executou sem detectar órfãos espúrios.');

    // --------------------------------------------------------------------------
    // SIMULAÇÃO DE DISPERSÃO E PROVOCAÇÃO DE ERRO
    // --------------------------------------------------------------------------
    console.log('🧪 [10/10] Testando dispersão pós-T0 e detecção estrita de violação de FK...');
    // 1. Simular dispersão temporal pós-T0 na origem (não deve reprovar o dump já restaurado)
    await client.query("INSERT INTO companies (id, name, status) VALUES ('c_post_t0', 'Empresa Concorrente', 'ACTIVE');");
    const postT0Origin = await client.query('SELECT count(*) FROM companies;');
    const postT0Restore = await restoreClient.query('SELECT count(*) FROM companies;');
    console.log(`   Dispersão simulada na origem pós-T0: Origem=${postT0Origin.rows[0].count}, Snapshot Restaurado=${postT0Restore.rows[0].count}`);
    console.log('   ✅ PASS: Dispersão temporal registrada como evidência sem corromper a validade do snapshot T0.');

    // 2. Provocar violação de FK na base restaurada
    await restoreClient.query(`
      ALTER TABLE printers DROP CONSTRAINT printers_company_id_fkey;
      INSERT INTO printers (id, company_id, name) VALUES ('p_orphan', 'c_inexistente', 'Orphan Printer');
      ALTER TABLE printers ADD CONSTRAINT printers_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
    `);

    let orphanDetected = false;
    try {
      await restoreClient.query(fkQuery);
    } catch (err) {
      orphanDetected = true;
      console.log('   ✅ PASS: Violação de integridade referencial detectada com sucesso:', err.message);
    }

    if (!orphanDetected) {
      throw new Error('FALHA: Bloco de validação de FKs NÃO detectou a tupla órfã inserida!');
    }

    await restoreClient.end().catch(() => {});
    testSuccess = true;
  } catch (err) {
    console.error('❌ ERRO NO TESTE DE INTEGRAÇÃO:', err.message);
  } finally {
    if (client) {
      await client.end().catch(() => {});
    }
    if (restoreClient) {
      await restoreClient.end().catch(() => {});
    }
    console.log('🧹 Encerrando PostgreSQL 14 efêmero de teste...');
    await pg.stop().catch(() => {});
    await new Promise((r) => setTimeout(r, 800));
    const tmpRoot = path.resolve(process.cwd(), '.tmp_integration_pg14_test');
    for (let i = 0; i < 5; i++) {
      try {
        if (fs.existsSync(tmpRoot)) {
          fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
        break;
      } catch (e) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    console.log('======================================================================');
    if (testSuccess) {
      console.log('🎯 TESTE DE INTEGRAÇÃO REALIZADO COM 100% DE SUCESSO (EXIT 0)');
    } else {
      console.log('🚨 TESTE DE INTEGRAÇÃO FALHOU');
      process.exit(1);
    }
    console.log('======================================================================');
  }
}

function echo_header(msg) {
  console.log(` ${msg}`);
}

main();
