# Script de Instalação dos Git Hooks de Segurança — Witiquetas
$ErrorActionPreference = "Stop"

$HooksDir = ".githooks"
if (-not (Test-Path $HooksDir)) {
    New-Item -ItemType Directory -Path $HooksDir -Force | Out-Null
}

git config core.hooksPath .githooks

Write-Host "✅ Git hooksPath configurado com sucesso para .githooks" -ForegroundColor Green
