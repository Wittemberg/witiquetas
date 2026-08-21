# Script de Criação de Checkpoint Local de Segurança — Witiquetas
[CmdletBinding()]
param (
    [string]$Label = "manual"
)

$ErrorActionPreference = "Stop"

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Branch = (git rev-parse --abbrev-ref HEAD).Trim()
$FullSHA = (git rev-parse HEAD).Trim()
$ShortSHA = (git rev-parse --short HEAD).Trim()

$CheckpointDir = Join-Path $PSScriptRoot "..\..\.recovery\$Timestamp-$ShortSHA-$Label"

if (-not (Test-Path $CheckpointDir)) {
    New-Item -ItemType Directory -Path $CheckpointDir -Force | Out-Null
}

$GitStatus = (git status --porcelain)
$IsClean = [string]::IsNullOrWhiteSpace($GitStatus)

$Manifest = @{
    timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    label = $Label
    branch = $Branch
    fullSha = $FullSHA
    shortSha = $ShortSHA
    isClean = $IsClean
    gitStatus = $GitStatus
}

$ManifestJson = $Manifest | ConvertTo-Json -Depth 5
Set-Content -Path (Join-Path $CheckpointDir "manifest.json") -Value $ManifestJson -Encoding UTF8

if (-not $IsClean) {
    git diff | Set-Content -Path (Join-Path $CheckpointDir "unstaged.patch") -Encoding UTF8
    git diff --cached | Set-Content -Path (Join-Path $CheckpointDir "staged.patch") -Encoding UTF8
}

Write-Host "✅ Checkpoint de segurança criado com sucesso:" -ForegroundColor Green
Write-Host "   Path: $CheckpointDir" -ForegroundColor Cyan
Write-Host "   SHA:  $ShortSHA ($Branch)" -ForegroundColor Yellow
