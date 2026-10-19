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

    // Conectar ao banco de teste criado
    client = new Client({
      host: '127.0.0.1',
      port: PORT,
      user: USER,
      password: PASSWORD,
      database: DB_NAME,
    });
    await client.connect();

    console.log('🔍 [2/6] Validando versão do PostgreSQL...');
    const versionRes = await client.query('SELECT version();');
    console.log('   Versão ativa:', versionRes.rows[0].version);

    console.log('📋 [3/6] Criando schemas, tabelas, views, funções e triggers de teste...');
    await client.query(`
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
    `);
    console.log('   Objetos relacionais criados com sucesso.');

    console.log('🧪 [4/6] Inserindo dados válidos e testando semântica de NULL (MATCH SIMPLE e MATCH FULL)...');
    await client.query(`
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
    `);
    console.log('   Dados válidos e casos de NULL inseridos com sucesso.');

    console.log('🛡️  [5/6] Executando bloco PL/pgSQL de validação estrita de Foreign Keys do Gate 2...');
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

    await client.query(fkQuery);
    console.log('   ✅ PASS: Bloco de validação executou sem detectar órfãos espúrios.');

    console.log('🧪 [6/6] Provocando violação de FK propositalmente para comprovar detecção estrita de falha...');
    // Desabilitar trigger temporariamente para forçar inserção órfã
    await client.query(`
      ALTER TABLE printers DROP CONSTRAINT printers_company_id_fkey;
      INSERT INTO printers (id, company_id, name) VALUES ('p_orphan', 'c_inexistente', 'Orphan Printer');
      ALTER TABLE printers ADD CONSTRAINT printers_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
    `);

    let orphanDetected = false;
    try {
      await client.query(fkQuery);
    } catch (err) {
      orphanDetected = true;
      console.log('   ✅ PASS: Violação de integridade referencial detectada com sucesso:', err.message);
    }

    if (!orphanDetected) {
      throw new Error('FALHA: Bloco de validação de FKs NÃO detectou a tupla órfã inserida!');
    }

    testSuccess = true;
  } catch (err) {
    console.error('❌ ERRO NO TESTE DE INTEGRAÇÃO:', err.message);
  } finally {
    if (client) {
      await client.end().catch(() => {});
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
