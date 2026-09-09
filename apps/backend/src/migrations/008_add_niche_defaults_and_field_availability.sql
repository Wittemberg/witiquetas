-- 008_add_niche_defaults_and_field_availability.sql
-- FASE 5 — PACOTE 5.4: Nicho padrão da empresa e disponibilidade manual/integração de campos

-- 1. Nicho padrão da empresa em company_niches
ALTER TABLE company_niches ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_company_niches_default ON company_niches (company_id, is_default);

-- 2. Flags de disponibilidade para campos de dados em company_niche_fields
ALTER TABLE company_niche_fields ADD COLUMN IF NOT EXISTS available_for_manual BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE company_niche_fields ADD COLUMN IF NOT EXISTS available_for_integration BOOLEAN NOT NULL DEFAULT TRUE;
