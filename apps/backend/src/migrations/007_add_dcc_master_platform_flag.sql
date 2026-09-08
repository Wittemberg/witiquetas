-- Migration: 007_add_dcc_master_platform_flag.sql
-- Adiciona a flag de plataforma is_dcc_master na tabela users

ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_dcc_master BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_dcc_master ON users (is_dcc_master);
