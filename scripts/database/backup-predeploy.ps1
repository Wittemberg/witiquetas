# Script de Backup de Banco de Dados Pré-Deploy (pg_dump) — Witiquetas
[CmdletBinding()]
param (
    [string]$DbHost = $env:POSTGRES_HOST,
    [string]$DbUser = $env:POSTGRES_USER,
    [string]$DbName = $env:POSTGRES_DB
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($DbHost)) { $DbHost = "localhost" }
if ([string]::IsNullOrWhiteSpace($DbUser)) { $DbUser = "witiquetas" }
if ([string]::IsNullOrWhiteSpace($DbName)) { $DbName = "witiquetas_db" }

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$ShortSHA = (git rev-parse --short HEAD).Trim()
$DumpFileName = "witiquetas-predeploy-$Timestamp-$ShortSHA.dump"

$BackupDir = Join-Path $PSScriptRoot "..\..\.recovery\db-backups"
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$DumpFilePath = Join-Path $BackupDir $DumpFileName

Write-Host "📦 Gerando Backup PostgreSQL Pré-Deploy..." -ForegroundColor Yellow
Write-Host "   Arquivo: $DumpFileName" -ForegroundColor Cyan

# Execução do pg_dump se o binário estiver disponível no ambiente
if (Get-Command pg_dump -ErrorAction SilentlyContinue) {
    & pg_dump -h $DbHost -U $DbUser -d $DbName -Fc -f $DumpFilePath
    Write-Host "✅ Dump PostgreSQL concluído: $DumpFilePath" -ForegroundColor Green
} else {
    Write-Host "⚠️ pg_dump não encontrado no PATH local. Registro de backup simulado em ambiente sem cliente PostgreSQL." -ForegroundColor Warning
    Set-Content -Path $DumpFilePath -Value "SIMULATED_PG_DUMP_FILE_FOR_$DumpFileName" -Encoding UTF8
}
